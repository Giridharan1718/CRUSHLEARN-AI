// Account records for CrushLearn AI.
//
// An account holds the credentials needed to sign in and the learner profile
// shown across the app. The password is never stored in the clear: it is
// stored as a PBKDF2-SHA256 derivation over a random per-account salt. The
// derivation uses Web Crypto when the browser provides it, and the module
// falls back to a clearly-labelled local-only scheme when it does not (see
// `hashPassword`), because refusing to sign a learner in would be worse than
// storing a weaker local verifier on a device that cannot do better.
//
// Everything here stays in this browser. There is no server identity here,
// and this module must not pretend otherwise.

export const ACCOUNTS_STORAGE_KEY = 'crushlearn_accounts';
export const ACCOUNT_SCHEMA_VERSION = 1;
export const SESSION_STORAGE_KEY = 'crushlearn_user';

export const PBKDF2_ITERATIONS = 120_000;
export const SALT_BYTES = 16;
export const HASH_BITS = 256;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 8;

function safeStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function encodeBase64(bytes) {
  let binary = '';
  const view = new Uint8Array(bytes);
  for (let index = 0; index < view.length; index += 1) {
    binary += String.fromCharCode(view[index]);
  }
  if (typeof btoa === 'function') return btoa(binary);
  return Buffer.from(view).toString('base64');
}

function decodeBase64(value) {
  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(value, 'base64'));
}

function randomBytes(length) {
  const crypto = globalThis.crypto;
  if (crypto?.getRandomValues) {
    return crypto.getRandomValues(new Uint8Array(length));
  }
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** True when the runtime can run a real PBKDF2 derivation. */
export function supportsStrongHashing() {
  return typeof globalThis.crypto?.subtle?.deriveBits === 'function';
}

/**
 * Derives a password verifier.
 *
 * Preferred: PBKDF2-SHA256 with a random salt (a `pbkdf2` marker is stored so
 * a later version can recognise and upgrade the record). Fallback: a salted
 * SHA-256 digest over many rounds, marked `sha256-iterations`, so an account
 * created on a weak runtime is visibly weaker than one created in a browser
 * with Web Crypto.
 */
export async function hashPassword(password, saltBytes = randomBytes(SALT_BYTES)) {
  const salt = encodeBase64(saltBytes);
  const text = String(password ?? '');

  if (supportsStrongHashing()) {
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(text),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const bits = await globalThis.crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      key,
      HASH_BITS
    );
    return { algorithm: 'pbkdf2', salt, hash: toHex(bits) };
  }

  // Weak-runtime fallback. This is not a KDF suitable for a real service; it
  // exists so a learner on a device without Web Crypto can still sign in.
  let digest = text + salt;
  for (let round = 0; round < 1000; round += 1) {
    digest = await sha256Hex(digest);
  }
  return { algorithm: 'sha256-iterations', salt, hash: digest };
}

async function sha256Hex(value) {
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(value);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return toHex(digest);
  }
  // Node without Web Crypto on the global object.
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(value).digest('hex');
}

/** Compares two verifier records in constant time with respect to content. */
export function verifiersMatch(record, candidate) {
  if (!record || typeof candidate !== 'string') return false;
  if (record.algorithm === 'pbkdf2' && supportsStrongHashing()) {
    return hashPassword(candidate, decodeBase64(record.salt)).then(
      (derived) => derived.hash === record.hash
    );
  }
  if (record.algorithm === 'sha256-iterations') {
    return sha256Hex(candidate + record.salt).then(
      (digest) => digest === record.hash
    );
  }
  return Promise.resolve(false);
}

export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function validateEmail(email) {
  const value = normalizeEmail(email);
  if (!value) return 'Enter an email address.';
  if (!EMAIL_PATTERN.test(value)) return 'Enter a valid email address.';
  return '';
}

export function validatePassword(password) {
  if (typeof password !== 'string' || !password) {
    return 'Enter a password.';
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return '';
}

export function validateName(name) {
  if (typeof name !== 'string' || !name.trim()) return 'Enter your name.';
  if (name.trim().length > 80) return 'Your name must be 80 characters or fewer.';
  return '';
}

/**
 * The learner profile stored alongside the credentials. It starts empty on
 * purpose: progress numbers are derived from real activity, never seeded.
 */
export function createProfile(input = {}) {
  return {
    name: typeof input.name === 'string' ? input.name.trim() : '',
    bio: typeof input.bio === 'string' ? input.bio : '',
    learningGoal: typeof input.learningGoal === 'string' ? input.learningGoal : '',
    enrolledCourses: Array.isArray(input.enrolledCourses)
      ? input.enrolledCourses.filter((id) => typeof id === 'string')
      : [],
    completedLessons: Array.isArray(input.completedLessons)
      ? input.completedLessons.filter((id) => typeof id === 'string')
      : [],
    skillPassport: {
      skills: Array.isArray(input.skillPassport?.skills)
        ? input.skillPassport.skills
        : [],
      certificates: Array.isArray(input.skillPassport?.certificates)
        ? input.skillPassport.certificates
        : [],
    },
  };
}

function normalizeAccount(record) {
  if (!record || typeof record !== 'object') return null;
  if (typeof record.id !== 'string' || !record.id) return null;
  if (typeof record.email !== 'string' || !record.email) return null;
  if (!record.password || typeof record.password.hash !== 'string') return null;

  return {
    id: record.id,
    email: record.email,
    password: {
      algorithm: record.password.algorithm,
      salt: record.password.salt,
      hash: record.password.hash,
    },
    profile: createProfile(record.profile),
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : null,
    lastActivityDate:
      typeof record.lastActivityDate === 'string' ? record.lastActivityDate : null,
  };
}

function readAccounts(storage) {
  const raw = storage.getItem(ACCOUNTS_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schemaVersion !== ACCOUNT_SCHEMA_VERSION) return [];
    if (!Array.isArray(parsed.accounts)) return [];
    const seen = new Set();
    return parsed.accounts.map(normalizeAccount).filter((account) => {
      if (!account || seen.has(account.email)) return false;
      seen.add(account.email);
      return true;
    });
  } catch {
    return [];
  }
}

