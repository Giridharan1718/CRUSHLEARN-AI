import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage } from '../notebooks/memoryStorage.mjs';
import {
  NEXT_ACTION_IDS,
  applyTurnToContext,
  createEmptyLearningContext,
  normalizeLearningContext,
  revalidateLearningContext,
  resolveQuestionWithContext,
  selectNextAction,
} from '../../src/intelligence/learningContext.mjs';
import {
  getNotebookContextStorageKey,
  createNotebookContextStore,
} from '../../src/intelligence/notebookContextStore.mjs';

const biologyText =
  'Photosynthesis converts light energy into chemical energy. Chlorophyll absorbs light in the visible spectrum.';
const chlorophyllQuote =
  'Chlorophyll absorbs light in the visible spectrum.';

function makeCitation(quote, start) {
  return {
    sourceId: 'source-biology',
    quote,
    locator: { kind: 'offset', start, end: start + quote.length },
  };
}

function makeSources() {
  return [
    {
      id: 'source-biology',
      title: 'Biology notes',
      status: 'ready',
      hasExtractedText: true,
    },
  ];
}

function makeSourceContents() {
  return {
    'source-biology': {
      text: biologyText,
      pageOffsets: [{ page: 1, start: 0, end: biologyText.length }],
    },
  };
}

function makeTurn() {
  const citation = makeCitation(
    chlorophyllQuote,
    biologyText.indexOf(chlorophyllQuote)
  );
  return {
    id: 'turn-1',
    question: 'What does chlorophyll absorb?',
    resolvedQuestion: 'What does chlorophyll absorb?',
    usedContextTerms: [],
    answer: {
      text: chlorophyllQuote,
      citation,
      sourceTitle: 'Biology notes',
      page: 1,
      generator: 'local_extractive',
      note: 'Direct quotation.',
    },
    evidence: [
      {
        sourceId: 'source-biology',
        sourceTitle: 'Biology notes',
        page: 1,
        quote: chlorophyllQuote,
        citation,
      },
    ],
    visual: {
      kind: 'source_evidence_map',
      id: 'evidence-1',
      title: 'Source evidence map',
      description: 'One verified quotation.',
      question: 'What does chlorophyll absorb?',
      items: [
        {
          sourceId: 'source-biology',
          sourceTitle: 'Biology notes',
          page: 1,
          quote: chlorophyllQuote,
          citation,
        },
      ],
      limitations: ['Single-source answer.'],
      accessibilityDescription: 'One verified quotation.',
    },
    relatedVisual: null,
    practice: {
      id: 'practice-1',
      prompt: `Fill in the missing source wording: _____ absorbs light in the visible spectrum.`,
      answer: 'Chlorophyll',
      explanation: `The source says: ${chlorophyllQuote}`,
      sourceTitle: 'Biology notes',
      page: 1,
      citation,
      attempts: [],
      lastResult: null,
    },
    nextAction: {
      id: NEXT_ACTION_IDS.ANSWER_PRACTICE,
      title: 'Check your understanding',
      reason: 'A source-based recall question is ready.',
      target: 'practice',
    },
    at: '2026-10-20T10:00:00.000Z',
  };
}

test('a context normalizes only bounded, source-shaped records', () => {
  const context = applyTurnToContext(
    createEmptyLearningContext('user-1', 'notebook-1'),
    { ...makeTurn(), userId: 'user-1', notebookId: 'notebook-1' }
  );

  assert.equal(context.userId, 'user-1');
  assert.equal(context.notebookId, 'notebook-1');
  assert.equal(context.currentQuestion, 'What does chlorophyll absorb?');
  assert.equal(context.answer.text, chlorophyllQuote);
  assert.equal(context.evidence.length, 1);
  assert.equal(context.practice.answer, 'Chlorophyll');
  assert.equal(context.nextAction.id, NEXT_ACTION_IDS.ANSWER_PRACTICE);
  assert.equal(context.turns.length, 1);
  assert.equal(
    normalizeLearningContext(context, {
      userId: 'user-1',
      notebookId: 'notebook-1',
    }).answer.text,
    chlorophyllQuote
  );
  assert.equal(
    normalizeLearningContext(context, {
      userId: 'another-user',
      notebookId: 'notebook-1',
    }),
    null
  );
});

