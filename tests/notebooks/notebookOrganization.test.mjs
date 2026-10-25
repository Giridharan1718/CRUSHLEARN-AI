// Notebook organisation: kind, tags, archive stamp, and the v1 → v2 schema
// migration.
//
// The migration matters more than the new fields. Before it existed, a
// schema version bump made the store return an empty list, which silently
// deleted every notebook a learner had. A version bump must never cost a
// learner their work.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NOTEBOOK_STORAGE_PREFIX,
  createNotebookStore,
  getNotebooksStorageKey,
} from '../../src/notebooks/notebookStore.mjs';
import {
  NOTEBOOK_KINDS,
  NOTEBOOK_SCHEMA_VERSION,
  NotebookValidationError,
  migrateNotebookPayload,
} from '../../src/notebooks/notebookSchema.mjs';
import {
  getChatStorageKey,
  getSourcesStorageKey,
  getSourceTextsStorageKey,
} from '../../src/notebooks/notebookDataStores.mjs';
import { createNotebookRepository } from '../../src/notebooks/notebookRepository.mjs';
import { MemoryStorage } from './memoryStorage.mjs';

const now = '2026-10-20T10:00:00.000Z';

function writeV1Notebooks(storage, notebooks, userId = 'user-1') {
  storage.setItem(
    getNotebooksStorageKey(userId),
    JSON.stringify({
      schemaVersion: 1,
      userId,
      notebooks,
      updatedAt: now,
    })
  );
}

test('a v1 notebook payload is migrated, not discarded', () => {
  const storage = new MemoryStorage();
  writeV1Notebooks(storage, [
    {
      id: 'notebook-legacy',
      title: 'Cell biology',
      description: 'Lecture notes from week 3',
      createdAt: '2026-01-04T09:00:00.000Z',
      updatedAt: '2026-01-04T09:00:00.000Z',
    },
  ]);

  const store = createNotebookStore(storage);
  const notebooks = store.list('user-1');

  assert.equal(notebooks.length, 1, 'the v1 notebook must survive the upgrade');

  const notebook = notebooks[0];
  // What the learner wrote is untouched.
  assert.equal(notebook.id, 'notebook-legacy');
  assert.equal(notebook.title, 'Cell biology');
  assert.equal(notebook.description, 'Lecture notes from week 3');
  assert.equal(notebook.createdAt, '2026-01-04T09:00:00.000Z');

  // The new organisation fields get safe defaults.
  assert.equal(notebook.kind, NOTEBOOK_KINDS.SUBJECT);
  assert.deepEqual(notebook.tags, []);
  assert.equal(notebook.archivedAt, null);
});

test('the migrated notebook is written back in the current schema', () => {
  const storage = new MemoryStorage();
  writeV1Notebooks(storage, [
    {
      id: 'notebook-legacy',
      title: 'Cell biology',
      description: '',
      createdAt: now,
      updatedAt: now,
    },
  ]);

  createNotebookStore(storage).list('user-1');

  const stored = JSON.parse(
    storage.getItem(getNotebooksStorageKey('user-1'))
  );
  assert.equal(stored.schemaVersion, NOTEBOOK_SCHEMA_VERSION);
  assert.equal(stored.notebooks[0].kind, NOTEBOOK_KINDS.SUBJECT);
  assert.deepEqual(stored.notebooks[0].tags, []);
  assert.equal(stored.notebooks[0].archivedAt, null);
});

test('a v1 notebook keeps its sources, chat history and materials', () => {
  const storage = new MemoryStorage();
  const repository = createNotebookRepository(storage);

  // Build a notebook with real content first, then downgrade the stored
  // payloads to v1 — the shape an existing learner's browser would hold.
  const notebook = repository.createNotebook('user-1', { title: 'Legacy' }, now);
  repository.addSource(
    'user-1',
    notebook.id,
    {
      source: {
        id: 'source-1',
        title: 'Lecture 3',
        sourceType: 'pasted_text',
        status: 'ready',
        createdAt: now,
        updatedAt: now,
      },
      content: { text: 'Mitosis has four phases.', pageOffsets: [] },
    }
  );
  repository.appendChatMessage(
    'user-1',
    notebook.id,
    { role: 'user', content: 'What are the phases?' },
    now
  );

  // Downgrade every stored payload to schema v1.
  [getNotebooksStorageKey('user-1'), getSourcesStorageKey('user-1', notebook.id), getSourceTextsStorageKey('user-1', notebook.id), getChatStorageKey('user-1', notebook.id)].forEach(
    (key) => {
      const parsed = JSON.parse(storage.getItem(key));
      storage.setItem(key, JSON.stringify({ ...parsed, schemaVersion: 1 }));
    }
  );

  // A fresh repository — as if the page had been reloaded.
  const reloaded = createNotebookRepository(storage);

  const notebooks = reloaded.listNotebooks('user-1');
  assert.equal(notebooks.length, 1);
  assert.equal(notebooks[0].title, 'Legacy');
  assert.equal(notebooks[0].kind, NOTEBOOK_KINDS.SUBJECT);

  const sources = reloaded.listSources('user-1', notebook.id);
  assert.equal(sources.length, 1, 'the source must survive the upgrade');
  assert.equal(sources[0].title, 'Lecture 3');
  assert.equal(
    reloaded.getSourceText('user-1', notebook.id, 'source-1'),
    'Mitosis has four phases.'
  );

  const messages = reloaded.listChatMessages('user-1', notebook.id);
  assert.equal(messages.length, 1, 'the chat history must survive the upgrade');
  assert.equal(messages[0].content, 'What are the phases?');
});

