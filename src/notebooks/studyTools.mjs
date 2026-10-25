// Local extractive study tools.
//
// A study kit is built only from text that already exists in the learner's
// sources. It quotes exact spans and never invents a claim, answer or citation.
// This is intentionally not labelled as AI generation. A future model-backed
// generator can implement the same output contract and add richer explanations.

import { CITATION_LOCATOR_KINDS, validateCitation } from './citations.mjs';
import { getContent } from './sourceAccess.mjs';
import { SOURCE_STATUSES } from './sourceSchema.mjs';
import { GENERATORS } from './generators.mjs';
import {
  findPageNumber,
  getContentText,
  splitTextIntoSentences,
  tokenize,
} from './sourceText.mjs';

export const MAX_SUMMARY_SENTENCES = 8;
export const MAX_FLASHCARDS = 12;
export const MAX_QUIZ_QUESTIONS = 8;

function createCitation(record) {
  return {
    sourceId: record.sourceId,
    quote: record.text,
    locator: {
      kind: CITATION_LOCATOR_KINDS.OFFSET,
      start: record.start,
      end: record.end,
    },
  };
}

function collectSentences(sources, sourceContents) {
  const records = [];
  const sourceIds = sources.map((source) => source.id);
  const sourceTexts = {};

  sources.forEach((source) => {
    const content = getContent(sourceContents, source.id);
    const text = getContentText(content);
    if (text) sourceTexts[source.id] = text;
  });

  (Array.isArray(sources) ? sources : []).forEach((source, sourceIndex) => {
    if (!source || source.status !== SOURCE_STATUSES.READY || !source.hasExtractedText) return;
    const content = getContent(sourceContents, source.id);
    const text = getContentText(content);
    if (!text.trim()) return;

    splitTextIntoSentences(text).forEach((sentence) => {
      const citation = createCitation({
        sourceId: source.id,
        text: sentence.text,
        start: sentence.start,
        end: sentence.end,
      });
      const verification = validateCitation(citation, {
        sourceIds,
        sourceTexts,
        requireSourceText: true,
      });
      if (!verification.ok) return;

      records.push({
        sourceId: source.id,
        sourceTitle: source.title,
        sourceIndex,
        text: sentence.text,
        start: sentence.start,
        end: sentence.end,
        page: findPageNumber(content, sentence.start),
        citation: verification.citation,
      });
    });
  });

  return records;
}

function buildTermStats(records) {
  const documentFrequency = new Map();
  const termFrequency = new Map();
  const sentenceTerms = new Map();

  records.forEach((record) => {
    const terms = tokenize(record.text);
    const uniqueTerms = new Set(terms);
    sentenceTerms.set(record, terms);
    uniqueTerms.forEach((term) => {
      documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    });
    terms.forEach((term) => {
      termFrequency.set(term, (termFrequency.get(term) || 0) + 1);
    });
  });

  const total = records.length || 1;
  const idf = new Map();
  documentFrequency.forEach((frequency, term) => {
    idf.set(term, Math.log(1 + (total - frequency + 0.5) / (frequency + 0.5)));
  });

  return { documentFrequency, termFrequency, sentenceTerms, idf };
}

