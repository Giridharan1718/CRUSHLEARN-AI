// One definition of "which sources can I use" and "what text do they have".
//
// This module existed five times over — `sourceTextMap` in five files,
// `readySources` in two, `getContent` in three — and the copies were not
// equivalent. Only one of the five filtered to ready sources; the other four
// could map text for a source that had failed extraction and therefore had
// none. Consolidating them here removes that class of drift.

import { getContentText } from './sourceText.mjs';
import { SOURCE_STATUSES } from './sourceSchema.mjs';

/**
 * The sources whose text can be trusted: extraction finished and there is
 * text to quote.
 */
export function readySources(sources = []) {
  if (!Array.isArray(sources)) return [];
  return sources.filter(
    (source) =>
      source &&
      source.status === SOURCE_STATUSES.READY &&
      Boolean(source.hasExtractedText)
  );
}

/**
 * The stored content record of one source, or null.
 *
 * The record holds the text and the page offsets.
 */
export function getContent(sourceContents = {}, sourceId) {
  if (!sourceContents || typeof sourceContents !== 'object') return null;
  return sourceContents[sourceId] || null;
}

/**
 * The text of one source, or null when it has none.
 */
export function getSourceText(sourceContents = {}, sourceId) {
  const text = getContentText(getContent(sourceContents, sourceId));
  return text || null;
}

export const SOURCE_PREVIEW_CHARS = 400;

/**
 * The opening portion of a stored source.
 *
 * The preview is a direct slice of the stored string, never a normalised or
 * reflowed copy, so a reader can trust that it matches the source at the same
 * offsets. `hasMore` tells the UI whether a "view full text" control is
 * warranted.
 */
export function getSourcePreview(
  sourceContents = {},
  sourceId,
  maxChars = SOURCE_PREVIEW_CHARS
) {
  const content = getContent(sourceContents, sourceId);
  const text = typeof content?.text === 'string' ? content.text : null;

  if (text === null) {
    return {
      available: false,
      text: '',
      hasMore: false,
      totalChars: 0,
    };
  }

  const limit = Number.isFinite(Number(maxChars))
    ? Math.min(Math.max(0, Math.floor(Number(maxChars))), text.length)
    : SOURCE_PREVIEW_CHARS;

  return {
    available: true,
    text: text.slice(0, limit),
    hasMore: text.length > limit,
    totalChars: text.length,
  };
}


/**
 * A map of source id to source text, for the ready sources only.
 *
 * A source that is not ready contributes nothing, so a caller can never
 * accidentally quote a failed source.
 */
export function sourceTextMap(sources = [], sourceContents = {}) {
  const map = Object.create(null);
  readySources(sources).forEach((source) => {
    const text = getSourceText(sourceContents, source.id);
    if (text) map[source.id] = text;
  });
  return map;
}

/**
 * The ids of the ready sources.
 */
export function readySourceIds(sources = []) {
  return readySources(sources).map((source) => source.id);
}

/**
 * Narrow a list of sources to one id, keeping the original order.
 *
 * Returns an empty list when the id is not present, so a caller searching
 * inside a source that does not exist gets no results rather than the whole
 * notebook.
 */
export function selectSource(sources = [], sourceId) {
  if (!sourceId) return [];
  return sources.filter((source) => source && source.id === sourceId);
}
