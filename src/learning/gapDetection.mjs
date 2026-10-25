// Knowledge-gap and prerequisite detection.
//
// Pure, framework-free logic shared by every subject. Course content supplies
// objectives, prerequisite links and diagnostic items; this module only decides
// what the recorded evidence means and which support (if any) to recommend.
//
// Deliberate design rules:
// - No evidence is NOT_ASSESSED. It is not evidence of a gap.
// - One incorrect answer is an early signal, never a confirmed gap.
// - Repeated incorrect evidence (at least two misses with no correct evidence)
//   is required before we confirm difficulty.
// - Recent repeated success is required before an objective is DEMONSTRATED.
// - A previously demonstrated objective whose latest answer is wrong becomes
//   REVIEW_RECOMMENDED rather than being called a new gap.

import { ASSESSMENT_STATES } from '../utils/evidenceClassification.mjs';
import { isBlankValue, scoreAssessment } from './journeyEngine.mjs';

export const EVIDENCE_SCHEMA_VERSION = 1;

export const EVIDENCE_SOURCES = Object.freeze({
  DIAGNOSTIC: 'diagnostic',
  PRACTICE: 'practice',
  REASSESSMENT: 'reassessment',
  LESSON_PRACTICE: 'lesson_practice',
  LESSON_ASSESSMENT: 'lesson_assessment',
  ADAPTIVE_PRACTICE: 'adaptive_practice',
  REVIEW: 'review',
});

export const RECOMMENDATION_TYPES = Object.freeze({
  TAKE_DIAGNOSTIC: 'take_diagnostic',
  REVIEW_PREREQUISITE: 'review_prerequisite',
  TARGETED_PRACTICE: 'targeted_practice',
  CONTINUE_LESSON: 'continue_lesson',
});

export const READINESS_STATES = Object.freeze({
  READY: 'ready',
  NEEDS_SUPPORT: 'needs_support',
  UNKNOWN: 'unknown',
});

export const CONFIDENCE_LABELS = Object.freeze({
  NONE: 'none',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
});

const PRIORITY_ORDER = Object.freeze({ high: 0, medium: 1, low: 2 });
const VALID_ITEM_KINDS = Object.freeze(['single_choice', 'short_text']);

function plural(count, singular, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm;
}

export function getConfidenceLabel(confidence) {
  if (!Number.isFinite(confidence) || confidence <= 0) {
    return CONFIDENCE_LABELS.NONE;
  }
  if (confidence < 0.4) return CONFIDENCE_LABELS.LOW;
  if (confidence < 0.75) return CONFIDENCE_LABELS.MEDIUM;
  return CONFIDENCE_LABELS.HIGH;
}

export function createEmptyEvidence() {
  return {
    version: EVIDENCE_SCHEMA_VERSION,
    observations: [],
    attempts: [],
  };
}

export function normalizeEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object') return createEmptyEvidence();
  return {
    version: EVIDENCE_SCHEMA_VERSION,
    observations: Array.isArray(evidence.observations)
      ? evidence.observations.filter(
          (entry) => entry && typeof entry.objectiveId === 'string'
        )
      : [],
    attempts: Array.isArray(evidence.attempts)
      ? evidence.attempts.filter((entry) => entry && typeof entry === 'object')
      : [],
  };
}

// ---------------------------------------------------------------------------
// Evidence classification
// ---------------------------------------------------------------------------

/**
 * Classify the evidence for one objective using transparent, ordered rules.
 *
 * Observations are expected in chronological order. Every rule is deterministic
 * and is reported through `rule` so the UI and tests can explain the outcome.
 */
