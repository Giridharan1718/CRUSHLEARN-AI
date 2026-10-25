// Separate, user-scoped stores for notebook source metadata, extracted source
// text, chat history and generated study materials.
//
// Keeping these collections behind distinct keys means a notebook can be
// listed without loading source contents, and generated materials never become
// part of the notebook record itself.

import {
  NOTEBOOK_SCHEMA_VERSION,
  createRecordId,
  migrateCollectionPayload,
} from './notebookSchema.mjs';
import { normalizeCitation } from './citations.mjs';
import { normalizeMaterialGenerator } from './generators.mjs';
import {
  MAX_SOURCES_PER_NOTEBOOK,
  normalizeSourceRecord,
  normalizeSourceTextRecord,
} from './sourceSchema.mjs';

export const SOURCE_STORAGE_PREFIX = 'crushlearn_notebook_sources';
export const SOURCE_TEXT_STORAGE_PREFIX = 'crushlearn_notebook_source_texts';
export const CHAT_STORAGE_PREFIX = 'crushlearn_notebook_chat';
export const MATERIAL_STORAGE_PREFIX = 'crushlearn_notebook_materials';

export const MAX_CHAT_MESSAGES = 200;
export const MAX_STUDY_MATERIALS = 50;
export const MAX_CHAT_MESSAGE_LENGTH = 20_000;
export const MAX_CHAT_CITATIONS = 20;
export const MAX_MATERIAL_BODY_LENGTH = 100_000;
export const MAX_MATERIAL_CITATIONS = 20;

const CHAT_ROLES = new Set(['user', 'assistant', 'system']);

function keyPart(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return encodeURIComponent(value.trim());
}

export function getNotebookScopedStorageKey(prefix, userId, notebookId) {
  return `${prefix}_${keyPart(userId, 'A user id')}::${keyPart(
    notebookId,
    'A notebook id'
  )}`;
}

export function getSourcesStorageKey(userId, notebookId) {
  return getNotebookScopedStorageKey(SOURCE_STORAGE_PREFIX, userId, notebookId);
}

export function getSourceTextsStorageKey(userId, notebookId) {
  return getNotebookScopedStorageKey(
    SOURCE_TEXT_STORAGE_PREFIX,
    userId,
    notebookId
  );
}

export function getChatStorageKey(userId, notebookId) {
  return getNotebookScopedStorageKey(CHAT_STORAGE_PREFIX, userId, notebookId);
}

export function getMaterialsStorageKey(userId, notebookId) {
  return getNotebookScopedStorageKey(MATERIAL_STORAGE_PREFIX, userId, notebookId);
}

function assertStorage(storage) {
  if (
    !storage ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function' ||
    typeof storage.removeItem !== 'function'
  ) {
    throw new Error(
      'Notebook collection stores require a storage adapter such as window.localStorage'
    );
  }
}

export function normalizeChatMessage(record) {
  if (!record || typeof record !== 'object') return null;
  if (typeof record.id !== 'string' || !record.id.trim()) return null;
  if (!CHAT_ROLES.has(record.role)) return null;
  if (typeof record.content !== 'string' || !record.content.trim()) return null;
  if (record.content.length > MAX_CHAT_MESSAGE_LENGTH) return null;
  if (typeof record.createdAt !== 'string' || !record.createdAt) return null;

  const citations = Array.isArray(record.citations)
    ? record.citations
        .slice(0, MAX_CHAT_CITATIONS)
        .map(normalizeCitation)
        .filter(Boolean)
    : [];

  return {
    id: record.id.trim(),
    role: record.role,
    content: record.content,
    citations,
    createdAt: record.createdAt,
  };
}

export function createChatMessage({
  role,
  content,
  citations = [],
  now = new Date().toISOString(),
}) {
  return normalizeChatMessage({
    id: createRecordId('message'),
    role,
    content,
    citations,
    createdAt: now,
  });
}

