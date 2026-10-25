import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTEBOOK_STORAGE_PREFIX,
  createNotebookStore,
  getNotebooksStorageKey,
} from '../../src/notebooks/notebookStore.mjs';
import {
  NOTEBOOK_SCHEMA_VERSION,
  NotebookValidationError,
} from '../../src/notebooks/notebookSchema.mjs';
import { MemoryStorage } from './memoryStorage.mjs';

const now = '2026-10-20T10:00:00.000Z';

test('notebooks can be created, listed, retrieved and updated', () => {
  const storage = new MemoryStorage();
  const store = createNotebookStore(storage);

  const created = store.create(
    'user-1',
    { title: 'Biology final', description: 'Cells and genetics' },
    now
  );
  assert.match(created.id, /^notebook_/);
  assert.equal(created.title, 'Biology final');
  assert.equal(created.createdAt, now);

  assert.deepEqual(store.list('user-1'), [created]);
  assert.deepEqual(store.get('user-1', created.id), created);

  const updated = store.update(
    'user-1',
    created.id,
    { title: 'Biology exam', description: '' },
    '2026-10-21T10:00:00.000Z'
  );
  assert.equal(updated.title, 'Biology exam');
  assert.equal(updated.description, '');
  assert.equal(updated.updatedAt, '2026-10-21T10:00:00.000Z');
  assert.equal(store.get('user-1', created.id).title, 'Biology exam');
});

test('notebook storage is scoped by user id', () => {
  const storage = new MemoryStorage();
  const store = createNotebookStore(storage);
  const notebook = store.create('user-1', { title: 'Private notes' }, now);

  assert.equal(
    getNotebooksStorageKey('user-1'),
    `${NOTEBOOK_STORAGE_PREFIX}_user-1`
  );
  assert.equal(store.get('user-2', notebook.id), null);
  assert.deepEqual(store.list('user-2'), []);
  assert.equal(store.update('user-2', notebook.id, { title: 'Stolen' }), null);
  assert.equal(store.remove('user-2', notebook.id), false);
  assert.equal(store.get('user-1', notebook.id).title, 'Private notes');
});

test('notebook input is validated and invalid updates are rejected', () => {
  const storage = new MemoryStorage();
  const store = createNotebookStore(storage);

  assert.throws(
    () => store.create('user-1', { title: '   ' }, now),
    NotebookValidationError
  );
  assert.throws(
    () => store.create('user-1', { title: 'x'.repeat(121) }, now),
    /120 characters or fewer/
  );

  const notebook = store.create('user-1', { title: 'Valid' }, now);
  assert.throws(
    () => store.update('user-1', notebook.id, { title: '' }, now),
    /title is required/i
  );
  assert.equal(store.get('user-1', notebook.id).title, 'Valid');
});

test('an update can clear the description but cannot clear a required title', () => {
  const storage = new MemoryStorage();
  const store = createNotebookStore(storage);
  const notebook = store.create(
    'user-1',
    { title: 'Keep this title', description: 'Old description' },
    now
  );

  const cleared = store.update(
    'user-1',
    notebook.id,
    { description: null },
    '2026-10-21T10:00:00.000Z'
  );
  assert.equal(cleared.title, 'Keep this title');
  assert.equal(cleared.description, '');
  assert.equal(cleared.updatedAt, '2026-10-21T10:00:00.000Z');

  const retitled = store.update(
    'user-1',
    notebook.id,
    { title: 'A new title' },
    '2026-10-22T10:00:00.000Z'
  );
  assert.equal(retitled.title, 'A new title');
  assert.equal(retitled.description, '');

  assert.throws(
    () => store.update('user-1', notebook.id, { title: null }, now),
    /title is required/i
  );
  assert.equal(store.get('user-1', notebook.id).title, 'A new title');
});

test('notebooks are deleted without affecting another user', () => {
  const storage = new MemoryStorage();
  const store = createNotebookStore(storage);
  const first = store.create('user-1', { title: 'First' }, now);
  const second = store.create('user-1', { title: 'Second' }, now);
  store.create('user-2', { title: 'Other learner' }, now);

  assert.equal(store.remove('user-1', first.id), true);
  assert.deepEqual(
    store.list('user-1').map((notebook) => notebook.title),
    ['Second']
  );
  assert.equal(store.list('user-2').length, 1);
  assert.equal(store.get('user-1', second.id).title, 'Second');
});

test('corrupt or mismatched notebook envelopes are ignored safely', () => {
  const storage = new MemoryStorage();
  const store = createNotebookStore(storage);
  const key = getNotebooksStorageKey('user-1');

  storage.setItem(key, '{not json');
  assert.deepEqual(store.list('user-1'), []);

  storage.setItem(
    key,
    JSON.stringify({
      schemaVersion: 999,
      userId: 'user-1',
      notebooks: [],
    })
  );
  assert.deepEqual(store.list('user-1'), []);

  storage.setItem(
    key,
    JSON.stringify({
      schemaVersion: NOTEBOOK_SCHEMA_VERSION,
      userId: 'user-2',
      notebooks: [],
    })
  );
  assert.deepEqual(store.list('user-1'), []);
});

test('malformed notebook records are dropped while valid records survive', () => {
  const storage = new MemoryStorage();
  const store = createNotebookStore(storage);
  const key = getNotebooksStorageKey('user-1');

  storage.setItem(
    key,
    JSON.stringify({
      schemaVersion: NOTEBOOK_SCHEMA_VERSION,
      userId: 'user-1',
      notebooks: [
        {
          id: 'notebook-valid',
          title: 'Valid notebook',
          description: '',
          createdAt: now,
          updatedAt: now,
        },
        { id: 'notebook-missing-title', title: '', createdAt: now },
        null,
        {
          id: 'notebook-valid',
          title: 'Duplicate id',
          createdAt: now,
          updatedAt: now,
        },
      ],
    })
  );

  assert.deepEqual(store.list('user-1'), [
    {
      id: 'notebook-valid',
      title: 'Valid notebook',
      description: '',
      kind: 'subject',
      tags: [],
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ]);
});

test('the notebook store requires a usable storage adapter', () => {
  assert.throws(
    () => createNotebookStore({ getItem() {}, setItem() {} }),
    /requires a storage adapter/i
  );
});
