// Shared, notebook-scoped learning context.
//
// This is deliberately a data model and deterministic policy layer, not an AI
// model. It records what the learner asked, which verified passage answered it,
// which visual/practice were offered, and what the system recommends next.
// Source quotations are references plus exact copies; they are revalidated
// against the current source text before being trusted again.

import {
  CITATION_LOCATOR_KINDS,
  normalizeCitation,
  validateCitation,
} from '../notebooks/citations.mjs';
import { GENERATORS, normalizeGenerator } from '../notebooks/generators.mjs';
import { getContentText, normalizeSearchQuery, tokenize } from '../notebooks/sourceText.mjs';
import { createRecordId } from '../notebooks/notebookSchema.mjs';
import {
  normalizeAdaptiveState,
  revalidateAdaptiveState,
} from './adaptiveState.mjs';

export const LEARNING_CONTEXT_SCHEMA_VERSION = 1;
export const MAX_CONTEXT_TURNS = 10;
export const MAX_CONTEXT_EVIDENCE = 5;
export const MAX_PRACTICE_ATTEMPTS = 10;
export const MAX_TOPIC_TERMS = 3;
export const MAX_CONTEXT_QUESTION_LENGTH = 300;
export const MAX_CONTEXT_ANSWER_LENGTH = 1200;
export const MAX_CONTEXT_TITLE_LENGTH = 160;
export const MAX_CONTEXT_REASON_LENGTH = 500;

export const CONTEXT_VISUAL_KINDS = Object.freeze({
  CURATED: 'curated',
  SOURCE_EVIDENCE: 'source_evidence_map',
});

export const NEXT_ACTION_TARGETS = Object.freeze([
  'sources',
  'question',
  'evidence',
  'practice',
  'related_visual',
]);

export const NEXT_ACTION_IDS = Object.freeze({
  ADD_SOURCES: 'add_sources',
  REVISE_QUESTION: 'revise_question',
  ASK_ANOTHER_QUESTION: 'ask_another_question',
  INSPECT_MATCHES: 'inspect_matches',
  ANSWER_PRACTICE: 'answer_practice',
  REVIEW_EVIDENCE: 'review_evidence',
  OPEN_RELATED_VISUAL: 'open_related_visual',
  ASK_FOLLOWUP: 'ask_followup',
});

const ACTION_TARGETS = new Set(NEXT_ACTION_TARGETS);
const VISUAL_KINDS = new Set(Object.values(CONTEXT_VISUAL_KINDS));

function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizePage(value) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : null;
}

function normalizeStringList(value, { maxItems = 6, maxLength = 400 } = {}) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeEvidenceItem(record) {
  if (!record || typeof record !== 'object') return null;
  const citation = normalizeCitation(record.citation);
  if (!citation || citation.locator.kind !== CITATION_LOCATOR_KINDS.OFFSET) return null;

  return {
    sourceId: citation.sourceId,
    sourceTitle: cleanText(record.sourceTitle, MAX_CONTEXT_TITLE_LENGTH) || 'Source',
    page: normalizePage(record.page),
    quote: citation.quote,
    citation,
  };
}

function normalizeAnswer(record) {
  if (!record || typeof record !== 'object') return null;
  const text = cleanText(record.text, MAX_CONTEXT_ANSWER_LENGTH);
  const citation = normalizeCitation(record.citation);
  if (!text || !citation) return null;

  return {
    text,
    citation,
    sourceTitle: cleanText(record.sourceTitle, MAX_CONTEXT_TITLE_LENGTH) || 'Source',
    page: normalizePage(record.page),
    generator: normalizeGenerator(record.generator, GENERATORS.LOCAL_EXTRACTIVE),
    note: cleanText(record.note, 600),
  };
}

function normalizeAttempt(record) {
  if (!record || typeof record !== 'object') return null;
  const response = typeof record.response === 'string' ? record.response.slice(0, 300) : '';
  if (typeof record.correct !== 'boolean') return null;
  const checkedAt =
    typeof record.checkedAt === 'string' && record.checkedAt
      ? record.checkedAt
      : null;
  if (!checkedAt) return null;

  return { response, correct: record.correct, checkedAt };
}

