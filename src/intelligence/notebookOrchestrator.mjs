// Deterministic notebook turn orchestration.
//
// The orchestrator is the seam between the learner-facing workflow and the
// specialized tools. It retrieves a verified quotation, builds a source
// evidence map, creates a recall check, chooses the next action, and updates the
// shared context. Model-backed adapters can replace these functions later
// without changing the UI or the context contract.
//
// This module never calls a network service and never fills a missing source
// answer with outside knowledge.

import {
  answerFromNotebookSources,
} from '../notebooks/sourceAnswers.mjs';
import { validateCitation } from '../notebooks/citations.mjs';
import { readySources, sourceTextMap } from '../notebooks/sourceAccess.mjs';
import {
  findPageNumber,
  tokenize,
} from '../notebooks/sourceText.mjs';
import { checkQuizAnswer } from '../notebooks/studyTools.mjs';
import { findVisualExplanationForTopic } from '../visual/visualCatalog.mjs';
import {
  CONTEXT_VISUAL_KINDS,
  MAX_CONTEXT_EVIDENCE,
  applyTurnToContext,
  createEmptyLearningContext,
  normalizeLearningContext,
  resolveQuestionWithContext,
  selectNextAction,
  updateContextWithPractice,
} from './learningContext.mjs';
import { createRecordId } from '../notebooks/notebookSchema.mjs';
import { GENERATORS } from '../notebooks/generators.mjs';

const TOKEN_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}'_-]*/gu;

function verifiedCitation(citation, sources, sourceContents) {
  return validateCitation(citation, {
    sourceIds: (Array.isArray(sources) ? sources : []).map((source) => source.id),
    sourceTexts: sourceTextMap(sources, sourceContents),
    requireSourceText: true,
  });
}

