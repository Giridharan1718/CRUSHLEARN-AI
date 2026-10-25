// Citation contract for future source-grounded chat.
//
// This module does not generate answers or retrieve passages. It defines the
// shape a citation must have and verifies a quoted span against the stored
// source text when that text is available. A retrieval/chat layer must call
// this validator before displaying or saving assistant citations.

export const MAX_CITATION_QUOTE_LENGTH = 1000;

export const CITATION_LOCATOR_KINDS = Object.freeze({
  OFFSET: 'offset',
  PAGE: 'page',
});

export function normalizeCitation(citation) {
  if (!citation || typeof citation !== 'object') return null;

  const sourceId =
    typeof citation.sourceId === 'string' ? citation.sourceId.trim() : '';
  const quote = typeof citation.quote === 'string' ? citation.quote : '';
  if (!sourceId || !quote.trim()) return null;
  if (quote.length > MAX_CITATION_QUOTE_LENGTH) return null;

  const locator = citation.locator;
  if (!locator || typeof locator !== 'object') return null;

  if (locator.kind === CITATION_LOCATOR_KINDS.OFFSET) {
    const start = Number(locator.start);
    const end = Number(locator.end);
    if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
    if (start < 0 || end <= start) return null;
    return {
      sourceId,
      quote,
      locator: { kind: CITATION_LOCATOR_KINDS.OFFSET, start, end },
    };
  }

  if (locator.kind === CITATION_LOCATOR_KINDS.PAGE) {
    const page = Number(locator.page);
    if (!Number.isInteger(page) || page < 1) return null;
    return { sourceId, quote, locator: { kind: 'page', page } };
  }

  return null;
}

/**
 * Validates a citation against the stored source text.
 *
 * `ok` and `verified` mean different things, and the difference matters:
 *
 * - `ok` — the citation is well-formed and nothing disqualifying was found.
 * - `verified` — the quoted passage was actually compared against the stored
 *   source text at the cited offsets and matched.
 *
 * A citation can be `ok` without being `verified` when the source text was
 * not available to check it against, or when the locator is a page number
 * rather than a span of text. A page locator names a location; it does not
 * prove what the text there says.
 *
 * When `requireSourceText` is set, the caller is asking for evidence, and
 * `ok` then requires `verified`. A citation that was never checked is not
 * evidence, and a caller that reads only `ok` would otherwise treat it as
 * though it had been.
 */
export function validateCitation(
  citation,
  { sourceIds = null, sourceTexts = {}, requireSourceText = false } = {}
) {
  const errors = [];
  const normalized = normalizeCitation(citation);

  if (!normalized) {
    return {
      ok: false,
      verified: false,
      citation: null,
      errors: [
        'A citation needs a source id, a non-empty quote, and a valid page or offset locator.',
      ],
    };
  }

  if (Array.isArray(sourceIds) && !sourceIds.includes(normalized.sourceId)) {
    errors.push('The citation points to a source outside this notebook.');
  }

  const sourceText = sourceTexts[normalized.sourceId];
  const hasSourceText = typeof sourceText === 'string';
  let verified = false;
  let unverifiedReason = null;

  if (normalized.locator.kind === CITATION_LOCATOR_KINDS.OFFSET) {
    const { start, end } = normalized.locator;
    if (end - start !== normalized.quote.length) {
      errors.push('The citation offsets do not match the quoted passage length.');
    }

    if (hasSourceText) {
      if (end > sourceText.length) {
        errors.push('The citation offsets are outside the source text.');
      } else if (sourceText.slice(start, end) !== normalized.quote) {
        errors.push('The quoted passage does not match the source at those offsets.');
      } else {
        verified = true;
      }
    } else {
      unverifiedReason =
        'The source text is unavailable, so this citation cannot be verified.';
    }
  } else {
    unverifiedReason =
      'A page locator names a page, not a passage, so the quote could not be checked against the source text. Cite an exact passage with character offsets instead.';
  }

  if (requireSourceText && !verified && errors.length === 0) {
    errors.push(
      unverifiedReason ||
        'The citation could not be verified against the source text.'
    );
  }

  return {
    ok: errors.length === 0,
    verified,
    citation: normalized,
    errors,
  };
}

export function validateMessageCitations(
  message,
  { sources = [], sourceTexts = {}, requireSourceText = false } = {}
) {
  const citations = Array.isArray(message?.citations) ? message.citations : [];
  const sourceIds = sources.map((source) => source.id);
  const errors = [];

  citations.forEach((citation, index) => {
    const result = validateCitation(citation, {
      sourceIds,
      sourceTexts,
      requireSourceText,
    });
    result.errors.forEach((error) => {
      errors.push(`Citation ${index + 1}: ${error}`);
    });
  });

  return { ok: errors.length === 0, errors };
}

export function formatCitationLabel(citation, source = null) {
  if (!citation) return 'Citation';
  const title =
    source && typeof source.title === 'string' && source.title.trim()
      ? source.title.trim()
      : 'Source';
  if (citation.locator?.kind === CITATION_LOCATOR_KINDS.PAGE) {
    return `${title}, page ${citation.locator.page}`;
  }
  if (citation.locator?.kind === CITATION_LOCATOR_KINDS.OFFSET) {
    return `${title}, characters ${citation.locator.start}-${citation.locator.end}`;
  }
  return title;
}
