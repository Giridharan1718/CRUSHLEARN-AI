// Facade connecting notebook metadata to its separate source, chat and study
// material collections. Every notebook-scoped operation checks that the
// notebook belongs to the requesting user first.

import { createRecordId } from './notebookSchema.mjs';
import { createNotebookStore } from './notebookStore.mjs';
import {
  MAX_CHAT_MESSAGES,
  createChatStore,
  createSourceStore,
  createSourceTextStore,
  createStudyMaterialStore,
  normalizeChatMessage,
  normalizeStudyMaterial,
} from './notebookDataStores.mjs';
import {
  MAX_SOURCES_PER_NOTEBOOK,
  SOURCE_STATUSES,
  normalizeSourceRecord,
  normalizeSourceTextRecord,
} from './sourceSchema.mjs';
import { createNotebookContextStore } from '../intelligence/notebookContextStore.mjs';
import { createExplanationRecordStore } from '../intelligence/explanationRecord.mjs';
import { normalizeLearningContext } from '../intelligence/learningContext.mjs';
import { findSourceDependents } from './sourceDependencies.mjs';
import {
  buildNotebookMarkdown,
  createNotebookExport,
  notebookExportFilename,
  validateNotebookImportPayload,
} from './notebookTransfer.mjs';

export class NotebookNotFoundError extends Error {
  constructor() {
    super('Notebook not found.');
    this.name = 'NotebookNotFoundError';
  }
}