function normalizePractice(record) {
  if (!record || typeof record !== 'object') return null;
  const prompt = cleanText(record.prompt, 600);
  const answer = cleanText(record.answer, 300);
  const citation = normalizeCitation(record.citation);
  if (!prompt || !answer || !citation || citation.locator.kind !== CITATION_LOCATOR_KINDS.OFFSET) {
    return null;
  }

  const attempts = Array.isArray(record.attempts)
    ? record.attempts
        .map(normalizeAttempt)
        .filter(Boolean)
        .slice(-MAX_PRACTICE_ATTEMPTS)
    : [];
  const lastAttempt = attempts[attempts.length - 1] || null;

  return {
    id: cleanText(record.id, 160) || `practice-${citation.sourceId}-${citation.locator.start}`,
    prompt,
    answer,
    explanation: cleanText(record.explanation, 1200),
    sourceTitle: cleanText(record.sourceTitle, MAX_CONTEXT_TITLE_LENGTH) || 'Source',
    page: normalizePage(record.page),
    citation,
    attempts,
    lastResult: lastAttempt,
  };
}

export function normalizeContextVisual(record) {
  if (!record || typeof record !== 'object') return null;
  const kind = VISUAL_KINDS.has(record.kind) ? record.kind : null;
  if (!kind) return null;

  const title = cleanText(record.title, 160);
  if (!title) return null;

  const items = Array.isArray(record.items)
    ? record.items.map(normalizeEvidenceItem).filter(Boolean).slice(0, MAX_CONTEXT_EVIDENCE)
    : [];
  if (kind === CONTEXT_VISUAL_KINDS.SOURCE_EVIDENCE && items.length === 0) {
    return null;
  }

  const id = cleanText(record.id, 160) || null;
  if (kind === CONTEXT_VISUAL_KINDS.CURATED && !id) return null;

  return {
    kind,
    id,
    title,
    description: cleanText(record.description, 1000),
    question: cleanText(record.question, MAX_CONTEXT_QUESTION_LENGTH),
    href: null,
    items,
    limitations: normalizeStringList(record.limitations),
    accessibilityDescription: cleanText(record.accessibilityDescription, 700),
  };
}

function normalizeNextAction(record) {
  if (!record || typeof record !== 'object') return null;
  const id = cleanText(record.id, 80);
  const title = cleanText(record.title, 120);
  const reason = cleanText(record.reason, MAX_CONTEXT_REASON_LENGTH);
  const target = ACTION_TARGETS.has(record.target) ? record.target : 'question';
  if (!id || !title) return null;
  return { id, title, reason, target };
}

function normalizeTurn(record) {
  if (!record || typeof record !== 'object') return null;
  const question = cleanText(record.question, MAX_CONTEXT_QUESTION_LENGTH);
  if (!question) return null;
  const citation = normalizeCitation(record.citation);
  const practiceResult = normalizeAttempt(record.practiceResult);

  return {
    id: cleanText(record.id, 160) || createRecordId('turn'),
    question,
    answerText: cleanText(record.answerText, MAX_CONTEXT_ANSWER_LENGTH),
    citation,
    practiceResult,
    nextActionId: cleanText(record.nextActionId, 80) || null,
    at:
      typeof record.at === 'string' && record.at
        ? record.at
        : new Date().toISOString(),
  };
}

export function createEmptyLearningContext(
  userId,
  notebookId,
  now = new Date().toISOString()
) {
  return {
    schemaVersion: LEARNING_CONTEXT_SCHEMA_VERSION,
    userId,
    notebookId,
    currentQuestion: '',
    resolvedQuestion: '',
    topicTerms: [],
    usedContextTerms: [],
    answer: null,
    evidence: [],
    visual: null,
    relatedVisual: null,
    practice: null,
    nextAction: null,
    adaptive: null,
    turns: [],
    updatedAt: now,
  };
}

