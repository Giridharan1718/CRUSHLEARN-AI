import test from 'node:test';
import assert from 'node:assert/strict';

import { MemoryStorage } from '../notebooks/memoryStorage.mjs';
import {
  EXPLANATION_RECORD_KEY,
  MAX_RECORDS_PER_NOTEBOOK,
  buildExplanationRecordInput,
  createExplanationRecordStore,
} from '../../src/intelligence/explanationRecord.mjs';
import { explainSelection } from '../../src/notebooks/textExplanation.mjs';

const TEXT =
  'Photosynthesis is the process by which plants convert sunlight into chemical energy. Chlorophyll absorbs light in the visible spectrum.';

test('the store requires a usable storage adapter', () => {
  assert.equal(createExplanationRecordStore(null), null);
  assert.equal(createExplanationRecordStore({}), null);
});

test('records are scoped by learner and notebook', () => {
  const storage = new MemoryStorage();
  const store = createExplanationRecordStore(storage);
  const saved = store.save('user-1', 'notebook-1', {
    subject: 'biology',
    level: 'eli5',
    concepts: ['photosynthesis', 'chlorophyll'],
    factCount: 0,
    verificationOk: true,
  });

  assert.equal(saved.ok, true);
  assert.equal(store.list('user-1', 'notebook-1').length, 1);
  assert.equal(store.list('user-2', 'notebook-1').length, 0);
  assert.equal(store.list('user-1', 'notebook-2').length, 0);
});

test('saved metadata never includes source quotations or free-text answers', () => {
  const storage = new MemoryStorage();
  const store = createExplanationRecordStore(storage);
  store.save('user-1', 'notebook-1', {
    subject: 'biology',
    level: 'eli10',
    concepts: ['photosynthesis'],
    note: 'Metadata only.',
  });

  const raw = storage.getItem(EXPLANATION_RECORD_KEY);
  assert.ok(raw.includes('photosynthesis'));
  assert.doesNotMatch(raw, /Chlorophyll absorbs light in the visible spectrum/);
});

test('records can be exported and deleted individually or all at once', () => {
  const storage = new MemoryStorage();
  const store = createExplanationRecordStore(storage);
  const first = store.save('user-1', 'notebook-1', {
    subject: 'biology',
    level: 'eli5',
  });
  store.save('user-1', 'notebook-1', {
    subject: 'physics',
    level: 'advanced',
  });
  assert.equal(store.list('user-1', 'notebook-1').length, 2);

  const exported = store.export('user-1', 'notebook-1');
  assert.equal(exported.ok, true);
  assert.equal(JSON.parse(exported.json).records.length, 2);

  assert.equal(store.remove('user-1', 'notebook-1', first.record.id).ok, true);
  assert.equal(store.list('user-1', 'notebook-1').length, 1);

  const cleared = store.clear('user-1', 'notebook-1');
  assert.equal(cleared.ok, true);
  assert.equal(cleared.removed, 1);
  assert.equal(store.list('user-1', 'notebook-1').length, 0);
});

test('the per-notebook record cap is enforced', () => {
  const storage = new MemoryStorage();
  const store = createExplanationRecordStore(storage);
  for (let index = 0; index < MAX_RECORDS_PER_NOTEBOOK + 5; index += 1) {
    store.save('user-1', 'notebook-1', {
      subject: 'general',
      level: 'eli10',
      at: new Date(2026, 0, 1, 0, 0, index).toISOString(),
    });
  }
  assert.equal(store.list('user-1', 'notebook-1').length, MAX_RECORDS_PER_NOTEBOOK);
});

test('record input is built from explanation metadata only', () => {
  const explanation = explainSelection({ text: TEXT, level: 'eli10', mode: 'simplify' });
  const input = buildExplanationRecordInput({
    explanation,
    sourceId: 'source-1',
    sourceTitle: 'Biology notes',
  });

  assert.equal(input.level, 'eli10');
  assert.equal(input.subject, 'biology');
  assert.equal(input.sourceId, 'source-1');
  assert.ok(input.concepts.length > 0);
  assert.equal(input.verificationOk, true);
  assert.doesNotMatch(JSON.stringify(input), /Chlorophyll absorbs light/);
});
