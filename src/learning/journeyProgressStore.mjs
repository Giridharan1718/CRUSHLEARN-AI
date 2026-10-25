// Progress persistence for lesson journeys.
//
// The store is intentionally tiny and storage-agnostic: production passes
// window.localStorage, tests pass an in-memory fake. Keys are scoped by both
// course and lesson so two courses that reuse a lesson id ("lesson-1") can
// never overwrite each other's progress.

import { JOURNEY_SCHEMA_VERSION } from './journeyEngine.mjs';

export const JOURNEY_STORAGE_PREFIX = 'crushlearn_journey';
export const JOURNEY_STORAGE_VERSION = JOURNEY_SCHEMA_VERSION;

export function getJourneyStorageKey(courseId, lessonId) {
  return `${JOURNEY_STORAGE_PREFIX}_${courseId}_${lessonId}`;
}

export function createJourneyProgressStore(storage) {
  if (
    !storage ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function'
  ) {
    throw new Error(
      'createJourneyProgressStore requires a storage adapter such as window.localStorage'
    );
  }

  return {
    load(courseId, lessonId) {
      const raw = storage.getItem(getJourneyStorageKey(courseId, lessonId));
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.schemaVersion !== JOURNEY_STORAGE_VERSION) {
          return null;
        }
        if (parsed.courseId !== courseId || parsed.lessonId !== lessonId) {
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    },

    save(courseId, lessonId, state, now = new Date().toISOString()) {
      const payload = {
        ...state,
        schemaVersion: JOURNEY_STORAGE_VERSION,
        courseId,
        lessonId,
        updatedAt: now,
      };
      storage.setItem(getJourneyStorageKey(courseId, lessonId), JSON.stringify(payload));
      return payload;
    },

    clear(courseId, lessonId) {
      if (typeof storage.removeItem === 'function') {
        storage.removeItem(getJourneyStorageKey(courseId, lessonId));
      }
    },
  };
}
