// Local persistence for the notebook learning context.
//
// Context is stored next to, but separately from, notebook sources and study
// materials. It is scoped by user and notebook, versioned, and treated as
// untrusted data whenever it is loaded. Deleting a notebook also clears it.

import {
  LEARNING_CONTEXT_SCHEMA_VERSION,
  normalizeLearningContext,
} from './learningContext.mjs';

export const NOTEBOOK_CONTEXT_STORAGE_PREFIX =
  'crushlearn_notebook_learning_context';
export const NOTEBOOK_CONTEXT_STORAGE_VERSION = LEARNING_CONTEXT_SCHEMA_VERSION;

function keyPart(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return encodeURIComponent(value.trim());
}

export function getNotebookContextStorageKey(userId, notebookId) {
  return `${NOTEBOOK_CONTEXT_STORAGE_PREFIX}_${keyPart(
    userId,
    'A user id'
  )}::${keyPart(notebookId, 'A notebook id')}`;
}

function assertStorage(storage) {
  if (
    !storage ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function' ||
    typeof storage.removeItem !== 'function'
  ) {
    throw new Error(
      'The notebook context store requires a storage adapter such as window.localStorage'
    );
  }
}

export function createNotebookContextStore(storage) {
  assertStorage(storage);

  return {
    load(userId, notebookId) {
      const key = getNotebookContextStorageKey(userId, notebookId);
      const raw = storage.getItem(key);
      if (!raw) return null;

      try {
        const parsed = JSON.parse(raw);
        return normalizeLearningContext(parsed, { userId, notebookId });
      } catch {
        return null;
      }
    },

    save(userId, notebookId, context) {
      const normalized = normalizeLearningContext(context, {
        userId,
        notebookId,
      });
      if (!normalized) {
        throw new Error('Invalid learning context.');
      }
      storage.setItem(
        getNotebookContextStorageKey(userId, notebookId),
        JSON.stringify(normalized)
      );
      return normalized;
    },

    clear(userId, notebookId) {
      storage.removeItem(getNotebookContextStorageKey(userId, notebookId));
    },
  };
}
