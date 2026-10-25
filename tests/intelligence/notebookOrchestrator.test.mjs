import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPracticeQuestion,
  buildSourceEvidenceVisual,
  createNotebookOrchestrator,
  evaluatePracticeResponse,
  runNotebookTurn,
} from '../../src/intelligence/notebookOrchestrator.mjs';
import { NEXT_ACTION_IDS } from '../../src/intelligence/learningContext.mjs';
import { validateCitation } from '../../src/notebooks/citations.mjs';

const biologyText =
  'Photosynthesis converts light energy into chemical energy. Chlorophyll absorbs light in the visible spectrum.';
const chlorophyllQuote =
  'Chlorophyll absorbs light in the visible spectrum.';
const electricityText =
  'Electricity flows through a closed circuit when a battery creates a potential difference. A lamp converts electrical energy into light.';

const biologySource = {
  id: 'source-biology',
  title: 'Biology notes',
  status: 'ready',
  hasExtractedText: true,
};
const electricitySource = {
  id: 'source-electricity',
  title: 'Electricity notes',
  status: 'ready',
  hasExtractedText: true,
};

const sourceContents = {
  'source-biology': {
    text: biologyText,
    pageOffsets: [{ page: 1, start: 0, end: biologyText.length }],
  },
  'source-electricity': {
    text: electricityText,
    pageOffsets: [{ page: 1, start: 0, end: electricityText.length }],
  },
};

const now = '2026-10-20T10:00:00.000Z';

test('one turn produces a verified answer, evidence map, practice and next action', () => {
  const result = runNotebookTurn({
    userId: 'user-1',
    notebookId: 'notebook-1',
    question: 'What does chlorophyll absorb?',
    sources: [biologySource],
    sourceContents,
    now,
  });

  assert.equal(result.ok, true);
  assert.equal(result.answered, true);
  assert.equal(result.answer, chlorophyllQuote);
  assert.equal(result.sourceTitle, 'Biology notes');
  assert.equal(
    validateCitation(result.citation, {
      sourceIds: [biologySource.id],
      sourceTexts: { [biologySource.id]: biologyText },
      requireSourceText: true,
    }).ok,
    true
  );

  assert.equal(result.visual.kind, 'source_evidence_map');
  assert.equal(result.visual.items.length > 0, true);
  assert.equal(result.visual.items[0].quote, chlorophyllQuote);
  assert.ok(result.visual.limitations.length > 0);
  assert.match(
    result.visual.limitations.join(' '),
    /contains the answer quotation/i
  );
  assert.match(result.visual.accessibilityDescription, /Chlorophyll/);
  assert.doesNotMatch(result.visual.accessibilityDescription, /undefined/);
  assert.equal(result.relatedVisual, null);
  assert.equal(result.practice.answer, 'Chlorophyll');
  assert.match(result.practice.prompt, /_____/);
  assert.equal(result.nextAction.id, NEXT_ACTION_IDS.ANSWER_PRACTICE);
  assert.equal(result.context.practice.answer, 'Chlorophyll');
  assert.equal(result.context.visual.kind, 'source_evidence_map');
  assert.equal(result.context.evidence.length > 0, true);
  assert.equal(result.context.currentQuestion, 'What does chlorophyll absorb?');
});

test('a wrong practice answer recommends evidence review; a correct retry advances', () => {
  const turn = runNotebookTurn({
    userId: 'user-1',
    notebookId: 'notebook-1',
    question: 'What does chlorophyll absorb?',
    sources: [biologySource],
    sourceContents,
    now,
  });

  const wrong = evaluatePracticeResponse({
    context: turn.context,
    response: 'oxygen',
    now: '2026-10-20T10:01:00.000Z',
  });
  assert.equal(wrong.ok, true);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.nextAction.id, NEXT_ACTION_IDS.REVIEW_EVIDENCE);
  assert.equal(wrong.context.practice.attempts.length, 1);
  assert.equal(wrong.context.practice.lastResult.correct, false);

  const correct = evaluatePracticeResponse({
    context: wrong.context,
    response: ' chlorophyll ',
    now: '2026-10-20T10:02:00.000Z',
  });
  assert.equal(correct.correct, true);
  assert.equal(correct.nextAction.id, NEXT_ACTION_IDS.ASK_FOLLOWUP);
  assert.equal(correct.context.practice.attempts.length, 2);
  assert.equal(correct.context.turns[0].practiceResult.correct, true);
});

test('a pronoun follow-up retrieves the prior topic from saved context', () => {
  const first = runNotebookTurn({
    userId: 'user-1',
    notebookId: 'notebook-1',
    question: 'What does chlorophyll absorb?',
    sources: [biologySource],
    sourceContents,
    now,
  });

  const second = runNotebookTurn({
    userId: 'user-1',
    notebookId: 'notebook-1',
    question: 'What does it absorb?',
    sources: [biologySource],
    sourceContents,
    previousContext: first.context,
    now: '2026-10-20T10:03:00.000Z',
  });

  assert.equal(second.usedContextTerms.includes('chlorophyll'), true);
  assert.match(second.resolvedQuestion, /chlorophyll/i);
  assert.equal(second.answer, chlorophyllQuote);
  assert.equal(second.context.currentQuestion, 'What does it absorb?');
  assert.equal(second.context.turns.length, 2);
});

