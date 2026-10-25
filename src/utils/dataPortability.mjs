// Data export, import and account wipe.
//
// The learner owns the data in this browser, so all three operations are
// real: an export contains every store the app writes, an import restores a
// previously exported envelope, and a wipe removes all of it.
//
// The envelope is versioned. An import refuses an envelope it does not
// understand rather than writing half of it, and every value is validated
// before it is written so a malformed file cannot corrupt the stores.
//
// Keys are matched by prefix, not by an allow-list, so a store added later
// is exported automatically. The one exclusion is the account credential file:
// it holds password verifiers and is never included in a shareable export.

export const EXPORT_SCHEMA_VERSION = 1;
export const EXPORT_FILE_PREFIX = 'crushlearn_';
export const EXPORT_FORMAT = 'crushlearn-export';

/**
 * Keys that are never exported. The credential store holds password
 * verifiers; the session key is a live pointer to a signed-in account.
 */
export const EXCLUDED_EXPORT_KEYS = Object.freeze([
  'crushlearn_accounts',
  'crushlearn_user',
]);

function safeStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function isExcluded(key) {
  return EXCLUDED_EXPORT_KEYS.includes(key);
}

/**
 * Lists every app-owned key currently in storage.
 *
 * `storage.length` and `storage.key(i)` are the only way to enumerate
 * localStorage. A defensive copy is taken because removing a key while
 * enumerating shifts the indices.
 */
export function listAppKeys(storage = safeStorage()) {
  if (!storage || typeof storage.key !== 'function') return [];

  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (typeof key !== 'string' || !key) continue;
    if (!key.startsWith(EXPORT_FILE_PREFIX)) continue;
    if (isExcluded(key)) continue;
    keys.push(key);
  }
  return keys;
}

/**
 * Builds the export envelope. Values that are not valid JSON are carried as
 * raw strings so an export never loses data to a serialization error.
 */
export function buildExport(storage = safeStorage(), now = new Date().toISOString()) {
  if (!storage) {
    return {
      ok: false,
      errors: ['Browser storage is unavailable, so nothing could be exported.'],
    };
  }

  const entries = [];
  const skipped = [];

  listAppKeys(storage).forEach((key) => {
    let raw = null;
    try {
      raw = storage.getItem(key);
    } catch {
      raw = null;
    }
    if (raw === null) {
      skipped.push(key);
      return;
    }

    try {
      entries.push({ key, value: JSON.parse(raw) });
    } catch {
      entries.push({ key, value: raw, raw: true });
    }
  });

  if (skipped.length > 0) {
    return {
      ok: false,
      errors: [
        `Some stored items could not be read (${skipped.length}). Nothing was exported so the export stays complete.`,
      ],
      skipped,
    };
  }

  return {
    ok: true,
    envelope: {
      format: EXPORT_FORMAT,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: now,
      entries,
    },
    count: entries.length,
  };
}

/** Serializes an export envelope to the JSON text written to the file. */
export function serializeExport(envelope) {
  return JSON.stringify(envelope, null, 2);
}

function validateEntry(entry) {
  if (!entry || typeof entry !== 'object') return 'An export entry is not an object.';
  if (typeof entry.key !== 'string' || !entry.key.startsWith(EXPORT_FILE_PREFIX)) {
    return 'An export entry has an unexpected key.';
  }
  if (isExcluded(entry.key)) {
    return 'An export entry targets a key that is never written by an import.';
  }
  if (!('value' in entry)) {
    return 'An export entry has no value.';
  }
  return '';
}

/**
 * Parses and validates an export file. Nothing is written; the caller decides
 * whether to apply it.
 */