export function classifyObjectiveEvidence(
  observations = [],
  { objectiveId = null, title = '', isPrerequisite = false } = {}
) {
  const valid = (Array.isArray(observations) ? observations : []).filter(
    (entry) => entry && typeof entry.isCorrect === 'boolean'
  );
  const evidenceCount = valid.length;
  const correctCount = valid.filter((entry) => entry.isCorrect).length;
  const incorrectCount = evidenceCount - correctCount;
  const evidenceSummary =
    evidenceCount === 0
      ? 'No evidence yet'
      : `${correctCount} of ${evidenceCount} ${plural(
          evidenceCount,
          'check'
        )} correct`;

  const base = {
    objectiveId,
    title,
    isPrerequisite,
    state: ASSESSMENT_STATES.NOT_ASSESSED,
    rule: 'no-evidence',
    confidence: 0,
    confidenceLabel: CONFIDENCE_LABELS.NONE,
    confirmedGap: false,
    evidenceCount,
    correctCount,
    incorrectCount,
    recentStreak: 0,
    evidenceSummary,
    reason: `No evidence yet for "${title || objectiveId}". This objective is not assessed, which is different from having a gap.`,
  };

  if (evidenceCount === 0) return base;

  const trailingCorrect = (() => {
    let streak = 0;
    for (let index = valid.length - 1; index >= 0; index -= 1) {
      if (!valid[index].isCorrect) break;
      streak += 1;
    }
    return streak;
  })();

  const lastThree = valid.slice(-3);
  const correctInLastThree = lastThree.filter((entry) => entry.isCorrect).length;
  const lastIsCorrect = valid[valid.length - 1].isCorrect;

  // "Previously demonstrated" means a run of at least two correct checks ended
  // before the latest observation.
  const demonstratedEarlier = (() => {
    for (let index = 1; index < valid.length - 1; index += 1) {
      if (valid[index].isCorrect && valid[index - 1].isCorrect) return true;
    }
    return false;
  })();

  if (demonstratedEarlier && !lastIsCorrect) {
    return {
      ...base,
      state: ASSESSMENT_STATES.REVIEW_RECOMMENDED,
      rule: 'regression',
      confidence: Math.min(0.85, 0.55 + correctCount * 0.05),
      confidenceLabel: getConfidenceLabel(
        Math.min(0.85, 0.55 + correctCount * 0.05)
      ),
      confirmedGap: false,
      recentStreak: 0,
      reason: `"${title || objectiveId}" looked demonstrated earlier (${evidenceSummary}), but the most recent check was incorrect. A short review is recommended rather than calling this a new gap.`,
    };
  }

  if (incorrectCount >= 2 && correctCount === 0) {
    const confidence = Math.min(0.85, 0.5 + evidenceCount * 0.1);
    return {
      ...base,
      state: ASSESSMENT_STATES.NEEDS_PRACTICE,
      rule: 'persistent-miss',
      confidence,
      confidenceLabel: getConfidenceLabel(confidence),
      confirmedGap: true,
      recentStreak: trailingCorrect,
      reason: `${incorrectCount} ${plural(
        incorrectCount,
        'check was',
        'checks were'
      )} incorrect for "${title || objectiveId}" and no correct evidence has been recorded yet. This is repeated evidence of difficulty.`,
    };
  }

  if (trailingCorrect >= 2 && correctInLastThree >= 2) {
    const confidence = Math.min(
      0.95,
      0.6 + correctCount * 0.05 + trailingCorrect * 0.05
    );
    return {
      ...base,
      state: ASSESSMENT_STATES.DEMONSTRATED,
      rule: 'repeated-success',
      confidence,
      confidenceLabel: getConfidenceLabel(confidence),
      confirmedGap: false,
      recentStreak: trailingCorrect,
      reason: `"${title || objectiveId}" has ${trailingCorrect} correct checks in a row and ${evidenceSummary}. Recent repeated success demonstrates this objective.`,
    };
  }

  if (correctCount > 0 && (correctCount >= incorrectCount || trailingCorrect > 0)) {
    const confidence = Math.min(0.7, 0.35 + evidenceCount * 0.05 + correctCount * 0.1);
    return {
      ...base,
      state: ASSESSMENT_STATES.DEVELOPING,
      rule: 'partial-evidence',
      confidence,
      confidenceLabel: getConfidenceLabel(confidence),
      confirmedGap: false,
      recentStreak: trailingCorrect,
      reason: `"${title || objectiveId}" has ${evidenceSummary}. There is some evidence of understanding, but not yet enough repeated success to demonstrate it confidently.`,
    };
  }

  if (evidenceCount === 1) {
    return {
      ...base,
      state: ASSESSMENT_STATES.NEEDS_PRACTICE,
      rule: 'single-miss',
      confidence: 0.2,
      confidenceLabel: CONFIDENCE_LABELS.LOW,
      confirmedGap: false,
      recentStreak: 0,
      reason: `One incorrect answer is the only evidence for "${title || objectiveId}". That is an early signal, not enough to diagnose a gap. A little practice and a reassessment will clarify it.`,
    };
  }

  return {
    ...base,
    state: ASSESSMENT_STATES.NEEDS_PRACTICE,
    rule: 'mixed-evidence',
    confidence: 0.45,
    confidenceLabel: getConfidenceLabel(0.45),
    confirmedGap: false,
    recentStreak: trailingCorrect,
    reason: `"${title || objectiveId}" has ${evidenceSummary}. That is not a confirmed gap, but a short review and reassessment are recommended.`,
  };
}

