// Source metadata, validation and normalization.
//
// Uploaded files are never executed. Text formats are read with File.text().
// PDF and DOCX files are parsed as data by browser-side extractors and are
// never evaluated as markup or script. Web pages are fetched by the Rust
// gateway, never by a browser-side fetch, and arrive here as extracted text
// together with the URL and retrieval time that produced it.

import { createRecordId } from './notebookSchema.mjs';

export const SOURCE_SCHEMA_VERSION = 1;
export const MAX_SOURCES_PER_NOTEBOOK = 100;
export const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
export const MAX_SOURCE_TEXT_CHARS = 500_000;
export const MAX_SOURCE_PAGES = 500;
export const SOURCE_TITLE_MAX_LENGTH = 120;
export const SOURCE_URL_MAX_LENGTH = 2048;

export const SOURCE_TYPES = Object.freeze({
  TEXT: 'text',
  MARKDOWN: 'markdown',
  PDF: 'pdf',
  DOCX: 'docx',
  PASTED_TEXT: 'pasted_text',
  WEB: 'web',
});

export const SOURCE_STATUSES = Object.freeze({
  QUEUED: 'queued',
  PROCESSING: 'processing',
  READY: 'ready',
  FAILED: 'failed',
});

export const SUPPORTED_FILE_EXTENSIONS = Object.freeze({
  '.txt': SOURCE_TYPES.TEXT,
  '.md': SOURCE_TYPES.MARKDOWN,
  '.markdown': SOURCE_TYPES.MARKDOWN,
  '.pdf': SOURCE_TYPES.PDF,
  '.docx': SOURCE_TYPES.DOCX,
});

export const UNSUPPORTED_EXTENSIONS = Object.freeze({
  '.doc': 'Legacy .doc files are not supported. Save the document as .docx, .txt or Markdown first.',
});

const SOURCE_STATUS_VALUES = new Set(Object.values(SOURCE_STATUSES));
const SOURCE_TYPE_VALUES = new Set(Object.values(SOURCE_TYPES));

export function getFileExtension(fileName) {
  if (typeof fileName !== 'string') return '';
  const trimmed = fileName.trim().toLowerCase();
  const dot = trimmed.lastIndexOf('.');
  return dot >= 0 ? trimmed.slice(dot) : '';
}

export function detectSourceType(fileName) {
  return SUPPORTED_FILE_EXTENSIONS[getFileExtension(fileName)] || null;
}

export function validateFileInput(file) {
  const errors = [];
  if (!file || typeof file !== 'object') {
    return { ok: false, errors: ['Choose a file to upload.'], sourceType: null };
  }

  const name = typeof file.name === 'string' ? file.name.trim() : '';
  if (!name) errors.push('The selected file has no filename.');

  const extension = getFileExtension(name);
  const sourceType = SUPPORTED_FILE_EXTENSIONS[extension] || null;
  if (!sourceType) {
    errors.push(
      UNSUPPORTED_EXTENSIONS[extension] ||
        'Unsupported file type. Use .txt, .md, .markdown, .pdf, or .docx.'
    );
  }

  const size = Number(file.size);
  if (!Number.isFinite(size) || size < 0) {
    errors.push('The selected file has an invalid size.');
  } else if (size === 0) {
    errors.push('The selected file is empty.');
  } else if (size > MAX_SOURCE_BYTES) {
    errors.push(
      `Files must be ${Math.floor(MAX_SOURCE_BYTES / (1024 * 1024))} MB or smaller.`
    );
  }

  if (sourceType) {
    const needsArrayBuffer =
      sourceType === SOURCE_TYPES.PDF || sourceType === SOURCE_TYPES.DOCX;
    const reader = needsArrayBuffer ? file.arrayBuffer : file.text;
    if (typeof reader !== 'function') {
      errors.push(
        needsArrayBuffer
          ? 'This browser cannot read the selected document.'
          : 'This browser cannot read the selected text file.'
      );
    }
  }

  return { ok: errors.length === 0, errors, sourceType };
}

export function validatePastedInput(input = {}) {
  const errors = [];
  const title =
    typeof input.title === 'string' && input.title.trim()
      ? input.title.trim()
      : 'Pasted text';
  const rawText = typeof input.text === 'string' ? input.text : '';
  const text = normalizeExtractedText(rawText);

  if (typeof input.text !== 'string' || !text) {
    errors.push('Paste some text before adding the source.');
  } else if (text.length > MAX_SOURCE_TEXT_CHARS) {
    errors.push(
      `Pasted text must be ${MAX_SOURCE_TEXT_CHARS.toLocaleString()} characters or fewer.`
    );
  }

  if (title.length > SOURCE_TITLE_MAX_LENGTH) {
    errors.push(
      `Source title must be ${SOURCE_TITLE_MAX_LENGTH} characters or fewer.`
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    value: { title, text },
  };
}

/**
 * Validate a learner-supplied web URL before sending it to the gateway.
 *
 * The gateway repeats every check and also applies DNS, private-address,
 * redirect and size limits. This client-side pass exists so an obvious typo is
 * reported immediately without creating a source record.
 */
export function validateWebInput(input = {}) {
  const errors = [];
  const raw = typeof input.url === 'string' ? input.url.trim() : '';

  if (!raw) {
    errors.push('Enter a web page URL before adding the source.');
    return { ok: false, errors, value: { url: '' } };
  }

  if (raw.length > SOURCE_URL_MAX_LENGTH) {
    errors.push(
      `Web addresses must be ${SOURCE_URL_MAX_LENGTH.toLocaleString()} characters or fewer.`
    );
    return { ok: false, errors, value: { url: raw } };
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    errors.push('Enter a complete http:// or https:// web address.');
    return { ok: false, errors, value: { url: raw } };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    errors.push('Only http:// and https:// web addresses can be fetched.');
  }
  if (parsed.username || parsed.password) {
    errors.push('Web addresses with a username or password are not accepted.');
  }
  if (!parsed.hostname) {
    errors.push('The web address does not name a host.');
  }

  return {
    ok: errors.length === 0,
    errors,
    value: { url: errors.length === 0 ? parsed.toString() : raw },
  };
}

export function sourceTitleFromUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || ''));
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    const title = `${parsed.hostname}${path}`;
    return normalizeSourceTitle(title, 'Web page');
  } catch {
    return 'Web page';
  }
}

