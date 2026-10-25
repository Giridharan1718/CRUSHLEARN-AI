// Course-scoped evidence persistence.
//
// Evidence belongs to the learner's work in a course, not to one lesson: a
// diagnostic taken in lesson 1 is valid evidence when lesson 2 checks the same
// prerequisite objective. Keys are therefore scoped by course only, using the
// same versioned localStorage envelope as lesson journey progress.

import {
  EVIDENCE_SCHEMA_VERSION,
  createEmptyEvidence,
  normalizeEvidence,
} from './gapDetection.mjs';

export const EVIDENCE_STORAGE_PREFIX = 'crushlearn_evidence';
export const EVIDENCE_STORAGE_VERSION = EVIDENCE_SCHEMA_VERSION;
export const EVIDENCE_UPDATED_EVENT = 'crushlearn:evidence-updated';

export function getEvidenceStorageKey(courseId) {
  return `${EVIDENCE_STORAGE_PREFIX}_${courseId}`;
}

export function createEvidenceStore(storage) {
  if (
    !storage ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function'
  ) {
    throw new Error(
      'createEvidenceStore requires a storage adapter such as window.localStorage'
    );
  }

  return {
    load(courseId) {
      const raw = storage.getItem(getEvidenceStorageKey(courseId));
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.schemaVersion !== EVIDENCE_STORAGE_VERSION) {
          return null;
        }
        if (parsed.courseId !== courseId) {
          return null;
        }
        return normalizeEvidence({
          version: EVIDENCE_SCHEMA_VERSION,
          observations: parsed.observations,
          attempts: parsed.attempts,
        });
      } catch {
        return null;
      }
    },

    save(courseId, evidence, now = new Date().toISOString()) {
      const normalized = normalizeEvidence(evidence);
      const payload = {
        schemaVersion: EVIDENCE_STORAGE_VERSION,
        courseId,
        version: EVIDENCE_SCHEMA_VERSION,
        observations: normalized.observations,
        attempts: normalized.attempts,
        updatedAt: now,
      };
      storage.setItem(getEvidenceStorageKey(courseId), JSON.stringify(payload));
      if (
        typeof window !== 'undefined' &&
        typeof window.dispatchEvent === 'function' &&
        typeof CustomEvent === 'function'
      ) {
        window.dispatchEvent(
          new CustomEvent(EVIDENCE_UPDATED_EVENT, {
            detail: { courseId },
          })
        );
      }
      return payload;
    },

    clear(courseId) {
      if (typeof storage.removeItem === 'function') {
        storage.removeItem(getEvidenceStorageKey(courseId));
      }
    },
  };
}

export function loadEvidenceOrDefault(store, courseId) {
  return (store && store.load(courseId)) || createEmptyEvidence();
}