export function groupObservationsByObjective(evidence) {
  const grouped = new Map();
  normalizeEvidence(evidence).observations.forEach((observation) => {
    if (!grouped.has(observation.objectiveId)) {
      grouped.set(observation.objectiveId, []);
    }
    grouped.get(observation.objectiveId).push(observation);
  });
  return grouped;
}

export function summarizeEvidence(evidence) {
  const normalized = normalizeEvidence(evidence);
  const bySource = {
    [EVIDENCE_SOURCES.DIAGNOSTIC]: 0,
    [EVIDENCE_SOURCES.PRACTICE]: 0,
    [EVIDENCE_SOURCES.REASSESSMENT]: 0,
    [EVIDENCE_SOURCES.LESSON_PRACTICE]: 0,
    [EVIDENCE_SOURCES.LESSON_ASSESSMENT]: 0,
    [EVIDENCE_SOURCES.ADAPTIVE_PRACTICE]: 0,
    [EVIDENCE_SOURCES.REVIEW]: 0,
  };
  normalized.observations.forEach((observation) => {
    if (bySource[observation.source] === undefined) {
      bySource[observation.source] = 0;
    }
    bySource[observation.source] += 1;
  });
  const attemptsBySource = {
    [EVIDENCE_SOURCES.DIAGNOSTIC]: 0,
    [EVIDENCE_SOURCES.PRACTICE]: 0,
    [EVIDENCE_SOURCES.REASSESSMENT]: 0,
    [EVIDENCE_SOURCES.LESSON_PRACTICE]: 0,
    [EVIDENCE_SOURCES.LESSON_ASSESSMENT]: 0,
    [EVIDENCE_SOURCES.ADAPTIVE_PRACTICE]: 0,
    [EVIDENCE_SOURCES.REVIEW]: 0,
  };
  normalized.attempts.forEach((attempt) => {
    if (attemptsBySource[attempt.kind] === undefined) {
      attemptsBySource[attempt.kind] = 0;
    }
    attemptsBySource[attempt.kind] += 1;
  });
  return {
    observations: normalized.observations.length,
    attempts: normalized.attempts.length,
    bySource,
    attemptsBySource,
    correct: normalized.observations.filter((entry) => entry.isCorrect).length,
  };
}

// ---------------------------------------------------------------------------
// Recording attempts
// ---------------------------------------------------------------------------

export function evaluateAnswers(items = [], answers = {}) {
  const scored = scoreAssessment(items, answers);
  const itemById = new Map((items || []).map((item) => [item.id, item]));

  const results = scored.results.map((result) => {
    const item = itemById.get(result.itemId);
    return {
      ...result,
      objectiveId: item ? item.objectiveId : null,
      prompt: item ? item.prompt : '',
      answered: !isBlankValue(result.value),
    };
  });

  const observations = results
    .filter((result) => result.answered)
    .map((result) => ({
      objectiveId: result.objectiveId,
      itemId: result.itemId,
      isCorrect: result.isCorrect,
      value: result.value,
    }));

  return {
    results,
    observations,
    correctCount: results.filter((result) => result.isCorrect).length,
    answeredCount: observations.length,
    total: results.length,
    percentage: scored.percentage,
  };
}

/**
 * Append an attempt and its evidence. Unanswered questions are not recorded as
 * incorrect observations: they are missing evidence and stay NOT_ASSESSED.
 */
