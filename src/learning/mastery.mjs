// Configurable mastery checks and progression decisions.
//
// This module is deliberately a layer on top of the existing evidence engine,
// not a second evidence model:
// - classifyObjectiveEvidence still owns the NOT_ASSESSED / NEEDS_PRACTICE /
//   DEVELOPING / DEMONSTRATED / REVIEW_RECOMMENDED rules.
// - analyzeLessonReadiness still owns prerequisite readiness and its
//   recommendations.
// - course maps own the criteria; this module only applies them.
// - activity completion (guided practice, independent practice, assessment)
//   is passed in by the caller, so journey completion rules stay in
//   journeyEngine.mjs.
//
// Mastery is not a claim of permanent memory. The statuses are:
//   unassessed -> developing -> demonstrated -> retained
// "retained" requires a correct delayed check from a configured source (review
// by default), at least the configured delay after the first evidence.
//
// Deliberate safeguards:
// - At least two correct answers are required, even if a caller misconfigures
//   the criteria.
// - Correct answers must come from at least two different question ids by
//   default. Repeating the same question is repeated practice, not new
//   evidence.
// - Recent repeated success is required by the existing classifier as well.
// - A required source (for example, lesson_assessment) must contain a correct
//   answer when configured.
// - A single correct answer, a streak alone, time spent or course completion is
//   never sufficient.

import { ASSESSMENT_STATES } from '../utils/evidenceClassification.mjs';
import {
  EVIDENCE_SOURCES,
  analyzeLessonReadiness,
  classifyObjectiveEvidence,
  createEmptyEvidence,
  findLessonForObjective,
  groupObservationsByObjective,
  normalizeEvidence,
} from './gapDetection.mjs';

export const MASTERY_SCHEMA_VERSION = 1;

export const MASTERY_STATUSES = Object.freeze({
  UNASSESSED: 'unassessed',
  DEVELOPING: 'developing',
  DEMONSTRATED: 'demonstrated',
  RETAINED: 'retained',
});

export const PROGRESSION_STATUSES = Object.freeze({
  ALLOWED: 'allowed',
  DEFERRED: 'deferred',
});

const VALID_SOURCES = new Set(Object.values(EVIDENCE_SOURCES));
const VALID_ITEM_KINDS = new Set(['single_choice', 'short_text']);

export const DEFAULT_MASTERY_CRITERIA = Object.freeze({
  minimumCorrect: 2,
  minimumDistinctItems: 2,
  minimumDistinctSources: 2,
  minimumAccuracy: 0.75,
  accuracyWindow: 5,
  requiredSources: Object.freeze([]),
  retention: Object.freeze({
    required: false,
    minimumDelayHours: 24,
    minimumCorrect: 1,
    sources: Object.freeze([EVIDENCE_SOURCES.REVIEW]),
  }),
});

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function asPositiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function asNonNegativeNumber(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function asRatio(value, fallback) {
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}

function asBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function asStringList(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((entry) => typeof entry === 'string' && entry.trim())
        .map((entry) => entry.trim())
    ),
  ];
}

