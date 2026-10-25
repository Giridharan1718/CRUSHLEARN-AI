// Notebook storage with an IndexedDB-backed source-text store.
//
// The repository and every store behind it are synchronous. IndexedDB is
// asynchronous, so this module provides the plan the audit called for:
//
//   1. a small adapter exposes the same `getItem` / `setItem` / `removeItem`
//      interface the stores already use;
//   2. source text lives in an in-memory cache after `hydrate()`, so reads can
//      stay synchronous;
//   3. every source-text write is written to localStorage first as a
//      write-ahead copy, then persisted to IndexedDB. The copy is removed only
//      after IndexedDB confirms the write. A failed database write therefore
//      leaves readable text behind and reports the real error instead of
//      leaving a source with no content;
//   4. existing localStorage source text is migrated during hydration; and
//   5. metadata, chat and materials remain in localStorage, so a failure of
//      the new store cannot take the notebook list with it.
//
// The facade also enumerates source-text keys from the cache. That keeps the
// existing whole-browser data export complete even after the localStorage copy
// has been removed.

import { createNotebookRepository } from './notebookRepository.mjs';
import { SOURCE_TEXT_STORAGE_PREFIX } from './notebookDataStores.mjs';

export const NOTEBOOK_DB_NAME = 'crushlearn-notebooks';
export const NOTEBOOK_DB_VERSION = 1;
export const SOURCE_TEXT_OBJECT_STORE = 'source_texts';

export function isSourceTextStorageKey(key) {
  return (
    typeof key === 'string' &&
    key.startsWith(`${SOURCE_TEXT_STORAGE_PREFIX}_`)
  );
}

export function isQuotaError(error) {
  if (!error) return false;
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22 ||
    error.code === 1014 ||
    /quota|storage is full|disk is full/i.test(String(error.message || ''))
  );
}

export function describeStorageError(error, { duringFallback = false } = {}) {
  if (isQuotaError(error)) {
    return duringFallback
      ? 'Browser storage is full. Delete a source or export and remove an old notebook before adding this one.'
      : 'The local source-text database is full. The text is still in the browser fallback store; free space and try again.';
  }

  const detail =
    error instanceof Error && error.message
      ? error.message
      : String(error || 'Unknown storage error.');

  return duringFallback
    ? `Source text could not be saved in this browser: ${detail}`
    : `Source text could not be moved to the local database: ${detail}`;
}

function unavailableBackend(reason) {
  const fail = async () => {
    throw new Error(reason);
  };
  return {
    available: false,
    getAll: async () => {
      await fail();
      return [];
    },
    put: fail,
    remove: fail,
    clear: fail,
  };
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      reject(transaction.error || new Error('The database transaction failed.'));
    };
    transaction.onabort = () => {
      reject(
        transaction.error || new Error('The database transaction was aborted.')
      );
    };
  });
}

/**
 * Short IndexedDB key-value backend. Values are the exact JSON strings the
 * existing collection store writes, so a rollback to localStorage loses
 * nothing.
 */
