// The one place the app records learning activity.
//
// Every meaningful action — finishing a lesson, answering a question, adding
// a source — records one dated entry. The streak shown across the app is
// derived from those entries, so it can never disagree with what actually
// happened.
//
// Activity is opt-out. When a learner turns tracking off, nothing new is
// written and the derived figures are hidden rather than shown as zero,
// because "zero" would be a claim about their learning that the app can no
// longer support.

import {
  ACTIVITY_KINDS,
  activeDays,
  calculateStreak,
  createActivityStore,
} from './activityStore.mjs';

function safeStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function currentUserId() {
  try {
    const raw = globalThis.localStorage?.getItem('crushlearn_user');
    if (!raw) return null;
    const session = JSON.parse(raw);
    return typeof session?.id === 'string' ? session.id : null;
  } catch {
    return null;
  }
}

function store() {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    return createActivityStore(storage);
  } catch {
    return null;
  }
}

/**
 * Records one activity for the signed-in learner.
 *
 * Returns the stored entry, or null when there is no learner, when tracking
 * is off, or when the kind is not one the app knows.
 */
export function recordActivity(kind, detail = '', at = new Date().toISOString()) {
  if (!ACTIVITY_KINDS.includes(kind)) return null;
  const userId = currentUserId();
  if (!userId) return null;
  const activityStore = store();
  if (!activityStore) return null;
  return activityStore.record(userId, kind, detail, at);
}

/**
 * The derived activity summary for the signed-in learner.
 *
 * `streak` is null when tracking is off, so a caller can distinguish "no
 * activity" from "activity not being tracked".
 */
export function getActivitySummary(now = new Date()) {
  const userId = currentUserId();
  if (!userId) {
    return { streak: null, activeDays: [], trackingEnabled: false, total: 0 };
  }

  const activityStore = store();
  if (!activityStore) {
    return { streak: null, activeDays: [], trackingEnabled: false, total: 0 };
  }

  const state = activityStore.read(userId);
  if (!state.trackingEnabled) {
    return { streak: null, activeDays: [], trackingEnabled: false, total: 0 };
  }

  const entries = state.entries;
  return {
    streak: calculateStreak(entries, now),
    activeDays: activeDays(entries),
    trackingEnabled: true,
    total: entries.length,
  };
}

export function isActivityTrackingEnabled() {
  const userId = currentUserId();
  if (!userId) return false;
  const activityStore = store();
  if (!activityStore) return false;
  return activityStore.isTrackingEnabled(userId);
}

export function setActivityTrackingEnabled(enabled) {
  const userId = currentUserId();
  if (!userId) return false;
  const activityStore = store();
  if (!activityStore) return false;
  return activityStore.setTrackingEnabled(userId, enabled);
}

export function clearActivityHistory() {
  const userId = currentUserId();
  if (!userId) return;
  const activityStore = store();
  if (!activityStore) return;
  activityStore.clear(userId);
}
