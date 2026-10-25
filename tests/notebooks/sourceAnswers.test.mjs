import test from 'node:test';
import assert from 'node:assert/strict';
import { answerFromNotebookSources } from '../../src/notebooks/sourceAnswers.mjs';

const sources = [
  {
    id: 'source-biology',
    title: 'Biology notes',
    status: 'ready',
    hasExtractedText: true,
  },
  {
    id: 'source-history',
    title: 'History notes',
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
  'source-history': {
    text: 'The printing press made books cheaper and spread ideas across Europe.',
    pageOffsets: [],
  },
  'source-failed': {
    text: 'This text must never be searched.',
    pageOffsets: [],
  },
};

test('an extractive answer quotes an exact source sentence with a verified page citation', () => {
  const result = answerFromNotebookSources({
    sources,
    sourceContents,
    question: 'What does chlorophyll absorb?',
  });

  assert.equal(result.ok, true);
  assert.equal(result.answered, true);
  assert.equal(
    result.answer,
    'Chlorophyll absorbs light in the visible spectrum.'
  );
  assert.equal(result.sourceTitle, 'Biology notes');
  assert.equal(result.page, 2);
  assert.equal(result.generator, 'local_extractive');
  assert.match(result.note, /not an AI-generated explanation/);
  assert.deepEqual(result.citation, {
    sourceId: 'source-biology',
    quote: 'Chlorophyll absorbs light in the visible spectrum.',
    locator: { kind: 'offset', start: 60, end: 110 },
  });
});

test('an unanswered question returns no answer instead of using outside knowledge', () => {
  const result = answerFromNotebookSources({
    sources,
    sourceContents,
    question: 'What is the capital of France?',
  });

  assert.equal(result.ok, true);
  assert.equal(result.answered, false);
  assert.equal(result.answer, null);
  assert.equal(result.citation, null);
  assert.match(result.message, /No source passage matched/);
});

test('extractive answers ignore failed sources and cross-source text', () => {
  const result = answerFromNotebookSources({
    sources,
    sourceContents,
    question: 'printing press books',
  });

  assert.equal(result.answered, true);
  assert.equal(result.sourceId, 'source-history');
  assert.match(result.answer, /printing press/i);
  assert.notEqual(result.sourceId, 'source-failed');
});

test('a short source passage still returns a verified whole-span answer', () => {
  const shortSources = [
    {
      id: 'short',
      title: 'Short note',
      status: 'ready',
      hasExtractedText: true,
    },
  ];
  const text = 'Walking on imported air';
  const result = answerFromNotebookSources({
    sources: shortSources,
    sourceContents: {
      short: { text, pageOffsets: [] },
    },
    question: 'imported air',
  });

  assert.equal(result.answered, true);
  assert.equal(result.answer, text);
  assert.deepEqual(result.citation, {
    sourceId: 'short',
    quote: text,
    locator: { kind: 'offset', start: 0, end: text.length },
  });
});

test('empty and unsearchable questions produce explicit errors', () => {
  const empty = answerFromNotebookSources({
    sources,
    sourceContents,
    question: '   ',
  });
  assert.equal(empty.ok, false);
  assert.match(empty.errors[0], /Enter a word or phrase/);

  const unsearchable = answerFromNotebookSources({
    sources,
    sourceContents,
    question: 'the and of',
  });
  assert.equal(unsearchable.ok, false);
  assert.match(unsearchable.errors[0], /no searchable terms/);
});

test('source text that contains markup is returned as data, not executed', () => {
  const maliciousSources = [
    {
      id: 'unsafe',
      title: 'Unsafe note',
      status: 'ready',
      hasExtractedText: true,
    },
  ];
  const text = '<script>alert(1)</script> is an HTML element example for learners.';
  const result = answerFromNotebookSources({
    sources: maliciousSources,
    sourceContents: { unsafe: { text, pageOffsets: [] } },
    question: 'script element',
  });

  assert.equal(result.answered, true);
  assert.equal(result.answer, text);
  assert.equal(typeof result.answer, 'string');
});