export function recordAttempt(
  evidence,
  {
    items = [],
    answers = {},
    source = EVIDENCE_SOURCES.DIAGNOSTIC,
    at,
    metadata = null,
  } = {}
) {
  if (!Object.values(EVIDENCE_SOURCES).includes(source)) {
    throw new Error(`Unsupported evidence source: ${source}`);
  }
  (items || []).forEach((item) => {
    if (!item || !item.objectiveId) {
      throw new Error(
        `Evidence item ${item && item.id ? item.id : '<unknown>'} has no objectiveId`
      );
    }
  });

  const normalized = normalizeEvidence(evidence);
  const timestamp = at || new Date().toISOString();
  const attemptId = `attempt-${normalized.attempts.length + 1}`;
  const outcome = evaluateAnswers(items, answers);

  const observations = outcome.observations.map((observation, index) => ({
    ...observation,
    id: `${attemptId}-${observation.itemId}-${index}`,
    attemptId,
    source,
    at: timestamp,
  }));

  const attempt = {
    id: attemptId,
    kind: source,
    at: timestamp,
    itemIds: (items || []).map((item) => item.id),
    total: outcome.total,
    answered: outcome.answeredCount,
    correctCount: outcome.correctCount,
    ...(metadata && typeof metadata === 'object' ? { metadata } : {}),
  };

  return {
    evidence: {
      version: EVIDENCE_SCHEMA_VERSION,
      observations: [...normalized.observations, ...observations],
      attempts: [...normalized.attempts, attempt],
    },
    attempt,
    outcome,
  };
}

// ---------------------------------------------------------------------------
// Lesson readiness and recommendations
// ---------------------------------------------------------------------------

export function findLessonForObjective(courseMap, objectiveId, excludeLessonId) {
  if (!courseMap || !courseMap.lessons) return null;
  const entries = Object.entries(courseMap.lessons);
  for (const [lessonId, lesson] of entries) {
    if (lessonId === excludeLessonId) continue;
    if ((lesson.objectiveIds || []).includes(objectiveId)) return lessonId;
  }
  return null;
}

function recommendation({
  type,
  objectiveResult,
  priority,
  reason,
  action,
  isPrerequisite,
}) {
  return {
    type,
    priority,
    objectiveId: objectiveResult ? objectiveResult.objectiveId : null,
    objectiveTitle: objectiveResult ? objectiveResult.title : '',
    state: objectiveResult ? objectiveResult.state : null,
    confidence: objectiveResult ? objectiveResult.confidence : 0,
    confirmedGap: objectiveResult ? objectiveResult.confirmedGap : false,
    isPrerequisite: Boolean(isPrerequisite),
    evidenceSummary: objectiveResult
      ? objectiveResult.evidenceSummary
      : 'No evidence yet',
    reason,
    action,
  };
}

function prerequisiteRecommendation(result, courseMap, lessonId) {
  const title = result.title || result.objectiveId;
  if (
    result.state === ASSESSMENT_STATES.REVIEW_RECOMMENDED ||
    (result.state === ASSESSMENT_STATES.NEEDS_PRACTICE && result.confirmedGap)
  ) {
    const reason =
      result.state === ASSESSMENT_STATES.REVIEW_RECOMMENDED
        ? `"${title}" is a prerequisite for this lesson. It looked demonstrated earlier, but the latest check was incorrect. Review the earlier lesson, then reassess.`
        : `"${title}" is a prerequisite for this lesson and ${result.incorrectCount} checks were incorrect with no correct evidence yet. Review the earlier lesson before continuing.`;
    return recommendation({
      type: RECOMMENDATION_TYPES.REVIEW_PREREQUISITE,
      objectiveResult: result,
      priority: 'high',
      reason,
      isPrerequisite: true,
      action: {
        kind: 'review',
        lessonId: findLessonForObjective(courseMap, result.objectiveId, lessonId),
      },
    });
  }

  if (result.state === ASSESSMENT_STATES.NOT_ASSESSED) {
    return recommendation({
      type: RECOMMENDATION_TYPES.TAKE_DIAGNOSTIC,
      objectiveResult: result,
      priority: 'medium',
      reason: `We have no evidence yet for prerequisite "${title}". That is unknown, not a gap. Take the short check so we can decide what support you need.`,
      isPrerequisite: true,
      action: { kind: 'diagnostic' },
    });
  }

  const reason =
    result.state === ASSESSMENT_STATES.DEVELOPING
      ? `"${title}" is a prerequisite for this lesson and has partial evidence (${result.evidenceSummary}). A short targeted practice will strengthen it before you continue.`
      : `"${title}" is a prerequisite for this lesson. ${result.evidenceSummary}; that is an early signal, not enough to diagnose a gap. Try targeted practice, then reassess.`;

  return recommendation({
    type: RECOMMENDATION_TYPES.TARGETED_PRACTICE,
    objectiveResult: result,
    priority: 'medium',
    reason,
    isPrerequisite: true,
    action: { kind: 'practice', lessonId: null },
  });
}

