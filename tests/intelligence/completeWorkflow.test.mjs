import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage } from '../notebooks/memoryStorage.mjs';
import { createNotebookRepository } from '../../src/notebooks/notebookRepository.mjs';
import { ingestPastedSource } from '../../src/notebooks/sourceIngestion.mjs';
import {
  evaluatePracticeResponse,
  runNotebookTurn,
} from '../../src/intelligence/notebookOrchestrator.mjs';
import { NEXT_ACTION_IDS } from '../../src/intelligence/learningContext.mjs';

const userId = 'continuous-user';
const now = '2026-10-20T10:00:00.000Z';
const biologyText =
  'Photosynthesis converts light energy into chemical energy. Chlorophyll absorbs light in the visible spectrum.';
const chlorophyllQuote =
  'Chlorophyll absorbs light in the visible spectrum.';

function addScienceNotebook(repository) {
  const notebook = repository.createNotebook(userId, {
    title: 'Continuous learning test',
    description: 'One complete persisted source-learning cycle.',
  });
  const ingested = ingestPastedSource({
    notebookId: notebook.id,
    title: 'Photosynthesis notes',
    text: biologyText,
    now,
  });
  assert.equal(ingested.ok, true);
  repository.addSource(userId, notebook.id, {
    source: ingested.source,
    content: ingested.content,
  });
  return notebook;
}

test('the complete local learning cycle survives a reload and uses prior context', () => {
  const storage = new MemoryStorage();
  const repository = createNotebookRepository(storage);
  const notebook = addScienceNotebook(repository);
  const sources = repository.listSources(userId, notebook.id);
  const sourceContents = repository.listSourceContents(userId, notebook.id);

  const turn = runNotebookTurn({
    userId,
    notebookId: notebook.id,
    question: 'What does chlorophyll absorb?',
    sources,
    sourceContents,
    now,
  });
  assert.equal(turn.answered, true);
  assert.equal(turn.answer, chlorophyllQuote);
  assert.equal(turn.visual.kind, 'source_evidence_map');
  assert.equal(turn.nextAction.id, NEXT_ACTION_IDS.ANSWER_PRACTICE);

  const saved = repository.saveLearningContext(
    userId,
    notebook.id,
    turn.context,
    now
  );
  assert.equal(saved.currentQuestion, 'What does chlorophyll absorb?');
  assert.equal(saved.answer.text, chlorophyllQuote);

  const reloadedRepository = createNotebookRepository(storage);
  const reloadedContext = reloadedRepository.getLearningContext(
    userId,
    notebook.id
  );
  const reloadedSources = reloadedRepository.listSources(userId, notebook.id);
  const reloadedContents = reloadedRepository.listSourceContents(
    userId,
    notebook.id
  );

  assert.equal(reloadedContext.answer.text, chlorophyllQuote);
  assert.equal(reloadedContext.practice.answer, 'Chlorophyll');
  assert.equal(reloadedContext.nextAction.id, NEXT_ACTION_IDS.ANSWER_PRACTICE);

  const wrong = evaluatePracticeResponse({
    context: reloadedContext,
    response: 'oxygen',
    now: '2026-10-20T10:01:00.000Z',
  });
  assert.equal(wrong.correct, false);
  assert.equal(wrong.nextAction.id, NEXT_ACTION_IDS.REVIEW_EVIDENCE);
  reloadedRepository.saveLearningContext(
    userId,
    notebook.id,
    wrong.context,
    '2026-10-20T10:01:00.000Z'
  );

  const afterPractice = createNotebookRepository(storage).getLearningContext(
    userId,
    notebook.id
  );
  assert.equal(afterPractice.practice.attempts.length, 1);
  assert.equal(afterPractice.practice.lastResult.correct, false);
  assert.equal(afterPractice.nextAction.id, NEXT_ACTION_IDS.REVIEW_EVIDENCE);

  const followUp = runNotebookTurn({
    userId,
    notebookId: notebook.id,
    question: 'What does it absorb?',
    sources: reloadedSources,
    sourceContents: reloadedContents,
    previousContext: afterPractice,
    now: '2026-10-20T10:02:00.000Z',
  });
  assert.match(followUp.resolvedQuestion, /chlorophyll/i);
  assert.equal(followUp.answer, chlorophyllQuote);
  assert.equal(followUp.usedContextTerms.includes('chlorophyll'), true);

  const followUpContext = reloadedRepository.saveLearningContext(
    userId,
    notebook.id,
    followUp.context,
    '2026-10-20T10:02:00.000Z'
  );
  assert.equal(followUpContext.currentQuestion, 'What does it absorb?');
  assert.equal(followUpContext.turns.length, 2);
  assert.equal(followUpContext.turns[0].question, 'What does chlorophyll absorb?');
});

test('deleting a notebook clears its persisted learning context', () => {
  const storage = new MemoryStorage();
  const repository = createNotebookRepository(storage);
  const notebook = addScienceNotebook(repository);
  const sources = repository.listSources(userId, notebook.id);
  const sourceContents = repository.listSourceContents(userId, notebook.id);
  const turn = runNotebookTurn({
    userId,
    notebookId: notebook.id,
    question: 'What does chlorophyll absorb?',
    sources,
    sourceContents,
    now,
  });
  repository.saveLearningContext(userId, notebook.id, turn.context, now);
  assert.ok(repository.getLearningContext(userId, notebook.id));

  repository.clearLearningContext(userId, notebook.id);
  assert.equal(repository.getLearningContext(userId, notebook.id), null);

  repository.saveLearningContext(userId, notebook.id, turn.context, now);
  repository.deleteNotebook(userId, notebook.id);
  assert.equal(repository.getLearningContext(userId, notebook.id), null);
});
