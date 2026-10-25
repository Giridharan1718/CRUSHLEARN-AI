// Authentication for CrushLearn AI.
//
// The public shape of this module is unchanged from the original demo so
// every existing call site keeps working. What changed is what happens
// behind it: credentials are now real, checked, and stored as password
// verifiers, and a session points at a real account record.
//
// This is still a local, single-device sign-in. There is no server identity
// boundary, so a learner on a shared browser can read another learner's
// local data the same way they could before. The difference is that a wrong
// password no longer signs anyone in, and a new account starts with a real
// (empty) record rather than a fabricated one.

import {
  SESSION_STORAGE_KEY,
  createAccountStore,
  createProfile,
  normalizeEmail,
  validateEmail,
  validateName,
  validatePassword,
} from './accountStore.mjs';

export { validateEmail, validateName, validatePassword };

function safeStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function readSession(storage) {
  const raw = storage?.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.id !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(storage, account) {
  if (!storage) return null;
  const session = {
    id: account.id,
    email: account.email,
    name: account.profile?.name || account.email,
    signedInAt: new Date().toISOString(),
  };
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

/**
 * The shape the rest of the app reads. It merges the account profile with
 * the session so a page can ask for `user.completedLessons` exactly as
 * before.
 */
function toUser(account, session) {
  if (!account) return null;
  const profile = createProfile(account.profile);
  return {
    ...profile,
    id: account.id,
    email: account.email,
    name: profile.name || session?.name || account.email,
    learningStreak: undefined,
    lastActivityDate: account.lastActivityDate || null,
    createdAt: account.createdAt || null,
  };
}

function resolveStore(storage) {
  return createAccountStore(storage);
}

export const AuthService = {
  /** True when a session points at an account that still exists. */
  isAuthenticated() {
    const storage = safeStorage();
    if (!storage) return false;
    const session = readSession(storage);
    if (!session) return false;
    try {
      return Boolean(resolveStore(storage).findById(session.id));
    } catch {
      return false;
    }
  },

  /**
   * Registers an account. The password is hashed before it is stored and is
   * never retrievable afterwards.
   */
  async register(name, email, password) {
    const storage = safeStorage();
    if (!storage) {
      return { success: false, error: 'Browser storage is unavailable.' };
    }

    const result = await resolveStore(storage).register({ name, email, password });
    if (!result.ok) {
      return { success: false, error: result.errors[0] };
    }

    writeSession(storage, result.account);
    return { success: true, user: toUser(result.account, null) };
  },

  /**
   * Signs in with a real credential check.
   *
   * A failed attempt never signs anyone in, and it does not tear down a
   * session that a previous successful sign-in created: a learner who is
   * already signed in and mistypes their password is still signed in as
   * themselves, which is the correct outcome for that situation.
   */
  async login(email, password) {
    const storage = safeStorage();
    if (!storage) {
      return { success: false, error: 'Browser storage is unavailable.' };
    }

    const result = await resolveStore(storage).verify(email, password);
    if (!result.ok) {
      return { success: false, error: result.errors[0] };
    }

    const session = writeSession(storage, result.account);
    return { success: true, user: toUser(result.account, session) };
  },

  /** Signs out. The account and its learning data are kept. */
  logout() {
    const storage = safeStorage();
    storage?.removeItem(SESSION_STORAGE_KEY);
  },

  /** The signed-in learner, or null. */
  getCurrentUser() {
    const storage = safeStorage();
    if (!storage) return null;
    const session = readSession(storage);
    if (!session) return null;
    try {
      const account = resolveStore(storage).findById(session.id);
      if (!account) return null;
      return toUser(account, session);
    } catch {
      return null;
    }
  },

  /** Updates the learner profile fields a page edits. */
  updateUser(userData = {}) {
    const storage = safeStorage();
    const session = readSession(storage);
    if (!storage || !session) return null;

    const patch = {};
    if (typeof userData.name === 'string') patch.name = userData.name.trim();
    if (typeof userData.bio === 'string') patch.bio = userData.bio;
    if (typeof userData.learningGoal === 'string') patch.learningGoal = userData.learningGoal;
    if (Array.isArray(userData.enrolledCourses)) {
      patch.enrolledCourses = userData.enrolledCourses;
    }
    if (Array.isArray(userData.completedLessons)) {
      patch.completedLessons = userData.completedLessons;
    }
    if (userData.skillPassport) patch.skillPassport = userData.skillPassport;

    const result = resolveStore(storage).updateProfile(session.id, patch);
    if (!result.ok) return null;
    return toUser(result.account, session);
  },

  /**
   * Changes the address the account signs in with.
   *
   * The address is checked for validity and for collisions first. When the
   * change is refused, nothing is written and the current address is kept.
   */
  async updateEmail(email) {
    const storage = safeStorage();
    const session = readSession(storage);
    if (!storage || !session) {
      return { success: false, error: 'You are not signed in.' };
    }

    const result = await resolveStore(storage).updateEmail(session.id, email);
    if (!result.ok) {
      return { success: false, error: result.errors[0] };
    }

    // The session carries the address, so it is rewritten to match.
    const nextSession = writeSession(storage, result.account);
    return { success: true, user: toUser(result.account, nextSession) };
  },

  /**
   * The id of the signed-in learner, or null. Used by the stores that scope
   * their data by user.
   */
  getUserId() {
    return readSession(safeStorage())?.id || null;
  },
};

export { normalizeEmail };