export function normalizeLearningContext(record, { userId, notebookId } = {}) {
  if (!record || typeof record !== 'object') return null;
  if (record.schemaVersion !== LEARNING_CONTEXT_SCHEMA_VERSION) return null;
  if (typeof record.userId !== 'string' || !record.userId.trim()) return null;
  if (typeof record.notebookId !== 'string' || !record.notebookId.trim()) {
    return null;
  }
  if (userId !== undefined && record.userId !== userId) return null;
  if (notebookId !== undefined && record.notebookId !== notebookId) return null;

  const turns = Array.isArray(record.turns)
    ? record.turns.map(normalizeTurn).filter(Boolean).slice(-MAX_CONTEXT_TURNS)
    : [];

  return {
    ...createEmptyLearningContext(record.userId, record.notebookId),
    currentQuestion: cleanText(record.currentQuestion, MAX_CONTEXT_QUESTION_LENGTH),
    resolvedQuestion: cleanText(record.resolvedQuestion, MAX_CONTEXT_QUESTION_LENGTH),
    topicTerms: normalizeStringList(record.topicTerms, {
      maxItems: MAX_TOPIC_TERMS,
      maxLength: 80,
    }),
    usedContextTerms: normalizeStringList(record.usedContextTerms, {
      maxItems: MAX_TOPIC_TERMS,
      maxLength: 80,
    }),
    answer: normalizeAnswer(record.answer),
    evidence: Array.isArray(record.evidence)
      ? record.evidence
          .map(normalizeEvidenceItem)
          .filter(Boolean)
          .slice(0, MAX_CONTEXT_EVIDENCE)
      : [],
    visual: normalizeContextVisual(record.visual),
    relatedVisual: normalizeContextVisual(record.relatedVisual),
    practice: normalizePractice(record.practice),
    nextAction: normalizeNextAction(record.nextAction),
    adaptive: normalizeAdaptiveState(record.adaptive),
    turns,
    updatedAt:
      typeof record.updatedAt === 'string' && record.updatedAt
        ? record.updatedAt
        : new Date().toISOString(),
  };
}

export function getQuestionTopicTerms(question) {
  return [...new Set(tokenize(question))]
    .sort((left, right) => right.length - left.length)
    .slice(0, MAX_TOPIC_TERMS);
}

export function resolveQuestionWithContext(question, context = null) {
  const originalQuestion = normalizeSearchQuery(question);
  const terms = tokenize(originalQuestion);
  const priorTerms = Array.isArray(context?.topicTerms)
    ? context.topicTerms
    : [];
  const hasPronoun = /\b(?:it|its|they|them|their|this|that|these|those|he|she|him|her)\b/i.test(
    originalQuestion
  );
  const needsContext =
    priorTerms.length > 0 &&
    (hasPronoun || terms.length === 0 || (terms.length === 1 && terms[0].length <= 4));
  const usedContextTerms = needsContext
    ? priorTerms
        .filter((term) => !terms.includes(term))
        .slice(0, 2)
    : [];
  const resolvedQuestion = normalizeSearchQuery(
    [originalQuestion, ...usedContextTerms].join(' ')
  );

  return {
    originalQuestion,
    resolvedQuestion,
    usedContextTerms,
  };
}

