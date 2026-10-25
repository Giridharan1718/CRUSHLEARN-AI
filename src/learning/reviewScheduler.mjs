// Active-recall scheduling.
//
// This is intentionally a small interval-ladder scheduler rather than a
// full SM-2 implementation. The goal is to make the rules easy to explain,
// test and configure. It is a scheduling aid, not a claim that a learner has
// permanently memorised a concept.
//
// Algorithm
// ---------
// - A concept with no saved record is due now.
// - A correct recall advances the concept one rung on the interval ladder
//   (1, 3, 7, 14, 30, 60 days by default).
// - A correct recall rated "easy" skips one additional rung.
// - A correct recall rated "hard" uses the next rung but halves the interval.
// - An incorrect recall resets the concept to stage 0 and schedules it again
//   after the configured short interval (1 day by default).
// - The next due date is always calculated from the supplied `now` value so
//   tests and callers can be deterministic.
//
// The queue orders due work by:
//   1. weak evidence (confirmed gap / review recommended / last miss),
//   2. how overdue the review is,
//   3. due date and title.
//
// Course-authored review concepts supply the content. This module only owns
// scheduling and prioritisation, so it stays subject-agnostic.

import { ASSESSMENT_STATES } from '../utils/evidenceClassification.mjs';
import {
  classifyObjectiveEvidence,
  groupObservationsByObjective,
} from './gapDetection.mjs';

export const REVIEW_SCHEMA_VERSION = 1;
export const REVIEW_OUTCOMES = Object.freeze({
  CORRECT: 'correct',
  INCORRECT: 'incorrect',
});
export const SELF_ASSESSMENTS = Object.freeze({
  EASY: 'easy',
  HARD: 'hard',
});

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_REVIEW_POLICY = Object.freeze({
  intervalsDays: Object.freeze([1, 3, 7, 14, 30, 60]),
  incorrectIntervalDays: 1,
  hardFactor: 0.5,
  easyStageBonus: 1,
  maxIntervalDays: 180,
});