export function parseImport(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      errors: ['This file is not valid JSON, so it was not imported.'],
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, errors: ['This file does not contain a CrushLearn export.'] };
  }
  if (parsed.format !== EXPORT_FORMAT) {
    return {
      ok: false,
      errors: ['This file is not a CrushLearn export.'],
    };
  }
  if (parsed.schemaVersion !== EXPORT_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        `This export was made by a different version of the app (schema ${parsed.schemaVersion}). It was not imported.`,
      ],
    };
  }
  if (!Array.isArray(parsed.entries)) {
    return { ok: false, errors: ['This export has no entries.'] };
  }

  const errors = [];
  const entries = [];
  const seen = new Set();

  parsed.entries.forEach((entry) => {
    const problem = validateEntry(entry);
    if (problem) {
      errors.push(problem);
      return;
    }
    if (seen.has(entry.key)) {
      errors.push(`The export lists ${entry.key} more than once.`);
      return;
    }
    seen.add(entry.key);
    entries.push(entry);
  });

  if (errors.length > 0) {
    return { ok: false, errors: errors.slice(0, 5) };
  }

  return { ok: true, entries, exportedAt: parsed.exportedAt || null };
}

/**
 * Writes a validated import into storage.
 *
 * `mode` is `replace` (the default: the app's current data is replaced by the
 * import) or `merge` (imported keys are written, and keys the import does not
 * mention are left alone).
 */
export function applyImport(entries, storage = safeStorage(), { mode = 'replace' } = {}) {
  if (!storage) {
    return { ok: false, errors: ['Browser storage is unavailable, so nothing was imported.'] };
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: false, errors: ['There is nothing to import.'] };
  }

  const removed = [];
  if (mode === 'replace') {
    listAppKeys(storage).forEach((key) => {
      try {
        storage.removeItem(key);
        removed.push(key);
      } catch {
        // A key that cannot be removed is reported by the write step below
        // if it is overwritten; otherwise it is left in place.
      }
    });
  }

  const written = [];
  const failed = [];

  entries.forEach((entry) => {
    try {
      const value = entry.raw ? String(entry.value) : JSON.stringify(entry.value);
      storage.setItem(entry.key, value);
      written.push(entry.key);
    } catch {
      failed.push(entry.key);
    }
  });

  if (failed.length > 0) {
    return {
      ok: false,
      written,
      removed,
      failed,
      errors: [
        `${failed.length} item${failed.length === 1 ? '' : 's'} could not be written. Browser storage may be full.`,
      ],
    };
  }

  return { ok: true, written, removed, errors: [] };
}

/**
 * Removes every app-owned key from storage, including the credential file
 * and the session key.
 */
export function wipeAllData(storage = safeStorage()) {
  if (!storage) {
    return { ok: false, removed: 0, errors: ['Browser storage is unavailable.'] };
  }

  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (typeof key === 'string' && key.startsWith(EXPORT_FILE_PREFIX)) {
      keys.push(key);
    }
  }

  const removed = [];
  const failed = [];
  keys.forEach((key) => {
    try {
      storage.removeItem(key);
      removed.push(key);
    } catch {
      failed.push(key);
    }
  });

  if (failed.length > 0) {
    return {
      ok: false,
      removed: removed.length,
      failed,
      errors: [`${failed.length} item${failed.length === 1 ? '' : 's'} could not be removed.`],
    };
  }

  return { ok: true, removed: removed.length, errors: [] };
}

/**
 * Removes only one account's data, leaving other accounts' data in place.
 *
 * Every app store is keyed by user id, so the account's own keys can be
 * removed without touching another learner's.
 */
export function wipeAccountData(userId, storage = safeStorage()) {
  if (!storage || !userId) {
    return { ok: false, removed: 0, errors: ['No account was selected.'] };
  }

  const suffix = encodeURIComponent(String(userId).trim());
  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (typeof key !== 'string') continue;
    if (!key.startsWith(EXPORT_FILE_PREFIX)) continue;
    if (isExcluded(key)) continue;
    // Course-scoped stores are not user-scoped, so they are left alone; the
    // account credential file is removed separately by the caller.
    if (key.endsWith(`_${suffix}`) || key.includes(`_${suffix}::`)) {
      keys.push(key);
    }
  }

  const removed = [];
  keys.forEach((key) => {
    try {
      storage.removeItem(key);
      removed.push(key);
    } catch {
      // Reported below through the removed count only.
    }
  });

  return { ok: true, removed: removed.length, errors: [] };
}
