// Local lexical retrieval over notebook sources.
//
// This is deliberately a transparent BM25 search, not an AI model. Results are
// exact source spans with offsets. The citation verifier runs before a result is
// returned so the UI cannot display a mismatched quotation.

import { CITATION_LOCATOR_KINDS, validateCitation } from './citations.mjs';
import { getContent } from './sourceAccess.mjs';
import { SOURCE_STATUSES } from './sourceSchema.mjs';
import {
  MAX_QUERY_TERMS,
  chunkSourceText,
  findPageNumber,
  getContentText,
  getPageOffsets,
  normalizeSearchQuery,
  tokenize,
} from './sourceText.mjs';

export const MAX_SEARCH_RESULTS = 12;
const BM25_K1 = 1.2;
const BM25_B = 0.75;

// Split a source into page-bounded sections before chunking.
//
// A chunk that crossed a page boundary could only carry one page number, so a
// passage on the second page of the chunk would be cited to the first. Search
// results therefore never span pages: each chunk belongs to exactly one page.
// The gaps between extracted pages (usually the "\n\n" separator) stay in the
// preceding section and are trimmed by the chunker.
function buildPageSections(content, text) {
  const pageOffsets = getPageOffsets(content)
    .filter(
      (page) =>
        page &&
        Number.isInteger(page.start) &&
        Number.isInteger(page.end) &&
        page.start < page.end
    )
    .slice()
    .sort((left, right) => left.start - right.start);

  if (pageOffsets.length === 0) {
    return [{ start: 0, end: text.length, page: null }];
  }

  const sections = [];
  pageOffsets.forEach((page, index) => {
    const start = Math.max(0, Math.min(page.start, text.length));
    const next = pageOffsets[index + 1];
    const end = next
      ? Math.max(start, Math.min(next.start, text.length))
      : text.length;

    if (end > start) {
      sections.push({ start, end, page: page.page ?? null });
    }
  });

  // Text before the first recorded page range is still searchable, but it has
  // no page number to claim.
  const firstStart = Math.max(0, Math.min(pageOffsets[0].start, text.length));
  if (firstStart > 0) {
    sections.unshift({ start: 0, end: firstStart, page: null });
  }

  return sections;
}

export function buildNotebookChunks(sources, sourceContents) {
  const chunks = [];

  (Array.isArray(sources) ? sources : []).forEach((source) => {
    if (!source || source.status !== SOURCE_STATUSES.READY || !source.hasExtractedText) return;
    const content = getContent(sourceContents, source.id);
    const text = getContentText(content);
    if (!text.trim()) return;

    buildPageSections(content, text).forEach((section) => {
      const sectionText = text.slice(section.start, section.end);
      if (!sectionText.trim()) return;

      chunkSourceText(sectionText, { sourceId: source.id }).forEach((chunk) => {
        const start = section.start + chunk.start;
        const end = section.start + chunk.end;
        chunks.push({
          ...chunk,
          id: `${source.id}:${start}-${end}`,
          start,
          end,
          sourceTitle: source.title,
          content,
          page: findPageNumber(content, start) ?? section.page,
        });
      });
    });
  });

  return chunks;
}

