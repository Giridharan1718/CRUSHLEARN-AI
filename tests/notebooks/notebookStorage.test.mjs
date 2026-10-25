import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createNotebookStorage,
  isSourceTextStorageKey,
} from '../../src/notebooks/notebookStorage.mjs';
import { createNotebookRepository } from '../../src/notebooks/notebookRepository.mjs';
import { ingestPastedSource } from '../../src/notebooks/sourceIngestion.mjs';
import {
  getSourceTextsStorageKey,
  getSourcesStorageKey,
} from '../../src/notebooks/notebookDataStores.mjs';
import { buildExport } from '../../src/utils/dataPortability.mjs';
import { MemoryStorage } from './memoryStorage.mjs';

const now = '2026-10-25T09:00:00.000Z';

class MemoryBackend {
  constructor() {
    this.values = new Map();
    this.failPuts = false;
  }

  async getAll() {
    return [...this.values.entries()];
  }

  async put(key, value) {
    if (this.failPuts) {
      throw new Error('QuotaExceededError: the local database is full');
    }
    this.values.set(key, value);
  }

  async remove(key) {
    this.values.delete(key);
  }

  async clear() {
    this.values.clear();
  }
}

class QuotaStorage extends MemoryStorage {
  setItem(key, value) {
    if (isSourceTextStorageKey(key)) {
      const error = new Error('The quota has been exceeded.');
      error.name = 'QuotaExceededError';
      throw error;
    }
    super.setItem(key, value);
  }
}

function textPayload(text, updatedAt = now) {
  return JSON.stringify({
    schemaVersion: 1,
    userId: 'user-1',
    notebookId: 'notebook-1',
    items: [{ sourceId: 'source-1', text, pageOffsets: [] }],
    updatedAt,
  });
}

function makeRepository(storage) {
  return createNotebookRepository(storage);
}

test('legacy localStorage source text is migrated and removed only after the database write', async () => {
  const local = new MemoryStorage();
  const backend = new MemoryBackend();
  const key = getSourceTextsStorageKey('user-1', 'notebook-1');
  const raw = textPayload('Legacy text');
  local.setItem(key, raw);

  const storage = createNotebookStorage({ localStorage: local, backend });
  const status = await storage.hydrate();

  assert.equal(status.ok, true);
  assert.equal(status.mode, 'indexeddb');
  assert.equal(backend.values.get(key), raw);
  assert.equal(local.getItem(key), null);
  assert.equal(storage.getItem(key), raw);
  assert.equal(isSourceTextStorageKey(key), true);
  assert.equal(storage.getStorageStatus().hydrated, true);
});

test('a 400,000-character source is stored in IndexedDB and survives a reload', async () => {
  const local = new MemoryStorage();
  const backend = new MemoryBackend();
  const storage = createNotebookStorage({ localStorage: local, backend });
  await storage.hydrate();

  const repository = makeRepository(storage);
  const notebook = repository.createNotebook(
    'user-1',
    {
      title: 'Large biology notebook',
      description: 'Storage headroom test',
      kind: 'subject',
      tags: [],
    },
    now
  );

  const text = 'Chlorophyll absorbs light. '.repeat(15_000).slice(0, 400_000);
  assert.equal(text.length, 400_000);

  const ingestion = ingestPastedSource({
    notebookId: notebook.id,
    title: 'Large notes',
    text,
    now,
  });
  assert.equal(ingestion.ok, true);

  repository.addSource('user-1', notebook.id, {
    source: ingestion.source,
    content: ingestion.content,
  });
  const storageResult = await storage.flush();
  assert.equal(storageResult.ok, true);

  const key = getSourceTextsStorageKey('user-1', notebook.id);
  assert.equal(local.getItem(key), null, 'localStorage copy should be released');
  assert.ok(backend.values.has(key), 'IndexedDB should hold the text');
  assert.equal(
    repository.getSourceText('user-1', notebook.id, ingestion.source.id).length,
    400_000
  );

  // A fresh page load hydrates the synchronous cache from the database.
  const reloadedStorage = createNotebookStorage({ localStorage: local, backend });
  await reloadedStorage.hydrate();
  const reloadedRepository = makeRepository(reloadedStorage);
  const reloadedText = reloadedRepository.getSourceText(
    'user-1',
    notebook.id,
    ingestion.source.id
  );
  assert.equal(reloadedText.length, 400_000);
  assert.equal(reloadedText, text);
});

