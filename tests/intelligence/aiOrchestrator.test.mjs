import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyTask,
  listCapabilities,
  orchestrateLearningRequest,
  orchestrateLearningRequestAsync,
} from '../../src/ai/orchestrator.mjs';
import { explainSelection } from '../../src/notebooks/textExplanation.mjs';

const SOURCE_TEXT =
  'Chlorophyll absorbs light in the visible spectrum. Photosynthesis converts light energy into chemical energy.';
const SOURCE = {
  id: 'source-biology',
  title: 'Biology notes',
  status: 'ready',
  hasExtractedText: true,
  characterCount: SOURCE_TEXT.length,
  sourceType: 'pasted_text',
};
const SOURCE_CONTENTS = {
  [SOURCE.id]: { text: SOURCE_TEXT, pageOffsets: [] },
};

const BASE = {
  userId: 'user-1',
  notebookId: 'notebook-1',
  sources: [SOURCE],
  sourceContents: SOURCE_CONTENTS,
};

const SECOND_SOURCE = {
  id: 'source-paper',
  title: 'Paper notes',
  status: 'ready',
  hasExtractedText: true,
  characterCount: 120,
  sourceType: 'pasted_text',
};
const SECOND_TEXT =
  'A separate study reports that chlorophyll absorbs mainly blue and red light. Its sample was small.';
const SECOND_CONTENTS = {
  [SECOND_SOURCE.id]: { text: SECOND_TEXT, pageOffsets: [] },
};

test('a simple factual question calls only source retrieval', () => {
  const envelope = orchestrateLearningRequest({
    ...BASE,
    question: 'What does chlorophyll absorb?',
  });

  assert.equal(envelope.ok, true);
  assert.equal(envelope.status, 'completed');
  assert.equal(envelope.task.id, 'ask');
  assert.equal(envelope.workflow, 'source_grounded_qa');
  assert.deepEqual(envelope.servicesUsed, ['document_retrieval']);
  assert.match(envelope.data.answer, /Chlorophyll absorbs light/);
  assert.equal(envelope.data.citation.sourceId, SOURCE.id);
  assert.equal(envelope.evidence.source.length >= 1, true);
  assert.equal(envelope.metrics.serviceCalls, 1);
  assert.equal(envelope.metrics.providerCalls, 0);
});

test('a simple explanation does not invoke retrieval or assessment', () => {
  const envelope = orchestrateLearningRequest({
    ...BASE,
    task: 'explain',
    text: SOURCE_TEXT,
    level: 'eli5',
  });

  assert.equal(envelope.ok, true);
  assert.equal(envelope.workflow, 'direct_explanation');
  // The explanation service and the visual service. Neither touches the
  // learner's sources and neither is an assessment.
  assert.deepEqual(envelope.servicesUsed, [
    'text_understanding',
    'visual_learning',
  ]);
  assert.equal(
    envelope.servicesUsed.includes('document_retrieval'),
    false
  );
  assert.equal(envelope.servicesUsed.includes('assessment'), false);
  assert.equal(envelope.data.explanation.level, 'eli5');
  assert.equal(envelope.data.explanation.segments.length > 0, true);
  assert.equal(envelope.metrics.serviceCalls, 2);
});

test('an explanation reports the visual plan and whether a curated visual exists', () => {
  const envelope = orchestrateLearningRequest({
    ...BASE,
    task: 'explain',
    text: SOURCE_TEXT,
    level: 'eli5',
  });

  assert.ok(envelope.data.visualPlan);
  assert.ok(envelope.data.curatedVisual);
  // The curated visual is either available with an id, or unavailable with
  // a recommendation. It is never presented as source evidence.
  if (envelope.data.curatedVisual.available) {
    assert.equal(typeof envelope.data.curatedVisual.id, 'string');
  } else {
    assert.equal(envelope.data.curatedVisual.kind, 'unavailable');
    assert.ok(envelope.data.curatedVisual.recommendation.reason);
  }
});

test('ELI5 and ELI10 produce different levels from the same selection', () => {
  const eli5 = orchestrateLearningRequest({ ...BASE, task: 'explain', text: SOURCE_TEXT, level: 'eli5' });
  const eli10 = orchestrateLearningRequest({ ...BASE, task: 'explain', text: SOURCE_TEXT, level: 'eli10' });
  assert.equal(eli5.data.explanation.level, 'eli5');
  assert.equal(eli10.data.explanation.level, 'eli10');
  assert.notEqual(eli5.data.explanation.levelNote, eli10.data.explanation.levelNote);
});