function tokenOccurrences(text) {
  const value = String(text ?? '');
  const occurrences = [];
  let match;
  TOKEN_PATTERN.lastIndex = 0;
  while ((match = TOKEN_PATTERN.exec(value)) !== null) {
    occurrences.push({
      text: match[0],
      lower: match[0].toLowerCase(),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return occurrences;
}

function chooseBlankToken(question, answerText) {
  const questionTerms = new Set(tokenize(question));
  const tokens = tokenOccurrences(answerText).filter(
    (token) => token.text.length >= 3 && /[\p{L}]/u.test(token.text)
  );
  if (tokens.length === 0) return null;

  let best = null;
  tokens.forEach((token) => {
    let score = token.text.length;
    if (questionTerms.has(token.lower)) score += 100;
    questionTerms.forEach((term) => {
      if (term.length < 4 || term === token.lower) return;
      if (token.lower.startsWith(term) || term.startsWith(token.lower)) {
        score += 60;
      }
    });

    if (!best || score > best.score) {
      best = { ...token, score };
    }
  });

  return best;
}

/**
 * Build a single exact-source recall question from the answer span.
 * The answer is a word that actually occurs in the quoted source sentence.
 */
export function buildPracticeQuestion({
  question,
  answer,
  sourceTitle,
  page,
  citation,
}) {
  if (!answer || !citation) return null;
  const token = chooseBlankToken(question, answer);
  if (!token) return null;

  const prompt = `Fill in the missing source wording: ${answer.slice(
    0,
    token.start
  )}_____${answer.slice(token.end)}`;
  if (prompt.length > 600) return null;

  return {
    id: `practice-${citation.sourceId}-${citation.locator.start}`,
    prompt,
    answer: token.text,
    explanation: `The source says: ${answer}`,
    sourceTitle: sourceTitle || 'Source',
    page: Number.isInteger(page) ? page : null,
    citation,
    attempts: [],
    lastResult: null,
    generator: GENERATORS.LOCAL_EXTRACTIVE,
    note: 'This is a local source-recall check, not mastery evidence.',
  };
}

function evidenceItem({ citation, sourceTitle, page }) {
  return {
    sourceId: citation.sourceId,
    sourceTitle: sourceTitle || 'Source',
    page: Number.isInteger(page) ? page : null,
    quote: citation.quote,
    citation,
  };
}

/**
 * Turn verified quotations into a typed source-evidence visual.
 * The map only groups exact source spans and never invents a relationship or a
 * conceptual explanation.
 */
export function buildSourceEvidenceVisual({
  question,
  answer,
  results = [],
  sources = [],
  sourceContents = {},
}) {
  if (!answer?.citation) return null;

  const answerVerification = verifiedCitation(
    answer.citation,
    sources,
    sourceContents
  );
  if (!answerVerification.ok) return null;

  const items = [
    evidenceItem({
      citation: answerVerification.citation,
      sourceTitle: answer.sourceTitle,
      page: answer.page,
    }),
  ];
  const seen = new Set([
    `${answerVerification.citation.sourceId}:${answerVerification.citation.locator.start}:${answerVerification.citation.locator.end}`,
  ]);

  (Array.isArray(results) ? results : []).forEach((result) => {
    if (items.length >= MAX_CONTEXT_EVIDENCE) return;
    const verification = verifiedCitation(
      result.citation,
      sources,
      sourceContents
    );
    if (!verification.ok) return;
    const key = `${verification.citation.sourceId}:${verification.citation.locator.start}:${verification.citation.locator.end}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(
      evidenceItem({
        citation: verification.citation,
        sourceTitle: result.sourceTitle,
        page: result.page,
      })
    );
  });

  const sourceCount = new Set(items.map((item) => item.sourceId)).size;
  const limitations = [
    'This map presents exact source quotations. It does not add an AI explanation or resolve conflicting evidence.',
  ];
  if (sourceCount === 1) {
    limitations.push(
      'Single-source answer: the claim is not independently corroborated by another source in this notebook.'
    );
  }
  if (items.length === 1) {
    limitations.push('Only one matching passage was available.');
  }
  const answerSpan = items[0]?.citation?.locator;
  const hasOverlappingContext = items.slice(1).some((item) => {
    const span = item.citation?.locator;
    return (
      answerSpan &&
      span &&
      item.sourceId === items[0].sourceId &&
      span.start <= answerSpan.start &&
      span.end >= answerSpan.end
    );
  });
  if (hasOverlappingContext) {
    limitations.push(
      'A larger context passage contains the answer quotation. It adds surrounding context, not independent corroboration.'
    );
  }

  return {
    kind: CONTEXT_VISUAL_KINDS.SOURCE_EVIDENCE,
    id: `evidence-${answer.citation.sourceId}-${answer.citation.locator.start}`,
    title: 'Source evidence map',
    description: `${items.length} verified quotation${
      items.length === 1 ? '' : 's'
    } from ${sourceCount} source${sourceCount === 1 ? '' : 's'}. The map shows what supports the answer, not a generated concept explanation.`,
    question: String(question || answer.text || '').slice(0, 300),
    items,
    limitations,
    accessibilityDescription: `Source evidence map with ${items.length} verified quotation${
      items.length === 1 ? '' : 's'
    }. ${answer.answer || answer.text || ''}`.trim(),
  };
}

/**
 * Select a curated visual only when the catalog has an authored match. It is
 * kept separate from source evidence and is never presented as a source claim.
 */
export function buildRelatedCuratedVisual(question) {
  const match = findVisualExplanationForTopic(question);
  if (!match.ok || !match.explanation) return null;
  return {
    kind: CONTEXT_VISUAL_KINDS.CURATED,
    id: match.explanation.id,
    title: match.explanation.title,
    description:
      'Authored process visual. It is not generated from, or evidence for, the uploaded source.',
    limitations: [
      'Curated authored explanation, not source evidence.',
      'Open the visual to see its own limitations and worked example.',
    ],
    items: [],
    accessibilityDescription: match.explanation.accessibilityDescription,
  };
}

function noAnswerTurn({
  question,
  resolution,
  answer,
  now,
  userId,
  notebookId,
  previousContext,
  readySourceCount = 0,
}) {
  const evidence = (answer.results || [])
    .slice(0, MAX_CONTEXT_EVIDENCE)
    .map((result) =>
      evidenceItem({
        citation: result.citation,
        sourceTitle: result.sourceTitle,
        page: result.page,
      })
    );
  const nextAction = selectNextAction({
    answer,
    relatedVisual: null,
    readySourceCount,
  });
  const turn = {
    id: createRecordId('turn'),
    question,
    resolvedQuestion: resolution.resolvedQuestion,
    usedContextTerms: resolution.usedContextTerms,
    answer: null,
    evidence,
    visual: null,
    relatedVisual: null,
    practice: null,
    nextAction,
    at: now,
  };
  const context = applyTurnToContext(
    previousContext ||
      createEmptyLearningContext(userId, notebookId, now),
    { ...turn, userId, notebookId }
  );
  return {
    ok: Boolean(answer.ok),
    turn,
    context,
    ...answer,
    results: answer.results || [],
    visual: null,
    relatedVisual: null,
    practice: null,
    nextAction,
  };
}

export function evaluatePracticeResponse({
  context,
  response,
  now = new Date().toISOString(),
} = {}) {
  const practice = context?.practice;
  if (!practice) {
    return { ok: false, errors: ['There is no practice question in this context.'] };
  }

  const correct = checkQuizAnswer(practice, response);
  const attempt = {
    response: String(response ?? '').slice(0, 300),
    correct,
    checkedAt: now,
  };
  const updatedPractice = {
    ...practice,
    attempts: [...(practice.attempts || []), attempt].slice(-10),
    lastResult: attempt,
  };
  const nextAction = selectNextAction({
    answer: { ok: true, answered: true },
    practice: updatedPractice,
    practiceResult: attempt,
    relatedVisual: context.relatedVisual,
    readySourceCount: 1,
  });
  const nextContext = updateContextWithPractice(
    context,
    updatedPractice,
    nextAction,
    now
  );

  return {
    ok: true,
    correct,
    attempt,
    practice: updatedPractice,
    nextAction,
    context: nextContext,
    feedback: correct
      ? 'Correct. The source wording matches your answer.'
      : `Not quite. The source answer is "${practice.answer}".`,
  };
}

export function createNotebookOrchestrator(adapters = {}) {
  const resolveQuestion =
    adapters.resolveQuestionWithContext || resolveQuestionWithContext;
  const retrieve = adapters.answerQuestion || answerFromNotebookSources;
  const createEvidenceVisual =
    adapters.buildSourceEvidenceVisual || buildSourceEvidenceVisual;
  const createRelatedVisual =
    adapters.buildRelatedCuratedVisual || buildRelatedCuratedVisual;
  const createPractice = adapters.buildPracticeQuestion || buildPracticeQuestion;
  const chooseAction = adapters.selectNextAction || selectNextAction;
  const now = adapters.now || (() => new Date().toISOString());

  const runTurn = (input = {}) => {
    const timestamp = input.now || now();
    const previousContext = normalizeLearningContext(input.previousContext, {
      userId: input.userId,
      notebookId: input.notebookId,
    });
    const resolution = resolveQuestion(input.question, previousContext);
    const usableSources = readySources(input.sources).filter(
      (source) => input.sourceContents?.[source.id]
    );

    if (usableSources.length === 0) {
      return noAnswerTurn({
        question: resolution.originalQuestion,
        resolution,
        answer: {
          ok: false,
          answered: false,
          question: resolution.resolvedQuestion,
          answer: null,
          citation: null,
          errors: ['Add at least one ready source before asking a question.'],
          results: [],
        },
        now: timestamp,
        userId: input.userId,
        notebookId: input.notebookId,
        previousContext,
        readySourceCount: 0,
      });
    }

    let answer = retrieve({
      sources: usableSources,
      sourceContents: input.sourceContents,
      question: resolution.resolvedQuestion,
    });

    if (answer.answered) {
      const verification = verifiedCitation(
        answer.citation,
        usableSources,
        input.sourceContents
      );
      if (!verification.ok) {
        answer = {
          ...answer,
          ok: false,
          answered: false,
          answer: null,
          citation: null,
          errors: ['The selected source answer could not be verified.'],
        };
      } else {
        answer = { ...answer, citation: verification.citation };
      }
    }

    if (!answer.ok || !answer.answered) {
      return noAnswerTurn({
        question: resolution.originalQuestion,
        resolution,
        answer,
        now: timestamp,
        userId: input.userId,
        notebookId: input.notebookId,
        previousContext,
        readySourceCount: usableSources.length,
      });
    }

    const source = usableSources.find((item) => item.id === answer.sourceId);
    const content = input.sourceContents?.[answer.sourceId];
    const page = Number.isInteger(answer.page)
      ? answer.page
      : findPageNumber(content, answer.citation?.locator?.start);
    const visual = createEvidenceVisual({
      question: resolution.originalQuestion,
      answer: { ...answer, page, sourceTitle: answer.sourceTitle || source?.title },
      results: answer.results,
      sources: usableSources,
      sourceContents: input.sourceContents,
    });
    const relatedVisual = createRelatedVisual(resolution.resolvedQuestion);
    const practice = createPractice({
      question: resolution.resolvedQuestion,
      answer: answer.answer,
      sourceTitle: answer.sourceTitle || source?.title,
      page,
      citation: answer.citation,
    });
    const nextAction = chooseAction({
      answer,
      practice,
      relatedVisual,
      readySourceCount: usableSources.length,
    });
    const turn = {
      id: createRecordId('turn'),
      question: resolution.originalQuestion,
      resolvedQuestion: resolution.resolvedQuestion,
      usedContextTerms: resolution.usedContextTerms,
      answer: {
        text: answer.answer,
        citation: answer.citation,
        sourceTitle: answer.sourceTitle || source?.title || 'Source',
        page,
        generator: GENERATORS.LOCAL_EXTRACTIVE,
        note: answer.note,
      },
      evidence: visual?.items || [],
      visual,
      relatedVisual,
      practice,
      nextAction,
      at: timestamp,
    };
    const context = applyTurnToContext(
      previousContext ||
        createEmptyLearningContext(input.userId, input.notebookId, timestamp),
      { ...turn, userId: input.userId, notebookId: input.notebookId }
    );

    return {
      ok: true,
      answered: true,
      question: resolution.originalQuestion,
      resolvedQuestion: resolution.resolvedQuestion,
      usedContextTerms: resolution.usedContextTerms,
      answer: answer.answer,
      citation: answer.citation,
      sourceId: answer.sourceId,
      sourceTitle: answer.sourceTitle || source?.title || 'Source',
      page,
      note: answer.note,
      results: answer.results,
      visual,
      relatedVisual,
      practice,
      nextAction,
      turn,
      context,
    };
  };

  return { runTurn, evaluatePracticeResponse };
}

export const notebookOrchestrator = createNotebookOrchestrator();

/**
 * Convenience entry point for the default deterministic adapters.
 * Call the factory directly to inject model-backed or test adapters.
 */
export function runNotebookTurn(input = {}) {
  return notebookOrchestrator.runTurn(input);
}