export function searchNotebookSources({
  sources = [],
  sourceContents = {},
  query = '',
  limit = MAX_SEARCH_RESULTS,
  sourceId = null,
} = {}) {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) {
    return {
      ok: false,
      query: '',
      results: [],
      errors: ['Enter a word or phrase to search your sources.'],
    };
  }

  const queryTerms = [...new Set(tokenize(normalizedQuery))].slice(
    0,
    MAX_QUERY_TERMS
  );
  if (queryTerms.length === 0) {
    return {
      ok: false,
      query: normalizedQuery,
      results: [],
      errors: ['That search has no searchable terms. Try a more specific word.'],
    };
  }

  // Searching within one source. The scope is resolved before the search
  // runs, so a request for a source that is not in this notebook fails
  // honestly instead of quietly searching everything.
  const allSources = Array.isArray(sources) ? sources : [];
  let scopedSources = allSources;

  if (typeof sourceId === 'string' && sourceId.trim()) {
    const wanted = sourceId.trim();
    const match = allSources.find((source) => source?.id === wanted);
    if (!match) {
      return {
        ok: false,
        query: normalizedQuery,
        results: [],
        errors: ['That source is not in this notebook.'],
      };
    }
    scopedSources = [match];
  }

  const chunks = buildNotebookChunks(scopedSources, sourceContents);
  if (chunks.length === 0) {
    return {
      ok: false,
      query: normalizedQuery,
      results: [],
      errors: [
        typeof sourceId === 'string' && sourceId.trim()
          ? 'That source has no extracted text to search yet.'
          : 'Add a ready source with extracted text before searching.',
      ],
    };
  }

  const documents = chunks.map((chunk) => {
    const tokens = tokenize(chunk.text);
    return {
      ...chunk,
      tokens,
      frequencies: tokens.reduce((frequencies, term) => {
        frequencies.set(term, (frequencies.get(term) || 0) + 1);
        return frequencies;
      }, new Map()),
    };
  });

  const documentFrequency = new Map();
  queryTerms.forEach((term) => {
    const count = documents.reduce(
      (total, document) => total + (document.frequencies.has(term) ? 1 : 0),
      0
    );
    documentFrequency.set(term, count);
  });

  const totalDocuments = documents.length;
  const averageLength =
    documents.reduce((total, document) => total + document.tokens.length, 0) /
    Math.max(totalDocuments, 1);
  const idfByTerm = new Map(
    queryTerms.map((term) => {
      const frequency = documentFrequency.get(term) || 0;
      return [term, Math.log(1 + (totalDocuments - frequency + 0.5) / (frequency + 0.5))];
    })
  );

  const sourceIds = scopedSources.map((source) => source.id);
  const sourceTexts = {};
  scopedSources.forEach((source) => {
    const content = getContent(sourceContents, source.id);
    const text = getContentText(content);
    if (text) sourceTexts[source.id] = text;
  });

  const lowerQuery = normalizedQuery.toLowerCase();
  const results = [];

  documents.forEach((document) => {
    let score = 0;
    const matchedTerms = [];

    queryTerms.forEach((term) => {
      const frequency = document.frequencies.get(term) || 0;
      if (frequency === 0) return;
      matchedTerms.push(term);
      const documentLength = document.tokens.length || 1;
      const denominator =
        frequency +
        BM25_K1 *
          (1 - BM25_B + BM25_B * (documentLength / Math.max(averageLength, 1)));
      score += (idfByTerm.get(term) || 0) * ((frequency * (BM25_K1 + 1)) / denominator);
    });

    if (matchedTerms.length === 0) return;

    if (document.text.toLowerCase().includes(lowerQuery)) {
      score += 2.5;
    }

    const citation = {
      sourceId: document.sourceId,
      quote: document.text,
      locator: {
        kind: CITATION_LOCATOR_KINDS.OFFSET,
        start: document.start,
        end: document.end,
      },
    };
    const verification = validateCitation(citation, {
      sourceIds,
      sourceTexts,
      requireSourceText: true,
    });
    if (!verification.ok) return;

    results.push({
      id: document.id,
      sourceId: document.sourceId,
      sourceTitle: document.sourceTitle,
      text: document.text,
      page: document.page,
      score: Number(score.toFixed(4)),
      matchedTerms,
      citation: verification.citation,
    });
  });

  results.sort(
    (left, right) =>
      right.score - left.score ||
      left.sourceTitle.localeCompare(right.sourceTitle) ||
      left.citation.locator.start - right.citation.locator.start
  );

  const requestedLimit = limit === null || limit === undefined ? NaN : Number(limit);
  const resultLimit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.floor(requestedLimit), 0), MAX_SEARCH_RESULTS)
    : MAX_SEARCH_RESULTS;

  return {
    ok: true,
    query: normalizedQuery,
    results: results.slice(0, resultLimit),
    errors: [],
  };
}

export function formatSearchResultLocation(result) {
  if (!result) return 'Source';
  if (Number.isInteger(result.page)) {
    return `${result.sourceTitle}, page ${result.page}`;
  }
  const start = result.citation?.locator?.start;
  const end = result.citation?.locator?.end;
  if (Number.isInteger(start) && Number.isInteger(end)) {
    return `${result.sourceTitle}, characters ${start}-${end}`;
  }
  return result.sourceTitle || 'Source';
}

/**
 * Build the text around a matched passage so a reader can see it in context.
 *
 * The context is the real source text, sliced at the source's own
 * boundaries. The match is marked separately so the UI can highlight it
 * without the marker becoming part of the quoted text.
 */
export function buildPassageContext(
  sourceContents,
  sourceId,
  start,
  end,
  { contextChars = 400 } = {}
) {
  const content = getContent(sourceContents, sourceId);
  const text = getContentText(content);
  if (!text) return null;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 0 || end > text.length || end <= start) return null;

  const window = Math.max(0, Math.floor(contextChars));
  const before = text.slice(Math.max(0, start - window), start);
  const match = text.slice(start, end);
  const after = text.slice(end, Math.min(text.length, end + window));

  return {
    before,
    match,
    after,
    start,
    end,
    // The page the passage sits on, and the page the window begins on, so a
    // reader can tell when a passage straddles a page break.
    page: findPageNumber(content, start),
    contextPage: findPageNumber(content, Math.max(0, start - window)),
    totalPages: getPageOffsets(content).length,
  };
}