function objectiveRecommendation(result) {
  const title = result.title || result.objectiveId;
  if (result.state === ASSESSMENT_STATES.DEMONSTRATED) return null;
  if (result.state === ASSESSMENT_STATES.NOT_ASSESSED) return null;

  const priority = result.confirmedGap ? 'high' : 'medium';
  const reason =
    result.state === ASSESSMENT_STATES.REVIEW_RECOMMENDED
      ? `"${title}" was demonstrated earlier but the latest check was incorrect. A short targeted practice and reassessment will restore confidence.`
      : result.confirmedGap
        ? `"${title}" has ${result.incorrectCount} incorrect checks and no correct evidence yet. Targeted practice is recommended before the lesson assessment.`
        : `"${title}" has ${result.evidenceSummary}. That is an early signal, not a confirmed gap. A short targeted practice will clarify where to focus.`;

  return recommendation({
    type: RECOMMENDATION_TYPES.TARGETED_PRACTICE,
    objectiveResult: result,
    priority,
    reason,
    isPrerequisite: false,
    action: { kind: 'practice', lessonId: null },
  });
}

export function analyzeLessonReadiness({
  courseMap,
  lessonId,
  evidence = createEmptyEvidence(),
}) {
  if (!courseMap || typeof courseMap !== 'object') {
    throw new Error('analyzeLessonReadiness requires a course learning map');
  }
  const lessonSpec = courseMap.lessons && courseMap.lessons[lessonId];
  if (!lessonSpec) {
    throw new Error(
      `No learning map for lesson "${lessonId}" in course "${courseMap.courseId}"`
    );
  }

  const objectivesById = new Map(
    (courseMap.objectives || []).map((objective) => [objective.id, objective])
  );
  const observationsByObjective = groupObservationsByObjective(evidence);

  const buildResult = (objectiveId, isPrerequisite) => {
    const objective = objectivesById.get(objectiveId);
    if (!objective) {
      throw new Error(`Learning map references unknown objective "${objectiveId}"`);
    }
    return classifyObjectiveEvidence(observationsByObjective.get(objectiveId), {
      objectiveId,
      title: objective.title,
      isPrerequisite,
    });
  };

  const prerequisiteObjectiveIds = lessonSpec.prerequisiteObjectiveIds || [];
  const prerequisiteResults = prerequisiteObjectiveIds.map((objectiveId) =>
    buildResult(objectiveId, true)
  );
  const lessonObjectiveResults = (lessonSpec.objectiveIds || []).map(
    (objectiveId) => buildResult(objectiveId, false)
  );

  const recommendations = [];
  prerequisiteResults.forEach((result) => {
    if (result.state === ASSESSMENT_STATES.DEMONSTRATED) return;
    recommendations.push(prerequisiteRecommendation(result, courseMap, lessonId));
  });
  lessonObjectiveResults.forEach((result) => {
    const entry = objectiveRecommendation(result);
    if (entry) recommendations.push(entry);
  });

  const hasAnyEvidence =
    normalizeEvidence(evidence).observations.length > 0;

  if (recommendations.length === 0) {
    if (prerequisiteResults.length > 0) {
      recommendations.push(
        recommendation({
          type: RECOMMENDATION_TYPES.CONTINUE_LESSON,
          objectiveResult: null,
          priority: 'low',
          reason: `All prerequisites show repeated correct evidence (${prerequisiteResults
            .map((result) => result.evidenceSummary)
            .join('; ')}). You are ready to continue.`,
          action: { kind: 'continue' },
        })
      );
    } else if (hasAnyEvidence) {
      recommendations.push(
        recommendation({
          type: RECOMMENDATION_TYPES.CONTINUE_LESSON,
          objectiveResult: null,
          priority: 'low',
          reason:
            'The assessed objectives show repeated correct evidence. Continue with the lesson.',
          action: { kind: 'continue' },
        })
      );
    } else if (lessonSpec.diagnostic && (lessonSpec.diagnostic.items || []).length) {
      recommendations.push(
        recommendation({
          type: RECOMMENDATION_TYPES.TAKE_DIAGNOSTIC,
          objectiveResult: null,
          priority: 'low',
          reason:
            'There is no evidence yet for this lesson. A short check can set a starting point; missing evidence is not a gap and does not block you.',
          action: { kind: 'diagnostic' },
        })
      );
    }
  }

  recommendations.sort(
    (left, right) =>
      (PRIORITY_ORDER[left.priority] ?? 9) - (PRIORITY_ORDER[right.priority] ?? 9)
  );

  const blockingPrerequisites = prerequisiteResults.some(
    (result) =>
      result.state === ASSESSMENT_STATES.REVIEW_RECOMMENDED ||
      (result.state === ASSESSMENT_STATES.NEEDS_PRACTICE && result.confirmedGap)
  );
  let readiness;
  if (prerequisiteResults.length === 0) {
    readiness = READINESS_STATES.READY;
  } else if (blockingPrerequisites) {
    readiness = READINESS_STATES.NEEDS_SUPPORT;
  } else if (
    prerequisiteResults.every(
      (result) => result.state === ASSESSMENT_STATES.DEMONSTRATED
    )
  ) {
    readiness = READINESS_STATES.READY;
  } else {
    readiness = READINESS_STATES.UNKNOWN;
  }

  return {
    courseId: courseMap.courseId,
    lessonId,
    hasPrerequisites: prerequisiteResults.length > 0,
    readiness,
    ready: readiness === READINESS_STATES.READY,
    hasConfirmedGap: [...prerequisiteResults, ...lessonObjectiveResults].some(
      (result) => result.confirmedGap
    ),
    prerequisiteResults,
    lessonObjectiveResults,
    recommendations,
    primaryRecommendation: recommendations[0] || null,
    evidenceSummary: summarizeEvidence(evidence),
  };
}