test('a failed database write leaves the write-ahead text readable and reports the real error', async () => {
  const local = new MemoryStorage();
  const backend = new MemoryBackend();
  const storage = createNotebookStorage({ localStorage: local, backend });
  await storage.hydrate();

  backend.failPuts = true;
  const repository = makeRepository(storage);
  const notebook = repository.createNotebook(
    'user-1',
    {
      title: 'Fallback notebook',
      description: '',
      kind: 'subject',
      tags: [],
    },
    now
  );
  const ingestion = ingestPastedSource({
    notebookId: notebook.id,
    title: 'Notes',
    text: 'Text that will fall back safely.',
    now,
  });
  repository.addSource('user-1', notebook.id, {
    source: ingestion.source,
    content: ingestion.content,
  });

  const result = await storage.flush();
  assert.equal(result.ok, false);
  assert.match(result.lastError, /database|full|fallback/i);
  assert.equal(
    repository.getSourceText('user-1', notebook.id, ingestion.source.id),
    'Text that will fall back safely.'
  );

  const key = getSourceTextsStorageKey('user-1', notebook.id);
  assert.ok(local.getItem(key), 'the write-ahead copy must remain');

  backend.failPuts = false;
  const reloadedStorage = createNotebookStorage({ localStorage: local, backend });
  const reloadedStatus = await reloadedStorage.hydrate();
  assert.equal(reloadedStatus.ok, true);
  assert.match(reloadedStorage.getItem(key), /fall back safely/);
  assert.equal(local.getItem(key), null);
});

test('a localStorage quota failure rolls the notebook metadata back and gives a clear message', async () => {
  const local = new QuotaStorage();
  const backend = new MemoryBackend();
  const storage = createNotebookStorage({ localStorage: local, backend });
  await storage.hydrate();

  const repository = makeRepository(storage);
  const notebook = repository.createNotebook(
    'user-1',
    {
      title: 'No room',
      description: '',
      kind: 'subject',
      tags: [],
    },
    now
  );
  const ingestion = ingestPastedSource({
    notebookId: notebook.id,
    title: 'Notes',
    text: 'This should not be persisted.',
    now,
  });

  assert.throws(
    () =>
      repository.addSource('user-1', notebook.id, {
        source: ingestion.source,
        content: ingestion.content,
      }),
    /Browser storage is full/
  );
  assert.equal(repository.listSources('user-1', notebook.id).length, 0);
  assert.equal(
    repository.getSourceText('user-1', notebook.id, ingestion.source.id),
    null
  );
});

test('the newer copy wins when both stores have a source-text record', async () => {
  const local = new MemoryStorage();
  const backend = new MemoryBackend();
  const key = getSourceTextsStorageKey('user-1', 'notebook-1');
  backend.values.set(
    key,
    textPayload('Old database text', '2026-10-24T09:00:00.000Z')
  );
  local.setItem(
    key,
    textPayload('New local text', '2026-10-25T09:00:00.000Z')
  );

  const storage = createNotebookStorage({ localStorage: local, backend });
  await storage.hydrate();

  assert.match(backend.values.get(key), /New local text/);
  assert.equal(local.getItem(key), null);
});

test('the whole-browser export still sees source text held only in the cache', async () => {
  const local = new MemoryStorage();
  const backend = new MemoryBackend();
  const storage = createNotebookStorage({ localStorage: local, backend });
  await storage.hydrate();

  local.setItem('crushlearn_settings', JSON.stringify({ schemaVersion: 1 }));
  const repository = makeRepository(storage);
  const notebook = repository.createNotebook(
    'user-1',
    {
      title: 'Export notebook',
      description: '',
      kind: 'subject',
      tags: [],
    },
    now
  );
  const ingestion = ingestPastedSource({
    notebookId: notebook.id,
    title: 'Notes',
    text: 'Exportable source text.',
    now,
  });
  repository.addSource('user-1', notebook.id, {
    source: ingestion.source,
    content: ingestion.content,
  });
  await storage.flush();

  const exported = buildExport(storage, now);
  assert.equal(exported.ok, true);
  const sourceTextKey = getSourceTextsStorageKey('user-1', notebook.id);
  const entry = exported.envelope.entries.find(
    (item) => item.key === sourceTextKey
  );
  assert.ok(entry, 'the source-text key should be exported');
  assert.equal(entry.value.items[0].text, 'Exportable source text.');
  assert.ok(
    exported.envelope.entries.some((item) => item.key === getSourcesStorageKey('user-1', notebook.id))
  );
});