export function normalizeExtractedText(text) {
  return String(text ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

export function normalizeSourceTitle(title, fallback = 'Untitled source') {
  const value = typeof title === 'string' ? title.trim() : '';
  const safeValue = value || fallback;
  return safeValue.slice(0, SOURCE_TITLE_MAX_LENGTH);
}

export function normalizeSourceRecord(record) {
  if (!record || typeof record !== 'object') return null;
  if (typeof record.id !== 'string' || !record.id.trim()) return null;
  if (typeof record.notebookId !== 'string' || !record.notebookId.trim()) {
    return null;
  }
  if (!SOURCE_TYPE_VALUES.has(record.sourceType)) return null;
  if (!SOURCE_STATUS_VALUES.has(record.status)) return null;

  const characterCount = Number(record.characterCount);
  const sizeBytes = Number(record.sizeBytes);
  const pageCount = Number(record.pageCount);
  const sourceType = record.sourceType;
  let url =
    typeof record.url === 'string' && record.url.trim()
      ? record.url.trim().slice(0, SOURCE_URL_MAX_LENGTH)
      : null;
  const retrievedAt =
    typeof record.retrievedAt === 'string' &&
    record.retrievedAt &&
    !Number.isNaN(Date.parse(record.retrievedAt))
      ? record.retrievedAt
      : null;

  // A web source without a valid http(s) URL has lost its provenance, or an
  // imported record is trying to smuggle in another scheme. Refuse it rather
  // than display a page as though it had no origin.
  if (sourceType === SOURCE_TYPES.WEB) {
    if (!url) return null;
    const webCheck = validateWebInput({ url });
    if (!webCheck.ok) return null;
    url = webCheck.value.url;
  }

  return {
    id: record.id.trim(),
    notebookId: record.notebookId.trim(),
    title: normalizeSourceTitle(record.title, record.fileName || 'Untitled source'),
    sourceType,
    url,
    retrievedAt,
    fileName:
      typeof record.fileName === 'string' && record.fileName.trim()
        ? record.fileName.trim()
        : null,
    mimeType:
      typeof record.mimeType === 'string' && record.mimeType.trim()
        ? record.mimeType.trim()
        : null,
    sizeBytes:
      Number.isFinite(sizeBytes) && sizeBytes >= 0 ? sizeBytes : null,
    status: record.status,
    error:
      typeof record.error === 'string' && record.error.trim()
        ? record.error.trim()
        : null,
    hasExtractedText: record.hasExtractedText === true,
    characterCount:
      Number.isFinite(characterCount) && characterCount >= 0
        ? Math.floor(characterCount)
        : 0,
    pageCount:
      Number.isFinite(pageCount) && pageCount >= 0
        ? Math.min(Math.floor(pageCount), MAX_SOURCE_PAGES)
        : 0,
    createdAt:
      typeof record.createdAt === 'string' && record.createdAt
        ? record.createdAt
        : null,
    updatedAt:
      typeof record.updatedAt === 'string' && record.updatedAt
        ? record.updatedAt
        : null,
  };
}

export function normalizePageOffsets(value, textLength) {
  if (!Array.isArray(value) || !Number.isInteger(textLength) || textLength <= 0) {
    return [];
  }

  return value
    .slice(0, MAX_SOURCE_PAGES)
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const page = Number(item.page);
      const start = Number(item.start);
      const end = Number(item.end);
      if (!Number.isInteger(page) || page < 1) return null;
      if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
      if (start < 0 || end <= start || end > textLength) return null;
      return { page, start, end };
    })
    .filter(Boolean)
    .sort((left, right) => left.start - right.start || left.page - right.page)
    .filter((item, index, items) => {
      if (index === 0) return true;
      return item.start >= items[index - 1].end;
    });
}

export function normalizeSourceTextRecord(record) {
  if (!record || typeof record !== 'object') return null;
  if (typeof record.sourceId !== 'string' || !record.sourceId.trim()) {
    return null;
  }
  if (typeof record.text !== 'string' || !record.text) return null;
  if (record.text.length > MAX_SOURCE_TEXT_CHARS) return null;

  return {
    sourceId: record.sourceId.trim(),
    text: record.text,
    pageOffsets: normalizePageOffsets(record.pageOffsets, record.text.length),
  };
}

export function createSourceRecord({
  notebookId,
  id,
  title,
  sourceType,
  url = null,
  retrievedAt = null,
  fileName = null,
  mimeType = null,
  sizeBytes = null,
  status,
  error = null,
  hasExtractedText = false,
  characterCount = 0,
  pageCount = 0,
  now = new Date().toISOString(),
}) {
  return normalizeSourceRecord({
    id: id || createRecordId('source'),
    notebookId,
    title,
    sourceType,
    url,
    retrievedAt,
    fileName,
    mimeType,
    sizeBytes,
    status,
    error,
    hasExtractedText,
    characterCount,
    pageCount,
    createdAt: now,
    updatedAt: now,
  });
}
