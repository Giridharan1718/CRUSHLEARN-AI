// TextUnderstandingService: the single entry point to the local Text
// Understanding Engine. It adapts the deterministic engine to the shared
// orchestration contract and keeps its output labelled correctly.

import {
  evaluateOwnWordsExplanation,
  explainSelection,
  validateExplanationResult,
} from '../notebooks/textExplanation.mjs';
import {
  CAPABILITY_STATUS,
  RUN_STATUS,
  citationsFromExplanation,
  createServiceResult,
  failureResult,
  MAX_ORCHESTRATION_TEXT_CHARS,
} from './contracts.mjs';

export const TEXT_UNDERSTANDING_CAPABILITY = CAPABILITY_STATUS.WORKING;

export function runTextUnderstanding(request = {}) {
  const started = Date.now();
  const selection = request.selection || {};
  const text = String(request.text || selection.text || '');
  const sourceId = selection.sourceId || '';
  const sourceTitle = selection.sourceTitle || '';

  if (!text.trim()) {
    return failureResult('text_understanding', ['Select some text to explain first.'], {
      capability: TEXT_UNDERSTANDING_CAPABILITY,
      unavailable: ['explanation without a selection'],
    });
  }
  if (text.length > MAX_ORCHESTRATION_TEXT_CHARS) {
    return failureResult(
      'text_understanding',
      [`The selection exceeds the ${MAX_ORCHESTRATION_TEXT_CHARS}-character limit.`],
      { capability: TEXT_UNDERSTANDING_CAPABILITY }
    );
  }

  const explanation = explainSelection({
    text,
    level: request.level,
    mode: request.mode,
    word: request.word,
    language: request.language,
    sourceId,
    sourceTexts: request.sourceContents,
    selectionStart:
      typeof selection.selectionStart === 'number' ? selection.selectionStart : null,
  });
  explanation.sourceTitle = sourceTitle;

  if (!explanation.ok) {
    return createServiceResult({
      service: 'text_understanding',
      capability: TEXT_UNDERSTANDING_CAPABILITY,
      status: RUN_STATUS.BLOCKED,
      data: { explanation },
      errors: explanation.errors,
      limitations: explanation.limitations || [],
      metrics: { latencyMs: Date.now() - started },
      generator: 'local_deterministic',
    });
  }

  const verification =
    explanation.verification ||
    validateExplanationResult({ text, result: explanation });

  return createServiceResult({
    service: 'text_understanding',
    capability: TEXT_UNDERSTANDING_CAPABILITY,
    status: verification.ok ? RUN_STATUS.COMPLETED : RUN_STATUS.PARTIAL,
    data: {
      explanation,
      subject: explanation.subject,
      level: explanation.level,
      language: explanation.language,
      visualPlan: explanation.visualPlan,
    },
    evidence: citationsFromExplanation(explanation),
    interpretations: [
      {
        kind: 'rule_based_interpretation',
        text: explanation.levelNote,
        note: 'Sentence selection and ordering are deterministic and are not a model paraphrase.',
      },
      ...(explanation.followUpQuestions || []).map((item) => ({
        kind: 'rule_based_interpretation',
        text: item.prompt,
        note: item.basis,
      })),
    ],
    unavailable: [
      ...(explanation.language?.supported ? [] : ['translation']),
      ...(explanation.visualPlan?.available ? [] : ['generated visual']),
    ],
    limitations: explanation.limitations,
    errors: verification.ok ? [] : verification.errors,
    metrics: {
      latencyMs: Date.now() - started,
      inputCharacters: text.length,
      facts: explanation.factCount,
      equations: explanation.equations.length,
      quantities: explanation.quantities.length,
      subjectConfidence: explanation.subject.confidence,
    },
    generator: 'local_extractive_rule',
  });
}

/**
 * Evaluates a learner's own-words response. Kept here because it belongs to
 * text understanding, not to model judging.
 */
export function evaluateOwnWords(request = {}) {
  const text = String(request.text || request.selection?.text || '');
  const response = String(request.response || '');
  const evaluation = evaluateOwnWordsExplanation({
    text,
    response,
    level: request.level,
  });
  return createServiceResult({
    service: 'text_understanding.own_words',
    capability: TEXT_UNDERSTANDING_CAPABILITY,
    status: evaluation.ok ? RUN_STATUS.COMPLETED : RUN_STATUS.NEEDS_INPUT,
    data: evaluation,
    learnerEvidence: evaluation.ok
      ? [
          {
            kind: 'learner_response',
            text: response.slice(0, 1200),
            correctness: null,
            note: 'Free-text response. Term coverage is evidence about the text, not mastery.',
          },
        ]
      : [],
    limitations: evaluation.limitations || [],
    errors: evaluation.errors || [],
    generator: 'local_deterministic',
  });
}
