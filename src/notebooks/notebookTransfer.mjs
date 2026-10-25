// Notebook export and import.
//
// Export is a learner-initiated download. It gathers the notebook metadata,
// source metadata and extracted text, chat history, saved materials and the
// learning context into one versioned JSON document. Markdown is a readable
// rendering of the same document.
//
// Import is the untrusted direction: a file can be edited or produced by
// another version of the app. The whole document is validated before anything
// is written, and the repository rolls back a partially created notebook if a
// storage write fails. A malformed file therefore imports nothing.

import { formatCitationLabel, normalizeCitation } from './citations.mjs';
import {
  MATERIAL_GENERATORS,
  formatGeneratorLabel,
} from './generators.mjs';
import {
  MAX_CHAT_CITATIONS,
  MAX_CHAT_MESSAGES,
  MAX_MATERIAL_CITATIONS,
  MAX_STUDY_MATERIALS,
  normalizeChatMessage,
  normalizeStudyMaterial,
} from './notebookDataStores.mjs';
import { validateNotebookInput } from './notebookSchema.mjs';
import { normalizeLearningContext } from '../intelligence/learningContext.mjs';
import { collectSourceCitationIds } from './sourceDependencies.mjs';
import {
  MAX_SOURCES_PER_NOTEBOOK,
  SOURCE_STATUSES,
  normalizeSourceRecord,
  normalizeSourceTextRecord,
} from './sourceSchema.mjs';

export const NOTEBOOK_TRANSFER_FORMAT = 'crushlearn-notebook';
export const NOTEBOOK_TRANSFER_VERSION = 1;

const SOURCE_TYPE_LABELS = Object.freeze({
  text: 'Text',
  markdown: 'Markdown',
  pdf: 'PDF',
  docx: 'DOCX',
  pasted_text: 'Pasted text',
  web: 'Web page',
});

function oneLine(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.replace(/\s+/g, ' ').trim() || fallback;
}