export function createIndexedDbBackend(indexedDB) {
  if (!indexedDB || typeof indexedDB.open !== 'function') {
    return unavailableBackend(
      'IndexedDB is not available in this browser, so source text is using the localStorage fallback.'
    );
  }

  let databasePromise = null;

  const openDatabase = () => {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      let request;
      try {
        request = indexedDB.open(NOTEBOOK_DB_NAME, NOTEBOOK_DB_VERSION);
      } catch (error) {
        reject(error);
        return;
      }

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(SOURCE_TEXT_OBJECT_STORE)) {
          database.createObjectStore(SOURCE_TEXT_OBJECT_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        reject(request.error || new Error('The local database could not be opened.'));
      };
      request.onblocked = () => {
        reject(
          new Error(
            'The local database is blocked by another open tab. Close the other tab and reload.'
          )
        );
      };
    }).catch((error) => {
      // A failed open should be retryable after the learner closes another tab.
      databasePromise = null;
      throw error;
    });
    return databasePromise;
  };

  return {
    available: true,

    async getAll() {
      const database = await openDatabase();
      return new Promise((resolve, reject) => {
        let transaction;
        try {
          transaction = database.transaction(SOURCE_TEXT_OBJECT_STORE, 'readonly');
        } catch (error) {
          reject(error);
          return;
        }
        const store = transaction.objectStore(SOURCE_TEXT_OBJECT_STORE);
        const request = store.getAll();
        const keysRequest = store.getAllKeys();
        request.onerror = () => reject(request.error || new Error('Source text could not be read.'));
        keysRequest.onerror = () =>
          reject(keysRequest.error || new Error('Source text keys could not be read.'));
        transaction.onerror = () =>
          reject(transaction.error || new Error('The source-text transaction failed.'));
        transaction.oncomplete = () => {
          const values = Array.isArray(request.result) ? request.result : [];
          const keys = Array.isArray(keysRequest.result) ? keysRequest.result : [];
          resolve(values.map((value, index) => [String(keys[index]), String(value)]));
        };
      });
    },

    async put(key, value) {
      const database = await openDatabase();
      return new Promise((resolve, reject) => {
        let transaction;
        try {
          transaction = database.transaction(SOURCE_TEXT_OBJECT_STORE, 'readwrite');
        } catch (error) {
          reject(error);
          return;
        }
        transaction.onabort = () =>
          reject(transaction.error || new Error('The source-text write was aborted.'));
        transaction.onerror = () =>
          reject(transaction.error || new Error('The source-text write failed.'));
        transaction.oncomplete = () => resolve();
        transaction.objectStore(SOURCE_TEXT_OBJECT_STORE).put(String(value), String(key));
      });
    },

    async remove(key) {
      const database = await openDatabase();
      return new Promise((resolve, reject) => {
        let transaction;
        try {
          transaction = database.transaction(SOURCE_TEXT_OBJECT_STORE, 'readwrite');
        } catch (error) {
          reject(error);
          return;
        }
        transaction.onabort = () =>
          reject(transaction.error || new Error('The source-text deletion was aborted.'));
        transaction.onerror = () =>
          reject(transaction.error || new Error('The source-text deletion failed.'));
        transaction.oncomplete = () => resolve();
        transaction.objectStore(SOURCE_TEXT_OBJECT_STORE).delete(String(key));
      });
    },

    async clear() {
      const database = await openDatabase();
      return new Promise((resolve, reject) => {
        let transaction;
        try {
          transaction = database.transaction(SOURCE_TEXT_OBJECT_STORE, 'readwrite');
        } catch (error) {
          reject(error);
          return;
        }
        transaction.onabort = () =>
          reject(transaction.error || new Error('The source-text clear was aborted.'));
        transaction.onerror = () =>
          reject(transaction.error || new Error('The source-text clear failed.'));
        transaction.oncomplete = () => resolve();
        transaction.objectStore(SOURCE_TEXT_OBJECT_STORE).clear();
      });
    },
  };
}

function resolveLocalStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function rawUpdatedAt(raw) {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.updatedAt === 'string' ? Date.parse(parsed.updatedAt) : 0;
  } catch {
    return 0;
  }
}

function latestRaw(localValue, databaseValue) {
  if (localValue === null || localValue === undefined) return databaseValue;
  if (databaseValue === null || databaseValue === undefined) return localValue;
  return rawUpdatedAt(localValue) >= rawUpdatedAt(databaseValue)
    ? localValue
    : databaseValue;
}

/**
 * Create the hybrid storage facade.
 *
 * `backend` is injectable so the storage contract can be tested without a
 * browser. Its methods are `getAll()`, `put(key, value)`, `remove(key)` and
 * `clear()`.
 */