export function selectNextAction({
  answer = null,
  practice = null,
  practiceResult = null,
  relatedVisual = null,
  readySourceCount = 0,
} = {}) {
  if (readySourceCount === 0) {
    return {
      id: NEXT_ACTION_IDS.ADD_SOURCES,
      title: 'Add a source',
      reason: 'Add and process a source before asking a source-grounded question.',
      target: 'sources',
    };
  }

  if (answer && answer.ok === false) {
    return {
      id: NEXT_ACTION_IDS.REVISE_QUESTION,
      title: 'Revise the question',
      reason: 'The local search could not use this question. Try a more specific phrase.',
      target: 'question',
    };
  }

  if (!answer || !answer.answered) {
    if (Array.isArray(answer?.results) && answer.results.length > 0) {
      return {
        id: NEXT_ACTION_IDS.INSPECT_MATCHES,
        title: 'Inspect the matching passages',
        reason:
          'No single sentence can answer this question, but matching passages exist. Check them before drawing a conclusion.',
        target: 'evidence',
      };
    }
    return {
      id: NEXT_ACTION_IDS.ASK_ANOTHER_QUESTION,
      title: 'Ask another source question',
      reason:
        'The sources do not contain a matching passage. Try wording that appears in a source.',
      target: 'question',
    };
  }

  if (practice && !practiceResult) {
    return {
      id: NEXT_ACTION_IDS.ANSWER_PRACTICE,
      title: 'Check your understanding',
      reason:
        'A source-based recall question is ready. Answering it turns reading into an observable check.',
      target: 'practice',
    };
  }

  if (practiceResult) {
    if (!practiceResult.correct) {
      return {
        id: NEXT_ACTION_IDS.REVIEW_EVIDENCE,
        title: 'Review the exact passage',
        reason:
          'The practice answer did not match the source wording. Re-read the verified passage, then try again.',
        target: 'evidence',
      };
    }

    if (relatedVisual) {
      return {
        id: NEXT_ACTION_IDS.OPEN_RELATED_VISUAL,
        title: 'Open the related visual',
        reason:
          'The practice answer was correct. The curated visual is a separate authored explanation, not evidence from your source.',
        target: 'related_visual',
      };
    }

    return {
      id: NEXT_ACTION_IDS.ASK_FOLLOWUP,
      title: 'Ask a follow-up question',
      reason:
        'The practice answer was correct. Ask a follow-up, or return to the sources to check a different claim.',
      target: 'question',
    };
  }

  return {
    id: NEXT_ACTION_IDS.ASK_FOLLOWUP,
    title: 'Ask a follow-up question',
    reason: 'The source has been quoted. Ask a related question to narrow the evidence.',
    target: 'question',
  };
}

export function applyTurnToContext(context, turn) {
  const base =
    normalizeLearningContext(context) ||
    createEmptyLearningContext(turn?.userId || '', turn?.notebookId || '');
  if (!turn || typeof turn !== 'object') return base;

  const question = cleanText(turn.question, MAX_CONTEXT_QUESTION_LENGTH);
  if (!question) return base;

  const answer = normalizeAnswer(turn.answer);
  const evidence = Array.isArray(turn.evidence)
    ? turn.evidence.map(normalizeEvidenceItem).filter(Boolean).slice(0, MAX_CONTEXT_EVIDENCE)
    : [];
  const visual = normalizeContextVisual(turn.visual);
  const relatedVisual = normalizeContextVisual(turn.relatedVisual);
  const practice = normalizePractice(turn.practice);
  const nextAction = normalizeNextAction(turn.nextAction);
  const topicTerms = getQuestionTopicTerms(question);
  const turnSummary = {
    id: cleanText(turn.id, 160) || createRecordId('turn'),
    question,
    answerText: answer?.text || '',
    citation: answer?.citation || null,
    practiceResult: practice?.lastResult || null,
    nextActionId: nextAction?.id || null,
    at:
      typeof turn.at === 'string' && turn.at
        ? turn.at
        : new Date().toISOString(),
  };

  return {
    ...base,
    currentQuestion: question,
    resolvedQuestion: cleanText(turn.resolvedQuestion, MAX_CONTEXT_QUESTION_LENGTH),
    topicTerms,
    usedContextTerms: normalizeStringList(turn.usedContextTerms, {
      maxItems: MAX_TOPIC_TERMS,
      maxLength: 80,
    }),
    answer,
    evidence,
    visual,
    relatedVisual,
    practice,
    nextAction,
    adaptive: null,
    turns: [...base.turns, turnSummary].slice(-MAX_CONTEXT_TURNS),
    updatedAt: turnSummary.at,
  };
}