function fenceFor(text) {
  const runs = String(text).match(/`+/g) || [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}

function sourceRecordForExport(source) {
  return {
    id: source.id,
    title: source.title,
    sourceType: source.sourceType,
    url: source.url,
    retrievedAt: source.retrievedAt,
    fileName: source.fileName,
    mimeType: source.mimeType,
    sizeBytes: source.sizeBytes,
    status: source.status,
    error: source.error,
    hasExtractedText: source.hasExtractedText === true,
    characterCount: source.characterCount,
    pageCount: source.pageCount,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

/**
 * Build the JSON document written by "Export JSON".
 *
 * Source ids are preserved because chat messages, materials and the learning
 * context cite sources by id. Notebook ids are not exported: an import always
 * creates a new notebook owned by the importing learner.
 */
export function createNotebookExport({
  notebook,
  sources = [],
  sourceContents = {},
  messages = [],
  materials = [],
  learningContext = null,
  exportedAt = new Date().toISOString(),
} = {}) {
  const safeNotebook = notebook || {};

  return {
    format: NOTEBOOK_TRANSFER_FORMAT,
    schemaVersion: NOTEBOOK_TRANSFER_VERSION,
    exportedAt,
    notebook: {
      title: safeNotebook.title || '',
      description: safeNotebook.description || '',
      kind: safeNotebook.kind || 'subject',
      tags: Array.isArray(safeNotebook.tags) ? [...safeNotebook.tags] : [],
      createdAt: safeNotebook.createdAt || null,
      updatedAt: safeNotebook.updatedAt || null,
    },
    sources: (Array.isArray(sources) ? sources : []).map((source) => {
      const content = sourceContents?.[source.id];
      return {
        source: sourceRecordForExport(source),
        content:
          content && typeof content.text === 'string'
            ? {
                text: content.text,
                pageOffsets: Array.isArray(content.pageOffsets)
                  ? content.pageOffsets
                  : [],
              }
            : null,
      };
    }),
    chat: Array.isArray(messages) ? messages : [],
    materials: Array.isArray(materials) ? materials : [],
    learningContext: learningContext || null,
  };
}

function citationMarkdown(citation, sourceTitles) {
  if (!citation) return '';
  const sourceTitle = sourceTitles[citation.sourceId] || 'Source';
  const label = formatCitationLabel(citation, { title: sourceTitle });
  const quote = oneLine(citation.quote);
  return quote ? `${label}: “${quote}”` : label;
}

function pushCitationLines(lines, citations, sourceTitles) {
  const list = Array.isArray(citations) ? citations : [];
  if (list.length === 0) return;
  lines.push('Citations:');
  list.forEach((citation) => {
    const rendered = citationMarkdown(citation, sourceTitles);
    if (rendered) lines.push(`- ${rendered}`);
  });
  lines.push('');
}

function notebookKindLabel(kind) {
  return oneLine(kind, 'subject');
}

function materialOriginLabel(generator) {
  if (generator === MATERIAL_GENERATORS.AUTHORED) {
    return 'Authored by the learner';
  }
  return formatGeneratorLabel(generator);
}

/**
 * Render the export as a readable Markdown document.
 *
 * The JSON export is the lossless copy. This document includes the source text
 * as well, so a learner can read and keep a study notebook without the app.
 */
export function buildNotebookMarkdown(payload) {
  const notebook = payload?.notebook || {};
  const sources = Array.isArray(payload?.sources) ? payload.sources : [];
  const messages = Array.isArray(payload?.chat) ? payload.chat : [];
  const materials = Array.isArray(payload?.materials) ? payload.materials : [];
  const learningContext = payload?.learningContext || null;
  const sourceTitles = Object.create(null);
  sources.forEach(({ source }) => {
    if (source?.id) sourceTitles[source.id] = source.title || 'Source';
  });

  const lines = [];
  lines.push(`# ${oneLine(notebook.title, 'Untitled notebook')}`, '');

  if (notebook.description) {
    lines.push(notebook.description, '');
  }

  lines.push(
    `- Kind: ${notebookKindLabel(notebook.kind)}`,
    `- Tags: ${
      Array.isArray(notebook.tags) && notebook.tags.length > 0
        ? notebook.tags.join(', ')
        : 'None'
    }`,
    `- Exported: ${payload?.exportedAt || new Date().toISOString()}`,
    `- Sources: ${sources.length}`,
    ''
  );

  lines.push('## Sources', '');
  if (sources.length === 0) {
    lines.push('No sources were saved in this notebook.', '');
  }

  sources.forEach(({ source, content }, index) => {
    lines.push(`### ${index + 1}. ${oneLine(source?.title, 'Untitled source')}`, '');
    lines.push(
      `- Type: ${
        SOURCE_TYPE_LABELS[source?.sourceType] || source?.sourceType || 'Source'
      }`,
      `- Status: ${source?.status || 'unknown'}`
    );
    if (source?.fileName) lines.push(`- File: ${source.fileName}`);
    if (source?.url) lines.push(`- URL: ${source.url}`);
    if (source?.retrievedAt) {
      lines.push(`- Retrieved: ${source.retrievedAt}`);
    }
    if (source?.characterCount) {
      lines.push(`- Characters: ${source.characterCount}`);
    }
    if (source?.pageCount) {
      lines.push(
        `- Pages: ${source.pageCount} page${source.pageCount === 1 ? '' : 's'}`
      );
    }
    lines.push('');

    if (content && typeof content.text === 'string' && content.text) {
      const fence = fenceFor(content.text);
      lines.push('#### Source text', '', fence, content.text, fence, '');
    } else if (source?.status === SOURCE_STATUSES.FAILED) {
      lines.push(
        `> This source could not be read: ${
          oneLine(source.error, 'No error detail was recorded.')
        }`,
        ''
      );
    } else {
      lines.push('> No extracted text was stored with this source.', '');
    }
  });

  lines.push('## Chat history', '');
  if (messages.length === 0) {
    lines.push('No chat messages were saved in this notebook.', '');
  }
  messages.forEach((message, index) => {
    lines.push(
      `### ${index + 1}. ${oneLine(message.role, 'message')}`,
      ''
    );
    lines.push(message.content || '', '');
    pushCitationLines(lines, message.citations, sourceTitles);
  });

  lines.push('## Study materials', '');
  if (materials.length === 0) {
    lines.push('No study materials were saved in this notebook.', '');
  }
  materials.forEach((material, index) => {
    lines.push(
      `### ${index + 1}. ${oneLine(material.title, 'Untitled material')}`,
      '',
      `- Kind: ${oneLine(material.kind, 'material')}`,
      `- Origin: ${materialOriginLabel(material.generator)}`,
      ''
    );
    lines.push(material.body || '', '');
    pushCitationLines(lines, material.citations, sourceTitles);
  });

  if (learningContext) {
    lines.push('## Learning context', '');
    if (learningContext.currentQuestion) {
      lines.push(`- Current question: ${learningContext.currentQuestion}`);
    }
    if (learningContext.resolvedQuestion) {
      lines.push(`- Searched as: ${learningContext.resolvedQuestion}`);
    }
    if (learningContext.answer) {
      lines.push('', '### Last answer', '', learningContext.answer.text || '');
      pushCitationLines(
        lines,
        [learningContext.answer.citation].filter(Boolean),
        sourceTitles
      );
    }
    if (Array.isArray(learningContext.evidence) && learningContext.evidence.length) {
      lines.push('### Evidence', '');
      learningContext.evidence.forEach((item) => {
        const rendered = citationMarkdown(item.citation, sourceTitles);
        if (rendered) lines.push(`- ${rendered}`);
      });
      lines.push('');
    }
    if (learningContext.practice) {
      lines.push(
        '### Practice',
        '',
        learningContext.practice.prompt || '',
        '',
        `Answer: ${learningContext.practice.answer || ''}`,
        ''
      );
      pushCitationLines(
        lines,
        [learningContext.practice.citation].filter(Boolean),
        sourceTitles
      );
    }
    if (learningContext.nextAction) {
      lines.push(
        `### Recommended next step`,
        '',
        `${learningContext.nextAction.title || 'Next step'}${
          learningContext.nextAction.reason
            ? ` — ${learningContext.nextAction.reason}`
            : ''
        }`,
        ''
      );
    }
  }

  lines.push('---', `Exported by CrushLearn AI on ${payload?.exportedAt || ''}`.trim(), '');
  return lines.join('\n');
}

function sourceValidationError(label, message) {
  return `${label}: ${message}`;
}

function validTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

// Source ids are used as keys in a few id-to-content maps. These names would
// mutate a map's prototype instead of adding an entry, so a hand-edited export
// must not be allowed to introduce them.
const RESERVED_RECORD_IDS = new Set(['__proto__', 'constructor', 'prototype']);

function validateCitationList(value, label, maxCitations, errors) {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) {
    errors.push(`${label} citations must be a list.`);
    return;
  }
  if (value.length > maxCitations) {
    errors.push(`${label} has more than ${maxCitations} citations.`);
  }
  value.forEach((citation, index) => {
    if (!normalizeCitation(citation)) {
      errors.push(`${label} citation ${index + 1} is not valid.`);
    }
  });
}