function toDate(value, label) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid date`);
  }
  return date;
}

function toIso(value) {
  return toDate(value, 'date').toISOString();
}

function isValidIso(value) {
  return (
    (typeof value === 'string' || value instanceof Date || typeof value === 'number') &&
    !Number.isNaN(new Date(value).getTime())
  );
}

function asNonNegativeInteger(value, fallback = 0) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function asPositiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function asPositiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function resolveReviewPolicy(overrides = {}) {
  const merged = {
    ...DEFAULT_REVIEW_POLICY,
    ...(overrides && typeof overrides === 'object' ? overrides : {}),
  };

  const intervals = Array.isArray(merged.intervalsDays)
    ? merged.intervalsDays
        .map((value) => Math.round(Number(value)))
        .filter((value) => Number.isFinite(value) && value > 0)
    : [];

  return {
    intervalsDays:
      intervals.length > 0
        ? intervals
        : [...DEFAULT_REVIEW_POLICY.intervalsDays],
    incorrectIntervalDays: asPositiveInteger(
      merged.incorrectIntervalDays,
      DEFAULT_REVIEW_POLICY.incorrectIntervalDays
    ),
    hardFactor: clamp(
      asPositiveNumber(merged.hardFactor, DEFAULT_REVIEW_POLICY.hardFactor),
      0.1,
      1
    ),
    easyStageBonus: clamp(
      asNonNegativeInteger(
        merged.easyStageBonus,
        DEFAULT_REVIEW_POLICY.easyStageBonus
      ),
      0,
      3
    ),
    maxIntervalDays: asPositiveInteger(
      merged.maxIntervalDays,
      DEFAULT_REVIEW_POLICY.maxIntervalDays
    ),
  };
}

export function createEmptyReviewState() {
  return {
    version: REVIEW_SCHEMA_VERSION,
    records: {},
  };
}

function normalizeRecord(key, raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!key || key === '__proto__' || key === 'constructor' || key === 'prototype') {
    return null;
  }
  if (typeof raw.conceptId === 'string' && raw.conceptId !== key) return null;
  if (!isValidIso(raw.dueAt)) return null;

  const intervalDays = asPositiveInteger(raw.intervalDays, 1);
  const correctCount = asNonNegativeInteger(raw.correctCount, 0);
  const incorrectCount = asNonNegativeInteger(raw.incorrectCount, 0);
  const lastOutcome = Object.values(REVIEW_OUTCOMES).includes(raw.lastOutcome)
    ? raw.lastOutcome
    : null;
  const lastSelfAssessment = Object.values(SELF_ASSESSMENTS).includes(
    raw.lastSelfAssessment
  )
    ? raw.lastSelfAssessment
    : null;

  return {
    conceptId: key,
    courseId: typeof raw.courseId === 'string' ? raw.courseId : null,
    objectiveId: typeof raw.objectiveId === 'string' ? raw.objectiveId : null,
    lessonId: typeof raw.lessonId === 'string' ? raw.lessonId : null,
    title: typeof raw.title === 'string' ? raw.title : '',
    stage: asNonNegativeInteger(raw.stage, 0),
    intervalDays,
    dueAt: toIso(raw.dueAt),
    reviewCount: Math.max(
      asNonNegativeInteger(raw.reviewCount, 0),
      correctCount + incorrectCount
    ),
    correctCount,
    incorrectCount,
    lapses: asNonNegativeInteger(raw.lapses, 0),
    lastOutcome,
    lastSelfAssessment,
    lastReviewedAt: isValidIso(raw.lastReviewedAt)
      ? toIso(raw.lastReviewedAt)
      : null,
    updatedAt: isValidIso(raw.updatedAt) ? toIso(raw.updatedAt) : null,
  };
}

/**
 * Treat saved review data as untrusted. Corrupt JSON is handled by the store;
 * this function additionally drops malformed records while keeping valid ones.
 */
export function normalizeReviewState(state) {
  if (!state || typeof state !== 'object') return createEmptyReviewState();
  const source = state.records;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return createEmptyReviewState();
  }

  const records = {};
  Object.entries(source).forEach(([key, raw]) => {
    const record = normalizeRecord(key, raw);
    if (record) records[key] = record;
  });
  return { version: REVIEW_SCHEMA_VERSION, records };
}

export function getReviewRecord(state, conceptId) {
  if (!conceptId) return null;
  return normalizeReviewState(state).records[conceptId] || null;
}

function intervalForStage(stage, policy) {
  const safeStage = Math.max(1, Math.floor(stage));
  const index = Math.min(safeStage - 1, policy.intervalsDays.length - 1);
  return policy.intervalsDays[index];
}

export function buildNextReview({
  state = createEmptyReviewState(),
  concept,
  outcome,
  selfAssessment = null,
  now = new Date(),
  policy,
} = {}) {
  if (!concept || typeof concept !== 'object' || !concept.id) {
    throw new Error('buildNextReview requires a concept with an id');
  }
  if (!Object.values(REVIEW_OUTCOMES).includes(outcome)) {
    throw new Error(`Unsupported review outcome: ${outcome}`);
  }

  const current = normalizeReviewState(state);
  const existing = current.records[concept.id] || null;
  const resolvedPolicy = resolveReviewPolicy(policy);
  const timestamp = toIso(now);
  const rating = Object.values(SELF_ASSESSMENTS).includes(selfAssessment)
    ? selfAssessment
    : null;

  let stage = existing ? existing.stage : 0;
  let intervalDays;
  let correctCount = existing ? existing.correctCount : 0;
  let incorrectCount = existing ? existing.incorrectCount : 0;
  let lapses = existing ? existing.lapses : 0;

  if (outcome === REVIEW_OUTCOMES.INCORRECT) {
    stage = 0;
    intervalDays = resolvedPolicy.incorrectIntervalDays;
    incorrectCount += 1;
    lapses += 1;
  } else {
    stage =
      (existing ? existing.stage : 0) +
      1 +
      (rating === SELF_ASSESSMENTS.EASY ? resolvedPolicy.easyStageBonus : 0);
    intervalDays = intervalForStage(stage, resolvedPolicy);
    if (rating === SELF_ASSESSMENTS.HARD) {
      intervalDays = Math.max(
        1,
        Math.round(intervalDays * resolvedPolicy.hardFactor)
      );
    }
    correctCount += 1;
  }

  intervalDays = clamp(
    intervalDays,
    1,
    resolvedPolicy.maxIntervalDays
  );
  const dueAt = new Date(Date.parse(timestamp) + intervalDays * DAY_MS).toISOString();

  const record = {
    conceptId: concept.id,
    courseId: concept.courseId || (existing ? existing.courseId : null),
    objectiveId: concept.objectiveId || (existing ? existing.objectiveId : null),
    lessonId: concept.lessonId || (existing ? existing.lessonId : null),
    title: concept.title || (existing ? existing.title : ''),
    stage,
    intervalDays,
    dueAt,
    reviewCount: (existing ? existing.reviewCount : 0) + 1,
    correctCount,
    incorrectCount,
    lapses,
    lastOutcome: outcome,
    lastSelfAssessment: rating,
    lastReviewedAt: timestamp,
    updatedAt: timestamp,
  };

  return {
    state: {
      version: REVIEW_SCHEMA_VERSION,
      records: {
        ...current.records,
        [concept.id]: record,
      },
    },
    record,
    intervalDays,
    dueAt,
    policy: resolvedPolicy,
  };
}

// Alias kept deliberately short for UI callers; buildNextReview is the
// descriptive export used by tests and documentation.
export const scheduleReview = buildNextReview;

function priorityFor({
  objectiveState,
  confirmedGap,
  lastOutcome,
  overdueDays,
  isNew,
  weakEvidence,
}) {
  if (
    weakEvidence ||
    confirmedGap ||
    lastOutcome === REVIEW_OUTCOMES.INCORRECT ||
    overdueDays >= 3
  ) {
    return 'high';
  }
  if (
    objectiveState === ASSESSMENT_STATES.NEEDS_PRACTICE ||
    objectiveState === ASSESSMENT_STATES.DEVELOPING ||
    objectiveState === ASSESSMENT_STATES.NOT_ASSESSED ||
    overdueDays > 0 ||
    isNew
  ) {
    return 'medium';
  }
  return 'low';
}

function priorityScoreFor({
  objectiveState,
  confirmedGap,
  lastOutcome,
  overdueDays,
  isNew,
}) {
  const stateScore = {
    [ASSESSMENT_STATES.REVIEW_RECOMMENDED]: 520,
    [ASSESSMENT_STATES.NEEDS_PRACTICE]: 400,
    [ASSESSMENT_STATES.DEVELOPING]: 200,
    [ASSESSMENT_STATES.NOT_ASSESSED]: 100,
    [ASSESSMENT_STATES.DEMONSTRATED]: 0,
  };
  let score = stateScore[objectiveState] || 0;
  if (confirmedGap) score += 80;
  if (lastOutcome === REVIEW_OUTCOMES.INCORRECT) score += 160;
  // Outdated work must be able to outrank a fresh unknown concept.
  score += Math.min(overdueDays, 60) * 30;
  if (isNew) score += 10;
  return score;
}

export function compareDueReviewItems(left, right) {
  return (
    (right.priorityScore || 0) - (left.priorityScore || 0) ||
    (right.overdueDays || 0) - (left.overdueDays || 0) ||
    String(left.dueAt).localeCompare(String(right.dueAt)) ||
    String(left.title).localeCompare(String(right.title))
  );
}

export function compareUpcomingReviewItems(left, right) {
  return (
    String(left.dueAt).localeCompare(String(right.dueAt)) ||
    (right.priorityScore || 0) - (left.priorityScore || 0) ||
    String(left.title).localeCompare(String(right.title))
  );
}

export function buildReviewQueue({
  activities = [],
  reviewState = createEmptyReviewState(),
  evidence = null,
  now = new Date(),
  policy,
} = {}) {
  const resolvedPolicy = resolveReviewPolicy(policy);
  const timestamp = toIso(now);
  const nowMs = Date.parse(timestamp);
  const current = normalizeReviewState(reviewState);
  const observationsByObjective = groupObservationsByObjective(
    evidence || { version: 1, observations: [], attempts: [] }
  );
  const activityIds = new Set();
  const due = [];
  const upcoming = [];

  (Array.isArray(activities) ? activities : []).forEach((activity) => {
    if (!activity || !activity.id || !activity.objectiveId) return;
    activityIds.add(activity.id);

    const record = current.records[activity.id] || null;
    const classification = classifyObjectiveEvidence(
      observationsByObjective.get(activity.objectiveId) || [],
      {
        objectiveId: activity.objectiveId,
        title: activity.objectiveTitle || activity.title || activity.objectiveId,
      }
    );
    const dueAt = record ? record.dueAt : timestamp;
    const dueMs = Date.parse(dueAt);
    const isDue = dueMs <= nowMs;
    const isNew = !record;
    const overdueDays = isDue
      ? Math.max(0, Math.floor((nowMs - dueMs) / DAY_MS))
      : 0;
    const daysUntilDue = isDue
      ? 0
      : Math.max(0, Math.ceil((dueMs - nowMs) / DAY_MS));
    const weakEvidence =
      classification.state === ASSESSMENT_STATES.NEEDS_PRACTICE ||
      classification.state === ASSESSMENT_STATES.REVIEW_RECOMMENDED;
    const priorityScore = priorityScoreFor({
      objectiveState: classification.state,
      confirmedGap: classification.confirmedGap,
      lastOutcome: record ? record.lastOutcome : null,
      overdueDays,
      isNew,
    });
    const item = {
      ...activity,
      dueAt,
      status: isDue ? 'due' : 'upcoming',
      isNew,
      overdueDays,
      daysUntilDue,
      weakEvidence,
      outdated: overdueDays > 0,
      objectiveState: classification.state,
      objectiveStateLabel: classification.state,
      evidenceSummary: classification.evidenceSummary,
      evidenceReason: classification.reason,
      confirmedGap: classification.confirmedGap,
      reviewCount: record ? record.reviewCount : 0,
      lastOutcome: record ? record.lastOutcome : null,
      lastSelfAssessment: record ? record.lastSelfAssessment : null,
      lastReviewedAt: record ? record.lastReviewedAt : null,
      priorityScore,
      priority: priorityFor({
        objectiveState: classification.state,
        confirmedGap: classification.confirmedGap,
        lastOutcome: record ? record.lastOutcome : null,
        overdueDays,
        isNew,
        weakEvidence,
      }),
    };

    if (isDue) due.push(item);
    else upcoming.push(item);
  });

  due.sort(compareDueReviewItems);
  upcoming.sort(compareUpcomingReviewItems);

  return {
    due,
    upcoming,
    activityCount: activityIds.size,
    unavailableCount: Object.keys(current.records).filter(
      (conceptId) => !activityIds.has(conceptId)
    ).length,
    policy: resolvedPolicy,
    now: timestamp,
  };
}

export function mergeReviewQueues(queues = []) {
  const valid = (Array.isArray(queues) ? queues : []).filter(
    (queue) => queue && typeof queue === 'object'
  );
  const due = valid.flatMap((queue) => queue.due || []).sort(compareDueReviewItems);
  const upcoming = valid
    .flatMap((queue) => queue.upcoming || [])
    .sort(compareUpcomingReviewItems);

  return {
    due,
    upcoming,
    activityCount: valid.reduce(
      (sum, queue) => sum + (queue.activityCount || 0),
      0
    ),
    unavailableCount: valid.reduce(
      (sum, queue) => sum + (queue.unavailableCount || 0),
      0
    ),
  };
}

export function getReviewSummary(queue = {}) {
  const due = Array.isArray(queue.due) ? queue.due : [];
  const upcoming = Array.isArray(queue.upcoming) ? queue.upcoming : [];
  return {
    dueCount: due.length,
    upcomingCount: upcoming.length,
    highPriorityCount: due.filter((item) => item.priority === 'high').length,
    overdueCount: due.filter((item) => item.overdueDays > 0).length,
    activityCount:
      typeof queue.activityCount === 'number'
        ? queue.activityCount
        : due.length + upcoming.length,
    unavailableCount: queue.unavailableCount || 0,
  };
}
