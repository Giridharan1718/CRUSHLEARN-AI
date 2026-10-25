// Course-scoped active-recall persistence.
//
// Review schedules belong to the learner's work in a course, just like the
// evidence store. Keeping a separate key means review scheduling can evolve
// without changing the evidence format, while both stores remain linked by the
// course id and objective id.
//
// Every saved payload is treated as untrusted on load: a corrupt envelope or a
// malformed record is ignored rather than crashing the review dashboard.

import {
  REVIEW_SCHEMA_VERSION,
  createEmptyReviewState,
  normalizeReviewState,
} from './reviewScheduler.mjs';

export const REVIEW_STORAGE_PREFIX = 'crushlearn_review';
export const REVIEW_STORAGE_VERSION = REVIEW_SCHEMA_VERSION;
export const REVIEW_UPDATED_EVENT = 'crushlearn:review-updated';

export function getReviewStorageKey(courseId) {
  return `${REVIEW_STORAGE_PREFIX}_${courseId}`;
}

export function createReviewStore(storage) {
  if (
    !storage ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function'
  ) {
    throw new Error(
      'createReviewStore requires a storage adapter such as window.localStorage'
    );
  }

  return {
    load(courseId) {
      const raw = storage.getItem(getReviewStorageKey(courseId));
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.schemaVersion !== REVIEW_STORAGE_VERSION) {
          return null;
        }
        if (parsed.courseId !== courseId) {
          return null;
        }
        if (
          !parsed.records ||
          typeof parsed.records !== 'object' ||
          Array.isArray(parsed.records)
        ) {
          return null;
        }
        return normalizeReviewState({ records: parsed.records });
      } catch {
        return null;
      }
    },

    save(courseId, state, now = new Date().toISOString()) {
      const normalized = normalizeReviewState(state);
      const payload = {
        schemaVersion: REVIEW_STORAGE_VERSION,
        courseId,
        version: REVIEW_SCHEMA_VERSION,
        records: normalized.records,
        updatedAt: now,
      };
      storage.setItem(getReviewStorageKey(courseId), JSON.stringify(payload));
      if (
        typeof window !== 'undefined' &&
        typeof window.dispatchEvent === 'function' &&
        typeof CustomEvent === 'function'
      ) {
        window.dispatchEvent(
          new CustomEvent(REVIEW_UPDATED_EVENT, {
            detail: { courseId },
          })
        );
      }
      return payload;
    },

    clear(courseId) {
      if (typeof storage.removeItem === 'function') {
        storage.removeItem(getReviewStorageKey(courseId));
      }
    },
  };
}

export function loadReviewOrDefault(store, courseId) {
  return (store && store.load(courseId)) || createEmptyReviewState();
}
