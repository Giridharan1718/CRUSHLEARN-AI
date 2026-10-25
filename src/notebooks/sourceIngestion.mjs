// Reusable source-ingestion pipeline.
//
// This module owns validation and the local text-extraction step. It does not
// write to storage; the notebook repository decides where accepted records and
// extracted text are persisted. PDF and DOCX parsers receive bytes only. Text is
// treated as data and is never evaluated or executed as markup or script.

import {
  MAX_SOURCE_TEXT_CHARS,
  SOURCE_STATUSES,
  SOURCE_TYPES,
  createSourceRecord,
  normalizeExtractedText,
  normalizeSourceTitle,
  sourceTitleFromUrl,
  validateFileInput,
  validatePastedInput,
  validateWebInput,
} from './sourceSchema.mjs';
import {
  extractDocxText,
  extractPdfText,
} from './documentExtraction.mjs';
import { fetchWebPage } from './gatewayClient.mjs';

function failedSource({ notebookId, file, sourceType, error, now }) {
  return createSourceRecord({
    notebookId,
    title: normalizeSourceTitle(file.name, 'Untitled file'),
    sourceType,
    fileName: file.name,
    mimeType: file.type || null,
    sizeBytes: Number.isFinite(Number(file.size)) ? Number(file.size) : null,
    status: SOURCE_STATUSES.FAILED,
    error,
    now,
  });
}

function failedExtraction({ notebookId, file, sourceType, error, now }) {
  return {
    ok: true,
    source: failedSource({
      notebookId,
      file,
      sourceType,
      error,
      now,
    }),
    content: null,
    errors: [],
  };
}

async function extractFileContent({
  sourceType,
  file,
  extractPdf,
  extractDocx,
}) {
  if (sourceType === SOURCE_TYPES.PDF) {
    const extracted = await extractPdf(await file.arrayBuffer());
    return {
      text: normalizeExtractedText(extracted?.text),
      pageOffsets: Array.isArray(extracted?.pageOffsets)
        ? extracted.pageOffsets
        : [],
    };
  }

  if (sourceType === SOURCE_TYPES.DOCX) {
    const extracted = await extractDocx(await file.arrayBuffer());
    return {
      text: normalizeExtractedText(extracted?.text),
      pageOffsets: [],
    };
  }

  try {
    return {
      text: normalizeExtractedText(await file.text()),
      pageOffsets: [],
    };
  } catch {
    throw new Error('The file could not be read. Its contents were not imported.');
  }
}

export async function ingestFileSource({
  notebookId,
  file,
  now = new Date().toISOString(),
  extractPdf = extractPdfText,
  extractDocx = extractDocxText,
}) {
  const validation = validateFileInput(file);
  if (!validation.ok) {
    return {
      ok: false,
      source: null,
      content: null,
      errors: validation.errors,
    };
  }

  const sourceType = validation.sourceType;

  let extracted;
  try {
    extracted = await extractFileContent({
      sourceType,
      file,
      extractPdf,
      extractDocx,
    });
  } catch (error) {
    return failedExtraction({
      notebookId,
      file,
      sourceType,
      error:
        error instanceof Error && error.message
          ? error.message
          : 'The file could not be read. Its contents were not imported.',
      now,
    });
  }

  const { text, pageOffsets } = extracted;

  if (!text) {
    return failedExtraction({
      notebookId,
      file,
      sourceType,
      error: 'No readable text was found in this file.',
      now,
    });
  }

  if (text.length > MAX_SOURCE_TEXT_CHARS) {
    return failedExtraction({
      notebookId,
      file,
      sourceType,
      error: `Extracted text exceeds the ${MAX_SOURCE_TEXT_CHARS.toLocaleString()} character limit.`,
      now,
    });
  }

  const source = createSourceRecord({
    notebookId,
    title: normalizeSourceTitle(file.name, 'Untitled file'),
    sourceType,
    fileName: file.name,
    mimeType: file.type || null,
    sizeBytes: Number(file.size),
    status: SOURCE_STATUSES.READY,
    hasExtractedText: true,
    characterCount: text.length,
    pageCount: pageOffsets.length,
    now,
  });

  return {
    ok: true,
    source,
    content: { sourceId: source.id, text, pageOffsets },
    errors: [],
  };
}