export function createNotebookRepository(storage) {
  const notebooks = createNotebookStore(storage);
  const sources = createSourceStore(storage);
  const sourceTexts = createSourceTextStore(storage);
  const chat = createChatStore(storage);
  const materials = createStudyMaterialStore(storage);
  const contexts = createNotebookContextStore(storage);
  const explanationRecords = createExplanationRecordStore(storage);

  const requireNotebook = (userId, notebookId) => {
    const notebook = notebooks.get(userId, notebookId);
    if (!notebook) throw new NotebookNotFoundError();
    return notebook;
  };

  const listContents = (userId, notebookId) => {
    const contentById = Object.create(null);
    sourceTexts.load(userId, notebookId).forEach((content) => {
      contentById[content.sourceId] = {
        text: content.text,
        pageOffsets: content.pageOffsets || [],
      };
    });
    return contentById;
  };

  const getContent = (userId, notebookId, sourceId) => {
    const source = sources
      .load(userId, notebookId)
      .find((item) => item.id === sourceId);
    if (!source) return null;

    const content = sourceTexts
      .load(userId, notebookId)
      .find((item) => item.sourceId === sourceId);
    return content
      ? {
          text: content.text,
          pageOffsets: content.pageOffsets || [],
        }
      : null;
  };

  const removeNotebook = (userId, notebookId) => {
    sources.clear(userId, notebookId);
    sourceTexts.clear(userId, notebookId);
    chat.clear(userId, notebookId);
    materials.clear(userId, notebookId);
    contexts.clear(userId, notebookId);
    // Explanation records live in their own key, so they are not covered by
    // the clears above. Left in place, they would outlive the notebook they
    // describe and reappear if the same id were ever reused.
    explanationRecords?.clear(userId, notebookId);
    return notebooks.remove(userId, notebookId);
  };

  return {
    listNotebooks(userId, options = {}) {
      const { includeArchived = false, kind = null, tag = null } = options;
      const all = notebooks.list(userId);

      return all.filter((notebook) => {
        if (!includeArchived && notebook.archivedAt) return false;
        if (kind && notebook.kind !== kind) return false;
        if (tag && !notebook.tags.includes(tag)) return false;
        return true;
      });
    },

    listArchivedNotebooks(userId) {
      return notebooks.list(userId).filter((notebook) => notebook.archivedAt);
    },

    getNotebook(userId, notebookId) {
      return notebooks.get(userId, notebookId);
    },

    createNotebook(userId, input, now = new Date().toISOString()) {
      return notebooks.create(userId, input, now);
    },

    updateNotebook(userId, notebookId, input, now = new Date().toISOString()) {
      requireNotebook(userId, notebookId);
      return notebooks.update(userId, notebookId, input, now);
    },

    /**
     * Archive a notebook.
     *
     * Archiving hides the notebook from the default list. It deletes
     * nothing: the notebook, its sources, its chat history and its study
     * materials all stay in storage and come back on restore.
     */
    archiveNotebook(userId, notebookId, now = new Date().toISOString()) {
      requireNotebook(userId, notebookId);
      return notebooks.setArchived(userId, notebookId, now, now);
    },

    restoreNotebook(userId, notebookId, now = new Date().toISOString()) {
      requireNotebook(userId, notebookId);
      return notebooks.setArchived(userId, notebookId, null, now);
    },

    deleteNotebook(userId, notebookId) {
      const notebook = notebooks.get(userId, notebookId);
      if (!notebook) return false;
      return removeNotebook(userId, notebookId);
    },

    listSources(userId, notebookId) {
      const notebook = notebooks.get(userId, notebookId);
      if (!notebook) return [];
      return sources.load(userId, notebookId);
    },

    addSource(userId, notebookId, { source, content } = {}) {
      requireNotebook(userId, notebookId);

      if (!source || typeof source !== 'object') {
        throw new Error('A source record is required.');
      }

      const existing = sources.load(userId, notebookId);
      if (existing.length >= MAX_SOURCES_PER_NOTEBOOK) {
        throw new Error(
          `A notebook can hold up to ${MAX_SOURCES_PER_NOTEBOOK} sources.`
        );
      }

      let normalized = normalizeSourceRecord({ ...source, notebookId });
      if (!normalized) throw new Error('Invalid source record.');
      if (existing.some((item) => item.id === normalized.id)) {
        throw new Error('This source already exists in the notebook.');
      }

      let contentRecord = null;
      if (normalized.status === SOURCE_STATUSES.READY) {
        const text = typeof content?.text === 'string' ? content.text : '';
        contentRecord = normalizeSourceTextRecord({
          sourceId: normalized.id,
          text,
          pageOffsets: content?.pageOffsets,
        });
        if (!contentRecord) {
          throw new Error('Ready sources require extracted text.');
        }
        normalized = {
          ...normalized,
          hasExtractedText: true,
          characterCount: contentRecord.text.length,
          pageCount: contentRecord.pageOffsets.length,
        };
      } else {
        normalized = {
          ...normalized,
          hasExtractedText: false,
          characterCount: 0,
        };
      }

      sources.save(userId, notebookId, [...existing, normalized]);
      if (contentRecord) {
        const existingTexts = sourceTexts.load(userId, notebookId);
        try {
          sourceTexts.save(userId, notebookId, [
            ...existingTexts,
            contentRecord,
          ]);
        } catch (error) {
          sources.save(userId, notebookId, existing);
          throw error;
        }
      }

      return normalized;
    },

    removeSource(userId, notebookId, sourceId) {
      requireNotebook(userId, notebookId);
      const existing = sources.load(userId, notebookId);
      const next = existing.filter((source) => source.id !== sourceId);
      if (next.length === existing.length) return false;

      const texts = sourceTexts.load(userId, notebookId);
      sourceTexts.save(
        userId,
        notebookId,
        texts.filter((content) => content.sourceId !== sourceId)
      );
      sources.save(userId, notebookId, next);
      return true;
    },

    getSourceText(userId, notebookId, sourceId) {
      requireNotebook(userId, notebookId);
      const content = getContent(userId, notebookId, sourceId);
      return content ? content.text : null;
    },

    getSourceContent(userId, notebookId, sourceId) {
      requireNotebook(userId, notebookId);
      return getContent(userId, notebookId, sourceId);
    },

    listSourceContents(userId, notebookId) {
      requireNotebook(userId, notebookId);
      return listContents(userId, notebookId);
    },

    /**
     * List the saved records that cite one source.
     *
     * The UI calls this before deleting a source so the learner can see which
     * materials, chat messages and learning-context records will be left with
     * an unverifiable citation.
     */
    listSourceDependents(userId, notebookId, sourceId) {
      requireNotebook(userId, notebookId);
      const sourceExists = sources
        .load(userId, notebookId)
        .some((source) => source.id === sourceId);
      if (!sourceExists) return [];

      return findSourceDependents({
        sourceId,
        materials: materials.load(userId, notebookId),
        messages: chat.load(userId, notebookId),
        learningContext: contexts.load(userId, notebookId),
      });
    },

    /**
     * Move a source through the pre-extraction states of a retry.
     *
     * Only queued and processing are accepted here. A source becomes ready or
     * failed through `replaceSource`, which also writes or clears the extracted
     * text in the same operation.
     */
    updateSourceStatus(
      userId,
      notebookId,
      sourceId,
      { status, now = new Date().toISOString() } = {}
    ) {
      requireNotebook(userId, notebookId);
      if (
        status !== SOURCE_STATUSES.QUEUED &&
        status !== SOURCE_STATUSES.PROCESSING
      ) {
        throw new Error(
          'Only queued or processing status can be set without replacing the source text.'
        );
      }

      const existing = sources.load(userId, notebookId);
      const index = existing.findIndex((source) => source.id === sourceId);
      if (index < 0) return null;

      const normalized = normalizeSourceRecord({
        ...existing[index],
        status,
        error: null,
        updatedAt: now,
      });
      if (!normalized) throw new Error('Invalid source record.');

      const next = [...existing];
      next[index] = normalized;
      sources.save(userId, notebookId, next, now);
      return normalized;
    },

    /**
     * Replace a failed source in place with the result of a retry.
     *
     * The source keeps its id and creation time, so citations that already
     * point at it remain attached. A ready result writes new extracted text; a
     * failed result clears any old text and keeps the real error. The source
     * metadata is written last and rolled back if the text write fails.
     */
    replaceSource(
      userId,
      notebookId,
      sourceId,
      { source, content } = {},
      now = new Date().toISOString()
    ) {
      requireNotebook(userId, notebookId);

      if (!source || typeof source !== 'object') {
        throw new Error('A source record is required.');
      }

      const existing = sources.load(userId, notebookId);
      const index = existing.findIndex((item) => item.id === sourceId);
      if (index < 0) return null;

      let normalized = normalizeSourceRecord({
        ...source,
        id: sourceId,
        notebookId,
        createdAt: existing[index].createdAt,
        updatedAt: now,
      });
      if (!normalized) throw new Error('Invalid source record.');

      if (
        normalized.status !== SOURCE_STATUSES.READY &&
        normalized.status !== SOURCE_STATUSES.FAILED
      ) {
        throw new Error(
          'A source can only be replaced by a ready or failed result.'
        );
      }

      let contentRecord = null;
      if (normalized.status === SOURCE_STATUSES.READY) {
        const text = typeof content?.text === 'string' ? content.text : '';
        contentRecord = normalizeSourceTextRecord({
          sourceId,
          text,
          pageOffsets: content?.pageOffsets,
        });
        if (!contentRecord) {
          throw new Error('Ready sources require extracted text.');
        }
        normalized = {
          ...normalized,
          hasExtractedText: true,
          characterCount: contentRecord.text.length,
          pageCount: contentRecord.pageOffsets.length,
        };
      } else {
        normalized = {
          ...normalized,
          hasExtractedText: false,
          characterCount: 0,
          pageCount: 0,
        };
      }

      const nextSources = [...existing];
      nextSources[index] = normalized;

      const previousTexts = sourceTexts.load(userId, notebookId);
      const nextTexts = previousTexts.filter(
        (item) => item.sourceId !== sourceId
      );
      if (contentRecord) nextTexts.push(contentRecord);

      sourceTexts.save(userId, notebookId, nextTexts, now);
      try {
        sources.save(userId, notebookId, nextSources, now);
      } catch (error) {
        sourceTexts.save(userId, notebookId, previousTexts, now);
        throw error;
      }

      return normalized;
    },

    /**
     * Build a portable copy of a notebook.
     *
     * JSON is the lossless format and the one `importNotebook` accepts.
     * Markdown is the readable format. Both are produced locally; exporting
     * never sends notebook data to a server.
     */
    exportNotebook(
      userId,
      notebookId,
      { format = 'json', now = new Date().toISOString() } = {}
    ) {
      const notebook = requireNotebook(userId, notebookId);
      if (format !== 'json' && format !== 'markdown') {
        throw new Error('Unsupported notebook export format.');
      }

      const payload = createNotebookExport({
        notebook,
        sources: sources.load(userId, notebookId),
        sourceContents: listContents(userId, notebookId),
        messages: chat.load(userId, notebookId),
        materials: materials.load(userId, notebookId),
        learningContext: contexts.load(userId, notebookId),
        exportedAt: now,
      });

      const isMarkdown = format === 'markdown';
      return {
        ok: true,
        format,
        filename: notebookExportFilename(
          notebook.title,
          isMarkdown ? 'md' : 'json',
          now
        ),
        mimeType: isMarkdown
          ? 'text/markdown;charset=utf-8'
          : 'application/json;charset=utf-8',
        content: isMarkdown
          ? buildNotebookMarkdown(payload)
          : JSON.stringify(payload, null, 2),
        payload,
      };
    },

    /**
     * Import a validated JSON export into a new notebook.
     *
     * Validation happens before the first write. If a later storage write
     * fails, the partially created notebook is removed again. Returned errors
     * are user-readable; malformed input imports nothing.
     */
    importNotebook(userId, payload, now = new Date().toISOString()) {
      const validation = validateNotebookImportPayload(payload);
      if (!validation.ok) {
        return { ok: false, errors: validation.errors, notebook: null };
      }

      const {
        notebookInput,
        notebookCreatedAt,
        notebookUpdatedAt,
        sources: importedSources,
        chat: importedChat,
        materials: importedMaterials,
        learningContext,
      } = validation.value;

      let notebook = null;
      try {
        notebook = notebooks.create(userId, notebookInput, now, {
          createdAt: notebookCreatedAt || now,
          updatedAt: notebookUpdatedAt || now,
        });

        if (importedSources.length > 0) {
          const sourceRecords = [];
          const contentRecords = [];

          importedSources.forEach(({ source, content }) => {
            const nextSource = normalizeSourceRecord({
              ...source,
              notebookId: notebook.id,
            });
            if (!nextSource) {
              throw new Error('An imported source record is invalid.');
            }

            if (nextSource.status === SOURCE_STATUSES.READY) {
              const nextContent = normalizeSourceTextRecord({
                ...content,
                sourceId: nextSource.id,
              });
              if (!nextContent) {
                throw new Error(
                  `The source "${nextSource.title}" has no readable text.`
                );
              }
              sourceRecords.push({
                ...nextSource,
                hasExtractedText: true,
                characterCount: nextContent.text.length,
                pageCount: nextContent.pageOffsets.length,
              });
              contentRecords.push(nextContent);
            } else {
              sourceRecords.push({
                ...nextSource,
                hasExtractedText: false,
                characterCount: 0,
                pageCount: 0,
              });
            }
          });

          sources.save(userId, notebook.id, sourceRecords, now);
          sourceTexts.save(userId, notebook.id, contentRecords, now);
        }

        if (importedChat.length > 0) {
          chat.save(userId, notebook.id, importedChat, now);
        }
        if (importedMaterials.length > 0) {
          materials.save(userId, notebook.id, importedMaterials, now);
        }
        if (learningContext) {
          const nextContext = normalizeLearningContext({
            ...learningContext,
            userId,
            notebookId: notebook.id,
          });
          if (!nextContext) {
            throw new Error('The saved learning context could not be imported.');
          }
          contexts.save(userId, notebook.id, nextContext, now);
        }

        return {
          ok: true,
          errors: [],
          notebook,
          counts: {
            sources: importedSources.length,
            chat: importedChat.length,
            materials: importedMaterials.length,
            learningContext: Boolean(learningContext),
          },
        };
      } catch (error) {
        if (notebook) {
          try {
            removeNotebook(userId, notebook.id);
          } catch {
            // The original error is more useful than a rollback failure.
          }
        }
        return {
          ok: false,
          errors: [
            error?.message ||
              'The notebook could not be imported. Browser storage may be full.',
          ],
          notebook: null,
        };
      }
    },

    listChatMessages(userId, notebookId) {
      const notebook = notebooks.get(userId, notebookId);
      if (!notebook) return [];
      return chat.load(userId, notebookId);
    },

    appendChatMessage(userId, notebookId, message, now = new Date().toISOString()) {
      requireNotebook(userId, notebookId);
      const normalized = normalizeChatMessage({
        ...message,
        id: message?.id || createRecordId('message'),
        createdAt: message?.createdAt || now,
      });
      if (!normalized) throw new Error('Invalid chat message.');

      const existing = chat.load(userId, notebookId);
      const next =
        existing.length >= MAX_CHAT_MESSAGES
          ? [...existing.slice(1), normalized]
          : [...existing, normalized];
      chat.save(userId, notebookId, next, now);
      return normalized;
    },

    listStudyMaterials(userId, notebookId) {
      const notebook = notebooks.get(userId, notebookId);
      if (!notebook) return [];
      return materials.load(userId, notebookId);
    },

    saveStudyMaterials(userId, notebookId, items, now = new Date().toISOString()) {
      requireNotebook(userId, notebookId);
      const normalized = (Array.isArray(items) ? items : []).map((item) =>
        normalizeStudyMaterial({
          ...item,
          id: item?.id || createRecordId('material'),
          createdAt: item?.createdAt || now,
        })
      );
      if (normalized.some((item) => !item)) {
        throw new Error('Invalid study material record.');
      }
      return materials.save(userId, notebookId, normalized, now);
    },

    getLearningContext(userId, notebookId) {
      const notebook = notebooks.get(userId, notebookId);
      if (!notebook) return null;
      return contexts.load(userId, notebookId);
    },

    saveLearningContext(userId, notebookId, context, now = new Date().toISOString()) {
      requireNotebook(userId, notebookId);
      const normalized = contexts.save(userId, notebookId, {
        ...context,
        userId,
        notebookId,
        updatedAt: context?.updatedAt || now,
      });
      return normalized;
    },

    clearLearningContext(userId, notebookId) {
      requireNotebook(userId, notebookId);
      contexts.clear(userId, notebookId);
    },
  };
}