// ---------------------------------------------------------------------------
// Practice selection and reassessment content
// ---------------------------------------------------------------------------

export function selectPracticeItems(
  diagnosticSpec,
  recommendations = [],
  { maxItems = 5 } = {}
) {
  const targetObjectiveIds = new Set(
    recommendations
      .filter(
        (entry) =>
          entry.type === RECOMMENDATION_TYPES.TARGETED_PRACTICE ||
          entry.type === RECOMMENDATION_TYPES.REVIEW_PREREQUISITE
      )
      .map((entry) => entry.objectiveId)
      .filter(Boolean)
  );
  if (targetObjectiveIds.size === 0) return [];
  return (diagnosticSpec && diagnosticSpec.practiceItems
    ? diagnosticSpec.practiceItems
    : []
  )
    .filter((item) => targetObjectiveIds.has(item.objectiveId))
    .slice(0, maxItems);
}

export function getReassessmentItems(diagnosticSpec) {
  if (!diagnosticSpec) return [];
  if (
    Array.isArray(diagnosticSpec.reassessmentItems) &&
    diagnosticSpec.reassessmentItems.length > 0
  ) {
    return diagnosticSpec.reassessmentItems;
  }
  return Array.isArray(diagnosticSpec.items) ? diagnosticSpec.items : [];
}

// ---------------------------------------------------------------------------
// Content validation
// ---------------------------------------------------------------------------

function validateItems(items, objectiveIds, label) {
  const errors = [];
  if (!Array.isArray(items)) {
    return [`${label} must be an array`];
  }
  const seen = new Set();
  items.forEach((item, index) => {
    const prefix = `${label}[${index}]`;
    if (!item || typeof item !== 'object') {
      errors.push(`${prefix} must be an object`);
      return;
    }
    if (!item.id || typeof item.id !== 'string') {
      errors.push(`${prefix} needs a string id`);
    } else if (seen.has(item.id)) {
      errors.push(`${label} has duplicate item id "${item.id}"`);
    } else {
      seen.add(item.id);
    }
    if (!item.objectiveId || !objectiveIds.has(item.objectiveId)) {
      errors.push(
        `${prefix} has unknown objectiveId "${item.objectiveId || ''}"`
      );
    }
    if (!VALID_ITEM_KINDS.includes(item.kind)) {
      errors.push(`${prefix} has unsupported kind "${item.kind}"`);
    }
    if (!item.prompt || typeof item.prompt !== 'string') {
      errors.push(`${prefix} needs a prompt`);
    }
    if (item.kind === 'single_choice') {
      if (!Array.isArray(item.options) || item.options.length < 2) {
        errors.push(`${prefix} needs at least two options`);
      }
      if (
        !Number.isInteger(item.correctIndex) ||
        item.correctIndex < 0 ||
        (Array.isArray(item.options) &&
          item.correctIndex >= item.options.length)
      ) {
        errors.push(`${prefix} needs a valid correctIndex`);
      }
    }
    if (item.kind === 'short_text') {
      const accepted = Array.isArray(item.acceptedAnswers)
        ? item.acceptedAnswers
        : [];
      if (isBlankValue(item.answer) && accepted.length === 0) {
        errors.push(`${prefix} needs an answer or acceptedAnswers`);
      }
    }
  });
  return errors;
}