test('the context store round-trips, isolates users and clears', () => {
  const storage = new MemoryStorage();
  const store = createNotebookContextStore(storage);
  const context = applyTurnToContext(
    createEmptyLearningContext('user-1', 'notebook-1'),
    { ...makeTurn(), userId: 'user-1', notebookId: 'notebook-1' }
  );

  const saved = store.save('user-1', 'notebook-1', context);
  assert.equal(saved.currentQuestion, context.currentQuestion);
  assert.equal(store.load('user-1', 'notebook-1').answer.text, chlorophyllQuote);
  assert.equal(store.load('user-2', 'notebook-1'), null);

  storage.setItem(
    getNotebookContextStorageKey('user-1', 'notebook-2'),
    '{not valid json'
  );
  assert.equal(store.load('user-1', 'notebook-2'), null);

  store.clear('user-1', 'notebook-1');
  assert.equal(store.load('user-1', 'notebook-1'), null);
});

test('a pronoun follow-up uses prior topic terms without replacing the question', () => {
  const context = applyTurnToContext(
    createEmptyLearningContext('user-1', 'notebook-1'),
    { ...makeTurn(), userId: 'user-1', notebookId: 'notebook-1' }
  );
  const resolved = resolveQuestionWithContext(
    'What does it absorb?',
    context
  );

  assert.equal(resolved.originalQuestion, 'What does it absorb?');
  assert.deepEqual(resolved.usedContextTerms, ['chlorophyll']);
  assert.match(resolved.resolvedQuestion, /chlorophyll/i);

  const unrelated = resolveQuestionWithContext(
    'What is the capital of France?',
    context
  );
  assert.deepEqual(unrelated.usedContextTerms, []);
  assert.equal(unrelated.resolvedQuestion, 'What is the capital of France?');
});

test('next-action selection changes with evidence and practice results', () => {
  assert.equal(
    selectNextAction({ readySourceCount: 0 }).id,
    NEXT_ACTION_IDS.ADD_SOURCES
  );

  assert.equal(
    selectNextAction({
      readySourceCount: 1,
      answer: { ok: false, answered: false, results: [] },
    }).id,
    NEXT_ACTION_IDS.REVISE_QUESTION
  );

  assert.equal(
    selectNextAction({
      readySourceCount: 1,
      answer: { ok: true, answered: false, results: [{ text: 'passage' }] },
    }).id,
    NEXT_ACTION_IDS.INSPECT_MATCHES
  );

  assert.equal(
    selectNextAction({
      readySourceCount: 1,
      answer: { ok: true, answered: true },
      practice: { id: 'practice-1' },
    }).id,
    NEXT_ACTION_IDS.ANSWER_PRACTICE
  );

  assert.equal(
    selectNextAction({
      readySourceCount: 1,
      answer: { ok: true, answered: true },
      practice: { id: 'practice-1' },
      practiceResult: { correct: false },
    }).id,
    NEXT_ACTION_IDS.REVIEW_EVIDENCE
  );

  assert.equal(
    selectNextAction({
      readySourceCount: 1,
      answer: { ok: true, answered: true },
      practice: { id: 'practice-1' },
      practiceResult: { correct: true },
    }).id,
    NEXT_ACTION_IDS.ASK_FOLLOWUP
  );

  assert.equal(
    selectNextAction({
      readySourceCount: 1,
      answer: { ok: true, answered: true },
      practice: { id: 'practice-1' },
      practiceResult: { correct: true },
      relatedVisual: { id: 'electricity-circuit' },
    }).id,
    NEXT_ACTION_IDS.OPEN_RELATED_VISUAL
  );
});

test('stale citations are removed rather than displayed as verified context', () => {
  const context = applyTurnToContext(
    createEmptyLearningContext('user-1', 'notebook-1'),
    { ...makeTurn(), userId: 'user-1', notebookId: 'notebook-1' }
  );

  const valid = revalidateLearningContext(context, {
    sources: makeSources(),
    sourceContents: makeSourceContents(),
  });
  assert.equal(valid.answer.text, chlorophyllQuote);
  assert.equal(valid.evidence.length, 1);
  assert.equal(valid.practice.answer, 'Chlorophyll');

  const stale = revalidateLearningContext(context, {
    sources: [],
    sourceContents: {},
  });
  assert.equal(stale.answer, null);
  assert.equal(stale.evidence.length, 0);
  assert.equal(stale.practice, null);
  assert.equal(stale.visual, null);
  assert.equal(stale.nextAction.id, NEXT_ACTION_IDS.ADD_SOURCES);
});