export function createNotebookStorage({
  localStorage: providedLocalStorage = null,
  indexedDB = null,
  backend = null,
} = {}) {
  const local = resolveLocalStorage(providedLocalStorage);
  if (
    !local ||
    typeof local.getItem !== 'function' ||
    typeof local.setItem !== 'function' ||
    typeof local.removeItem !== 'function'
  ) {
    throw new Error(
      'Notebook storage requires a storage adapter such as window.localStorage'
    );
  }

  const textBackend =
    backend ||
    createIndexedDbBackend(
      indexedDB === null && typeof globalThis !== 'undefined'
        ? globalThis.indexedDB
        : indexedDB
    );

  const textCache = new Map();
  const writeVersions = new Map();
  const pending = new Map();
  const state = {
    hydrated: false,
    hydrating: null,
    backendAvailable: textBackend.available !== false,
    mode: 'localStorage',
    errors: [],
    lastError: null,
  };

  const rememberError = (error, fallback) => {
    const message = describeStorageError(error, { duringFallback: fallback });
    state.lastError = message;
    if (!state.errors.includes(message)) state.errors.push(message);
    state.mode = 'localStorage-fallback';
    return message;
  };

  const enqueue = (key, operation) => {
    const previous = pending.get(key) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(operation)
      .catch((error) => {
        state.backendAvailable = false;
        rememberError(error, true);
      })
      .finally(() => {
        if (pending.get(key) === next) pending.delete(key);
      });
    pending.set(key, next);
    return next;
  };

  const persistText = (key, value, version) => {
    enqueue(key, async () => {
      if (writeVersions.get(key) !== version) return;
      await textBackend.put(key, value);
      if (writeVersions.get(key) !== version || textCache.get(key) !== value) {
        return;
      }
      // The database has the text. Removing the write-ahead copy is the point
      // at which source text stops consuming the small localStorage quota.
      try {
        local.removeItem(key);
      } catch {
        // A later migration can still remove it. The database copy is current.
      }
    });
  };

  const deleteText = (key) => {
    enqueue(key, async () => {
      await textBackend.remove(key);
      try {
        local.removeItem(key);
      } catch {
        // The cache and visible state no longer contain it.
      }
    });
  };

  const hydrate = () => {
    if (state.hydrated) {
      return Promise.resolve({
        ok: state.errors.length === 0,
        mode: state.mode,
        backendAvailable: state.backendAvailable,
        errors: [...state.errors],
      });
    }
    if (state.hydrating) return state.hydrating;

    state.hydrating = (async () => {
      let databaseEntries = [];
      try {
        databaseEntries = await textBackend.getAll();
        state.backendAvailable = textBackend.available !== false;
      } catch (error) {
        state.backendAvailable = false;
        rememberError(error, true);
      }

      const databaseMap = new Map(databaseEntries);

      // Load database values into the synchronous cache first.
      databaseMap.forEach((value, key) => {
        textCache.set(key, value);
      });

      // Migrate every legacy localStorage source text. If both stores hold a
      // record, the newer `updatedAt` wins rather than whichever happened to
      // be read last.
      const localKeys = [];
      try {
        for (let index = 0; index < local.length; index += 1) {
          const key = local.key(index);
          if (isSourceTextStorageKey(key)) localKeys.push(key);
        }
      } catch (error) {
        rememberError(error, true);
      }

      for (const key of localKeys) {
        let localValue = null;
        try {
          localValue = local.getItem(key);
        } catch (error) {
          rememberError(error, true);
          continue;
        }
        if (localValue === null) continue;

        const chosen = latestRaw(localValue, databaseMap.get(key) || null);
        textCache.set(key, chosen);

        if (!state.backendAvailable) {
          // No database. Keep the text where it already is.
          continue;
        }

        try {
          if (chosen !== databaseMap.get(key)) {
            await textBackend.put(key, chosen);
          }
          local.removeItem(key);
        } catch (error) {
          rememberError(error, true);
          textCache.set(key, chosen);
        }
      }

      state.hydrated = true;
      state.mode = state.backendAvailable
        ? state.errors.length > 0
          ? 'indexeddb-with-fallback'
          : 'indexeddb'
        : 'localStorage-fallback';

      return {
        ok: state.errors.length === 0,
        mode: state.mode,
        backendAvailable: state.backendAvailable,
        errors: [...state.errors],
      };
    })().finally(() => {
      state.hydrating = null;
    });

    return state.hydrating;
  };

  const getText = (key) => {
    if (textCache.has(key)) return textCache.get(key);
    let raw = null;
    try {
      raw = local.getItem(key);
    } catch {
      raw = null;
    }
    if (raw === null) return null;
    textCache.set(key, raw);

    // A direct write to localStorage can appear after hydration (for example
    // from an older tab). Migrate it in the background.
    if (state.hydrated && state.backendAvailable) {
      const version = (writeVersions.get(key) || 0) + 1;
      writeVersions.set(key, version);
      persistText(key, raw, version);
    }
    return raw;
  };

  const setText = (key, value) => {
    const raw = String(value);

    // Write-ahead copy. If this throws (usually a quota error), nothing was
    // accepted and the repository can roll the metadata write back.
    try {
      local.setItem(key, raw);
    } catch (error) {
      textCache.delete(key);
      throw new Error(describeStorageError(error, { duringFallback: true }));
    }

    textCache.set(key, raw);
    const version = (writeVersions.get(key) || 0) + 1;
    writeVersions.set(key, version);

    if (state.backendAvailable) {
      persistText(key, raw, version);
    }
  };

  const removeText = (key) => {
    textCache.delete(key);
    const version = (writeVersions.get(key) || 0) + 1;
    writeVersions.set(key, version);
    try {
      local.removeItem(key);
    } catch {
      // The cache is already clear and the database delete below still runs.
    }
    if (state.backendAvailable) deleteText(key);
  };

  const enumerateKeys = () => {
    const keys = [];
    const seen = new Set();
    try {
      for (let index = 0; index < local.length; index += 1) {
        const key = local.key(index);
        if (typeof key === 'string' && !seen.has(key)) {
          seen.add(key);
          keys.push(key);
        }
      }
    } catch {
      // The cache below is still enumerated.
    }
    textCache.forEach((_value, key) => {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    });
    return keys;
  };

  const storage = {
    get length() {
      return enumerateKeys().length;
    },

    key(index) {
      const keys = enumerateKeys();
      const position = Number(index);
      if (!Number.isInteger(position) || position < 0 || position >= keys.length) {
        return null;
      }
      return keys[position];
    },

    getItem(key) {
      return isSourceTextStorageKey(key)
        ? getText(String(key))
        : local.getItem(key);
    },

    setItem(key, value) {
      if (isSourceTextStorageKey(key)) {
        setText(String(key), value);
      } else {
        local.setItem(key, value);
      }
    },

    removeItem(key) {
      if (isSourceTextStorageKey(key)) {
        removeText(String(key));
      } else {
        local.removeItem(key);
      }
    },

    hydrate,
    isHydrated: () => state.hydrated,
    getStorageStatus: () => ({
      hydrated: state.hydrated,
      mode: state.mode,
      backendAvailable: state.backendAvailable,
      errors: [...state.errors],
      lastError: state.lastError,
    }),

    async flush() {
      // A write can enqueue another write while we await the current set.
      while (pending.size > 0) {
        await Promise.all([...pending.values()]);
      }
      return {
        ok: state.errors.length === 0,
        mode: state.mode,
        backendAvailable: state.backendAvailable,
        errors: [...state.errors],
        lastError: state.lastError,
      };
    },

    async clearSourceTexts() {
      textCache.clear();
      writeVersions.clear();
      const keys = enumerateKeys().filter(isSourceTextStorageKey);
      keys.forEach((key) => {
        try {
          local.removeItem(key);
        } catch {
          // The database clear below is the authoritative removal.
        }
      });
      if (state.backendAvailable) {
        await textBackend.clear();
      }
      return { ok: true };
    },
  };

  return storage;
}

let appStorage = null;
let appRepository = null;

export function getAppNotebookStorage() {
  if (!appStorage) {
    appStorage = createNotebookStorage();
  }
  return appStorage;
}

export function getAppNotebookRepository() {
  if (!appRepository) {
    appRepository = createNotebookRepository(getAppNotebookStorage());
  }
  return appRepository;
}

/**
 * Load existing source text into the synchronous cache and migrate legacy
 * localStorage records. The app calls this once before rendering.
 */
export function hydrateNotebookStorage() {
  return getAppNotebookStorage().hydrate();
}

export function flushNotebookStorage() {
  return getAppNotebookStorage().flush();
}

export function getNotebookStorageStatus() {
  return getAppNotebookStorage().getStorageStatus();
}
