import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAdaptiveIntelligenceLoop,
  recordAdaptiveCorrection,
} from '../../src/intelligence/adaptiveLoop.mjs';
import {
  createNotebookContextStore,
} from '../../src/intelligence/notebookContextStore.mjs';
import {
  revalidateLearningContext,
} from '../../src/intelligence/learningContext.mjs';
import { runNotebookTurn } from '../../src/intelligence/notebookOrchestrator.mjs';
import { MemoryStorage } from '../notebooks/memoryStorage.mjs';

const userId = 'adaptive-user';
const notebookId = 'adaptive-notebook';
const now = '2026-10-20T12:00:00.000Z';
const biologyText =
  'Photosynthesis converts light energy into chemical energy. Chlorophyll absorbs light in the visible spectrum.';
const chlorophyllQuote =
  'Chlorophyll absorbs light in the visible spectrum.';

const sources = [
  {
    id: 'source-biology',
    title: 'Biology notes',
    status: 'ready',
    hasExtractedText: true,
  },
];
const sourceContents = {
  'source-biology': { text: biologyText },
};

const baseInput = {
  userId,
  notebookId,
  sources,
  sourceContents,
};

function fixedLoop(overrides = {}) {
  return createAdaptiveIntelligenceLoop({
    now: () => now,
    clock: () => 0,
    ...overrides,
  });
}

test('a verified answer, a miss, a correct retry and resume are a bounded loop', async () => {
  let retrievalCalls = 0;
  const loop = fixedLoop({
    retrieveSourceEvidence: (input) => {
      retrievalCalls += 1;
      return runNotebookTurn(input);
    },
  });

  const first = await loop.run({
    ...baseInput,
    event: { type: 'question', question: 'What does chlorophyll absorb?' },
  });
  assert.equal(first.status, 'awaiting_response');
  assert.equal(first.answered, true);
  assert.equal(first.answer, chlorophyllQuote);
  assert.equal(first.adaptive.currentAction, 'verify_understanding');
  assert.ok(first.adaptive.sourceFacts.length >= 1);
  assert.equal(
    first.adaptive.sourceFacts.some(
      (fact) => fact.citation.quote === chlorophyllQuote
    ),
    true
  );
  assert.equal(first.adaptive.assessmentEvidence.length, 0);
  assert.equal(first.adaptive.measured.citationVerified, true);
  assert.equal(first.adaptive.measured.keywordOverlap > 0, true);
  assert.equal(first.practice.answer, 'Chlorophyll');
  assert.equal(first.nextAction.target, 'practice');
  assert.equal(retrievalCalls, 1);

  const wrong = await loop.run({
    ...baseInput,
    event: { type: 'practice_response', response: 'oxygen' },
    previousContext: first.context,
  });
  assert.equal(wrong.status, 'awaiting_response');
  assert.equal(wrong.correct, false);
  assert.equal(wrong.adaptive.currentAction, 'retrieve_source_evidence');
  assert.equal(wrong.adaptive.assessmentEvidence.length, 1);
  assert.equal(wrong.adaptive.assessmentEvidence[0].correct, false);
  assert.equal(wrong.adaptive.generatedExplanations.length, 0);
  assert.equal(wrong.adaptive.hypotheses.length, 1);
  assert.doesNotMatch(wrong.feedbackMessage, /Chlorophyll/);
  assert.equal(wrong.nextAction.target, 'evidence');
  assert.equal(retrievalCalls, 1);

  const correct = await loop.run({
    ...baseInput,
    event: { type: 'practice_response', response: 'Chlorophyll' },
    previousContext: wrong.context,
  });
  assert.equal(correct.status, 'complete');
  assert.equal(correct.correct, true);
  assert.equal(correct.adaptive.currentAction, 'summarize_or_save');
  assert.equal(correct.adaptive.assessmentEvidence.length, 2);
  assert.equal(correct.adaptive.assessmentEvidence[1].correct, true);
  assert.match(correct.adaptive.summary, /not evidence of mastery/i);
  assert.equal(correct.adaptive.measured.practiceCorrect, true);

  const resume = await loop.run({
    ...baseInput,
    event: { type: 'resume' },
    previousContext: correct.context,
  });
  assert.equal(resume.status, 'complete');
  assert.match(resume.adaptive.summary, /No additional adaptive action/i);
  assert.equal(retrievalCalls, 1);
});

