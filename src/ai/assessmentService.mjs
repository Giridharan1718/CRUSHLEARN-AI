// AssessmentService: deterministic practice and understanding checks.
//
// This service builds fill-in questions from exact source spans and evaluates
// free-text responses by term coverage. It does not use a model to grade the
// learner and it never reports mastery from a single check.

import {
  checkExplanationAnswer,
  evaluateOwnWordsExplanation,
  explainSelection,
} from '../notebooks/textExplanation.mjs';
import {
  CAPABILITY_STATUS,
  RUN_STATUS,
  createServiceResult,
  failureResult,
} from './contracts.mjs';

export const ASSESSMENT_CAPABILITY = CAPABILITY_STATUS.WORKING;
export const ADAPTIVE_ASSESSMENT_CAPABILITY = CAPABILITY_STATUS.PARTIAL;

export function buildPracticeCheck(request = {}) {
  const started = Date.now();
  const text = String(request.text || request.selection?.text || '');
  if (!text.trim()) {
    return failureResult('assessment', ['Select text before building a practice check.'], {
      capability: ASSESSMENT_CAPABILITY,
    });
  }

  const explanation = explainSelection({
    text,
    level: request.level || 'eli10',
    mode: 'check',
    sourceId: request.selection?.sourceId || '',
    sourceTexts: request.sourceContents,
    selectionStart:
      typeof request.selection?.selectionStart === 'number'
        ? request.selection.selectionStart
        : null,
  });

  if (!explanation.ok) {
    return failureResult('assessment', explanation.errors, {
      capability: ASSESSMENT_CAPABILITY,
      data: { explanation },
    });
  }

  const questions = explanation.questions || [];
  return createServiceResult({
    service: 'assessment',
    capability: ASSESSMENT_CAPABILITY,
    status: questions.length > 0 ? RUN_STATUS.COMPLETED : RUN_STATUS.PARTIAL,
    data: {
      questions,
      limitations: explanation.limitations,
      note: 'Source-recall checks, not mastery evidence.',
    },
    evidence: questions
      .map((question) => question.sentence)
      .filter(Boolean)
      .map((sentence, index) => ({
        kind: 'source_evidence',
        quote: sentence.text,
        citation: null,
        note: `Question ${index + 1} was built from this exact source sentence.`,
      })),
    learnerEvidence: [],
    limitations: [
      ...explanation.limitations,
      'A fill-in answer checks recall of one word or number. It does not establish understanding of the whole idea.',
    ],
    metrics: { latencyMs: Date.now() - started, questions: questions.length },
    generator: 'local_deterministic',
  });
}

export function checkPracticeAnswer(request = {}) {
  const question = request.question || null;
  const response = String(request.response || '');
  const outcome = checkExplanationAnswer(question, response);
  return createServiceResult({
    service: 'assessment.answer_check',
    capability: ASSESSMENT_CAPABILITY,
    status: outcome.reason === 'invalid-question' ? RUN_STATUS.NEEDS_INPUT : RUN_STATUS.COMPLETED,
    data: outcome,
    learnerEvidence: [
      {
        kind: 'learner_response',
        text: response.slice(0, 300),
        correctness: outcome.correct,
        note: 'One deterministic recall check.',
      },
    ],
    limitations: [
      'A correct answer is evidence for this check only; it is not mastery evidence.',
      'Exact normalised matching can reject a valid paraphrase.',
    ],
    errors: outcome.reason === 'invalid-question' ? ['No valid practice question was supplied.'] : [],
    generator: 'local_deterministic',
  });
}

export function assessOwnWords(request = {}) {
  const started = Date.now();
  const text = String(request.text || request.selection?.text || '');
  const response = String(request.response || '');
  const evaluation = evaluateOwnWordsExplanation({
    text,
    response,
    level: request.level,
  });

  if (!evaluation.ok) {
    return createServiceResult({
      service: 'assessment.own_words',
      capability: ASSESSMENT_CAPABILITY,
      status: RUN_STATUS.NEEDS_INPUT,
      data: evaluation,
      errors: evaluation.errors,
      limitations: evaluation.limitations,
      metrics: { latencyMs: Date.now() - started },
      generator: 'local_deterministic',
    });
  }

  return createServiceResult({
    service: 'assessment.own_words',
    capability: ASSESSMENT_CAPABILITY,
    status: RUN_STATUS.COMPLETED,
    data: evaluation,
    learnerEvidence: [
      {
        kind: 'learner_response',
        text: response.slice(0, 1200),
        correctness: null,
        note: 'Free-text response. Coverage is evidence about the text, not mastery.',
      },
    ],
    limitations: evaluation.limitations,
    metrics: { latencyMs: Date.now() - started },
    generator: 'local_deterministic',
  });
}

/**
 * Chooses a different teaching strategy after a struggle. The available
 * strategies are implemented elsewhere; this function only selects one.
 */
export function recommendNextStrategy({ attempts = [], ownWords = null } = {}) {
  const misses = (Array.isArray(attempts) ? attempts : []).filter(
    (attempt) => attempt?.correct === false
  ).length;
  const hits = (Array.isArray(attempts) ? attempts : []).filter(
    (attempt) => attempt?.correct === true
  ).length;

  if (ownWords?.nextStrategy) {
    return {
      strategy: ownWords.nextStrategy,
      reason: ownWords.feedback,
      basis: 'own_words_coverage',
    };
  }
  if (misses >= 3) {
    return {
      strategy: 'stop_and_review_source',
      reason:
        'Three misses in a row suggest the current check is not helping. Stop repeating it and review the verified passage instead.',
      basis: 'repeated_misses',
    };
  }
  if (misses > hits) {
    return {
      strategy: 'source_steps',
      reason:
        'The last checks did not match. Walk through the exact source sentences in order before trying the recall check again.',
      basis: 'recall_misses',
    };
  }
  if (hits > 0) {
    return {
      strategy: 'ask_learner_to_explain',
      reason:
        'The recall check matched. Ask the learner to explain the idea in their own words before claiming understanding.',
      basis: 'recall_hit',
    };
  }
  return {
    strategy: 'start_with_source_sentence',
    reason:
      'No learner response has been recorded yet. Start with one verified source sentence.',
    basis: 'no_evidence',
  };
}