export function ingestPastedSource({
  notebookId,
  title,
  text,
  now = new Date().toISOString(),
}) {
  const validation = validatePastedInput({ title, text });
  if (!validation.ok) {
    return {
      ok: false,
      source: null,
      content: null,
      errors: validation.errors,
    };
  }

  const source = createSourceRecord({
    notebookId,
    title: validation.value.title,
    sourceType: SOURCE_TYPES.PASTED_TEXT,
    status: SOURCE_STATUSES.READY,
    hasExtractedText: true,
    characterCount: validation.value.text.length,
    now,
  });

  return {
    ok: true,
    source,
    content: { sourceId: source.id, text: validation.value.text },
    errors: [],
  };
}

function failedWebSource({ notebookId, url, error, now }) {
  return {
    ok: true,
    source: createSourceRecord({
      notebookId,
      title: sourceTitleFromUrl(url),
      sourceType: SOURCE_TYPES.WEB,
      url,
      retrievedAt: null,
      status: SOURCE_STATUSES.FAILED,
      error,
      now,
    }),
    content: null,
    errors: [],
  };
}

/**
 * Fetch a web page through the server-side gateway and turn the extracted text
 * into a source.
 *
 * A gateway that cannot be reached, a blocked address, a non-readable content
 * type and an empty page all produce a failed source with the real reason. The
 * URL is never retried in the browser, because a browser fetch would leak the
 * learner's network position and is blocked by CORS for most sites.
 */
export async function ingestWebSource({
  notebookId,
  url,
  now = new Date().toISOString(),
  baseUrl = '',
  fetchImpl = null,
  fetchPage = fetchWebPage,
} = {}) {
  const validation = validateWebInput({ url });
  if (!validation.ok) {
    return {
      ok: false,
      source: null,
      content: null,
      errors: validation.errors,
    };
  }

  const requestedUrl = validation.value.url;
  let fetched;
  try {
    fetched = await fetchPage({ url: requestedUrl, baseUrl, fetchImpl });
  } catch (error) {
    return failedWebSource({
      notebookId,
      url: requestedUrl,
      error:
        error instanceof Error && error.message
          ? error.message
          : 'The page could not be fetched, so no source text was imported.',
      now,
    });
  }

  if (!fetched?.ok) {
    return failedWebSource({
      notebookId,
      url: requestedUrl,
      error:
        fetched?.error ||
        fetched?.data?.errors?.[0] ||
        'The page could not be fetched, so no source text was imported.',
      now,
    });
  }

  const data = fetched.data || {};
  const text = normalizeExtractedText(data.text);
  if (!text) {
    return failedWebSource({
      notebookId,
      url: requestedUrl,
      error: 'The page was fetched, but no readable text was found.',
      now,
    });
  }

  if (text.length > MAX_SOURCE_TEXT_CHARS) {
    return failedWebSource({
      notebookId,
      url: requestedUrl,
      error: `The page text exceeds the ${MAX_SOURCE_TEXT_CHARS.toLocaleString()} character limit.`,
      now,
    });
  }

  const finalValidation = validateWebInput({ url: data.final_url || requestedUrl });
  const sourceUrl = finalValidation.ok ? finalValidation.value.url : requestedUrl;
  const title = normalizeSourceTitle(
    typeof data.title === 'string' ? data.title : '',
    sourceTitleFromUrl(sourceUrl)
  );
  const retrievedAt =
    typeof data.fetched_at === 'string' && !Number.isNaN(Date.parse(data.fetched_at))
      ? data.fetched_at
      : now;

  const source = createSourceRecord({
    notebookId,
    title,
    sourceType: SOURCE_TYPES.WEB,
    url: sourceUrl,
    retrievedAt,
    mimeType:
      typeof data.content_type === 'string' && data.content_type.trim()
        ? data.content_type.trim()
        : null,
    sizeBytes: Number.isFinite(Number(data.bytes_read))
      ? Math.max(0, Math.floor(Number(data.bytes_read)))
      : null,
    status: SOURCE_STATUSES.READY,
    hasExtractedText: true,
    characterCount: text.length,
    pageCount: 0,
    now,
  });

  return {
    ok: true,
    source,
    content: { sourceId: source.id, text, pageOffsets: [] },
    errors: [],
    truncated: data.truncated === true,
  };
}
