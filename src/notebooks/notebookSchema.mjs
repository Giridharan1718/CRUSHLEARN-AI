// Notebook metadata validation shared by the store and the UI.
//
// Notebook records intentionally contain only learner-authored metadata. Source
// files, extracted text, chat history and generated materials live in separate
// stores so a notebook can be loaded without reading source contents.
//
// Schema v2 adds the organisation fields: `kind`, `tags` and `archivedAt`.
// v1 records are migrated rather than discarded — a version bump must never
// cost a learner their work.

export const NOTEBOOK_SCHEMA_VERSION = 2;
export const MAX_NOTEBOOKS = 50;
export const NOTEBOOK_TITLE_MAX_LENGTH = 120;
export const NOTEBOOK_DESCRIPTION_MAX_LENGTH = 1000;
export const MAX_NOTEBOOK_TAGS = 12;
export const NOTEBOOK_TAG_MAX_LENGTH = 40;

/**
 * What a notebook is for.
 *
 * The kind is a plain label the learner picks. It drives grouping in the
 * sidebar, and nothing else — it never changes how a source is parsed or
 * how an answer is produced.
 */
export const NOTEBOOK_KINDS = Object.freeze({
  SUBJECT: 'subject',
  COURSE: 'course',
  ASSIGNMENT: 'assignment',
  PROJECT: 'project',
});

export const NOTEBOOK_KIND_VALUES = Object.freeze(
  Object.values(NOTEBOOK_KINDS)
);

export const NOTEBOOK_KIND_LABELS = Object.freeze({
  [NOTEBOOK_KINDS.SUBJECT]: 'Subject',
  [NOTEBOOK_KINDS.COURSE]: 'Course',
  [NOTEBOOK_KINDS.ASSIGNMENT]: 'Assignment',
  [NOTEBOOK_KINDS.PROJECT]: 'Research project',
});

export class NotebookValidationError extends Error {
  constructor(errors) {
    super(errors.join(' '));
    this.name = 'NotebookValidationError';
    this.errors = errors;
  }
}

export function createRecordId(prefix = 'record') {
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${random}`;
}

export function normalizeNotebookKind(value) {
  return NOTEBOOK_KIND_VALUES.includes(value)
    ? value
    : NOTEBOOK_KINDS.SUBJECT;
}

export function normalizeNotebookTags(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const tags = [];
  value.forEach((tag) => {
    if (typeof tag !== 'string') return;
    const trimmed = tag.trim().replace(/\s+/g, ' ').slice(0, NOTEBOOK_TAG_MAX_LENGTH);
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    tags.push(trimmed);
  });

  return tags.slice(0, MAX_NOTEBOOK_TAGS);
}

export function validateNotebookInput(input = {}) {
  const errors = [];
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const description =
    typeof input.description === 'string' ? input.description.trim() : '';

  if (typeof input.title !== 'string' || !title) {
    errors.push('Notebook title is required.');
  } else if (title.length > NOTEBOOK_TITLE_MAX_LENGTH) {
    errors.push(
      `Notebook title must be ${NOTEBOOK_TITLE_MAX_LENGTH} characters or fewer.`
    );
  }

  if (input.description !== undefined && typeof input.description !== 'string') {
    errors.push('Notebook description must be text.');
  } else if (description.length > NOTEBOOK_DESCRIPTION_MAX_LENGTH) {
    errors.push(
      `Notebook description must be ${NOTEBOOK_DESCRIPTION_MAX_LENGTH} characters or fewer.`
    );
  }

  if (
    input.kind !== undefined &&
    input.kind !== null &&
    !NOTEBOOK_KIND_VALUES.includes(input.kind)
  ) {
    errors.push(
      `Notebook kind must be one of: ${NOTEBOOK_KIND_VALUES.join(', ')}.`
    );
  }

  if (input.tags !== undefined && !Array.isArray(input.tags)) {
    errors.push('Notebook tags must be a list of words.');
  }

  return {
    ok: errors.length === 0,
    errors,
    value: {
      title,
      description,
      kind: normalizeNotebookKind(input.kind),
      tags: normalizeNotebookTags(input.tags),
    },
  };
}

export function normalizeNotebookRecord(record) {
  if (!record || typeof record !== 'object') return null;
  if (typeof record.id !== 'string' || !record.id.trim()) return null;

  const validation = validateNotebookInput({
    title: record.title,
    description: record.description,
    kind: record.kind,
    tags: record.tags,
  });
  if (!validation.ok) return null;

  const createdAt =
    typeof record.createdAt === 'string' && record.createdAt
      ? record.createdAt
      : null;
  const updatedAt =
    typeof record.updatedAt === 'string' && record.updatedAt
      ? record.updatedAt
      : createdAt;

  if (!createdAt) return null;

  return {
    id: record.id.trim(),
    title: validation.value.title,
    description: validation.value.description,
    kind: validation.value.kind,
    tags: validation.value.tags,
    archivedAt:
      typeof record.archivedAt === 'string' && record.archivedAt
        ? record.archivedAt
        : null,
    createdAt,
    updatedAt,
  };
}

/**
 * Migrate a stored notebook payload to the current schema.
 *
 * A v1 payload has no organisation fields. Those are added with safe
 * defaults — a subject, no tags, not archived — so nothing a learner wrote
 * is lost and nothing about their existing notebooks changes.
 *
 * A payload from a *newer* version than this build understands is left
 * alone for the caller to handle, because guessing at a future shape would
 * be worse than refusing to read it.
 */
export function migrateNotebookPayload(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;

  const version = Number(parsed.schemaVersion);

  if (!Number.isFinite(version) || version < 1) return null;
  if (version > NOTEBOOK_SCHEMA_VERSION) return null;

  if (version === NOTEBOOK_SCHEMA_VERSION) return parsed;

  return {
    ...parsed,
    schemaVersion: NOTEBOOK_SCHEMA_VERSION,
    notebooks: (Array.isArray(parsed.notebooks) ? parsed.notebooks : []).map(
      (notebook) => ({
        ...notebook,
        kind: normalizeNotebookKind(notebook?.kind),
        tags: normalizeNotebookTags(notebook?.tags),
        archivedAt:
          typeof notebook?.archivedAt === 'string' && notebook.archivedAt
            ? notebook.archivedAt
            : null,
      })
    ),
  };
}

/**
 * Migrate a notebook-scoped collection payload — sources, chat history and
 * study materials.
 *
 * The item shape did not change between v1 and v2, so this only stamps the
 * current version. It has to exist at all: these collections are versioned
 * by the same constant as the notebook metadata, so without a migration path
 * a schema bump would silently drop every learner's sources and chat
 * history on the very first read.
 */
export function migrateCollectionPayload(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;

  const version = Number(parsed.schemaVersion);

  if (!Number.isFinite(version) || version < 1) return null;
  if (version > NOTEBOOK_SCHEMA_VERSION) return null;
  if (version === NOTEBOOK_SCHEMA_VERSION) return parsed;

  return { ...parsed, schemaVersion: NOTEBOOK_SCHEMA_VERSION };
}