function toDate(value, label = 'date') {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid date`);
  }
  return date;
}

function parseDateMs(value) {
  if (typeof value !== 'string' && !(value instanceof Date) && typeof value !== 'number') {
    return null;
  }
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function toIso(value) {
  return toDate(value).toISOString();
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm;
}

function percentage(value) {
  return Math.round(value * 100);
}

/**
 * Merge defaults, a course mastery policy and objective-level overrides.
 *
 * The course policy uses the same shape as objective criteria. A nested
 * `criteria` object is accepted too, which keeps policy files readable:
 * `{ criteria: { ... }, retention: { ... } }`.
 */
export function resolveMasteryCriteria(objective = {}, courseMap = {}) {
  const policy = plainObject(courseMap && courseMap.masteryPolicy);
  const policyCriteria =
    policy.criteria && typeof policy.criteria === 'object'
      ? plainObject(policy.criteria)
      : policy;
  const objectiveCriteria = plainObject(
    objective && objective.masteryCriteria
  );
  const merged = {
    ...DEFAULT_MASTERY_CRITERIA,
    ...policyCriteria,
    ...objectiveCriteria,
  };
  const retention = {
    ...DEFAULT_MASTERY_CRITERIA.retention,
    ...plainObject(policy.retention),
    ...plainObject(policyCriteria.retention),
    ...plainObject(objectiveCriteria.retention),
  };

  return {
    minimumCorrect: Math.max(
      2,
      asPositiveInteger(
        merged.minimumCorrect,
        DEFAULT_MASTERY_CRITERIA.minimumCorrect
      )
    ),
    minimumDistinctItems: Math.max(
      2,
      asPositiveInteger(
        merged.minimumDistinctItems,
        DEFAULT_MASTERY_CRITERIA.minimumDistinctItems
      )
    ),
    minimumDistinctSources: Math.max(
      1,
      asPositiveInteger(
        merged.minimumDistinctSources,
        DEFAULT_MASTERY_CRITERIA.minimumDistinctSources
      )
    ),
    minimumAccuracy: asRatio(
      merged.minimumAccuracy,
      DEFAULT_MASTERY_CRITERIA.minimumAccuracy
    ),
    accuracyWindow: asPositiveInteger(
      merged.accuracyWindow,
      DEFAULT_MASTERY_CRITERIA.accuracyWindow
    ),
    requiredSources: asStringList(merged.requiredSources),
    retention: {
      required: asBoolean(retention.required, false),
      minimumDelayHours: asNonNegativeNumber(
        retention.minimumDelayHours,
        DEFAULT_MASTERY_CRITERIA.retention.minimumDelayHours
      ),
      minimumCorrect: asPositiveInteger(
        retention.minimumCorrect,
        DEFAULT_MASTERY_CRITERIA.retention.minimumCorrect
      ),
      sources:
        asStringList(retention.sources).length > 0
          ? asStringList(retention.sources)
          : [...DEFAULT_MASTERY_CRITERIA.retention.sources],
    },
  };
}

/**
 * Validate authored criteria. The runtime resolves missing values from
 * defaults, but authored maps should be explicit and easy to audit.
 */
export function validateMasteryCriteria(criteria, label = 'masteryCriteria') {
  const errors = [];
  if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) {
    return [`${label} must be an object`];
  }

  const minimumCorrect = criteria.minimumCorrect;
  if (!Number.isInteger(minimumCorrect) || minimumCorrect < 2) {
    errors.push(`${label}.minimumCorrect must be an integer of at least 2`);
  }
  const minimumDistinctItems = criteria.minimumDistinctItems;
  if (!Number.isInteger(minimumDistinctItems) || minimumDistinctItems < 2) {
    errors.push(
      `${label}.minimumDistinctItems must be an integer of at least 2`
    );
  }
  if (
    Number.isInteger(minimumCorrect) &&
    Number.isInteger(minimumDistinctItems) &&
    minimumDistinctItems > minimumCorrect
  ) {
    errors.push(
      `${label}.minimumDistinctItems cannot exceed minimumCorrect`
    );
  }
  if (
    criteria.minimumDistinctSources !== undefined &&
    (!Number.isInteger(criteria.minimumDistinctSources) ||
      criteria.minimumDistinctSources < 1)
  ) {
    errors.push(
      `${label}.minimumDistinctSources must be a positive integer`
    );
  }
  if (
    criteria.minimumDistinctSources !== undefined &&
    Number.isInteger(criteria.minimumCorrect) &&
    criteria.minimumDistinctSources > criteria.minimumCorrect
  ) {
    errors.push(
      `${label}.minimumDistinctSources cannot exceed minimumCorrect`
    );
  }
  if (
    criteria.minimumAccuracy !== undefined &&
    (!Number.isFinite(criteria.minimumAccuracy) ||
      criteria.minimumAccuracy < 0 ||
      criteria.minimumAccuracy > 1)
  ) {
    errors.push(`${label}.minimumAccuracy must be between 0 and 1`);
  }
  if (
    criteria.accuracyWindow !== undefined &&
    (!Number.isInteger(criteria.accuracyWindow) ||
      criteria.accuracyWindow < 1)
  ) {
    errors.push(`${label}.accuracyWindow must be a positive integer`);
  }
  if (criteria.requiredSources !== undefined) {
    if (
      !Array.isArray(criteria.requiredSources) ||
      criteria.requiredSources.some(
        (source) => typeof source !== 'string' || !VALID_SOURCES.has(source)
      )
    ) {
      errors.push(
        `${label}.requiredSources must be an array of known evidence sources`
      );
    }
  }

  if (criteria.retention !== undefined) {
    const retention = criteria.retention;
    if (!retention || typeof retention !== 'object' || Array.isArray(retention)) {
      errors.push(`${label}.retention must be an object`);
    } else {
      if (
        retention.required !== undefined &&
        typeof retention.required !== 'boolean'
      ) {
        errors.push(`${label}.retention.required must be a boolean`);
      }
      if (
        retention.minimumDelayHours !== undefined &&
        (!Number.isFinite(retention.minimumDelayHours) ||
          retention.minimumDelayHours < 0)
      ) {
        errors.push(
          `${label}.retention.minimumDelayHours must be a non-negative number`
        );
      }
      if (
        retention.required === true &&
        Number.isFinite(retention.minimumDelayHours) &&
        retention.minimumDelayHours < 1
      ) {
        errors.push(
          `${label}.retention.minimumDelayHours must be at least 1 when retention is required`
        );
      }
      if (
        retention.minimumCorrect !== undefined &&
        (!Number.isInteger(retention.minimumCorrect) ||
          retention.minimumCorrect < 1)
      ) {
        errors.push(
          `${label}.retention.minimumCorrect must be a positive integer`
        );
      }
      if (
        retention.sources !== undefined &&
        (!Array.isArray(retention.sources) ||
          retention.sources.length === 0 ||
          retention.sources.some(
            (source) => typeof source !== 'string' || !VALID_SOURCES.has(source)
          ))
      ) {
        errors.push(
          `${label}.retention.sources must be a non-empty array of known evidence sources`
        );
      }
    }
  }

  return errors;
}

/**
 * Validate the course-wide mastery configuration. Unlike runtime resolution,
 * this requires every objective to declare criteria explicitly so authors
 * cannot accidentally inherit a policy that was meant for another subject.
 */
export function validateMasteryConfiguration(courseMap) {
  if (!courseMap || typeof courseMap !== 'object') {
    return ['course map must be an object'];
  }
  const errors = [];
  const objectives = Array.isArray(courseMap.objectives)
    ? courseMap.objectives
    : [];
  if (objectives.length === 0) {
    errors.push('objectives must be a non-empty array');
    return errors;
  }

  if (courseMap.masteryPolicy !== undefined) {
    const policy = plainObject(courseMap.masteryPolicy);
    const nestedCriteria = plainObject(policy.criteria);
    const policyCriteria =
      Object.keys(nestedCriteria).length > 0
        ? {
            ...nestedCriteria,
            retention: {
              ...plainObject(policy.retention),
              ...plainObject(nestedCriteria.retention),
            },
          }
        : policy;
    errors.push(
      ...validateMasteryCriteria(policyCriteria, 'masteryPolicy')
    );
  }

  const reviewConcepts = Array.isArray(courseMap.reviewConcepts)
    ? courseMap.reviewConcepts
    : [];

  objectives.forEach((objective) => {
    if (!objective || !objective.id) {
      errors.push('every objective needs an id before mastery can be checked');
      return;
    }
    if (
      !objective.masteryCriteria ||
      typeof objective.masteryCriteria !== 'object' ||
      Array.isArray(objective.masteryCriteria)
    ) {
      errors.push(
        `objective "${objective.id}" needs explicit masteryCriteria`
      );
      return;
    }
    errors.push(
      ...validateMasteryCriteria(
        objective.masteryCriteria,
        `objective "${objective.id}" masteryCriteria`
      )
    );
    const criteria = resolveMasteryCriteria(objective, courseMap);
    if (
      criteria.retention.required &&
      !reviewConcepts.some(
        (concept) => concept && concept.objectiveId === objective.id
      )
    ) {
      errors.push(
        `objective "${objective.id}" requires a delayed retention check but has no review concept`
      );
    }
  });

  return errors;
}

function normalizeObservation(entry) {
  if (!entry || typeof entry.isCorrect !== 'boolean') return null;
  return {
    ...entry,
    itemId: typeof entry.itemId === 'string' ? entry.itemId : null,
    source: typeof entry.source === 'string' ? entry.source : 'unknown',
    atMs: parseDateMs(entry.at),
  };
}

function check({
  id,
  label,
  passed,
  actual,
  required,
  reason,
  blocking = true,
  objectiveId = null,
}) {
  return {
    id,
    label,
    passed,
    actual,
    required,
    reason,
    blocking,
    objectiveId,
  };
}

/**
 * Evaluate one objective against its criteria and the shared classifier.
 *
 * @param {Object} options
 * @param {Object} options.objective - Course objective with masteryCriteria.
 * @param {Object} options.courseMap - Parent learning map (for policy).
 * @param {Array} options.observations - Evidence for this objective.
 * @param {Date|string} options.now - Current time.
 * @param {boolean} options.isPrerequisite - Presentation/classification flag.
 */
export function evaluateObjectiveMastery({
  objective,
  courseMap,
  observations = [],
  now = new Date(),
  isPrerequisite = false,
} = {}) {
  if (!objective || !objective.id) {
    throw new Error('evaluateObjectiveMastery requires an objective with an id');
  }
  const timestamp = toIso(now);
  const nowMs = Date.parse(timestamp);
  const criteria = resolveMasteryCriteria(objective, courseMap);
  const valid = (Array.isArray(observations) ? observations : [])
    .map(normalizeObservation)
    .filter(Boolean);
  const title = objective.title || objective.id;
  const classification = classifyObjectiveEvidence(valid, {
    objectiveId: objective.id,
    title,
    isPrerequisite,
  });

  const correct = valid.filter((entry) => entry.isCorrect);
  const distinctItemIds = [
    ...new Set(correct.map((entry) => entry.itemId).filter(Boolean)),
  ];
  const correctSources = [
    ...new Set(
      correct
        .map((entry) => entry.source)
        .filter((source) => source && source !== 'unknown')
    ),
  ];
  const recent = valid.slice(-criteria.accuracyWindow);
  const recentCorrect = recent.filter((entry) => entry.isCorrect).length;
  const recentAccuracy =
    recent.length > 0 ? recentCorrect / recent.length : 0;
  const requiredSourceChecks = criteria.requiredSources.map((source) => {
    const sourceCorrect = correct.filter((entry) => entry.source === source);
    return {
      source,
      passed: sourceCorrect.length > 0,
      correctCount: sourceCorrect.length,
    };
  });

  const coreChecks = [
    check({
      id: 'correct-evidence',
      label: 'Correct answers',
      passed: correct.length >= criteria.minimumCorrect,
      actual: correct.length,
      required: criteria.minimumCorrect,
      reason:
        correct.length >= criteria.minimumCorrect
          ? `${correct.length} correct ${plural(
              correct.length,
              'answer',
              'answers'
            )} recorded.`
          : `Needs at least ${criteria.minimumCorrect} correct answers; ${correct.length} ${
              correct.length === 1 ? 'is' : 'are'
            } recorded. One correct answer is not enough to demonstrate mastery.`,
    }),
    check({
      id: 'distinct-items',
      label: 'Different questions',
      passed: distinctItemIds.length >= criteria.minimumDistinctItems,
      actual: distinctItemIds.length,
      required: criteria.minimumDistinctItems,
      reason:
        distinctItemIds.length >= criteria.minimumDistinctItems
          ? `${distinctItemIds.length} different questions have correct evidence.`
          : `Needs correct answers on at least ${criteria.minimumDistinctItems} different questions; ${distinctItemIds.length} ${
              distinctItemIds.length === 1 ? 'has' : 'have'
            } correct evidence. Repeating the same question does not add a different item.`,
    }),
    check({
      id: 'distinct-sources',
      label: 'Evidence sources',
      passed: correctSources.length >= criteria.minimumDistinctSources,
      actual: correctSources.length,
      required: criteria.minimumDistinctSources,
      reason:
        correctSources.length >= criteria.minimumDistinctSources
          ? `Correct evidence comes from ${correctSources.length} sources.`
          : `Needs correct evidence from at least ${criteria.minimumDistinctSources} different sources; ${correctSources.length} ${
              correctSources.length === 1 ? 'is' : 'are'
            } recorded.`,
    }),
    check({
      id: 'recent-accuracy',
      label: 'Recent accuracy',
      passed: recentAccuracy >= criteria.minimumAccuracy,
      actual: recentAccuracy,
      required: criteria.minimumAccuracy,
      reason:
        recentAccuracy >= criteria.minimumAccuracy
          ? `Recent accuracy is ${percentage(
              recentAccuracy
            )}% across the last ${recent.length} ${plural(
              recent.length,
              'check'
            )}.`
          : `Recent accuracy is ${percentage(
              recentAccuracy
            )}% across the last ${recent.length} ${plural(
              recent.length,
              'check'
            )}; ${percentage(criteria.minimumAccuracy)}% is required.`,
    }),
    check({
      id: 'recent-demonstration',
      label: 'Recent repeated success',
      passed: classification.state === ASSESSMENT_STATES.DEMONSTRATED,
      actual: classification.state,
      required: ASSESSMENT_STATES.DEMONSTRATED,
      reason:
        classification.state === ASSESSMENT_STATES.DEMONSTRATED
          ? 'Recent evidence shows repeated success under the shared classifier.'
          : `The shared evidence classifier currently reports ${classification.state}; recent repeated correct evidence is required.`,
    }),
    ...requiredSourceChecks.map((entry) =>
      check({
        id: `required-source:${entry.source}`,
        label: `Source: ${entry.source}`,
        passed: entry.passed,
        actual: entry.correctCount,
        required: 1,
        reason: entry.passed
          ? `Correct evidence includes the required ${entry.source} source.`
          : `Needs at least one correct answer from the required ${entry.source} source.`,
      })
    ),
  ];

  const criteriaMet = coreChecks.every((entry) => entry.passed);
  const failedCoreChecks = coreChecks.filter((entry) => !entry.passed);
  const requiredSourceGaps = failedCoreChecks
    .filter((entry) => entry.id.startsWith('required-source:'))
    .map((entry) => entry.id.replace('required-source:', ''));
  const timed = valid.filter((entry) => entry.atMs !== null);
  const earliestMs =
    timed.length > 0
      ? Math.min(...timed.map((entry) => entry.atMs))
      : null;
  const eligibleMs =
    earliestMs === null
      ? null
      : earliestMs + criteria.retention.minimumDelayHours * 60 * 60 * 1000;
  const retentionSources = new Set(criteria.retention.sources);
  const retentionCorrect = valid.filter(
    (entry) =>
      entry.isCorrect &&
      entry.atMs !== null &&
      eligibleMs !== null &&
      entry.atMs >= eligibleMs &&
      entry.atMs <= nowMs &&
      (retentionSources.size === 0 || retentionSources.has(entry.source))
  );
  const retentionMet =
    eligibleMs !== null && retentionCorrect.length >= criteria.retention.minimumCorrect;
  const retentionDue =
    eligibleMs !== null && nowMs >= eligibleMs && !retentionMet;
  const retentionReason = retentionMet
    ? `${retentionCorrect.length} correct delayed ${plural(
        retentionCorrect.length,
        'check'
      )} recorded at least ${criteria.retention.minimumDelayHours} hours after the first evidence.`
    : eligibleMs === null
      ? 'A delayed retention check needs timestamped evidence before it can be scheduled.'
      : retentionDue
        ? `A delayed retention check is available now (at least ${criteria.retention.minimumDelayHours} hours after the first evidence).`
        : `A delayed retention check becomes available at ${new Date(
            eligibleMs
          ).toISOString()} (${criteria.retention.minimumDelayHours} hours after the first evidence).`;

  const retentionCheck = check({
    id: 'retention',
    label: 'Delayed retention',
    passed: retentionMet,
    actual: retentionCorrect.length,
    required: criteria.retention.minimumCorrect,
    reason: retentionReason,
    blocking: criteria.retention.required,
  });

  const status =
    valid.length === 0
      ? MASTERY_STATUSES.UNASSESSED
      : !criteriaMet
        ? MASTERY_STATUSES.DEVELOPING
        : retentionMet
          ? MASTERY_STATUSES.RETAINED
          : MASTERY_STATUSES.DEMONSTRATED;
  const progressionEligible =
    valid.length > 0 &&
    criteriaMet &&
    (!criteria.retention.required || retentionMet);

  let reason;
  if (status === MASTERY_STATUSES.UNASSESSED) {
    reason = `No evidence yet for "${title}". This objective is unassessed, not failed. Mastery requires at least ${criteria.minimumCorrect} correct answers across ${criteria.minimumDistinctItems} different questions.`;
  } else if (!criteriaMet) {
    reason = `"${title}" is still developing. ${coreChecks
      .filter((entry) => !entry.passed)
      .map((entry) => entry.reason)
      .join(' ')}`;
  } else if (retentionMet) {
    reason = `"${title}" has retained evidence: ${correct.length} correct ${
      correct.length === 1 ? 'answer' : 'answers'
    } across ${distinctItemIds.length} different questions, ${percentage(
      recentAccuracy
    )}% recent accuracy, and a delayed retention check. This is not a claim of permanent memory.`;
  } else if (criteria.retention.required) {
    reason = `"${title}" meets the current mastery criteria, but progression is waiting for a delayed retention check. ${retentionReason}`;
  } else {
    reason = `"${title}" is demonstrated by ${correct.length} correct ${
      correct.length === 1 ? 'answer' : 'answers'
    } across ${distinctItemIds.length} different questions with ${percentage(
      recentAccuracy
    )}% recent accuracy. The delayed retention check is still pending; this is not permanent mastery.`;
  }

  return {
    objectiveId: objective.id,
    title,
    isPrerequisite,
    status,
    criteria,
    criteriaMet,
    progressionEligible,
    evidenceState: classification.state,
    evidenceRule: classification.rule,
    evidenceReason: classification.reason,
    evidenceSummary: classification.evidenceSummary,
    correctCount: correct.length,
    distinctItemIds,
    correctSources,
    recentAccuracy,
    recentCheckCount: recent.length,
    coreChecks,
    requiredSourceGaps,
    needsPractice: failedCoreChecks.some(
      (entry) => !entry.id.startsWith('required-source:')
    ),
    retentionCheck,
    retention: {
      required: criteria.retention.required,
      met: retentionMet,
      due: retentionDue,
      count: retentionCorrect.length,
      minimumCorrect: criteria.retention.minimumCorrect,
      minimumDelayHours: criteria.retention.minimumDelayHours,
      sources: criteria.retention.sources,
      earliestEvidenceAt: earliestMs === null ? null : new Date(earliestMs).toISOString(),
      eligibleAt: eligibleMs === null ? null : new Date(eligibleMs).toISOString(),
      reason: retentionReason,
    },
    reason,
    checks: [...coreChecks, retentionCheck],
  };
}

/**
 * Pick new practice questions for the objectives that blocked progression.
 *
 * Existing authored practice/reassessment/adaptive content is preferred.
 * Callers may also pass a wider validated item pool. Reusing the same question
 * is allowed for practice but cannot satisfy the distinct-question criterion,
 * so this helper prefers item ids the caller has not excluded.
 */
export function selectRemediationItems({
  courseMap,
  lessonId,
  objectiveIds = [],
  items = [],
  excludeItemIds = [],
  maxItems = 5,
} = {}) {
  const targets = new Set(
    (Array.isArray(objectiveIds) ? objectiveIds : []).filter(
      (id) => typeof id === 'string' && id
    )
  );
  if (targets.size === 0 || !courseMap || typeof courseMap !== 'object') {
    return [];
  }
  const excluded = new Set(
    (Array.isArray(excludeItemIds) ? excludeItemIds : []).filter(Boolean)
  );
  const lessonSpec =
    courseMap.lessons && courseMap.lessons[lessonId]
      ? courseMap.lessons[lessonId]
      : null;
  const diagnostic = lessonSpec && lessonSpec.diagnostic;
  const pools = [
    diagnostic && diagnostic.practiceItems,
    diagnostic && diagnostic.reassessmentItems,
    ...Object.values(courseMap.adaptiveExercises || {}),
    diagnostic && diagnostic.items,
    items,
  ];
  const seen = new Set();
  const selected = [];

  pools.forEach((pool) => {
    (Array.isArray(pool) ? pool : []).forEach((item) => {
      if (
        !item ||
        typeof item !== 'object' ||
        !item.id ||
        !targets.has(item.objectiveId) ||
        !VALID_ITEM_KINDS.has(item.kind) ||
        excluded.has(item.id) ||
        seen.has(item.id)
      ) {
        return;
      }
      seen.add(item.id);
      selected.push(item);
    });
  });

  const limit = Math.max(1, Number.isInteger(maxItems) ? maxItems : 5);
  return selected.slice(0, limit);
}

/**
 * Decide whether a learner may progress past a lesson.
 *
 * @param {Object} options
 * @param {Object} options.courseMap - Course learning map.
 * @param {string} options.lessonId - Lesson to decide.
 * @param {Object} options.evidence - Course-scoped evidence.
 * @param {Date|string} options.now - Deterministic decision timestamp.
 * @param {boolean} options.activityComplete - Result of the existing journey
 *   completion check (or true for lessons without a journey).
 * @param {Array} options.remediationItems - Optional wider item pool.
 */
export function evaluateProgression({
  courseMap,
  lessonId,
  evidence = createEmptyEvidence(),
  now = new Date(),
  activityComplete = true,
  remediationItems = [],
} = {}) {
  if (!courseMap || typeof courseMap !== 'object') {
    throw new Error('evaluateProgression requires a course learning map');
  }
  const lessonSpec =
    courseMap.lessons && courseMap.lessons[lessonId]
      ? courseMap.lessons[lessonId]
      : null;
  if (!lessonSpec) {
    throw new Error(
      `No learning map for lesson "${lessonId}" in course "${courseMap.courseId}"`
    );
  }

  const timestamp = toIso(now);
  const normalizedEvidence = normalizeEvidence(evidence);
  const objectivesById = new Map(
    (courseMap.objectives || []).map((objective) => [objective.id, objective])
  );
  const observationsByObjective = groupObservationsByObjective(
    normalizedEvidence
  );
  const buildReport = (objectiveId, isPrerequisite) => {
    const objective = objectivesById.get(objectiveId);
    if (!objective) {
      throw new Error(
        `Learning map references unknown objective "${objectiveId}"`
      );
    }
    return evaluateObjectiveMastery({
      objective,
      courseMap,
      observations: observationsByObjective.get(objectiveId) || [],
      now: timestamp,
      isPrerequisite,
    });
  };

  const objectiveReports = (lessonSpec.objectiveIds || []).map((objectiveId) =>
    buildReport(objectiveId, false)
  );
  const prerequisiteReports = (lessonSpec.prerequisiteObjectiveIds || []).map(
    (objectiveId) => buildReport(objectiveId, true)
  );
  const readiness = analyzeLessonReadiness({
    courseMap,
    lessonId,
    evidence: normalizedEvidence,
  });
  const prerequisiteRecommendations = readiness.recommendations.filter(
    (entry) => entry.isPrerequisite
  );
  const prerequisiteReportsReady = prerequisiteReports.every(
    (report) => report.progressionEligible
  );
  const failedPrerequisiteReports = prerequisiteReports.filter(
    (report) => !report.progressionEligible
  );
  const prerequisitePassed =
    prerequisiteReports.length === 0 ||
    (readiness.ready && prerequisiteReportsReady);
  const prerequisiteCriteriaReasons = failedPrerequisiteReports.map(
    (report) => `"${report.title}": ${report.reason}`
  );
  const prerequisiteReason =
    prerequisiteReports.length === 0
      ? 'This lesson has no prerequisite objectives.'
      : prerequisitePassed
        ? `All ${prerequisiteReports.length} prerequisite ${
            prerequisiteReports.length === 1 ? 'objective is' : 'objectives are'
          } ready.`
        : [
            prerequisiteRecommendations.length > 0
              ? prerequisiteRecommendations
                  .map((entry) => entry.reason)
                  .join(' ')
              : `Prerequisite readiness is ${readiness.readiness}. Every prerequisite needs demonstrated evidence that also meets its mastery criteria.`,
            ...prerequisiteCriteriaReasons,
          ].join(' ');

  const checks = [
    check({
      id: 'activity-complete',
      label: 'Lesson activity',
      passed: activityComplete,
      actual: activityComplete,
      required: true,
      reason: activityComplete
        ? 'The lesson activity is complete, including practice and the assessment.'
        : 'The lesson activity is not complete yet. Guided practice, independent practice and a passing assessment are still required.',
    }),
    check({
      id: 'prerequisites',
      label: 'Prerequisite readiness',
      passed: prerequisitePassed,
      actual: readiness.readiness,
      required: 'ready',
      reason: prerequisiteReason,
    }),
    ...objectiveReports.map((report) =>
      check({
        id: `objective:${report.objectiveId}`,
        label: `Mastery: ${report.title}`,
        passed: report.progressionEligible,
        actual: report.status,
        required: 'demonstrated',
        reason: report.reason,
        objectiveId: report.objectiveId,
      })
    ),
  ];

  const allowed = checks.every((entry) => entry.passed);
  const failedReports = objectiveReports.filter(
    (report) => !report.progressionEligible
  );
  const failedPrerequisiteIds = failedPrerequisiteReports.map(
    (report) => report.objectiveId
  );
  const allFailedReports = [...failedReports, ...failedPrerequisiteReports];
  const remediationObjectiveIds = [
    ...new Set(allFailedReports.map((report) => report.objectiveId)),
  ];
  const practiceObjectiveIds = [
    ...new Set(
      allFailedReports
        .filter((report) => report.needsPractice)
        .map((report) => report.objectiveId)
    ),
  ];
  const assessmentRetakeObjectiveIds = [
    ...new Set(
      allFailedReports
        .filter((report) => report.requiredSourceGaps.length > 0)
        .map((report) => report.objectiveId)
    ),
  ];
  const reviewConceptIds = (
    Array.isArray(courseMap.reviewConcepts) ? courseMap.reviewConcepts : []
  )
    .filter(
      (concept) =>
        concept &&
        concept.id &&
        remediationObjectiveIds.includes(concept.objectiveId)
    )
    .map((concept) => concept.id);
  const practiceItems = selectRemediationItems({
    courseMap,
    lessonId,
    objectiveIds: practiceObjectiveIds,
    items: remediationItems,
  });
  const prerequisiteLessons = failedPrerequisiteIds.map((objectiveId) => ({
    objectiveId,
    lessonId: findLessonForObjective(courseMap, objectiveId, lessonId),
  }));
  const failedChecks = checks.filter((entry) => !entry.passed);
  const relevantChecks = allowed ? checks : failedChecks;
  const reasons = relevantChecks.map((entry) => entry.reason);
  const summary = allowed
    ? `Progression allowed for lesson "${lessonId}": every lesson objective meets its mastery criteria and all prerequisites are ready.`
    : `Progression deferred for lesson "${lessonId}": ${failedChecks.length} ${
        failedChecks.length === 1 ? 'requirement is' : 'requirements are'
      } not met.`;
  const pendingRetention = objectiveReports
    .filter(
      (report) =>
        report.criteriaMet &&
        !report.retention.met &&
        report.retention.eligibleAt
    )
    .map((report) => report.retention.eligibleAt)
    .sort((left, right) => left.localeCompare(right));

  return {
    version: MASTERY_SCHEMA_VERSION,
    decisionId: `mastery:${courseMap.courseId}:${lessonId}:${timestamp}`,
    courseId: courseMap.courseId,
    lessonId,
    at: timestamp,
    allowed,
    status: allowed
      ? PROGRESSION_STATUSES.ALLOWED
      : PROGRESSION_STATUSES.DEFERRED,
    activityComplete: Boolean(activityComplete),
    summary,
    reasons,
    checks,
    objectives: objectiveReports,
    prerequisites: prerequisiteReports,
    readiness,
    remediation: {
      objectiveIds: remediationObjectiveIds,
      practiceObjectiveIds,
      assessmentRetakeObjectiveIds,
      practiceItemIds: practiceItems.map((item) => item.id),
      practiceItems,
      reviewConceptIds,
      prerequisiteLessons,
      requiresRemediation: remediationObjectiveIds.length > 0,
      requiresPractice: practiceObjectiveIds.length > 0,
      requiresAssessmentRetake: assessmentRetakeObjectiveIds.length > 0,
    },
    retention: {
      pendingObjectiveIds: objectiveReports
        .filter((report) => report.criteriaMet && !report.retention.met)
        .map((report) => report.objectiveId),
      nextEligibleAt: pendingRetention.length > 0 ? pendingRetention[0] : null,
    },
    evidenceAttempts: normalizedEvidence.attempts.length,
    evidenceObservations: normalizedEvidence.observations.length,
  };
}

// Descriptive alias used by callers that prefer "build".
export const buildProgressionDecision = evaluateProgression;