test('a teach-me request becomes a guided explanation with practice', () => {
  const envelope = orchestrateLearningRequest({
    ...BASE,
    task: 'explain',
    question: 'Teach me this passage',
    text: SOURCE_TEXT,
    level: 'eli10',
  });

  assert.equal(envelope.workflow, 'guided_explanation');
  assert.deepEqual(envelope.servicesUsed, ['tutoring']);
  assert.equal(envelope.status, 'partial');
  assert.ok(envelope.data.tutoring.explanation);
  assert.ok(Array.isArray(envelope.data.tutoring.practice.questions));
  assert.ok(envelope.data.tutoring.nextStrategy.strategy);
  assert.ok(envelope.limitations.some((note) => /not an adaptive model tutor/i.test(note)));
});

test('a research request produces a plan and states that no external search ran', () => {
  const envelope = orchestrateLearningRequest({
    ...BASE,
    task: 'research',
    question: 'How does chlorophyll absorb light?',
  });

  assert.equal(envelope.workflow, 'research_plan');
  assert.deepEqual(envelope.servicesUsed, ['research']);
  assert.equal(envelope.data.research.externalSearch.performed, false);
  assert.equal(envelope.data.research.externalSearch.available, false);
  assert.ok(envelope.unavailable.includes('external literature search'));
  assert.equal(envelope.status, 'partial');
});

test('a compare request compares verified passages from at least two sources', () => {
  const envelope = orchestrateLearningRequest({
    ...BASE,
    sources: [SOURCE, SECOND_SOURCE],
    sourceContents: { ...SOURCE_CONTENTS, ...SECOND_CONTENTS },
    task: 'research',
    question: 'Compare the sources on what chlorophyll absorbs',
  });

  assert.equal(envelope.workflow, 'evidence_verification');
  assert.deepEqual(envelope.servicesUsed, ['research.compare']);
  assert.ok(envelope.data.comparison.rows.length >= 2);
  envelope.data.comparison.rows.forEach((row) => {
    assert.ok(row.citation);
    assert.ok(row.quote.length > 0);
  });
});

test('a writing request returns a citation plan, not generated prose', () => {
  const envelope = orchestrateLearningRequest({
    ...BASE,
    task: 'write',
    question: 'Write an outline about chlorophyll absorption',
  });

  assert.equal(envelope.workflow, 'writing_outline');
  assert.deepEqual(envelope.servicesUsed, ['writing']);
  assert.equal(envelope.data.writing.drafting.available, false);
  assert.ok(envelope.data.writing.citationPlan.length >= 1);
  assert.ok(envelope.unavailable.includes('model-written draft'));
});

test('verification is deterministic and reports the checks it ran', () => {
  const explanation = explainSelection({
    text: 'The mass is 5 kg and 2 + 2 = 4.',
    level: 'advanced',
  });
  const envelope = orchestrateLearningRequest({
    ...BASE,
    task: 'verify',
    text: 'The mass is 5 kg and 2 + 2 = 4.',
    explanation,
    citations: [],
  });

  assert.equal(envelope.workflow, 'evidence_verification');
  assert.deepEqual(envelope.servicesUsed, ['verification']);
  assert.equal(envelope.data.verification.ok, true);
  assert.ok(envelope.data.verification.checks.some((check) => check.id === 'simple_arithmetic'));
});

test('an unauthorized notebook request is blocked before any service runs', () => {
  const envelope = orchestrateLearningRequest({
    notebookId: 'notebook-1',
    question: 'What does chlorophyll absorb?',
    sources: [SOURCE],
    sourceContents: SOURCE_CONTENTS,
  });

  assert.equal(envelope.ok, false);
  assert.equal(envelope.status, 'blocked');
  assert.deepEqual(envelope.servicesUsed, []);
  assert.match(envelope.errors[0], /signed-in learner/i);
  assert.equal(envelope.metrics.serviceCalls, 0);
});

