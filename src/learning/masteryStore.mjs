// Course-scoped progression-decision log.
//
// Mastery is derived from evidence, not stored as a second source of truth.
// This store only records the explanation for the latest progression decisions
// so learners and authors can see why a lesson was allowed or deferred. It is
// intentionally separate from journey progress and can be deleted without
// changing what evidence exists.
//
// Saved data is untrusted: corrupt envelopes are ignored, malformed decisions
// are dropped, and only a bounded number of valid decisions is kept.

import {
  MASTERY_SCHEMA_VERSION,
  PROGRESSION_STATUSES,
} from './mastery.mjs';

export const MASTERY_STORAGE_PREFIX = 'crushlearn_mastery';
export const MASTERY_STORAGE_VERSION = MASTERY_SCHEMA_VERSION;
export const MASTERY_UPDATED_EVENT = 'crushlearn:mastery-updated';
export const MAX_SAVED_DECISIONS = 50;

export function getMasteryStorageKey(courseId) {
  return `${MASTERY_STORAGE_PREFIX}_${courseId}`;
}

export function createEmptyMasteryLog() {
  return {
    version: MASTERY_SCHEMA_VERSION,
    decisions: [],
  };
}

function isValidIso(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !Number.isNaN(new Date(value).getTime())
  );
}

function normalizeCheck(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (typeof raw.passed !== 'boolean') return null;
  return {
    id: raw.id,
    label: typeof raw.label === 'string' ? raw.label : raw.id,
    passed: raw.passed,
    actual:
      typeof raw.actual === 'string' ||
      typeof raw.actual === 'number' ||
      typeof raw.actual === 'boolean'
        ? raw.actual
        : null,
    required:
      typeof raw.required === 'string' ||
      typeof raw.required === 'number' ||
      typeof raw.required === 'boolean'
        ? raw.required
        : null,
    reason: typeof raw.reason === 'string' ? raw.reason : '',
    objectiveId:
      typeof raw.objectiveId === 'string' ? raw.objectiveId : null,
  };
}

function normalizeObjective(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.objectiveId !== 'string' || !raw.objectiveId) return null;
  return {
    objectiveId: raw.objectiveId,
    title: typeof raw.title === 'string' ? raw.title : raw.objectiveId,
    status: typeof raw.status === 'string' ? raw.status : null,
    criteriaMet: Boolean(raw.criteriaMet),
    retentionMet: Boolean(raw.retentionMet),
    progressionEligible: Boolean(raw.progressionEligible),
    reason: typeof raw.reason === 'string' ? raw.reason : '',
  };
}

function normalizePrerequisite(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.objectiveId !== 'string' || !raw.objectiveId) return null;
  return {
    objectiveId: raw.objectiveId,
    title: typeof raw.title === 'string' ? raw.title : raw.objectiveId,
    status: typeof raw.status === 'string' ? raw.status : null,
    reason: typeof raw.reason === 'string' ? raw.reason : '',
  };
}

/**
 * Keep the explanation compact but complete enough to answer "why was this
 * allowed or deferred?" without depending on the evidence still existing.
 */
export function normalizeMasteryDecision(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.courseId !== 'string' || !raw.courseId) return null;
  if (typeof raw.lessonId !== 'string' || !raw.lessonId) return null;
  if (typeof raw.allowed !== 'boolean') return null;
  const status = raw.allowed
    ? PROGRESSION_STATUSES.ALLOWED
    : PROGRESSION_STATUSES.DEFERRED;
  if (
    raw.status !== undefined &&
    raw.status !== PROGRESSION_STATUSES.ALLOWED &&
    raw.status !== PROGRESSION_STATUSES.DEFERRED
  ) {
    return null;
  }
  if (raw.status !== undefined && raw.status !== status) return null;
  if (!isValidIso(raw.at)) return null;

  return {
    decisionId:
      typeof raw.decisionId === 'string' && raw.decisionId
        ? raw.decisionId
        : `mastery:${raw.courseId}:${raw.lessonId}:${raw.at}`,
    courseId: raw.courseId,
    lessonId: raw.lessonId,
    at: new Date(raw.at).toISOString(),
    allowed: raw.allowed,
    status,
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    reasons: Array.isArray(raw.reasons)
      ? raw.reasons.filter((reason) => typeof reason === 'string')
      : [],
    checks: Array.isArray(raw.checks)
      ? raw.checks.map(normalizeCheck).filter(Boolean)
      : [],
    objectives: Array.isArray(raw.objectives)
      ? raw.objectives.map(normalizeObjective).filter(Boolean)
      : [],
    prerequisites: Array.isArray(raw.prerequisites)
      ? raw.prerequisites.map(normalizePrerequisite).filter(Boolean)
      : [],
    activityComplete: Boolean(raw.activityComplete),
    evidenceAttempts: Number.isInteger(raw.evidenceAttempts)
      ? raw.evidenceAttempts
      : 0,
    evidenceObservations: Number.isInteger(raw.evidenceObservations)
      ? raw.evidenceObservations
      : 0,
  };
}

