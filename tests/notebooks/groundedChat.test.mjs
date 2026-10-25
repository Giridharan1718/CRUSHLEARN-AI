import test from 'node:test';
import assert from 'node:assert/strict';
import {
  answerGroundedQuestion,
  buildHistory,
  toGatewaySpans,
  verifyCitations,
  GENERATOR_EXTRACTIVE,
  GENERATOR_GROUNDED,
} from '../../src/notebooks/groundedChat.mjs';

const sources = [
  {
    id: 'source-biology',
    title: 'Biology notes',
    status: 'ready',
    hasExtractedText: true,
  },
  {
    id: 'source-failed',
    title: 'Failed scan',
    status: 'failed',
    hasExtractedText: false,
  },
];

const biologyText =
  'Photosynthesis converts light energy into chemical energy.\n\nChlorophyll absorbs light in the visible spectrum.';

const sourceContents = {
  'source-biology': {
    text: biologyText,
    pageOffsets: [
      { page: 1, start: 0, end: 58 },
      { page: 2, start: 60, end: 110 },
    ],
  },
  'source-failed': {
    text: 'This text must never be searched.',
    pageOffsets: [],
  },
};

const biologySpan = {
  sourceId: 'source-biology',
  sourceTitle: 'Biology notes',
  text: 'Chlorophyll absorbs light in the visible spectrum.',
  start: 60,
  end: 110,
  page: 2,
};

test('a verified model answer is returned with its citations', async () => {
  const gateway = async () => ({
    ok: true,
    data: {
      answer: 'Chlorophyll absorbs light in the visible spectrum.',
      citations: [
        {
          sourceId: 'source-biology',
          quote: 'Chlorophyll absorbs light in the visible spectrum.',
          locator: { kind: 'offset', start: 60, end: 110 },
        },
      ],
      model: 'claude-opus-5-5',
      usage: { input_tokens: 100, output_tokens: 20 },
    },
  });

  const result = await answerGroundedQuestion({
    question: 'What does chlorophyll absorb?',
    sources,
    sourceContents,
    gateway,
  });

  assert.equal(result.ok, true);
  assert.equal(result.answered, true);
  assert.equal(result.generator, GENERATOR_GROUNDED);
  assert.equal(result.citations.length, 1);
  assert.equal(result.citations[0].sourceId, 'source-biology');
  assert.match(result.note, /re-checked against the stored source text/);
});

test('a citation that does not match the source text is rejected and the extractive answer is used', async () => {
  const gateway = async () => ({
    ok: true,
    data: {
      answer: 'Chlorophyll absorbs ultraviolet light from the sun.',
      citations: [
        {
          sourceId: 'source-biology',
          quote: 'Chlorophyll absorbs ultraviolet light from the sun.',
          locator: { kind: 'offset', start: 60, end: 110 },
        },
      ],
      model: 'claude-opus-5-5',
    },
  });

  const result = await answerGroundedQuestion({
    question: 'What does chlorophyll absorb?',
    sources,
    sourceContents,
    gateway,
  });

  assert.equal(result.answered, true);
  assert.equal(result.generator, GENERATOR_EXTRACTIVE);
  assert.notEqual(result.answer, 'Chlorophyll absorbs ultraviolet light from the sun.');
  assert.equal(result.answer, 'Chlorophyll absorbs light in the visible spectrum.');
  assert.match(result.note, /could not be verified/);
});

test('a model answer with no citation falls back to the extractive answer', async () => {
  const gateway = async () => ({
    ok: true,
    data: {
      answer: 'Chlorophyll absorbs light.',
      citations: [],
      model: 'claude-opus-5-5',
    },
  });

  const result = await answerGroundedQuestion({
    question: 'What does chlorophyll absorb?',
    sources,
    sourceContents,
    gateway,
  });

  assert.equal(result.generator, GENERATOR_EXTRACTIVE);
  assert.match(result.note, /did not cite any source passage/);
});

test('a citation pointing at a source outside the notebook is rejected', () => {
  const { accepted, rejected } = verifyCitations(
    [
      {
        sourceId: 'source-failed',
        quote: 'This text must never be searched.',
        locator: { kind: 'offset', start: 0, end: 33 },
      },
    ],
    { sources, sourceContents }
  );

  assert.equal(accepted.length, 0);
  assert.equal(rejected.length, 1);
});

test('an unreachable gateway falls back to the extractive answer', async () => {
  const gateway = async () => ({
    ok: false,
    data: null,
    error: 'The AI gateway is not running.',
  });

  const result = await answerGroundedQuestion({
    question: 'What does chlorophyll absorb?',
    sources,
    sourceContents,
    gateway,
  });

  assert.equal(result.answered, true);
  assert.equal(result.generator, GENERATOR_EXTRACTIVE);
  assert.match(result.note, /AI gateway is not running/);
});

test('a question the sources do not cover produces an honest unanswered turn', async () => {
  let called = false;
  const gateway = async () => {
    called = true;
    return { ok: true, data: { answer: 'x', citations: [] } };
  };

  const result = await answerGroundedQuestion({
    question: 'What is the capital of France?',
    sources,
    sourceContents,
    gateway,
  });

  assert.equal(called, false);
  assert.equal(result.ok, true);
  assert.equal(result.answered, false);
  assert.equal(result.answer, null);
  assert.match(result.note, /No source passage matched/);
});

test('a notebook with no ready source refuses to answer', async () => {
  const result = await answerGroundedQuestion({
    question: 'What does chlorophyll absorb?',
    sources: [sources[1]],
    sourceContents,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors[0], /ready source/);
});

test('an empty question is refused', async () => {
  const result = await answerGroundedQuestion({
    question: '   ',
    sources,
    sourceContents,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors[0], /Enter a question/);
});

test('failed sources are never searched', async () => {
  const result = await answerGroundedQuestion({
    question: 'This text must never be searched',
    sources,
    sourceContents,
  });

  assert.equal(result.answered, false);
  assert.match(result.note, /No source passage matched/);
});

test('gateway spans carry the offsets of the verified passage', () => {
  const spans = toGatewaySpans([
    {
      sourceId: 'source-biology',
      sourceTitle: 'Biology notes',
      text: 'Chlorophyll absorbs light in the visible spectrum.',
      page: 2,
      citation: { locator: { kind: 'offset', start: 60, end: 110 } },
    },
  ]);

  assert.equal(spans.length, 1);
  assert.equal(spans[0].start, 60);
  assert.equal(spans[0].end, 110);
  assert.equal(spans[0].page, 2);
});

test('history keeps only the most recent user and assistant turns', () => {
  const history = buildHistory([
    { role: 'user', content: 'first' },
    { role: 'system', content: 'ignored' },
    { role: 'assistant', content: 'second' },
    { role: 'user', content: '   ' },
    { role: 'user', content: 'third' },
  ]);

  assert.deepEqual(history, [
    { role: 'user', content: 'first' },
    { role: 'assistant', content: 'second' },
    { role: 'user', content: 'third' },
  ]);
});
