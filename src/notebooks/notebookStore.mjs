// User-scoped notebook metadata persistence.
//
// This store deliberately knows nothing about sources, chat or study
// materials. Their records live behind separate storage keys owned by the
// notebook repository.

import {
  MAX_NOTEBOOKS,
  NOTEBOOK_SCHEMA_VERSION,
  NotebookValidationError,
  createRecordId,
  migrateNotebookPayload,
  normalizeNotebookRecord,
  validateNotebookInput,
} from './notebookSchema.mjs';

export const NOTEBOOK_STORAGE_PREFIX = 'crushlearn_notebooks';

function keyPart(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return encodeURIComponent(value.trim());
}

export function getNotebooksStorageKey(userId) {
  return `${NOTEBOOK_STORAGE_PREFIX}_${keyPart(userId, 'A user id')}`;
}

function assertStorage(storage) {
  if (
    !storage ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function' ||
    typeof storage.removeItem !== 'function'
  ) {
    throw new Error(
      'createNotebookStore requires a storage adapter such as window.localStorage'
    );
  }
}

/**
 * Read the stored payload for a user.
 *
 * A payload written by an older schema version is migrated rather than
 * discarded. The previous behaviour — returning an empty list whenever the
 * version did not match — silently deleted every notebook a learner had.
 */
function readNotebookPayload(storage, userId) {
  const raw = storage.getItem(getNotebooksStorageKey(userId));
  if (!raw) return { payload: null, migrated: false };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { payload: null, migrated: false };
  }

  if (!parsed || parsed.userId !== userId || !Array.isArray(parsed.notebooks)) {
    return { payload: null, migrated: false };
  }

  const migrated = migrateNotebookPayload(parsed);
  if (!migrated) return { payload: null, migrated: false };

  return {
    payload: migrated,
    migrated: Number(parsed.schemaVersion) !== NOTEBOOK_SCHEMA_VERSION,
  };
}

function readNotebooks(storage, userId) {
  const { payload, migrated } = readNotebookPayload(storage, userId);
  if (!payload) return [];

  const seen = new Set();
  const notebooks = payload.notebooks
    .map(normalizeNotebookRecord)
    .filter((notebook) => {
      if (!notebook || seen.has(notebook.id)) return false;
      seen.add(notebook.id);
      return true;
    })
    .slice(0, MAX_NOTEBOOKS);

  // Persist the migrated shape once, so the migration does not run again on
  // every read and the stored copy matches what the app now understands.
  if (migrated) {
    writeNotebooks(storage, userId, notebooks, payload.updatedAt || new Date().toISOString());
  }

  return notebooks;
}

function writeNotebooks(storage, userId, notebooks, now) {
  const payload = {
    schemaVersion: NOTEBOOK_SCHEMA_VERSION,
    userId,
    notebooks: notebooks.slice(0, MAX_NOTEBOOKS),
    updatedAt: now,
  };
  storage.setItem(getNotebooksStorageKey(userId), JSON.stringify(payload));
  return payload;
}

export function createNotebookStore(storage) {
  assertStorage(storage);

  const list = (userId) => readNotebooks(storage, userId);

  const get = (userId, notebookId) =>
    list(userId).find((notebook) => notebook.id === notebookId) || null;

  const save = (userId, notebooks, now) =>
    writeNotebooks(storage, userId, notebooks, now);

  return {
    list,

    get,

    create(
      userId,
      input,
      now = new Date().toISOString(),
      { createdAt = now, updatedAt = now } = {}
    ) {
      const validation = validateNotebookInput(input);
      if (!validation.ok) {
        throw new NotebookValidationError(validation.errors);
      }

      const notebooks = list(userId);
      if (notebooks.length >= MAX_NOTEBOOKS) {
        throw new NotebookValidationError([
          `You can keep up to ${MAX_NOTEBOOKS} notebooks in this browser.`,
        ]);
      }

      const created =
        typeof createdAt === 'string' && createdAt ? createdAt : now;
      const updated =
        typeof updatedAt === 'string' && updatedAt ? updatedAt : created;

      const notebook = {
        id: createRecordId('notebook'),
        title: validation.value.title,
        description: validation.value.description,
        kind: validation.value.kind,
        tags: validation.value.tags,
        archivedAt: null,
        createdAt: created,
        updatedAt: updated,
      };
      save(userId, [notebook, ...notebooks], now);
      return notebook;
    },

    update(userId, notebookId, input, now = new Date().toISOString()) {
      const notebooks = list(userId);
      const index = notebooks.findIndex(
        (notebook) => notebook.id === notebookId
      );
      if (index < 0) return null;

      const existing = notebooks[index];
      const has = (key) =>
        Boolean(input) &&
        Object.prototype.hasOwnProperty.call(input, key);

      // Omitted fields keep their stored value. An explicit `null`
      // description clears it, while an explicit `null` title still fails
      // validation instead of silently keeping the old title.
      const validation = validateNotebookInput({
        title: has('title') ? input.title : existing.title,
        description: has('description')
          ? input.description ?? ''
          : existing.description,
        kind: has('kind') ? input.kind : existing.kind,
        tags: has('tags') ? input.tags : existing.tags,
      });
      if (!validation.ok) {
        throw new NotebookValidationError(validation.errors);
      }

      const updated = {
        ...existing,
        ...validation.value,
        updatedAt: now,
      };
      const next = [...notebooks];
      next[index] = updated;
      save(userId, next, now);
      return updated;
    },

    /**
     * Set or clear the archive stamp.
     *
     * Archiving is a flag, never a deletion: the notebook, its sources, its
     * chat history and its study materials all stay in storage.
     */
    setArchived(userId, notebookId, archivedAt, now = new Date().toISOString()) {
      const notebooks = list(userId);
      const index = notebooks.findIndex(
        (notebook) => notebook.id === notebookId
      );
      if (index < 0) return null;

      const updated = {
        ...notebooks[index],
        archivedAt: archivedAt || null,
        updatedAt: now,
      };
      const next = [...notebooks];
      next[index] = updated;
      save(userId, next, now);
      return updated;
    },

    remove(userId, notebookId) {
      const notebooks = list(userId);
      const next = notebooks.filter((notebook) => notebook.id !== notebookId);
      if (next.length === notebooks.length) return false;
      save(userId, next, new Date().toISOString());
      return true;
    },

    clear(userId) {
      storage.removeItem(getNotebooksStorageKey(userId));
    },
  };
}