export function normalizeStudyMaterial(record) {
  if (!record || typeof record !== 'object') return null;
  if (typeof record.id !== 'string' || !record.id.trim()) return null;
  if (typeof record.title !== 'string' || !record.title.trim()) return null;
  if (record.title.length > 120) return null;
  if (typeof record.kind !== 'string' || !record.kind.trim()) return null;
  if (record.kind.length > 40) return null;
  if (typeof record.body !== 'string' || !record.body.trim()) return null;
  if (record.body.length > MAX_MATERIAL_BODY_LENGTH) return null;
  if (typeof record.createdAt !== 'string' || !record.createdAt) return null;

  const citations = Array.isArray(record.citations)
    ? record.citations
        .slice(0, MAX_MATERIAL_CITATIONS)
        .map(normalizeCitation)
        .filter(Boolean)
    : [];
  const generator = normalizeMaterialGenerator(record.generator);

  return {
    id: record.id.trim(),
    title: record.title.trim(),
    kind: record.kind.trim(),
    body: record.body,
    citations,
    generator,
    createdAt: record.createdAt,
  };
}

export function createNotebookCollectionStore(
  storage,
  {
    prefix,
    normalizeItem,
    maxItems = 100,
    itemKey = (item) => item.id || item.sourceId,
  }
) {
  assertStorage(storage);

  return {
    load(userId, notebookId) {
      const key = getNotebookScopedStorageKey(prefix, userId, notebookId);
      const raw = storage.getItem(key);
      if (!raw) return [];

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return [];
      }

      if (
        !parsed ||
        parsed.userId !== userId ||
        parsed.notebookId !== notebookId ||
        !Array.isArray(parsed.items)
      ) {
        return [];
      }

      // An older schema version is migrated, not discarded. These
      // collections share the notebook schema version, so without this a
      // version bump would drop every learner's sources and chat history.
      const migrated = migrateCollectionPayload(parsed);
      if (!migrated) return [];

      const seen = new Set();
      const items = migrated.items
        .map(normalizeItem)
        .filter((item) => {
          if (!item) return false;
          const key = itemKey(item);
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, maxItems);

      if (Number(parsed.schemaVersion) !== NOTEBOOK_SCHEMA_VERSION) {
        storage.setItem(
          key,
          JSON.stringify({
            ...migrated,
            schemaVersion: NOTEBOOK_SCHEMA_VERSION,
            items,
            updatedAt: migrated.updatedAt || new Date().toISOString(),
          })
        );
      }

      return items;
    },

    save(
      userId,
      notebookId,
      items,
      now = new Date().toISOString()
    ) {
      const key = getNotebookScopedStorageKey(prefix, userId, notebookId);
      const seen = new Set();
      const normalized = (Array.isArray(items) ? items : [])
        .map(normalizeItem)
        .filter((item) => {
          if (!item) return false;
          const itemId = itemKey(item);
          if (!itemId || seen.has(itemId)) return false;
          seen.add(itemId);
          return true;
        })
        .slice(0, maxItems);

      const payload = {
        schemaVersion: NOTEBOOK_SCHEMA_VERSION,
        userId,
        notebookId,
        items: normalized,
        updatedAt: now,
      };
      storage.setItem(key, JSON.stringify(payload));
      return normalized;
    },

    clear(userId, notebookId) {
      storage.removeItem(getNotebookScopedStorageKey(prefix, userId, notebookId));
    },
  };
}

export const createSourceStore = (storage) =>
  createNotebookCollectionStore(storage, {
    prefix: SOURCE_STORAGE_PREFIX,
    normalizeItem: normalizeSourceRecord,
    maxItems: MAX_SOURCES_PER_NOTEBOOK,
    itemKey: (source) => source.id,
  });

export const createSourceTextStore = (storage) =>
  createNotebookCollectionStore(storage, {
    prefix: SOURCE_TEXT_STORAGE_PREFIX,
    normalizeItem: normalizeSourceTextRecord,
    maxItems: MAX_SOURCES_PER_NOTEBOOK,
    itemKey: (content) => content.sourceId,
  });

export const createChatStore = (storage) =>
  createNotebookCollectionStore(storage, {
    prefix: CHAT_STORAGE_PREFIX,
    normalizeItem: normalizeChatMessage,
    maxItems: MAX_CHAT_MESSAGES,
    itemKey: (message) => message.id,
  });

export const createStudyMaterialStore = (storage) =>
  createNotebookCollectionStore(storage, {
    prefix: MATERIAL_STORAGE_PREFIX,
    normalizeItem: normalizeStudyMaterial,
    maxItems: MAX_STUDY_MATERIALS,
    itemKey: (material) => material.id,
  });
