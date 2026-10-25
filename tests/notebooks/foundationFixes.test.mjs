import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GENERATORS,
  formatGeneratorLabel,
  isModelGenerated,
  normalizeGenerator,
} from '../../src/notebooks/generators.mjs';
import { searchNotebookSources } from '../../src/notebooks/sourceRetrieval.mjs';
import {
  createNotebookRepository,
} from '../../src/notebooks/notebookRepository.mjs';
import { createExplanationRecordStore } from '../../src/intelligence/explanationRecord.mjs';
import {
  createEmptyLearningContext,
  normalizeLearningContext,
} from '../../src/intelligence/learningContext.mjs';
import { MemoryStorage } from './memoryStorage.mjs';

const now = '2026-10-21T10:00:00.000Z';

const SOURCE_TEXT =
  'Photosynthesis converts light energy into chemical energy. ' +
  'Chlorophyll absorbs light in the visible spectrum and gives leaves their green colour.';

function makeSources() {
  return [
    {
      id: 'source-1',
      notebookId: 'notebook-1',
      title: 'Biology notes',
      sourceType: 'pasted_text',
      status: 'ready',
      hasExtractedText: true,
      characterCount: SOURCE_TEXT.length,
      pageCount: 0,
      error: null,
      fileName: null,
      mimeType: null,
      sizeBytes: null,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

const sourceContents = {
  'source-1': { text: SOURCE_TEXT, pageOffsets: [] },
};

// ---------------------------------------------------------------------------
// The generator label must survive a save/load round trip.
// ---------------------------------------------------------------------------

test('a model-backed answer keeps its label when the learning context is saved and reloaded', () => {
  const context = createEmptyLearningContext('user-1', 'notebook-1', now);
  context.answer = {
    text: 'Chlorophyll absorbs light in the visible spectrum.',
    citation: {
      sourceId: 'source-1',
      quote: 'Chlorophyll absorbs light in the visible spectrum',
      locator: { kind: 'offset', start: 69, end: 120 },
    },
    sourceTitle: 'Biology notes',
    page: null,
    generator: GENERATORS.AI_GROUNDED,
    note: 'Answered by a model using the source passages shown below.',
  };

  const reloaded = normalizeLearningContext(context, {
    userId: 'user-1',
    notebookId: 'notebook-1',
  });

  assert.equal(reloaded.answer.generator, GENERATORS.AI_GROUNDED);
});

test('a local extractive answer keeps its label in the learning context', () => {
  const context = createEmptyLearningContext('user-1', 'notebook-1', now);
  context.answer = {
    text: 'Chlorophyll absorbs light in the visible spectrum.',
    citation: {
      sourceId: 'source-1',
      quote: 'Chlorophyll absorbs light in the visible spectrum',
      locator: { kind: 'offset', start: 69, end: 120 },
    },
    sourceTitle: 'Biology notes',
    page: null,
    generator: GENERATORS.LOCAL_EXTRACTIVE,
    note: 'Quoted from the notebook sources.',
  };

  const reloaded = normalizeLearningContext(context, {
    userId: 'user-1',
    notebookId: 'notebook-1',
  });

  assert.equal(reloaded.answer.generator, GENERATORS.LOCAL_EXTRACTIVE);
});

test('an unrecognised generator falls back to local extractive rather than being passed through', () => {
  const context = createEmptyLearningContext('user-1', 'notebook-1', now);
  context.answer = {
    text: 'Chlorophyll absorbs light in the visible spectrum.',
    citation: {
      sourceId: 'source-1',
      quote: 'Chlorophyll absorbs light in the visible spectrum',
      locator: { kind: 'offset', start: 69, end: 120 },
    },
    sourceTitle: 'Biology notes',
    page: null,
    generator: 'a_generator_this_app_does_not_know',
    note: '',
  };

  const reloaded = normalizeLearningContext(context, {
    userId: 'user-1',
    notebookId: 'notebook-1',
  });

  assert.equal(reloaded.answer.generator, GENERATORS.LOCAL_EXTRACTIVE);
});

test('the generator vocabulary recognises a model origin and labels it', () => {
  assert.equal(isModelGenerated(GENERATORS.AI_GROUNDED), true);
  assert.equal(isModelGenerated(GENERATORS.AI_ASSISTED), true);
  assert.equal(isModelGenerated(GENERATORS.LOCAL_EXTRACTIVE), false);
  assert.equal(isModelGenerated(GENERATORS.LOCAL_DETERMINISTIC), false);

  assert.equal(normalizeGenerator(GENERATORS.AI_GROUNDED), GENERATORS.AI_GROUNDED);
  assert.equal(
    normalizeGenerator('not-a-generator'),
    GENERATORS.LOCAL_DETERMINISTIC
  );

  assert.equal(formatGeneratorLabel(GENERATORS.AI_GROUNDED), 'AI answer');
  assert.equal(formatGeneratorLabel('not-a-generator'), 'Local rule');
});

// ---------------------------------------------------------------------------
// A limit of zero must mean zero results.
// ---------------------------------------------------------------------------

test('a search limit of zero returns no results', () => {
  const result = searchNotebookSources({
    sources: makeSources(),
    sourceContents,
    query: 'chlorophyll',
    limit: 0,
  });

  assert.equal(result.ok, true);
  assert.equal(result.results.length, 0);
});

test('a negative search limit returns no results', () => {
  const result = searchNotebookSources({
    sources: makeSources(),
    sourceContents,
    query: 'chlorophyll',
    limit: -5,
  });

  assert.equal(result.ok, true);
  assert.equal(result.results.length, 0);
});

test('a search limit above the maximum is capped, and the default is unchanged', () => {
  const capped = searchNotebookSources({
    sources: makeSources(),
    sourceContents,
    query: 'chlorophyll',
    limit: 50,
  });
  assert.equal(capped.ok, true);
  assert.ok(capped.results.length <= 12);

  const defaulted = searchNotebookSources({
    sources: makeSources(),
    sourceContents,
    query: 'chlorophyll',
  });
  assert.equal(defaulted.ok, true);
  assert.equal(defaulted.results.length, capped.results.length);
});

test('a search limit of one returns a single result', () => {
  const result = searchNotebookSources({
    sources: makeSources(),
    sourceContents,
    query: 'chlorophyll',
    limit: 1,
  });

  assert.equal(result.ok, true);
  assert.equal(result.results.length, 1);
});

// ---------------------------------------------------------------------------
// Deleting a notebook must not leave explanation records behind.
// ---------------------------------------------------------------------------

test('deleting a notebook clears the explanation records that belong to it', () => {
  const storage = new MemoryStorage();
  const repository = createNotebookRepository(storage);
  const recordStore = createExplanationRecordStore(storage);

  const notebook = repository.createNotebook(
    'user-1',
    { title: 'Biology', description: 'Exam revision' },
    now
  );
  const otherNotebook = repository.createNotebook(
    'user-1',
    { title: 'Chemistry', description: 'Lab report' },
    now
  );

  const saved = recordStore.save('user-1', notebook.id, {
    subject: 'biology',
    level: 'eli10',
    mode: 'simplify',
    language: 'en',
    concepts: ['chlorophyll'],
    factCount: 3,
    verificationOk: true,
    sourceId: 'source-1',
    sourceTitle: 'Biology notes',
    at: now,
  });
  assert.equal(saved.ok, true);

  recordStore.save('user-1', otherNotebook.id, {
    subject: 'chemistry',
    level: 'eli10',
    mode: 'simplify',
    language: 'en',
    concepts: ['titration'],
    factCount: 2,
    verificationOk: true,
    sourceId: 'source-2',
    sourceTitle: 'Chemistry notes',
    at: now,
  });

  assert.equal(recordStore.list('user-1', notebook.id).length, 1);

  const deleted = repository.deleteNotebook('user-1', notebook.id);
  assert.equal(deleted, true);

  assert.equal(recordStore.list('user-1', notebook.id).length, 0);
  // The other notebook's records must survive.
  assert.equal(recordStore.list('user-1', otherNotebook.id).length, 1);
});
