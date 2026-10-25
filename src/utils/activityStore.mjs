// Real learning activity.
//
// Every meaningful action a learner takes records one dated entry. The streak
// is derived from those dates, never stored as a number, so it cannot drift
// away from what actually happened.
//
// Activity is opt-out: `setTrackingEnabled(false)` stops new entries being
// written and hides the derived figures, and the learner can clear the whole
// history at any time.

export const ACTIVITY_STORAGE_PREFIX = 'crushlearn_activity';
export const ACTIVITY_SCHEMA_VERSION = 1;
export const ACTIVITY_UPDATED_EVENT = 'crushlearn:activity-updated';

export const ACTIVITY_KINDS = Object.freeze([
  'lesson_completed',
  'quiz_completed',
  'note_saved',
  'question_asked',
  'source_added',
  'study_material_generated',
  'review_session',
  'project_updated',
  'research_updated',
]);

const MAX_ACTIVITY_ENTRIES = 2000;

function safeStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function keyPart(value) {
  return encodeURIComponent(String(value ?? '').trim());
}

export function getActivityStorageKey(userId) {
  return `${ACTIVITY_STORAGE_PREFIX}_${keyPart(userId)}`;
}

function dayKey(date) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return null;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (!ACTIVITY_KINDS.includes(entry.kind)) return null;
  if (typeof entry.at !== 'string' || !entry.at) return null;
  if (!dayKey(entry.at)) return null;

  return {
    id: typeof entry.id === 'string' && entry.id ? entry.id : `${entry.kind}_${entry.at}`,
    kind: entry.kind,
    at: entry.at,
    day: dayKey(entry.at),
    detail:
      typeof entry.detail === 'string' && entry.detail.length <= 200
        ? entry.detail
        : '',
  };
}

function readState(storage, userId) {
  const raw = storage.getItem(getActivityStorageKey(userId));
  if (!raw) {
    return { trackingEnabled: true, entries: [] };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schemaVersion !== ACTIVITY_SCHEMA_VERSION) {
      return { trackingEnabled: true, entries: [] };
    }
    const seen = new Set();
    const entries = (Array.isArray(parsed.entries) ? parsed.entries : [])
      .map(normalizeEntry)
      .filter((entry) => {
        if (!entry || seen.has(entry.id)) return false;
        seen.add(entry.id);
        return true;
      })
      .slice(-MAX_ACTIVITY_ENTRIES);
    return {
      trackingEnabled: parsed.trackingEnabled !== false,
      entries,
    };
  } catch {
    return { trackingEnabled: true, entries: [] };
  }
}

function writeState(storage, userId, state) {
  storage.setItem(
    getActivityStorageKey(userId),
    JSON.stringify({
      schemaVersion: ACTIVITY_SCHEMA_VERSION,
      userId,
      trackingEnabled: state.trackingEnabled !== false,
      entries: state.entries.slice(-MAX_ACTIVITY_ENTRIES),
      updatedAt: new Date().toISOString(),
    })
  );
}

function emitUpdate() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ACTIVITY_UPDATED_EVENT));
}

export function createActivityStore(storage = safeStorage()) {
  if (
    !storage ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function' ||
    typeof storage.removeItem !== 'function'
  ) {
    throw new Error(
      'createActivityStore requires a storage adapter such as window.localStorage'
    );
  }

  const read = (userId) => readState(storage, userId);

  return {
    read,

    isTrackingEnabled(userId) {
      return read(userId).trackingEnabled;
    },

    setTrackingEnabled(userId, enabled) {
      const state = read(userId);
      state.trackingEnabled = Boolean(enabled);
      writeState(storage, userId, state);
      emitUpdate();
      return state.trackingEnabled;
    },

    record(userId, kind, detail = '', at = new Date().toISOString()) {
      const state = read(userId);
      if (!state.trackingEnabled) return null;

      const entry = normalizeEntry({ kind, detail, at });
      if (!entry) return null;

      state.entries = [
        ...state.entries.filter((item) => item.id !== entry.id),
        entry,
      ].slice(-MAX_ACTIVITY_ENTRIES);
      writeState(storage, userId, state);
      emitUpdate();
      return entry;
    },

    list(userId) {
      return read(userId).entries;
    },

    clear(userId) {
      storage.removeItem(getActivityStorageKey(userId));
      emitUpdate();
    },
  };
}

/**
 * The number of consecutive days ending today (or yesterday, when today has
 * no activity yet) that contain at least one entry.
 */
export function calculateStreak(entries, now = new Date()) {
  const days = new Set(
    (Array.isArray(entries) ? entries : [])
      .map((entry) => entry?.day)
      .filter(Boolean)
  );
  if (days.size === 0) return 0;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cursor = new Date(today);
  if (!days.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(dayKey(cursor))) return 0;
  }

  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** The distinct days on which any activity was recorded, newest first. */
export function activeDays(entries) {
  const counts = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    if (!entry?.day) return;
    counts.set(entry.day, (counts.get(entry.day) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => (a.day < b.day ? 1 : -1));
}