export function normalizeMasteryLog(log) {
  if (!log || typeof log !== 'object' || !Array.isArray(log.decisions)) {
    return createEmptyMasteryLog();
  }
  const seen = new Set();
  const decisions = log.decisions
    .map(normalizeMasteryDecision)
    .filter((decision) => {
      if (!decision || seen.has(decision.decisionId)) return false;
      seen.add(decision.decisionId);
      return true;
    })
    .slice(-MAX_SAVED_DECISIONS);
  return {
    version: MASTERY_SCHEMA_VERSION,
    decisions,
  };
}

export function createMasteryStore(storage) {
  if (
    !storage ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function'
  ) {
    throw new Error(
      'createMasteryStore requires a storage adapter such as window.localStorage'
    );
  }

  const load = (courseId) => {
    const raw = storage.getItem(getMasteryStorageKey(courseId));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.schemaVersion !== MASTERY_STORAGE_VERSION) {
        return null;
      }
      if (parsed.courseId !== courseId) return null;
      if (!Array.isArray(parsed.decisions)) return null;
      return normalizeMasteryLog({ decisions: parsed.decisions });
    } catch {
      return null;
    }
  };

  return {
    load,

    saveDecision(courseId, decision, now = new Date().toISOString()) {
      const normalized = normalizeMasteryDecision({
        ...decision,
        courseId: decision && decision.courseId
          ? decision.courseId
          : courseId,
      });
      if (!normalized) {
        throw new Error('saveDecision requires a valid progression decision');
      }
      if (normalized.courseId !== courseId) {
        throw new Error('Progression decision courseId does not match the store key');
      }
      const current = load(courseId) || createEmptyMasteryLog();
      const decisions = current.decisions.filter(
        (entry) => entry.decisionId !== normalized.decisionId
      );
      decisions.push(normalized);
      const payload = {
        schemaVersion: MASTERY_STORAGE_VERSION,
        courseId,
        version: MASTERY_SCHEMA_VERSION,
        decisions: decisions.slice(-MAX_SAVED_DECISIONS),
        updatedAt: now,
      };
      storage.setItem(
        getMasteryStorageKey(courseId),
        JSON.stringify(payload)
      );
      if (
        typeof window !== 'undefined' &&
        typeof window.dispatchEvent === 'function' &&
        typeof CustomEvent === 'function'
      ) {
        window.dispatchEvent(
          new CustomEvent(MASTERY_UPDATED_EVENT, {
            detail: { courseId, decision: normalized },
          })
        );
      }
      return normalized;
    },

    getLatestDecision(courseId, lessonId) {
      const log = load(courseId);
      if (!log) return null;
      const matching = log.decisions.filter(
        (decision) => decision.lessonId === lessonId
      );
      return matching.length > 0 ? matching[matching.length - 1] : null;
    },

    clear(courseId) {
      if (typeof storage.removeItem === 'function') {
        storage.removeItem(getMasteryStorageKey(courseId));
      }
    },
  };
}

export function loadMasteryLogOrDefault(store, courseId) {
  return (store && store.load(courseId)) || createEmptyMasteryLog();
}