test('a second miss shows a verified worked example and stops; a third miss does not repeat it', async () => {
  const loop = fixedLoop();
  const first = await loop.run({
    ...baseInput,
    event: { type: 'question', question: 'What does chlorophyll absorb?' },
  });
  const wrongOne = await loop.run({
    ...baseInput,
    event: { type: 'practice_response', response: 'oxygen' },
    previousContext: first.context,
  });
  const wrongTwo = await loop.run({
    ...baseInput,
    event: { type: 'practice_response', response: 'oxygen' },
    previousContext: wrongOne.context,
  });

  assert.equal(wrongTwo.status, 'blocked');
  assert.equal(wrongTwo.correct, false);
  assert.equal(wrongTwo.adaptive.currentAction, 'provide_worked_example');
  assert.equal(wrongTwo.adaptive.generatedExplanations.length, 1);
  assert.match(wrongTwo.workedExample.text, /Chlorophyll absorbs light/);
  assert.match(wrongTwo.workedExample.text, /Chlorophyll/);
  assert.equal(
    wrongTwo.workedExample.citation.quote,
    chlorophyllQuote
  );
  assert.equal(wrongTwo.adaptive.unresolvedQuestions.length, 1);
  assert.equal(wrongTwo.adaptive.measured.workedExampleShown, true);

  const wrongThree = await loop.run({
    ...baseInput,
    event: { type: 'practice_response', response: 'oxygen' },
    previousContext: wrongTwo.context,
  });
  assert.equal(wrongThree.status, 'blocked');
  assert.equal(wrongThree.adaptive.currentAction, 'summarize_or_save');
  assert.equal(wrongThree.adaptive.generatedExplanations.length, 1);
  assert.match(wrongThree.adaptive.summary, /stopped after repeated misses/i);
});