test('a payload from a newer schema is refused rather than guessed at', () => {
  const storage = new MemoryStorage();
  storage.setItem(
    getNotebooksStorageKey('user-1'),
    JSON.stringify({
      schemaVersion: NOTEBOOK_SCHEMA_VERSION + 1,
      userId: 'user-1',
      notebooks: [],
    })
  );

  assert.deepEqual(createNotebookStore(storage).list('user-1'), []);
});

test('migrateNotebookPayload leaves a current payload alone and rejects a future one', () => {
  const current = {
    schemaVersion: NOTEBOOK_SCHEMA_VERSION,
    userId: 'user-1',
    notebooks: [],
  };
  assert.equal(migrateNotebookPayload(current), current);

  assert.equal(
    migrateNotebookPayload({ ...current, schemaVersion: NOTEBOOK_SCHEMA_VERSION + 1 }),
    null
  );
  assert.equal(migrateNotebookPayload(null), null);
  assert.equal(migrateNotebookPayload({ schemaVersion: 0 }), null);
});

test('a notebook records its kind and tags', () => {
  const storage = new MemoryStorage();
  const store = createNotebookStore(storage);

  const created = store.create(
    'user-1',
    {
      title: 'Dissertation',
      description: 'Chapter two',
      kind: NOTEBOOK_KINDS.PROJECT,
      tags: ['psychology', 'memory', 'psychology'],
    },
    now
  );

  assert.equal(created.kind, NOTEBOOK_KINDS.PROJECT);
  // Tags are de-duplicated case-insensitively, keeping the first spelling.
  assert.deepEqual(created.tags, ['psychology', 'memory']);

  const updated = store.update(
    'user-1',
    created.id,
    { tags: ['memory', 'methods'] },
    '2026-10-21T10:00:00.000Z'
  );
  assert.deepEqual(updated.tags, ['memory', 'methods']);
  assert.equal(updated.kind, NOTEBOOK_KINDS.PROJECT, 'kind survives a partial update');
  assert.equal(updated.title, 'Dissertation');
});

test('an unknown kind is rejected instead of stored', () => {
  const storage = new MemoryStorage();
  const store = createNotebookStore(storage);

  assert.throws(
    () => store.create('user-1', { title: 'Bad', kind: 'semester' }, now),
    NotebookValidationError
  );

  const notebook = store.create('user-1', { title: 'Good' }, now);
  assert.throws(
    () => store.update('user-1', notebook.id, { kind: 'semester' }, now),
    NotebookValidationError
  );
});

test('archiving hides a notebook from the default list and preserves its data', () => {
  const storage = new MemoryStorage();
  const repository = createNotebookRepository(storage);

  const notebook = repository.createNotebook('user-1', { title: 'Old project' }, now);
  repository.addSource(
    'user-1',
    notebook.id,
    {
      source: {
        id: 'source-1',
        title: 'Reference',
        sourceType: 'pasted_text',
        status: 'ready',
        createdAt: now,
        updatedAt: now,
      },
      content: { text: 'The reference text.', pageOffsets: [] },
    }
  );
  repository.appendChatMessage(
    'user-1',
    notebook.id,
    { role: 'user', content: 'A question' },
    now
  );

  const archived = repository.archiveNotebook('user-1', notebook.id, now);
  assert.ok(archived.archivedAt);

  // Hidden from the default list, reachable through the archived filter.
  assert.deepEqual(repository.listNotebooks('user-1'), []);
  assert.deepEqual(
    repository.listNotebooks('user-1', { includeArchived: true }).map((n) => n.id),
    [notebook.id]
  );
  assert.deepEqual(
    repository.listArchivedNotebooks('user-1').map((n) => n.id),
    [notebook.id]
  );

  // Nothing was deleted.
  assert.equal(repository.listSources('user-1', notebook.id).length, 1);
  assert.equal(repository.listChatMessages('user-1', notebook.id).length, 1);
  assert.equal(
    repository.getSourceText('user-1', notebook.id, 'source-1'),
    'The reference text.'
  );

  const restored = repository.restoreNotebook('user-1', notebook.id, now);
  assert.equal(restored.archivedAt, null);
  assert.deepEqual(
    repository.listNotebooks('user-1').map((n) => n.id),
    [notebook.id]
  );
});

test('notebooks can be filtered by kind and by tag', () => {
  const storage = new MemoryStorage();
  const repository = createNotebookRepository(storage);

  repository.createNotebook(
    'user-1',
    { title: 'Organic chemistry', kind: NOTEBOOK_KINDS.COURSE, tags: ['chem'] },
    now
  );
  repository.createNotebook(
    'user-1',
    { title: 'Essay plan', kind: NOTEBOOK_KINDS.ASSIGNMENT, tags: ['chem', 'writing'] },
    now
  );

  assert.equal(
    repository.listNotebooks('user-1', { kind: NOTEBOOK_KINDS.COURSE }).length,
    1
  );
  assert.equal(
    repository.listNotebooks('user-1', { tag: 'chem' }).length,
    2
  );
  assert.equal(repository.listNotebooks('user-1', { tag: 'writing' }).length, 1);
});

test('a notebook belongs to one user, and another user cannot archive it', () => {
  const storage = new MemoryStorage();
  const repository = createNotebookRepository(storage);

  const notebook = repository.createNotebook('user-1', { title: 'Private' }, now);

  // The repository refuses outright rather than silently doing nothing, so
  // a caller cannot mistake "not archived" for "archived".
  assert.throws(
    () => repository.archiveNotebook('user-2', notebook.id, now),
    /not found/i
  );
  assert.equal(repository.listNotebooks('user-2').length, 0);
  assert.equal(repository.getNotebook('user-1', notebook.id).archivedAt, null);
});
