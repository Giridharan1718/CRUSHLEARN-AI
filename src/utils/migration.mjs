// One-time migration from the original demo build.
//
// The first version of this app stored a single `crushlearn_user` object with
// no credentials: any password signed in, and a fresh account arrived with a
// fabricated streak and two pre-completed lessons.
//
// A learner who used the old build has real work in this browser (notebooks,
// sources, notes, lesson progress). That work must survive the move to real
// accounts. This module lifts the old profile into a new account and keeps
// the learner's id, so the notebooks and study material that are already
// keyed by that id are still found.
//
// The fabricated numbers are not carried over: the streak is now derived from
// activity, and the pre-completed lessons are reset because they were never
// the learner's work. Everything else — enrolled courses, real completed
// lessons, the skill passport — is preserved.

import {
  SESSION_STORAGE_KEY,
  createAccountStore,
  createProfile,
} from './accountStore.mjs';

export const MIGRATION_STORAGE_KEY = 'crushlearn_migration_v1';
export const MIGRATION_VERSION = 1;

const LEGACY_USER_KEY = 'crushlearn_user';

function safeStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function readLegacyUser(storage) {
  const raw = storage.getItem(LEGACY_USER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The starter courses the original build enrolled every new learner in.
 */
const STARTER_COURSES = ['web-dev-101', 'python-basics'];

/**
 * The two lessons the original build marked complete at sign-in. They were
 * not earned, so they are not migrated.
 */
const FABRICATED_COMPLETIONS = ['lesson-1', 'lesson-2'];

function stripFabricatedCompletions(completedLessons) {
  return completedLessons.filter((id) => !FABRICATED_COMPLETIONS.includes(id));
}

export function hasMigrated(storage = safeStorage()) {
  if (!storage) return true;
  try {
    const raw = storage.getItem(MIGRATION_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed?.version === MIGRATION_VERSION;
  } catch {
    return false;
  }
}

function markMigrated(storage, detail) {
  try {
    storage.setItem(
      MIGRATION_STORAGE_KEY,
      JSON.stringify({
        version: MIGRATION_VERSION,
        at: new Date().toISOString(),
        ...detail,
      })
    );
  } catch {
    // A failed marker means the migration runs again next time. That is
    // safe: it only re-lifts the legacy profile, and the account it finds
    // already exists.
  }
}

/**
 * Lifts the legacy profile into a real account.
 *
 * The legacy user has no password, so the account is created with a random
 * one that the learner does not know. The learner can then use "Set a
 * password" in Settings to take control of the account. Until then the
 * account is reachable through the session this migration writes.
 */
export async function migrateLegacyUser(storage = safeStorage()) {
  if (!storage) return { ok: false, migrated: false, reason: 'no storage' };
  if (hasMigrated(storage)) return { ok: true, migrated: false, reason: 'already migrated' };

  const legacy = readLegacyUser(storage);
  if (!legacy) {
    markMigrated(storage, { migrated: false, reason: 'no legacy user' });
    return { ok: true, migrated: false, reason: 'no legacy user' };
  }

  const email =
    typeof legacy.email === 'string' && legacy.email.includes('@')
      ? legacy.email.trim().toLowerCase()
      : `learner_${Date.now()}@crushlearn.local`;

  try {
    const store = createAccountStore(storage);
    let account = store.findByEmail(email);

    if (!account) {
      // A random password the learner does not know. The account is claimed
      // by setting a new password in Settings.
      const randomPassword = `${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}${Date.now()}`;
      const result = await store.register({
        name: typeof legacy.name === 'string' ? legacy.name : 'Learner',
        email,
        password: randomPassword,
        // Keep the learner's original id so the notebooks and study material
        // already stored under it are still found after the move.
        id: typeof legacy.id === 'string' && legacy.id.trim() ? legacy.id : null,
      });
      if (!result.ok) {
        return { ok: false, migrated: false, reason: 'register failed' };
      }
      account = result.account;
    }

    const profile = createProfile({
      name: legacy.name,
      bio: legacy.bio,
      learningGoal: legacy.learningGoal,
      enrolledCourses: legacy.enrolledCourses || STARTER_COURSES,
      completedLessons: stripFabricabricated(legacy.completedLessons),
      skillPassport: legacy.skillPassport,
    });

    const updated = store.updateProfile(account.id, profile);
    if (!updated.ok) {
      return { ok: false, migrated: false, reason: 'profile update failed' };
    }

    // Keep the learner's original id so their existing notebooks and study
    // material stay reachable.
    storage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        id: updated.account.id,
        email: updated.account.email,
        name: updated.account.profile.name,
        signedInAt: new Date().toISOString(),
        migrated: true,
      })
    );

    markMigrated(storage, {
      migrated: true,
      email,
      keptId: legacy.id || null,
    });

    return { ok: true, migrated: true, account: updated.account };
  } catch {
    return { ok: false, migrated: false, reason: 'migration error' };
  }
}

// Small local alias so the intent above reads clearly.
function stripFabricabricated(completedLessons) {
  return stripFabricatedCompletions(
    Array.isArray(completedLessons) ? completedLessons : []
  );
}