test('an unrelated source sentence is rejected as an answer, not displayed', async () => {
  const unrelatedCitation = {
    sourceId: 'source-weather',
    quote: 'The sky is blue.',
    locator: { kind: 'offset', start: 0, end: 16 },
  };
  const unrelatedSource = {
    id: 'source-weather',
    title: 'Weather notes',
    status: 'ready',
    hasExtractedText: true,
  };
  const loop = fixedLoop({
    retrieveSourceEvidence: () => ({
      ok: true,
      answered: true,
      answer: 'The sky is blue.',
      citation: unrelatedCitation,
      sourceId: 'source-weather',
      sourceTitle: 'Weather notes',
      results: [],
    }),
  });

  const result = await loop.run({
    userId,
    notebookId,
    sources: [unrelatedSource],
    sourceContents: { 'source-weather': { text: 'The sky is blue.' } },
    event: { type: 'question', question: 'What does chlorophyll absorb?' },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.answered, false);
  assert.equal(result.answer, null);
  assert.equal(result.visual, null);
  assert.equal(result.practice, null);
  assert.match(result.message, /did not share a query term/i);
  assert.equal(
    result.adaptive.experimentalResults[0].outcome,
    'irrelevant_source'
  );
  assert.equal(result.adaptive.unresolvedQuestions.length, 1);
});

test('failed retrieval retries once, reports failure and keeps learner text out of logs', async () => {
  let calls = 0;
  const loop = fixedLoop({
    retrieveSourceEvidence: () => {
      calls += 1;
      throw new Error('provider secret and chlorophyll question');
    },
  });

  const result = await loop.run({
    ...baseInput,
    event: { type: 'question', question: 'What does chlorophyll absorb?' },
    limits: { maxActionAttempts: 2, timeoutMs: 500, overallTimeoutMs: 2000 },
  });

  assert.equal(calls, 2);
  assert.equal(result.status, 'failed');
  assert.equal(result.answered, false);
  assert.equal(result.errorCode, 'retrieval_failed');
  assert.equal(result.adaptive.unresolvedQuestions.length, 1);
  assert.equal(result.report.logs.length, 2);
  assert.equal(
    result.report.logs.every((entry) => entry.outcome === 'failed'),
    true
  );
  const serializedLogs = JSON.stringify(result.report.logs);
  assert.doesNotMatch(serializedLogs, /chlorophyll/i);
  assert.doesNotMatch(serializedLogs, /secret/i);
  assert.doesNotMatch(serializedLogs, /provider/i);
});

test('a hanging adapter times out within the configured budget', async () => {
  let calls = 0;
  const loop = fixedLoop({
    retrieveSourceEvidence: () => {
      calls += 1;
      return new Promise(() => {});
    },
  });
  const started = Date.now();
  const result = await loop.run({
    ...baseInput,
    event: { type: 'question', question: 'What does chlorophyll absorb?' },
    limits: { maxActionAttempts: 2, timeoutMs: 15, overallTimeoutMs: 100 },
  });
  const elapsed = Date.now() - started;

  assert.equal(calls, 2);
  assert.ok(elapsed < 500, `expected a bounded timeout, got ${elapsed}ms`);
  assert.equal(result.status, 'failed');
  assert.equal(result.errorCode, 'retrieval_timeout');
  assert.equal(
    result.report.logs.filter((entry) => entry.outcome === 'timed_out').length,
    2
  );
});

test('invalid visualization data is dropped while a verified answer continues', async () => {
  const loop = fixedLoop({
    retrieveSourceEvidence: (input) => {
      const result = runNotebookTurn(input);
      const badQuote = 'This sentence is not in the source.';
      return {
        ...result,
        visual: {
          ...result.visual,
          items: [
            {
              ...result.visual.items[0],
              quote: badQuote,
              citation: {
                ...result.visual.items[0].citation,
                quote: badQuote,
              },
            },
          ],
        },
      };
    },
  });

  const result = await loop.run({
    ...baseInput,
    event: { type: 'question', question: 'What does chlorophyll absorb?' },
  });

  assert.equal(result.answered, true);
  assert.equal(result.status, 'awaiting_response');
  assert.equal(result.visual, null);
  assert.equal(result.adaptive.measured.visualStatus, 'invalid');
  assert.equal(
    result.adaptive.uncertainties.some((item) =>
      /visualization failed validation/i.test(item)
    ),
    true
  );
  assert.notEqual(result.practice, null);
});

test('permission checks and cancellation prevent retrieval', async () => {
  let calls = 0;
  const loop = fixedLoop({
    retrieveSourceEvidence: () => {
      calls += 1;
      return { ok: false, answered: false, results: [] };
    },
  });

  const noAccess = await loop.run({
    sources,
    sourceContents,
    event: { type: 'question', question: 'What does chlorophyll absorb?' },
  });
  assert.equal(noAccess.status, 'blocked');
  assert.equal(noAccess.errorCode, 'permission_denied');
  assert.equal(calls, 0);

  const controller = new AbortController();
  controller.abort();
  const cancelled = await loop.run({
    ...baseInput,
    event: { type: 'question', question: 'What does chlorophyll absorb?' },
    signal: controller.signal,
  });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(calls, 0);
});

test('the action limit stops a retry loop even when the adapter keeps failing', async () => {
  let calls = 0;
  const loop = fixedLoop({
    retrieveSourceEvidence: () => {
      calls += 1;
      throw new Error('adapter failure');
    },
  });

  const result = await loop.run({
    ...baseInput,
    event: { type: 'question', question: 'What does chlorophyll absorb?' },
    limits: {
      maxSteps: 1,
      maxActionAttempts: 2,
      timeoutMs: 500,
      overallTimeoutMs: 2000,
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.status, 'failed');
  assert.equal(result.errorCode, 'step_limit');
  assert.equal(
    result.report.logs.some((entry) => entry.outcome === 'skipped_step_limit'),
    true
  );
});

test('adaptive state persists, supports corrections and drops stale quotations', async () => {
  const loop = fixedLoop();
  const first = await loop.run({
    ...baseInput,
    event: { type: 'question', question: 'What does chlorophyll absorb?' },
  });

  const corrected = recordAdaptiveCorrection({
    adaptive: first.adaptive,
    text: 'The learner clarified that the question was about visible light.',
    now,
  });
  assert.equal(corrected.corrections.length, 1);

  const store = createNotebookContextStore(new MemoryStorage());
  const saved = store.save(userId, notebookId, {
    ...first.context,
    adaptive: corrected,
  });
  assert.equal(saved.adaptive.status, 'awaiting_response');
  assert.ok(saved.adaptive.sourceFacts.length >= 1);
  assert.equal(saved.adaptive.corrections.length, 1);

  const loaded = store.load(userId, notebookId);
  assert.equal(
    loaded.adaptive.sourceFacts.some(
      (fact) => fact.citation.quote === chlorophyllQuote
    ),
    true
  );

  const cleaned = revalidateLearningContext(saved, {
    sources: [],
    sourceContents: {},
  });
  assert.equal(cleaned.answer, null);
  assert.equal(cleaned.practice, null);
  assert.equal(cleaned.adaptive.sourceFacts.length, 0);
  assert.equal(
    cleaned.adaptive.uncertainties.some((item) =>
      /no longer verifies/i.test(item)
    ),
    true
  );
});