function hasPrerequisiteCycle(objectives) {
  const byId = new Map(objectives.map((objective) => [objective.id, objective]));
  const visiting = new Set();
  const visited = new Set();

  const visit = (id) => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const objective = byId.get(id);
    for (const prerequisiteId of objective?.prerequisiteIds || []) {
      if (visit(prerequisiteId)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };

  return objectives.some((objective) => visit(objective.id));
}

export function validateLearningMap(courseMap) {
  const errors = [];
  if (!courseMap || typeof courseMap !== 'object') {
    return ['course map must be an object'];
  }
  if (!courseMap.courseId) errors.push('courseId is required');
  if (!Array.isArray(courseMap.objectives) || courseMap.objectives.length === 0) {
    errors.push('objectives must be a non-empty array');
    return errors;
  }

  const objectiveIds = new Set();
  courseMap.objectives.forEach((objective, index) => {
    if (!objective || !objective.id) {
      errors.push(`objectives[${index}] needs an id`);
      return;
    }
    if (objectiveIds.has(objective.id)) {
      errors.push(`duplicate objective id "${objective.id}"`);
    }
    objectiveIds.add(objective.id);
    if (!objective.title) {
      errors.push(`objective "${objective.id}" needs a title`);
    }
  });

  courseMap.objectives.forEach((objective) => {
    (objective.prerequisiteIds || []).forEach((prerequisiteId) => {
      if (!objectiveIds.has(prerequisiteId)) {
        errors.push(
          `objective "${objective.id}" references unknown prerequisite "${prerequisiteId}"`
        );
      }
      if (prerequisiteId === objective.id) {
        errors.push(`objective "${objective.id}" cannot require itself`);
      }
    });
  });

  if (hasPrerequisiteCycle(courseMap.objectives)) {
    errors.push('objective prerequisites contain a cycle');
  }

  const lessons =
    courseMap.lessons && typeof courseMap.lessons === 'object'
      ? courseMap.lessons
      : null;
  if (!lessons || Object.keys(lessons).length === 0) {
    errors.push('lessons must be a non-empty object');
    return errors;
  }

  Object.entries(lessons).forEach(([lessonId, lesson]) => {
    if (!lesson || typeof lesson !== 'object') {
      errors.push(`lesson "${lessonId}" must be an object`);
      return;
    }
    const objectiveIdsInLesson = new Set();
    (lesson.objectiveIds || []).forEach((objectiveId) => {
      if (!objectiveIds.has(objectiveId)) {
        errors.push(
          `lesson "${lessonId}" references unknown objective "${objectiveId}"`
        );
      } else if (objectiveIdsInLesson.has(objectiveId)) {
        errors.push(
          `lesson "${lessonId}" lists objective "${objectiveId}" more than once`
        );
      } else {
        objectiveIdsInLesson.add(objectiveId);
      }
    });
    (lesson.prerequisiteObjectiveIds || []).forEach((objectiveId) => {
      if (!objectiveIds.has(objectiveId)) {
        errors.push(
          `lesson "${lessonId}" references unknown prerequisite objective "${objectiveId}"`
        );
      }
    });

    if (lesson.diagnostic) {
      errors.push(
        ...validateItems(
          lesson.diagnostic.items,
          objectiveIds,
          `lesson "${lessonId}" diagnostic.items`
        )
      );
      if (lesson.diagnostic.practiceItems) {
        errors.push(
          ...validateItems(
            lesson.diagnostic.practiceItems,
            objectiveIds,
            `lesson "${lessonId}" diagnostic.practiceItems`
          )
        );
      }
      if (lesson.diagnostic.reassessmentItems) {
        errors.push(
          ...validateItems(
            lesson.diagnostic.reassessmentItems,
            objectiveIds,
            `lesson "${lessonId}" diagnostic.reassessmentItems`
          )
        );
      }
    }
  });

  return errors;
}