/**
 * Validate an untrusted import document.
 *
 * All records are checked before the caller writes anything. Invalid item
 * records fail the whole import rather than producing a notebook with dangling
 * citations or partially restored study material.
 */
export function validateNotebookImportPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      ok: false,
      errors: ['The file does not contain a CrushLearn notebook export.'],
    };
  }

  const structuralErrors = [];
  if (payload.format !== NOTEBOOK_TRANSFER_FORMAT) {
    structuralErrors.push('This file is not a CrushLearn notebook export.');
  }

  const version = Number(payload.schemaVersion);
  if (!Number.isInteger(version) || version < 1) {
    structuralErrors.push('The export has no valid schema version.');
  } else if (version > NOTEBOOK_TRANSFER_VERSION) {
    structuralErrors.push(
      `This export uses format version ${version}; this version of CrushLearn can import version ${NOTEBOOK_TRANSFER_VERSION} only.`
    );
  }

  if (
    !payload.notebook ||
    typeof payload.notebook !== 'object' ||
    Array.isArray(payload.notebook)
  ) {
    structuralErrors.push('The export is missing notebook details.');
  }

  if (structuralErrors.length > 0) {
    return { ok: false, errors: structuralErrors };
  }

  const errors = [];
  const notebookCheck = validateNotebookInput({
    title: payload.notebook.title,
    description: payload.notebook.description ?? '',
    kind: payload.notebook.kind,
    tags: payload.notebook.tags,
  });
  notebookCheck.errors.forEach((error) => {
    errors.push(`Notebook: ${error}`);
  });

  const notebookCreatedAt = validTimestamp(payload.notebook.createdAt);
  const notebookUpdatedAt = validTimestamp(payload.notebook.updatedAt);
  if (
    payload.notebook.createdAt !== undefined &&
    payload.notebook.createdAt !== null &&
    !notebookCreatedAt
  ) {
    errors.push('Notebook: creation date is not a valid timestamp.');
  }
  if (
    payload.notebook.updatedAt !== undefined &&
    payload.notebook.updatedAt !== null &&
    !notebookUpdatedAt
  ) {
    errors.push('Notebook: updated date is not a valid timestamp.');
  }

  const sourceEntries = [];
  const sourceIds = new Set();
  if (!Array.isArray(payload.sources)) {
    errors.push('Sources must be a list.');
  } else if (payload.sources.length > MAX_SOURCES_PER_NOTEBOOK) {
    errors.push(
      `The export contains more than ${MAX_SOURCES_PER_NOTEBOOK} sources.`
    );
  } else {
    payload.sources.forEach((entry, index) => {
      const label = `Source ${index + 1}`;
      if (!entry || typeof entry !== 'object' || !entry.source) {
        errors.push(sourceValidationError(label, 'is missing source metadata.'));
        return;
      }

      const source = normalizeSourceRecord({
        ...entry.source,
        notebookId: 'import-validation',
      });
      if (!source) {
        errors.push(
          sourceValidationError(label, 'has invalid source metadata.')
        );
        return;
      }
      if (RESERVED_RECORD_IDS.has(source.id)) {
        errors.push(
          sourceValidationError(
            label,
            `uses the reserved source id "${source.id}".`
          )
        );
        return;
      }
      if (sourceIds.has(source.id)) {
        errors.push(
          sourceValidationError(
            label,
            `repeats the source id "${source.id}".`
          )
        );
        return;
      }
      sourceIds.add(source.id);

      if (source.status === SOURCE_STATUSES.READY) {
        const content = normalizeSourceTextRecord({
          sourceId: source.id,
          text: entry.content?.text,
          pageOffsets: entry.content?.pageOffsets,
        });
        if (!content) {
          errors.push(
            sourceValidationError(
              label,
              'is marked ready but has no readable stored text.'
            )
          );
          return;
        }
        sourceEntries.push({
          source: {
            ...source,
            hasExtractedText: true,
            characterCount: content.text.length,
            pageCount: content.pageOffsets.length,
          },
          content,
        });
        return;
      }

      if (source.status !== SOURCE_STATUSES.FAILED) {
        errors.push(
          sourceValidationError(
            label,
            `has unsupported status "${source.status}"; import ready or failed sources.`
          )
        );
        return;
      }

      sourceEntries.push({
        source: {
          ...source,
          hasExtractedText: false,
          characterCount: 0,
          pageCount: 0,
        },
        content: null,
      });
    });
  }

  const importedChat = [];
  if (payload.chat !== undefined && !Array.isArray(payload.chat)) {
    errors.push('Chat history must be a list.');
  } else if (Array.isArray(payload.chat)) {
    if (payload.chat.length > MAX_CHAT_MESSAGES) {
      errors.push(
        `The export contains more than ${MAX_CHAT_MESSAGES} chat messages.`
      );
    } else {
      const chatIds = new Set();
      payload.chat.forEach((entry, index) => {
        const message = normalizeChatMessage(entry);
        if (!message) {
          errors.push(`Chat message ${index + 1} is not a valid record.`);
          return;
        }
        if (chatIds.has(message.id)) {
          errors.push(
            `Chat message ${index + 1} repeats the id "${message.id}".`
          );
          return;
        }
        validateCitationList(
          entry.citations,
          `Chat message ${index + 1}`,
          MAX_CHAT_CITATIONS,
          errors
        );
        chatIds.add(message.id);
        importedChat.push(message);
      });
    }
  }

  const importedMaterials = [];
  if (payload.materials !== undefined && !Array.isArray(payload.materials)) {
    errors.push('Study materials must be a list.');
  } else if (Array.isArray(payload.materials)) {
    if (payload.materials.length > MAX_STUDY_MATERIALS) {
      errors.push(
        `The export contains more than ${MAX_STUDY_MATERIALS} study materials.`
      );
    } else {
      const materialIds = new Set();
      payload.materials.forEach((entry, index) => {
        const material = normalizeStudyMaterial(entry);
        if (!material) {
          errors.push(`Study material ${index + 1} is not a valid record.`);
          return;
        }
        if (materialIds.has(material.id)) {
          errors.push(
            `Study material ${index + 1} repeats the id "${material.id}".`
          );
          return;
        }
        validateCitationList(
          entry.citations,
          `Study material ${index + 1}`,
          MAX_MATERIAL_CITATIONS,
          errors
        );
        materialIds.add(material.id);
        importedMaterials.push(material);
      });
    }
  }

  let importedContext = null;
  if (payload.learningContext !== undefined && payload.learningContext !== null) {
    importedContext = normalizeLearningContext(payload.learningContext);
    if (!importedContext) {
      errors.push('The saved learning context is not a valid record.');
    }
  }

  // A citation must point at a source in this export. An imported notebook
  // must never start with a reference that cannot be checked.
  const citedSourceIds = new Set();
  importedChat.forEach((message) =>
    collectSourceCitationIds(message, citedSourceIds)
  );
  importedMaterials.forEach((material) =>
    collectSourceCitationIds(material, citedSourceIds)
  );
  if (importedContext) {
    collectSourceCitationIds(importedContext, citedSourceIds);
  }
  [...citedSourceIds]
    .filter((sourceId) => !sourceIds.has(sourceId))
    .forEach((sourceId) => {
      errors.push(
        `A saved record cites source "${sourceId}", which is not part of this export.`
      );
    });

  if (errors.length > 0) {
    return { ok: false, errors: [...new Set(errors)] };
  }

  return {
    ok: true,
    errors: [],
    value: {
      notebookInput: notebookCheck.value,
      notebookCreatedAt,
      notebookUpdatedAt,
      sources: sourceEntries,
      chat: importedChat,
      materials: importedMaterials,
      learningContext: importedContext,
    },
  };
}

/**
 * A safe download filename derived from the notebook title and export date.
 */
export function notebookExportFilename(
  title,
  extension,
  exportedAt = new Date().toISOString()
) {
  const base =
    String(title || 'notebook')
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_-]+/g, '-')
      .slice(0, 60)
      .toLowerCase() || 'notebook';
  const date = /^\d{4}-\d{2}-\d{2}/.test(String(exportedAt || ''))
    ? String(exportedAt).slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const suffix = String(extension || 'json').replace(/^\./, '');
  return `${base}-${date}.${suffix}`;
}