export function updateContextWithPractice(
  context,
  practice,
  nextAction,
  now = new Date().toISOString()
) {
  const base = normalizeLearningContext(context);
  if (!base) return null;
  const normalizedPractice = normalizePractice(practice);
  if (!normalizedPractice) return base;

  const turns = [...base.turns];
  const lastIndex = turns.length - 1;
  if (lastIndex >= 0) {
    turns[lastIndex] = {
      ...turns[lastIndex],
      practiceResult: normalizedPractice.lastResult,
      nextActionId: normalizeNextAction(nextAction)?.id || turns[lastIndex].nextActionId,
    };
  }

  return {
    ...base,
    practice: normalizedPractice,
    nextAction: normalizeNextAction(nextAction),
    turns,
    updatedAt: now,
  };
}

export function updateContextWithAdaptive(
  context,
  adaptive,
  now = new Date().toISOString()
) {
  const base = normalizeLearningContext(context);
  if (!base) return null;
  const normalizedAdaptive = normalizeAdaptiveState(adaptive);
  return {
    ...base,
    adaptive: normalizedAdaptive,
    updatedAt: now,
  };
}

export function revalidateLearningContext(
  context,
  { sources = [], sourceContents = {} } = {}
) {
  const base = normalizeLearningContext(context);
  if (!base) return null;

  const sourceIds = (Array.isArray(sources) ? sources : []).map((source) => source.id);
  const sourceTexts = {};
  (Array.isArray(sources) ? sources : []).forEach((source) => {
    const text = getContentText(sourceContents?.[source.id]);
    if (text) sourceTexts[source.id] = text;
  });

  const isVerified = (citation) =>
    Boolean(
      citation &&
        validateCitation(citation, {
          sourceIds,
          sourceTexts,
          requireSourceText: true,
        }).verified
    );

  const answer = base.answer && isVerified(base.answer.citation) ? base.answer : null;
  const evidence = base.evidence.filter((item) => isVerified(item.citation));
  const practice =
    base.practice && isVerified(base.practice.citation) ? base.practice : null;
  const visual =
    base.visual?.kind === CONTEXT_VISUAL_KINDS.SOURCE_EVIDENCE
      ? {
          ...base.visual,
          items: base.visual.items.filter((item) => isVerified(item.citation)),
        }
      : base.visual;
  const hasVisual =
    visual &&
    (visual.kind !== CONTEXT_VISUAL_KINDS.SOURCE_EVIDENCE ||
      visual.items.length > 0);
  let nextVisual = hasVisual ? visual : null;
  if (nextVisual?.kind === CONTEXT_VISUAL_KINDS.SOURCE_EVIDENCE) {
    const sourceCount = new Set(
      nextVisual.items.map((item) => item.sourceId)
    ).size;
    const quotationLabelText =
      nextVisual.items.length === 1 ? 'quotation' : 'quotations';
    const sourceLabelText = sourceCount === 1 ? 'source' : 'sources';
    const questionText =
      nextVisual.question || base.currentQuestion || 'the saved question';
    nextVisual = {
      ...nextVisual,
      description: `${nextVisual.items.length} verified ${quotationLabelText} from ${sourceCount} ${sourceLabelText}. The map shows what supports the answer, not a generated concept explanation.`,
      accessibilityDescription: `Source evidence map with ${nextVisual.items.length} verified ${quotationLabelText} from ${sourceCount} ${sourceLabelText} for the question: ${questionText}.`,
    };
  }

  return {
    ...base,
    answer,
    evidence,
    practice,
    visual: nextVisual,
    adaptive: revalidateAdaptiveState(base.adaptive, { isVerified }),
    nextAction: selectNextAction({
      answer: answer
        ? { ok: true, answered: true }
        : { ok: true, answered: false, results: evidence },
      practice,
      practiceResult: practice?.lastResult || null,
      relatedVisual: base.relatedVisual,
      readySourceCount: Object.keys(sourceTexts).length,
    }),
  };
}
