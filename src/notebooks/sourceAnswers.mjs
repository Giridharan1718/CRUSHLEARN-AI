// Local extractive question answering over notebook sources.
//
// This is intentionally not an AI model. It retrieves exact source spans, picks
// the sentence with the strongest query overlap, and returns that quotation with
// a verified citation. The UI must label the result as an extractive source
// answer, not as a generated explanation.

import { CITATION_LOCATOR_KINDS, validateCitation } from './citations.mjs';
import { searchNotebookSources } from './sourceRetrieval.mjs';
import { getContent, sourceTextMap } from './sourceAccess.mjs';
import { GENERATORS } from './generators.mjs';
import {
  findPageNumber,
  getContentText,
  splitTextIntoSentences,
  tokenize,
} from './sourceText.mjs';

export const EXTRACTIVE_ANSWER_GENERATOR = GENERATORS.LOCAL_EXTRACTIVE;

function sentenceCandidates(results, sourceContents, queryTerms) {
  const candidates = [];

  results.forEach((result) => {
    const content = getContent(sourceContents, result.sourceId);
    const chunkStart = result.citation?.locator?.start;
    if (!Number.isInteger(chunkStart)) return;

    const sentences = splitTextIntoSentences(result.text);
    if (sentences.length === 0) {
      candidates.push({
        result,
        text: result.text,
        start: chunkStart,
        end: chunkStart + result.text.length,
        overlap: 0,
        page: findPageNumber(content, chunkStart),
      });
      return;
    }

    sentences.forEach((sentence) => {
      const start = chunkStart + sentence.start;
      const overlap = tokenize(sentence.text).filter((term) =>
        queryTerms.has(term)
      ).length;
      candidates.push({
        result,
        text: sentence.text,
        start,
        end: start + sentence.text.length,
        overlap,
        page: findPageNumber(content, start),
      });
    });
  });

  return candidates.sort(
    (left, right) =>
      right.overlap - left.overlap ||
      right.result.score - left.result.score ||
      left.start - right.start
  );
}

/**
 * Answer a question with the most relevant exact sentence from ready sources.
 * Returns `answered: false` when no source passage matches; it never fills the
 * gap with general knowledge.
 */
export function answerFromNotebookSources({
  sources = [],
  sourceContents = {},
  question = '',
  limit = 6,
} = {}) {
  const search = searchNotebookSources({
    sources,
    sourceContents,
    query: question,
    limit,
  });

  if (!search.ok) {
    return {
      ok: false,
      answered: false,
      question: search.query || '',
      answer: null,
      citation: null,
      errors: search.errors,
      results: [],
    };
  }

  if (search.results.length === 0) {
    return {
      ok: true,
      answered: false,
      question: search.query,
      answer: null,
      citation: null,
      errors: [],
      results: [],
      message:
        'No source passage matched this question. The sources do not contain enough relevant text to quote.',
    };
  }

  const queryTerms = new Set(tokenize(search.query));
  const candidates = sentenceCandidates(
    search.results,
    sourceContents,
    queryTerms
  );
  const best =
    candidates.find((candidate) => candidate.overlap > 0) || candidates[0];

  if (!best) {
    return {
      ok: true,
      answered: false,
      question: search.query,
      answer: null,
      citation: null,
      errors: [],
      results: search.results,
      message:
        'No readable source sentence was found. The matching source spans are shown below instead.',
    };
  }

  const citation = {
    sourceId: best.result.sourceId,
    quote: best.text,
    locator: {
      kind: CITATION_LOCATOR_KINDS.OFFSET,
      start: best.start,
      end: best.end,
    },
  };
  const verification = validateCitation(citation, {
    sourceIds: sources.map((source) => source.id),
    sourceTexts: sourceTextMap(sources, sourceContents),
    requireSourceText: true,
  });

  if (!verification.ok) {
    return {
      ok: false,
      answered: false,
      question: search.query,
      answer: null,
      citation: null,
      errors: ['The selected source answer could not be verified.'],
      results: search.results,
    };
  }

  return {
    ok: true,
    answered: true,
    question: search.query,
    answer: verification.citation.quote,
    citation: verification.citation,
    sourceId: best.result.sourceId,
    sourceTitle: best.result.sourceTitle,
    page: best.page,
    matchedTerms: best.result.matchedTerms,
    supportCount: search.results.length,
    generator: EXTRACTIVE_ANSWER_GENERATOR,
    note: 'Direct quotation from a matching source span. This is an extractive answer, not an AI-generated explanation.',
    results: search.results,
  };
}
