// Deterministic concept extraction for the notebook context panel.
//
// A "concept" here is a recurring significant word in the stored source text,
// not a model-generated topic. Every concept keeps a verified first quotation
// so the learner can inspect why it was surfaced. No embeddings, no language
// model and no outside vocabulary are involved.

import { validateCitation } from './citations.mjs';
import { getContent, readySources, sourceTextMap } from './sourceAccess.mjs';
import {
  getContentText,
  splitTextIntoSentences,
  tokenize,
} from './sourceText.mjs';

export const MAX_CONTEXT_CONCEPTS = 8;
export const CONCEPT_MIN_LENGTH = 3;

const LOW_SIGNAL_TERMS = new Set([
  'abstract',
  'although',
  'article',
  'chapter',
  'could',
  'discuss',
  'document',
  'example',
  'figure',
  'however',
  'introduction',
  'might',
  'paper',
  'paragraph',
  'section',
  'source',
  'study',
  'table',
  'their',
  'there',
  'these',
  'those',
  'through',
  'using',
  'which',
  'while',
  'would',
]);

function firstQuotation(text, content, sourceId, term, sourceIds, sourceTexts) {
  const sentences = splitTextIntoSentences(text);
  const match = sentences.find((sentence) =>
    tokenize(sentence.text).includes(term)
  );
  if (!match) return null;

  const citation = {
    sourceId,
    quote: match.text,
    locator: {
      kind: 'offset',
      start: match.start,
      end: match.end,
    },
  };
  const verification = validateCitation(citation, {
    sourceIds,
    sourceTexts,
    requireSourceText: true,
  });

  if (!verification.ok || !verification.verified) return null;
  return {
    citation: verification.citation,
    page:
      Array.isArray(content?.pageOffsets) &&
      content.pageOffsets.find(
        (offset) =>
          verification.citation.locator.start >= offset.start &&
          verification.citation.locator.start < offset.end
      )?.page || null,
  };
}

/**
 * Extract recurring terms across the ready source text.
 *
 * The ranking is frequency x source spread, so a term used many times in one
 * source does not automatically outrank a term that appears across sources.
 * A concept without a verifiable first quotation is still listed by term, with
 * `citation: null`, so the UI can say that its evidence could not be shown.
 */
export function extractSourceConcepts({
  sources = [],
  sourceContents = {},
  limit = MAX_CONTEXT_CONCEPTS,
} = {}) {
  const ready = readySources(sources);
  const sourceIds = ready.map((source) => source.id);
  const sourceTexts = sourceTextMap(ready, sourceContents);
  const byTerm = new Map();

  ready.forEach((source) => {
    const content = getContent(sourceContents, source.id);
    const text = getContentText(content);
    if (!text) return;

    const counts = new Map();
    tokenize(text).forEach((term) => {
      if (term.length < CONCEPT_MIN_LENGTH || LOW_SIGNAL_TERMS.has(term)) return;
      counts.set(term, (counts.get(term) || 0) + 1);
    });

    counts.forEach((count, term) => {
      const existing = byTerm.get(term) || {
        term,
        count: 0,
        sourceIds: [],
        quotations: [],
      };
      existing.count += count;
      existing.sourceIds.push(source.id);
      const quote = firstQuotation(
        text,
        content,
        source.id,
        term,
        sourceIds,
        sourceTexts
      );
      if (quote) {
        existing.quotations.push({
          sourceId: source.id,
          sourceTitle: source.title,
          citation: quote.citation,
          page: quote.page,
        });
      }
      byTerm.set(term, existing);
    });
  });

  const wanted = Number.isFinite(Number(limit))
    ? Math.max(1, Math.min(Math.floor(Number(limit)), MAX_CONTEXT_CONCEPTS))
    : MAX_CONTEXT_CONCEPTS;

  return [...byTerm.values()]
    .sort(
      (left, right) =>
        right.sourceIds.length - left.sourceIds.length ||
        right.count - left.count ||
        left.term.localeCompare(right.term)
    )
    .slice(0, wanted)
    .map((concept, index) => ({
      id: `concept-${index + 1}-${concept.term}`,
      term: concept.term,
      count: concept.count,
      sourceCount: concept.sourceIds.length,
      sourceIds: concept.sourceIds,
      firstEvidence: concept.quotations[0] || null,
      label: 'Rule-based key term',
    }));
}

/**
 * Terms from a question that occur in the supplied sources, and terms that do
 * not. Used by the research planner to state a real coverage gap.
 */
export function topicTermCoverage(
  topic,
  { sources = [], sourceContents = {} } = {}
) {
  const terms = [...new Set(tokenize(topic))].slice(0, 10);
  const ready = readySources(sources);
  const sourceTexts = sourceTextMap(ready, sourceContents);
  const allText = Object.values(sourceTexts).join('\n').toLowerCase();

  return {
    terms,
    covered: terms.filter((term) => allText.includes(term)),
    missing: terms.filter((term) => !allText.includes(term)),
  };
}