test('a topic with an authored process visual keeps it separate from source evidence', () => {
  const result = runNotebookTurn({
    userId: 'user-1',
    notebookId: 'notebook-1',
    question: 'How does electricity flow through a simple circuit?',
    sources: [electricitySource],
    sourceContents,
    now,
  });

  assert.equal(result.answered, true);
  assert.equal(result.visual.kind, 'source_evidence_map');
  assert.equal(result.relatedVisual.kind, 'curated');
  assert.equal(result.relatedVisual.id, 'electricity-circuit');
  assert.match(result.relatedVisual.description, /not generated from/i);

  const evaluated = evaluatePracticeResponse({
    context: result.context,
    response: result.practice.answer,
    now: '2026-10-20T10:04:00.000Z',
  });
  assert.equal(evaluated.correct, true);
  assert.equal(evaluated.nextAction.id, NEXT_ACTION_IDS.OPEN_RELATED_VISUAL);
});

test('no matching source sentence produces no invented answer, visual or practice', () => {
  const result = runNotebookTurn({
    userId: 'user-1',
    notebookId: 'notebook-1',
    question: 'What is the capital of France?',
    sources: [biologySource],
    sourceContents,
    now,
  });

  assert.equal(result.answered, false);
  assert.equal(result.answer, null);
  assert.equal(result.visual, null);
  assert.equal(result.practice, null);
  assert.equal(result.nextAction.id, NEXT_ACTION_IDS.ASK_ANOTHER_QUESTION);
});

test('no ready sources is an explicit prerequisite, not a fabricated turn', () => {
  const result = runNotebookTurn({
    userId: 'user-1',
    notebookId: 'notebook-1',
    question: 'What does chlorophyll absorb?',
    sources: [],
    sourceContents: {},
    now,
  });

  assert.equal(result.ok, false);
  assert.equal(result.answer, null);
  assert.equal(result.nextAction.id, NEXT_ACTION_IDS.ADD_SOURCES);
  assert.match(result.errors[0], /ready source/i);
});

test('a foreign saved context cannot be adopted by a different notebook', () => {
  const foreign = runNotebookTurn({
    userId: 'other-user',
    notebookId: 'other-notebook',
    question: 'What does chlorophyll absorb?',
    sources: [biologySource],
    sourceContents,
    now,
  });

  const result = runNotebookTurn({
    userId: 'user-1',
    notebookId: 'notebook-1',
    question: 'What does chlorophyll absorb?',
    sources: [biologySource],
    sourceContents,
    previousContext: foreign.context,
    now,
  });

  assert.equal(result.context.userId, 'user-1');
  assert.equal(result.context.notebookId, 'notebook-1');
  assert.equal(result.context.turns.length, 1);
  assert.equal(result.usedContextTerms.length, 0);
});

test('a citation that does not match the source is rejected before display', () => {
  const orchestrator = createNotebookOrchestrator({
    answerQuestion: () => ({
      ok: true,
      answered: true,
      answer: 'A fabricated sentence.',
      citation: {
        sourceId: biologySource.id,
        quote: 'A fabricated sentence.',
        locator: { kind: 'offset', start: 0, end: 21 },
      },
      sourceId: biologySource.id,
      sourceTitle: 'Biology notes',
      page: 1,
      note: '',
      results: [],
    }),
  });

  const result = orchestrator.runTurn({
    userId: 'user-1',
    notebookId: 'notebook-1',
    question: 'What does chlorophyll absorb?',
    sources: [biologySource],
    sourceContents,
    now,
  });

  assert.equal(result.ok, false);
  assert.equal(result.answered, false);
  assert.equal(result.answer, null);
  assert.equal(result.visual, null);
  assert.match(result.errors[0], /could not be verified/i);
});

test('practice generation uses an exact word from the answer and refuses empty spans', () => {
  const citation = {
    sourceId: 'source-biology',
    quote: chlorophyllQuote,
    locator: {
      kind: 'offset',
      start: biologyText.indexOf(chlorophyllQuote),
      end: biologyText.indexOf(chlorophyllQuote) + chlorophyllQuote.length,
    },
  };
  const practice = buildPracticeQuestion({
    question: 'What does chlorophyll absorb?',
    answer: chlorophyllQuote,
    sourceTitle: 'Biology notes',
    page: 1,
    citation,
  });
  assert.equal(practice.answer, 'Chlorophyll');
  assert.equal(
    buildPracticeQuestion({
      question: 'What?',
      answer: '...',
      citation,
    }),
    null
  );
});

test('evidence map construction rejects a citation outside the source', () => {
  const visual = buildSourceEvidenceVisual({
    question: 'What does chlorophyll absorb?',
    answer: {
      text: 'A fabricated sentence.',
      sourceTitle: 'Biology notes',
      page: 1,
      citation: {
        sourceId: 'source-biology',
        quote: 'A fabricated sentence.',
        locator: { kind: 'offset', start: 0, end: 21 },
      },
    },
    sources: [biologySource],
    sourceContents,
  });
  assert.equal(visual, null);
});