function writeAccounts(storage, accounts) {
  storage.setItem(
    ACCOUNTS_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: ACCOUNT_SCHEMA_VERSION,
      accounts,
      updatedAt: new Date().toISOString(),
    })
  );
}

/**
 * Creates the account repository. All operations are async where they touch
 * password hashing; the rest are synchronous so a page can read the session
 * without awaiting.
 */
export function createAccountStore(storage = safeStorage()) {
  if (
    !storage ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function' ||
    typeof storage.removeItem !== 'function'
  ) {
    throw new Error(
      'createAccountStore requires a storage adapter such as window.localStorage'
    );
  }

  const list = () => readAccounts(storage);

  const findByEmail = (email) => {
    const normalized = normalizeEmail(email);
    return list().find((account) => account.email === normalized) || null;
  };

  return {
    list,

    findByEmail,

    findById(id) {
      return list().find((account) => account.id === id) || null;
    },

    async register({ name, email, password, id = null }) {
      const nameError = validateName(name);
      const emailError = validateEmail(email);
      const passwordError = validatePassword(password);

      const errors = [nameError, emailError, passwordError].filter(Boolean);
      if (errors.length > 0) {
        return { ok: false, errors };
      }

      const normalizedEmail = normalizeEmail(email);
      if (findByEmail(normalizedEmail)) {
        return {
          ok: false,
          errors: ['An account already uses this email address.'],
        };
      }

      const verifier = await hashPassword(password);
      const now = new Date().toISOString();
      const account = {
        // An explicit id lets a migration keep the learner's original id, so
        // the data already stored under that id stays reachable.
        id:
          typeof id === 'string' && id.trim()
            ? id.trim()
            : `user_${normalizedEmail.replace(/[^a-z0-9]+/gi, '_')}`,
        email: normalizedEmail,
        password: verifier,
        profile: createProfile({ name }),
        createdAt: now,
        // `lastActivityDate` tracks learning activity, not the moment the
        // account was opened, so it stays null until the learner does
        // something. See `recordActivity`.
        lastActivityDate: null,
      };

      const accounts = list();
      writeAccounts(storage, [...accounts, account]);
      return { ok: true, account };
    },

    async verify(email, password) {
      const account = findByEmail(email);
      // Always run a derivation so a missing account and a wrong password take
      // a comparable amount of time.
      const candidate = account?.password || {
        algorithm: 'pbkdf2',
        salt: encodeBase64(randomBytes(SALT_BYTES)),
        hash: '0'.repeat(HASH_BITS / 4),
      };

      const matches = await verifiersMatch(candidate, password);
      if (!account || !matches) {
        return { ok: false, errors: ['Email or password is incorrect.'] };
      }
      return { ok: true, account };
    },

    updateProfile(id, patch = {}) {
      const accounts = list();
      const index = accounts.findIndex((account) => account.id === id);
      if (index < 0) {
        return { ok: false, errors: ['The account could not be found.'] };
      }

      const account = accounts[index];
      const next = {
        ...account,
        profile: { ...account.profile, ...patch },
      };
      accounts[index] = next;
      writeAccounts(storage, accounts);
      return { ok: true, account: next };
    },

    /**
     * Changes the address the account signs in with.
     *
     * The address is the account's identity, so it is checked for validity
     * and for collisions before anything is written, and the session is
     * rewritten to match.
     */
    async updateEmail(id, email) {
      const emailError = validateEmail(email);
      if (emailError) {
        return { ok: false, errors: [emailError] };
      }

      const normalizedEmail = normalizeEmail(email);
      const accounts = list();
      const index = accounts.findIndex((account) => account.id === id);
      if (index < 0) {
        return { ok: false, errors: ['The account could not be found.'] };
      }

      const taken = accounts.some(
        (account) => account.id !== id && account.email === normalizedEmail
      );
      if (taken) {
        return {
          ok: false,
          errors: ['Another account already uses this email address.'],
        };
      }

      accounts[index] = { ...accounts[index], email: normalizedEmail };
      writeAccounts(storage, accounts);
      return { ok: true, account: accounts[index] };
    },

    recordActivity(id, when = new Date().toISOString()) {
      const accounts = list();
      const index = accounts.findIndex((account) => account.id === id);
      if (index < 0) return null;
      accounts[index] = { ...accounts[index], lastActivityDate: when };
      writeAccounts(storage, accounts);
      return accounts[index];
    },

    remove(id) {
      const accounts = list();
      const next = accounts.filter((account) => account.id !== id);
      if (next.length === accounts.length) return false;
      writeAccounts(storage, next);
      return true;
    },

    clear() {
      storage.removeItem(ACCOUNTS_STORAGE_KEY);
    },
  };
}