test('a provider failure falls back to a verified extractive answer', async () => {
  const envelope = await orchestrateLearningRequestAsync({
    ...BASE,
    question: 'What does chlorophyll absorb?',
    allowModel: true,
    fetchImpl: async () => {
      throw new Error('gateway down');
    },
  });

  assert.equal(envelope.status, 'partial');
  assert.equal(envelope.data.generator, 'local_extractive');
  assert.match(envelope.data.answer, /Chlorophyll absorbs light/);
  assert.equal(envelope.data.citation.sourceId, SOURCE.id);
  assert.ok(
    envelope.limitations.some((note) => /AI gateway could not be used|not running/i.test(note))
  );
  assert.equal(envelope.metrics.providerCalls, 0);
});

test('a provider answer is accepted only with verified citations and usage is recorded', async () => {
  const quote = 'Chlorophyll absorbs light in the visible spectrum.';
  const start = SOURCE_TEXT.indexOf(quote);
  let called = 0;

  const envelope = await orchestrateLearningRequestAsync({
    ...BASE,
    question: 'What does chlorophyll absorb?',
    allowModel: true,
    gateway: async () => {
      called += 1;
      return {
        ok: true,
        error: null,
        data: {
          answer: 'Chlorophyll absorbs visible light.',
          citations: [
            {
              sourceId: SOURCE.id,
              quote,
              locator: { kind: 'offset', start, end: start + quote.length },
            },
          ],
          generator: 'ai_grounded',
          model: 'test-model',
          usage: { input_tokens: 100, output_tokens: 20, cost_usd: 0.002 },
        },
      };
    },
  });

  assert.equal(called, 1);
  assert.equal(envelope.status, 'completed');
  assert.equal(envelope.servicesUsed[0], 'document_retrieval.grounded');
  assert.equal(envelope.data.generator, 'ai_grounded');
  assert.equal(envelope.model, 'test-model');
  assert.equal(envelope.metrics.providerCalls, 1);
  assert.equal(envelope.metrics.inputTokens, 100);
  assert.equal(envelope.metrics.costUsd, 0.002);
  assert.ok(envelope.interpretation.some((item) => item.kind === 'model_interpretation'));
});

test('a model answer with a bad citation is rejected by the fallback path', async () => {
  const envelope = await orchestrateLearningRequestAsync({
    ...BASE,
    question: 'What does chlorophyll absorb?',
    allowModel: true,
    gateway: async () => ({
      ok: true,
      error: null,
      data: {
        answer: 'A fabricated claim.',
        citations: [
          {
            sourceId: SOURCE.id,
            quote: 'This quote is not in the source.',
            locator: { kind: 'offset', start: 0, end: 34 },
          },
        ],
        generator: 'ai_grounded',
        model: 'test-model',
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    }),
  });

  assert.equal(envelope.data.generator, 'local_extractive');
  assert.doesNotMatch(envelope.data.answer, /fabricated claim/i);
  assert.ok(envelope.limitations.some((note) => /citation|could not be verified/i.test(note)));
});

test('a question with no matching source is blocked honestly', () => {
  const envelope = orchestrateLearningRequest({
    ...BASE,
    question: 'What is the capital of France?',
  });
  assert.equal(envelope.ok, false);
  assert.equal(envelope.status, 'blocked');
  assert.ok(envelope.limitations.some((note) => /do(es)? not contain|No source passage/i.test(note)));
});

test('task classification honours explicit tasks and common wording', () => {
  assert.equal(classifyTask({ task: 'write' }).id, 'write');
  assert.equal(classifyTask({ question: 'Give me a practice question' }).id, 'practice');
  assert.equal(classifyTask({ question: 'Compare the sources on this claim' }).id, 'research');
  assert.equal(classifyTask({ question: 'Explain this like I am 5', text: 'x' }).id, 'explain');
  assert.equal(classifyTask({ question: 'What is chlorophyll?' }).id, 'ask');
});

test('the capability manifest does not advertise unimplemented model features as working', () => {
  const manifest = listCapabilities();
  const grounded = manifest.find((item) => item.service === 'document_retrieval.grounded');
  const research = manifest.find((item) => item.service === 'research');
  const writing = manifest.find((item) => item.service === 'writing');
  assert.equal(grounded.status, 'PARTIAL');
  assert.equal(research.status, 'PARTIAL');
  assert.equal(writing.status, 'PARTIAL');
});
