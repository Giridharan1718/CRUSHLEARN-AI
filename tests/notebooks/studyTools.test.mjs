import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCitation } from '../../src/notebooks/citations.mjs';
import {
  buildExtractiveSummary,
  buildFlashcards,
  buildQuiz,
  buildStudyKit,
  checkQuizAnswer,
  formatStudyKitForStorage,
  normalizeQuizAnswer,
} from '../../src/notebooks/studyTools.mjs';

const biology = [
  'Photosynthesis is the process by which plants convert light energy into chemical energy.',
  'Chlorophyll is the green pigment that absorbs light in the visible spectrum.',
  'The Calvin cycle uses ATP and NADPH to build sugars from carbon dioxide.',
].join(' ');

const economics = [
  'Demand is the quantity of a good that buyers are willing and able to purchase.',
  'A market price coordinates buyers and sellers when supply and demand meet.',
].join(' ');

const sources = [
  {
    id: 'source-biology',
    title: 'Biology notes',
    status: 'ready',
    hasExtractedText: true,
  },
  {
    id: 'source-economics',
    title: 'Economics notes',
    status: 'ready',
    hasExtractedText: true,
  },
];

const sourceContents = {
  'source-biology': { text: biology, pageOffsets: [] },
  'source-economics': { text: economics, pageOffsets: [] },
};

const sourceTexts = {
  'source-biology': biology,
  'source-economics': economics,
};
const sourceIds = sources.map((source) => source.id);

function assertVerified(citation) {
  const result = validateCitation(citation, {
    sourceIds,
    sourceTexts,
    requireSourceText: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.verified, true);
}

test('extractive summaries quote only source text and keep verified citations', () => {
  const summary = buildExtractiveSummary({
    sources,
    sourceContents,
    maxSentences: 5,
  });

  assert.ok(summary);
  assert.equal(summary.generator, 'local_extractive');
  assert.ok(summary.sentences.length >= 2);
  assert.ok(summary.sentences.length <= 5);
  assert.ok(summary.sentences.some((sentence) => /Photosynthesis/.test(sentence.text)));
  assert.ok(summary.sentences.some((sentence) => /Demand/.test(sentence.text)));

  summary.sentences.forEach((sentence) => {
    assert.ok(sourceTexts[sentence.sourceId].includes(sentence.text));
    assertVerified(sentence.citation);
  });
  summary.citations.forEach(assertVerified);
});

test('flashcards contain definition and recall prompts with exact answers', () => {
  const cards = buildFlashcards({
    sources,
    sourceContents,
    maxCards: 8,
  });

  assert.ok(cards.length >= 3);
  assert.ok(cards.some((card) => card.type === 'definition'));
  assert.ok(cards.some((card) => card.front.includes('Define: Photosynthesis')));
  assert.ok(cards.some((card) => card.front.includes('Define: Demand')));

  cards.forEach((card) => {
    assert.ok(card.front);
    assert.ok(card.back);
    assert.ok(sourceTexts[card.citation.sourceId].includes(card.back));
    assertVerified(card.citation);
  });
});

test('quiz questions are generated from source spans and check exact answers', () => {
  const quiz = buildQuiz({
    sources,
    sourceContents,
    maxQuestions: 6,
  });

  assert.ok(quiz.length >= 3);
  quiz.forEach((question) => {
    assert.match(question.prompt, /^Fill in the blank:/);
    assert.ok(question.answer);
    assert.ok(question.prompt.includes('_____'));
    assert.ok(sourceTexts[question.citation.sourceId].includes(question.explanation));
    assertVerified(question.citation);
    assert.equal(checkQuizAnswer(question, question.answer), true);
    assert.equal(checkQuizAnswer(question, ` ${question.answer.toUpperCase()}! `), true);
    assert.equal(checkQuizAnswer(question, 'definitely wrong'), false);
  });

  assert.equal(normalizeQuizAnswer('  The Light! '), 'light');
});

test('a study kit is complete, labelled local extractive, and storable as text', () => {
  const result = buildStudyKit({
    sources,
    sourceContents,
    now: '2026-10-20T10:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.kit.generator, 'local_extractive');
  assert.ok(result.kit.summary);
  assert.ok(result.kit.flashcards.length > 0);
  assert.ok(result.kit.quiz.length > 0);
  assert.ok(result.kit.citations.length > 0);

  const stored = formatStudyKitForStorage(result.kit);
  assert.match(stored, /LOCAL EXTRACTIVE STUDY KIT/);
  assert.match(stored, /SUMMARY/);
  assert.match(stored, /FLASHCARDS/);
  assert.match(stored, /RECALL QUIZ/);
  assert.match(stored, /Biology notes/);
});

test('empty or failed sources produce no invented study kit', () => {
  const result = buildStudyKit({
    sources: [
      {
        id: 'failed',
        title: 'Failed scan',
        status: 'failed',
        hasExtractedText: false,
      },
    ],
    sourceContents: {},
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /ready source/i);
  assert.equal(result.kit, null);
  assert.equal(
    buildExtractiveSummary({ sources: [], sourceContents: {} }),
    null
  );
  assert.deepEqual(buildFlashcards({ sources: [], sourceContents: {} }), []);
  assert.deepEqual(buildQuiz({ sources: [], sourceContents: {} }), []);
});

test('long and non-English text remains bounded and citation-verifiable', () => {
  const longText = `${'A long explanation about cells and energy. '.repeat(25)}The end.`;
  const longSources = [
    {
      id: 'long-source',
      title: 'Long notes',
      status: 'ready',
      hasExtractedText: true,
    },
  ];
  const contents = { 'long-source': { text: longText } };
  const summary = buildExtractiveSummary({
    sources: longSources,
    sourceContents: contents,
    maxSentences: 3,
  });

  assert.ok(summary);
  summary.sentences.forEach((sentence) => {
    assert.ok(sentence.text.length <= 420);
    const verified = validateCitation(sentence.citation, {
      sourceIds: ['long-source'],
      sourceTexts: { 'long-source': longText },
      requireSourceText: true,
    });
    assert.equal(verified.ok, true);
  });
});
