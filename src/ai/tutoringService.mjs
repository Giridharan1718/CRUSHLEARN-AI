// TutoringService: a small guided explanation workflow.
//
// It composes TextUnderstanding + Assessment. It is not an autonomous tutor and
// does not claim to know the learner's understanding. A response from the
// learner changes the recommended strategy; it does not prove mastery.

import {
  CAPABILITY_STATUS,
  RUN_STATUS,
  createServiceResult,
  failureResult,
} from './contracts.mjs';
import { buildPracticeCheck, recommendNextStrategy } from './assessmentService.mjs';
import { runTextUnderstanding } from './textUnderstandingService.mjs';

export const TUTORING_CAPABILITY = CAPABILITY_STATUS.PARTIAL;

export function runTutoring(request = {}) {
  const started = Date.now();
  const understanding = runTextUnderstanding({
    ...request,
    mode: request.mode === 'simplify' || !request.mode ? 'simplify' : request.mode,
  });

  if (!understanding.ok) {
    return failureResult('tutoring', understanding.errors, {
      capability: TUTORING_CAPABILITY,
      data: { understanding },
    });
  }

  const explanation = understanding.data.explanation;
  const practice = buildPracticeCheck({
    text: request.text || request.selection?.text,
    selection: request.selection,
    level: request.level,
    sourceContents: request.sourceContents,
  });

  const next = recommendNextStrategy({
    attempts: explanation.questions?.attempts || [],
    ownWords: request.ownWords || null,
  });

  const practiceQuestions = practice.ok ? practice.data.questions : [];

  return createServiceResult({
    service: 'tutoring',
    capability: TUTORING_CAPABILITY,
    status: RUN_STATUS.PARTIAL,
    data: {
      explanation,
      practice: {
        available: practiceQuestions.length > 0,
        questions: practiceQuestions,
        note:
          practiceQuestions.length > 0
            ? 'Practice questions quote the same selection. They check recall, not mastery.'
            : 'No practice question could be built from this selection.',
      },
      ownWordsPrompt:
        'Explain the idea in your own words. The app compares key-term coverage; it does not ask a model to grade you.',
      nextStrategy: next,
    },
    evidence: understanding.evidence,
    interpretations: understanding.interpretations,
    learnerEvidence: [],
    unavailable: [
      'model tutor dialogue',
      'generated analogy when the source has none',
      ...understanding.unavailable,
    ],
    limitations: [
      ...understanding.limitations,
      'Tutoring is a deterministic sequence; it is not an adaptive model tutor.',
      'One practice check does not measure mastery or retention.',
    ],
    metrics: {
      latencyMs: Date.now() - started,
      questions: practiceQuestions.length,
      ...understanding.metrics,
    },
    generator: 'local_deterministic',
  });
}