function scoreSentences(records, termStats) {
  return records
    .map((record) => {
      const terms = termStats.sentenceTerms.get(record) || [];
      const uniqueTerms = [...new Set(terms)];
      const keywordScore = uniqueTerms.reduce((score, term) => {
        const frequency = termStats.termFrequency.get(term) || 0;
        return score + (termStats.idf.get(term) || 0) * (1 + Math.log(frequency + 1));
      }, 0);
      const length = Math.max(terms.length, 1);
      const normalized = keywordScore / Math.sqrt(length);
      return { record, score: normalized };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.record.sourceIndex - right.record.sourceIndex ||
        left.record.start - right.record.start
    );
}

function selectSummarySentences(records, termStats, maxSentences, sourceCount) {
  const limit = Math.max(1, Math.min(Number(maxSentences) || 6, MAX_SUMMARY_SENTENCES));
  const maxPerSource =
    sourceCount > 1
      ? Math.max(1, Math.ceil(limit / Math.min(sourceCount, 3)))
      : limit;
  const selected = [];
  const selectedBySource = new Map();
  const selectedTermSets = [];

  for (const candidate of scoreSentences(records, termStats)) {
    if (selected.length >= limit) break;
    const sourceCountUsed = selectedBySource.get(candidate.record.sourceId) || 0;
    if (sourceCountUsed >= maxPerSource) continue;

    const candidateTerms = new Set(
      termStats.sentenceTerms.get(candidate.record) || []
    );
    const overlapsExisting = selectedTermSets.some((terms) => {
      const smaller = Math.min(candidateTerms.size, terms.size);
      if (smaller === 0) return false;
      let overlap = 0;
      candidateTerms.forEach((term) => {
        if (terms.has(term)) overlap += 1;
      });
      return overlap / smaller > 0.72;
    });
    if (overlapsExisting) continue;

    selected.push(candidate.record);
    selectedTermSets.push(candidateTerms);
    selectedBySource.set(
      candidate.record.sourceId,
      (selectedBySource.get(candidate.record.sourceId) || 0) + 1
    );
  }

  return selected.sort(
    (left, right) =>
      left.sourceIndex - right.sourceIndex || left.start - right.start
  );
}

function dedupeCitations(citations) {
  const seen = new Set();
  return citations.filter((citation) => {
    const key = `${citation.sourceId}:${citation.locator.start}:${citation.locator.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanTerm(value) {
  const term = String(value ?? '')
    .replace(/^[*_`]+|[*_`]+$/g, '')
    .replace(/^(?:the|a|an)\s+/i, '')
    .replace(/[.,;:!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!term || term.length < 2 || term.length > 60) return null;
  if (term.split(/\s+/).length > 6) return null;
  if (/^(?:it|this|that|these|those|there|they|he|she|we|i|you|which|who)$/i.test(term)) {
    return null;
  }
  if (!/\p{L}/u.test(term)) return null;
  return term;
}

function matchDefinition(text) {
  const patterns = [
    /^(.{2,70}?)\s+(?:is|are|means|refers to|describes|represents|is defined as|are defined as)\s+(.{20,})$/i,
    /^([^:]{2,60}):\s+(.{20,})$/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const term = match ? cleanTerm(match[1]) : null;
    if (term) return term;
  }
  return null;
}

function pickKeyTerm(text, termStats) {
  const terms = termStats.sentenceTerms.get(text) || [];
  const candidates = [...new Set(terms)].filter(
    (term) => term.length >= 4 && !/^\d+$/.test(term)
  );

  return (
    candidates.sort((left, right) => {
      const leftScore =
        (termStats.idf.get(left) || 0) *
        (1 + Math.log((termStats.termFrequency.get(left) || 0) + 1));
      const rightScore =
        (termStats.idf.get(right) || 0) *
        (1 + Math.log((termStats.termFrequency.get(right) || 0) + 1));
      return rightScore - leftScore || right.length - left.length;
    })[0] || null
  );
}

export function buildExtractiveSummary({
  sources = [],
  sourceContents = {},
  maxSentences = 6,
} = {}) {
  const records = collectSentences(sources, sourceContents);
  if (records.length === 0) return null;

  const sourceCount = new Set(records.map((record) => record.sourceId)).size;
  const termStats = buildTermStats(records);
  const selected = selectSummarySentences(
    records,
    termStats,
    maxSentences,
    sourceCount
  );

  if (selected.length === 0) return null;

  return {
    title: 'Extractive summary',
    body: selected.map((record) => record.text).join(' '),
    sentences: selected.map((record) => ({
      text: record.text,
      sourceId: record.sourceId,
      sourceTitle: record.sourceTitle,
      page: record.page,
      citation: record.citation,
    })),
    citations: dedupeCitations(selected.map((record) => record.citation)),
    generator: GENERATORS.LOCAL_EXTRACTIVE,
  };
}

export function buildFlashcards({
  sources = [],
  sourceContents = {},
  maxCards = 8,
} = {}) {
  const records = collectSentences(sources, sourceContents);
  if (records.length === 0) return [];

  const limit = Math.max(1, Math.min(Number(maxCards) || 8, MAX_FLASHCARDS));
  const termStats = buildTermStats(records);
  const ranked = scoreSentences(records, termStats).map((item) => item.record);
  const cards = [];
  const seenTerms = new Set();
  const usedRecords = new Set();

  for (const record of ranked) {
    if (cards.length >= limit) break;
    const term = matchDefinition(record.text);
    if (!term || seenTerms.has(term.toLowerCase())) continue;

    seenTerms.add(term.toLowerCase());
    usedRecords.add(record);
    cards.push({
      id: `card-definition-${cards.length + 1}`,
      type: 'definition',
      front: `Define: ${term}`,
      back: record.text,
      answer: term,
      sourceTitle: record.sourceTitle,
      page: record.page,
      citation: record.citation,
    });
  }

  for (const record of ranked) {
    if (cards.length >= limit) break;
    if (usedRecords.has(record)) continue;

    const term = pickKeyTerm(record, termStats);
    if (!term || seenTerms.has(term.toLowerCase())) continue;

    seenTerms.add(term.toLowerCase());
    cards.push({
      id: `card-recall-${cards.length + 1}`,
      type: 'recall',
      front: `What does the source say about "${term}"?`,
      back: record.text,
      answer: term,
      sourceTitle: record.sourceTitle,
      page: record.page,
      citation: record.citation,
    });
  }

  return cards;
}

function findTermIndex(text, term) {
  const lowerText = text.toLowerCase();
  const lowerTerm = term.toLowerCase();
  let index = lowerText.indexOf(lowerTerm);

  while (index >= 0) {
    const before = index === 0 ? '' : text[index - 1];
    const after = text[index + term.length] || '';
    if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) {
      return index;
    }
    index = lowerText.indexOf(lowerTerm, index + 1);
  }

  return -1;
}

function createCloze(text, term) {
  const index = findTermIndex(text, term);
  if (index < 0) return null;
  return `${text.slice(0, index)}_____${text.slice(index + term.length)}`;
}

export function buildQuiz({
  sources = [],
  sourceContents = {},
  maxQuestions = 5,
} = {}) {
  const cards = buildFlashcards({
    sources,
    sourceContents,
    maxCards: Math.max(maxQuestions * 2, 8),
  });
  const limit = Math.max(1, Math.min(Number(maxQuestions) || 5, MAX_QUIZ_QUESTIONS));
  const questions = [];

  for (const card of cards) {
    if (questions.length >= limit) break;
    const prompt = createCloze(card.back, card.answer);
    if (!prompt) continue;

    questions.push({
      id: `question-${questions.length + 1}`,
      prompt: `Fill in the blank: ${prompt}`,
      answer: card.answer,
      explanation: card.back,
      sourceTitle: card.sourceTitle,
      page: card.page,
      citation: card.citation,
    });
  }

  return questions;
}

export function buildStudyKit({
  sources = [],
  sourceContents = {},
  maxSentences = 6,
  maxCards = 8,
  maxQuestions = 5,
  now = new Date().toISOString(),
} = {}) {
  const records = collectSentences(sources, sourceContents);
  if (records.length === 0) {
    return {
      ok: false,
      kit: null,
      errors: [
        'Add at least one ready source with extracted text before building a study kit.',
      ],
    };
  }

  const summary = buildExtractiveSummary({
    sources,
    sourceContents,
    maxSentences,
  });
  const flashcards = buildFlashcards({
    sources,
    sourceContents,
    maxCards,
  });
  const quiz = buildQuiz({
    sources,
    sourceContents,
    maxQuestions,
  });
  const citations = dedupeCitations([
    ...(summary?.citations || []),
    ...flashcards.map((card) => card.citation),
    ...quiz.map((question) => question.citation),
  ]);

  return {
    ok: true,
    kit: {
      generator: GENERATORS.LOCAL_EXTRACTIVE,
      generatedAt: now,
      summary,
      flashcards,
      quiz,
      citations,
    },
    errors: [],
  };
}

export function normalizeQuizAnswer(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\b(?:a|an|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function checkQuizAnswer(question, answer) {
  if (!question || typeof question.answer !== 'string') return false;
  return normalizeQuizAnswer(question.answer) === normalizeQuizAnswer(answer);
}

export function formatStudyKitForStorage(kit) {
  if (!kit) return '';
  const lines = [
    'LOCAL EXTRACTIVE STUDY KIT',
    'Quoted from the notebook sources. This is not AI-generated content.',
    '',
    'SUMMARY',
  ];

  (kit.summary?.sentences || []).forEach((sentence) => {
    const page = sentence.page ? `, page ${sentence.page}` : '';
    lines.push(
      `- ${sentence.text} [${sentence.sourceTitle}${page}]`
    );
  });

  lines.push('', 'FLASHCARDS');
  (kit.flashcards || []).forEach((card, index) => {
    lines.push(`${index + 1}. ${card.front}`);
    lines.push(`   Answer: ${card.back}`);
  });

  lines.push('', 'RECALL QUIZ');
  (kit.quiz || []).forEach((question, index) => {
    lines.push(`${index + 1}. ${question.prompt}`);
    lines.push(`   Answer: ${question.answer}`);
  });

  return lines.join('\n');
}
