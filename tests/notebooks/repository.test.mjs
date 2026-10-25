import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NotebookNotFoundError,
  createNotebookRepository,
} from '../../src/notebooks/notebookRepository.mjs';
import {
  getChatStorageKey,
  getMaterialsStorageKey,
  getSourceTextsStorageKey,
  getSourcesStorageKey,
} from '../../src/notebooks/notebookDataStores.mjs';
import { getNotebooksStorageKey } from '../../src/notebooks/notebookStore.mjs';
import { ingestPastedSource } from '../../src/notebooks/sourceIngestion.mjs';
import {
  SOURCE_STATUSES,
  createSourceRecord,
} from '../../src/notebooks/sourceSchema.mjs';
import { searchNotebookSources } from '../../src/notebooks/sourceRetrieval.mjs';
import { MemoryStorage } from './memoryStorage.mjs';

const now = '2026-10-20T10:00:00.000Z';
const secretText = 'Photosynthesis converts light energy into chemical energy.';

function addPastedSource(repository, userId, notebookId, text = secretText) {
  const ingestion = ingestPastedSource({
    notebookId,
    title: 'Biology notes',
    text,
    now,
  });
  assert.equal(ingestion.ok, true);
  return repository.addSource(userId, notebookId, {
    source: ingestion.source,
    content: ingestion.content,
  });
}

test('notebook metadata and source contents are stored under separate keys', () => {
  const storage = new MemoryStorage();
  const repository = createNotebookRepository(storage);
  const notebook = repository.createNotebook(
    'user-1',
    { title: 'Biology', description: 'Exam revision' },
    now
  );
  const source = addPastedSource(repository, 'user-1', notebook.id);

  assert.equal(storage.has(getNotebooksStorageKey('user-1')), true);
  assert.equal(storage.has(getSourcesStorageKey('user-1', notebook.id)), true);
  assert.equal(
    storage.has(getSourceTextsStorageKey('user-1', notebook.id)),
    true
  );
  assert.equal(storage.has(getChatStorageKey('user-1', notebook.id)), false);
  assert.equal(
    storage.has(getMaterialsStorageKey('user-1', notebook.id)),
    false
  );

  const notebookRaw = storage.getItem(getNotebooksStorageKey('user-1'));
  const sourceRaw = storage.getItem(
    getSourcesStorageKey('user-1', notebook.id)
  );
  assert.doesNotMatch(notebookRaw, /Photosynthesis/);
  assert.doesNotMatch(sourceRaw, /Photosynthesis/);

  assert.equal(
    repository.getSourceText('user-1', notebook.id, source.id),
    secretText
  );
  const { getSourceText } = repository;
  assert.equal(
    getSourceText('user-1', notebook.id, source.id),
    secretText,
    'getSourceText must not depend on the repository object as its receiver'
  );
  assert.equal(source.hasExtractedText, true);
  assert.equal(source.characterCount, secretText.length);
});

test('notebook sources are isolated by notebook and by user', () => {
  const storage = new MemoryStorage();
  const repository = createNotebookRepository(storage);
  const first = repository.createNotebook('user-1', { title: 'First' }, now);
  const second = repository.createNotebook('user-1', { title: 'Second' }, now);
  addPastedSource(repository, 'user-1', first.id, 'First notebook text');

  assert.equal(repository.listSources('user-1', first.id).length, 1);
  assert.deepEqual(repository.listSources('user-1', second.id), []);
  assert.deepEqual(repository.listSources('user-2', first.id), []);
  assert.deepEqual(repository.listStudyMaterials('user-2', first.id), []);

  assert.throws(
    () => repository.getSourceText('user-2', first.id, 'source-1'),
    NotebookNotFoundError
  );
  assert.throws(
    () =>
      repository.addSource('user-2', first.id, {
        source: addPastedSourceSource(first.id),
        content: { text: 'stolen' },
      }),
    NotebookNotFoundError
  );
});

function addPastedSourceSource(notebookId) {
  return ingestPastedSource({
    notebookId,
    text: 'Attempted cross-user write',
  }).source;
}

test('removing a source removes its extracted text but keeps the notebook', () => {
  const storage = new MemoryStorage();
  const repository = createNotebookRepository(storage);
  const notebook = repository.createNotebook('user-1', { title: 'Notes' }, now);
  const source = addPastedSource(repository, 'user-1', notebook.id);

  assert.equal(repository.removeSource('user-1', notebook.id, source.id), true);
  assert.deepEqual(repository.listSources('user-1', notebook.id), []);
  assert.equal(
    repository.getSourceText('user-1', notebook.id, source.id),
    null
  );
  assert.equal(repository.getNotebook('user-1', notebook.id).title, 'Notes');
  assert.equal(
    repository.removeSource('user-1', notebook.id, 'missing-source'),
    false
  );
});

test('page offsets and source contents survive repository storage', () => {
  const storage = new MemoryStorage();
  const repository = createNotebookRepository(storage);
  const notebook = repository.createNotebook('user-1', { title: 'Paper' }, now);
  const text = 'Page one text.\n\nPage two text.';
  const source = repository.addSource('user-1', notebook.id, {
    source: {
      id: 'source-pdf',
      notebookId: notebook.id,
      title: 'Paper.pdf',
      sourceType: 'pdf',
      status: 'ready',
      hasExtractedText: true,
      characterCount: text.length,
      pageCount: 2,
      createdAt: now,
      updatedAt: now,
    },
    content: {
      text,
      pageOffsets: [
        { page: 1, start: 0, end: 14 },
        { page: 2, start: 16, end: 30 },
      ],
    },
  });

  assert.equal(source.pageCount, 2);
  assert.deepEqual(repository.getSourceContent('user-1', notebook.id, source.id), {
    text,
    pageOffsets: [
      { page: 1, start: 0, end: 14 },
      { page: 2, start: 16, end: 30 },
    ],
  });
  assert.deepEqual(
    repository.listSourceContents('user-1', notebook.id)['source-pdf'].pageOffsets,
    [
      { page: 1, start: 0, end: 14 },
      { page: 2, start: 16, end: 30 },
    ]
  );
});

test('chat history and study materials use their own stores', () => {
  const storage = new MemoryStorage();
  const repository = createNotebookRepository(storage);
  const notebook = repository.createNotebook('user-1', { title: 'Notebook' }, now);

  const userMessage = repository.appendChatMessage(
    'user-1',
    notebook.id,
    { role: 'user', content: 'What is photosynthesis?' },
    now
  );
  repository.appendChatMessage(
    'user-1',
    notebook.id,
    {
      role: 'assistant',
      content: 'The sources do not contain enough evidence.',
      citations: [],
    },
    now
  );

  assert.equal(repository.listChatMessages('user-1', notebook.id).length, 2);
  assert.match(userMessage.id, /^message_/);
  assert.equal(storage.has(getChatStorageKey('user-1', notebook.id)), true);

  repository.saveStudyMaterials(
    'user-1',
    notebook.id,
    [
      {
        id: 'material-1',
        title: 'Summary',
        kind: 'summary',
        body: 'A local extractive summary appears here.',
        generator: 'local_extractive',
        citations: [
          {
            sourceId: 'source-1',
            quote: 'Quoted source text.',
            locator: { kind: 'offset', start: 0, end: 19 },
          },
        ],
        createdAt: now,
      },
    ],
    now
  );

  const materials = repository.listStudyMaterials('user-1', notebook.id);
  assert.equal(materials.length, 1);
  assert.equal(materials[0].title, 'Summary');
  assert.equal(materials[0].generator, 'local_extractive');
  assert.equal(materials[0].citations.length, 1);

  const generated = repository.saveStudyMaterials(
    'user-1',
    notebook.id,
    [
      {
        title: 'Generated kit',
        kind: 'study_kit',
        body: 'Local extractive study kit.',
        citations: [],
        generator: 'local_extractive',
        createdAt: now,
      },
    ],
    now
  );
  assert.match(generated[0].id, /^material_/);
  assert.equal(generated[0].generator, 'local_extractive');
  assert.equal(storage.has(getMaterialsStorageKey('user-1', notebook.id)), true);
  assert.equal(
    storage.has(getSourceTextsStorageKey('user-1', notebook.id)),
    false
  );

  assert.throws(
    () =>
      repository.appendChatMessage('user-1', notebook.id, {
        role: 'assistant',
        content: '',
      }),
    /Invalid chat message/i
  );
  assert.throws(
    () =>
      repository.saveStudyMaterials('user-1', notebook.id, [
        { id: 'bad-material', title: '', kind: 'summary', body: '' },
      ]),
    /Invalid study material/i
  );
});

test('a ready source cannot be saved without extracted text', () => {
  const storage = new MemoryStorage();
  const repository = createNotebookRepository(storage);
  const notebook = repository.createNotebook('user-1', { title: 'Notebook' }, now);
  const ingestion = ingestPastedSource({
    notebookId: notebook.id,
    text: 'Text',
  });

  assert.throws(
    () =>
      repository.addSource('user-1', notebook.id, {
        source: ingestion.source,
        content: null,
      }),
    /require extracted text/i
  );
  assert.throws(
    () => repository.addSource('user-1', notebook.id, {}),
    /A source record is required/i
  );
  assert.deepEqual(repository.listSources('user-1', notebook.id), []);
});

test('deleting a notebook removes all related collections', () => {
  const storage = new MemoryStorage();
  const repository = createNotebookRepository(storage);
  const notebook = repository.createNotebook('user-1', { title: 'Delete me' }, now);
  addPastedSource(repository, 'user-1', notebook.id);
  repository.appendChatMessage(
    'user-1',
    notebook.id,
    { role: 'user', content: 'Hello' },
    now
  );
  repository.saveStudyMaterials(
    'user-1',
    notebook.id,
    [
      {
        id: 'material-1',
        title: 'Guide',
        kind: 'study_guide',
        body: 'Body',
        createdAt: now,
      },
    ],
    now
  );

  assert.equal(repository.deleteNotebook('user-1', notebook.id), true);
  assert.equal(repository.getNotebook('user-1', notebook.id), null);
  assert.equal(storage.has(getSourcesStorageKey('user-1', notebook.id)), false);
  assert.equal(
    storage.has(getSourceTextsStorageKey('user-1', notebook.id)),
    false
  );
  assert.equal(storage.has(getChatStorageKey('user-1', notebook.id)), false);
  assert.equal(
    storage.has(getMaterialsStorageKey('user-1', notebook.id)),
    false
  );
  assert.deepEqual(repository.listNotebooks('user-1'), []);
});

test('corrupt source entries are ignored rather than trusted', () => {
  const storage = new MemoryStorage();
  const repository = createNotebookRepository(storage);
  const notebook = repository.createNotebook('user-1', { title: 'Notebook' }, now);

  storage.setItem(
    getSourcesStorageKey('user-1', notebook.id),
    JSON.stringify({
      schemaVersion: 1,
      userId: 'user-1',
      notebookId: notebook.id,
      items: [
        { id: 'broken-source', status: 'ready' },
        {
          id: 'valid-source',
          notebookId: notebook.id,
          title: 'Valid',
          sourceType: 'pasted_text',
          status: 'failed',
          error: 'No text',
          hasExtractedText: false,
          characterCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      ],
    })
  );

  const sources = repository.listSources('user-1', notebook.id);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].id, 'valid-source');
});

const citation = {
  sourceId: 'unused-placeholder',
  quote: 'Photosynthesis',
  locator: { kind: 'offset', start: 0, end: 14 },
};

function citationFor(sourceId) {
  return { ...citation, sourceId };
}

function contextFor(notebookId, sourceId) {
  return {
    schemaVersion: 1,
    userId: 'user-1',
    notebookId,
    currentQuestion: 'What is photosynthesis?',
    resolvedQuestion: '',
    topicTerms: [],
    usedContextTerms: [],
    answer: {
      text: secretText,
      citation: citationFor(sourceId),
      sourceTitle: 'Biology notes',
      generator: 'local_extractive',
      note: 'Direct quotation.',
    },
    evidence: [],
    visual: null,
    relatedVisual: null,
    practice: null,
    nextAction: null,
    adaptive: null,
    turns: [],
    updatedAt: now,
  };
}

test('source dependencies include materials, chat and learning context', () => {
  const storage = new MemoryStorage();
  const repository = createNotebookRepository(storage);
  const notebook = repository.createNotebook('user-1', { title: 'Biology' }, now);
  const source = addPastedSource(repository, 'user-1', notebook.id);

  repository.appendChatMessage(
    'user-1',
    notebook.id,
    {
      role: 'assistant',
      content: 'The notes define photosynthesis.',
      citations: [citationFor(source.id)],
    },
    now
  );
  repository.saveStudyMaterials(
    'user-1',
    notebook.id,
    [
      {
        id: 'material-1',
        title: 'Energy summary',
        kind: 'summary',
        body: 'A saved summary.',
        citations: [citationFor(source.id)],
        createdAt: now,
      },
    ],
    now
  );
  repository.saveLearningContext(
    'user-1',
    notebook.id,
    contextFor(notebook.id, source.id),
    now
  );

  const dependents = repository.listSourceDependents(
    'user-1',
    notebook.id,
    source.id
  );
  assert.deepEqual(
    dependents.map((item) => item.kind),
    ['material', 'chat', 'learning_context']
  );
  assert.match(dependents[0].label, /Energy summary/);
  assert.match(dependents[1].excerpt, /define photosynthesis/);
  assert.match(dependents[2].excerpt, /What is photosynthesis/);

  assert.deepEqual(
    repository.listSourceDependents('user-1', notebook.id, 'missing-source'),
    []
  );
});

test('a failed source can be retried in place and remains failed honestly', () => {
  const storage = new MemoryStorage();
  const repository = createNotebookRepository(storage);
  const notebook = repository.createNotebook('user-1', { title: 'Scans' }, now);
  const failed = repository.addSource('user-1', notebook.id, {
    source: createSourceRecord({
      notebookId: notebook.id,
      title: 'Scan.pdf',
      sourceType: 'pdf',
      fileName: 'scan.pdf',
      status: SOURCE_STATUSES.FAILED,
      error: 'Scanned PDFs require OCR.',
      now,
    }),
    content: null,
  });

  assert.equal(
    repository.updateSourceStatus('user-1', notebook.id, failed.id, {
      status: SOURCE_STATUSES.QUEUED,
      now: '2026-10-21T10:00:00.000Z',
    }).status,
    SOURCE_STATUSES.QUEUED
  );
  assert.equal(
    repository.updateSourceStatus('user-1', notebook.id, failed.id, {
      status: SOURCE_STATUSES.PROCESSING,
      now: '2026-10-21T10:00:01.000Z',
    }).status,
    SOURCE_STATUSES.PROCESSING
  );

  const retryText = 'Page one text.';
  const ready = repository.replaceSource(
    'user-1',
    notebook.id,
    failed.id,
    {
      source: createSourceRecord({
        notebookId: notebook.id,
        title: 'Scan.pdf',
        sourceType: 'pdf',
        fileName: 'scan.pdf',
        status: SOURCE_STATUSES.READY,
        hasExtractedText: true,
        characterCount: retryText.length,
        now: '2026-10-21T10:00:02.000Z',
      }),
      content: {
        text: retryText,
        pageOffsets: [{ page: 1, start: 0, end: retryText.length }],
      },
    },
    '2026-10-21T10:00:02.000Z'
  );

  assert.equal(ready.id, failed.id);
  assert.equal(ready.createdAt, failed.createdAt);
  assert.equal(ready.status, SOURCE_STATUSES.READY);
  assert.equal(ready.characterCount, retryText.length);
  assert.equal(repository.getSourceText('user-1', notebook.id, failed.id), retryText);
  assert.deepEqual(
    repository.getSourceContent('user-1', notebook.id, failed.id).pageOffsets,
    [{ page: 1, start: 0, end: retryText.length }]
  );

  const stillFailed = repository.replaceSource(
    'user-1',
    notebook.id,
    failed.id,
    {
      source: createSourceRecord({
        notebookId: notebook.id,
        title: 'Scan.pdf',
        sourceType: 'pdf',
        status: SOURCE_STATUSES.FAILED,
        error: 'Still unreadable.',
        now: '2026-10-21T10:00:03.000Z',
      }),
      content: null,
    },
    '2026-10-21T10:00:03.000Z'
  );

  assert.equal(stillFailed.status, SOURCE_STATUSES.FAILED);
  assert.equal(stillFailed.error, 'Still unreadable.');
  assert.equal(stillFailed.hasExtractedText, false);
  assert.equal(repository.getSourceText('user-1', notebook.id, failed.id), null);
  assert.equal(
    repository.replaceSource('user-1', notebook.id, 'missing-source', {
      source: stillFailed,
      content: null,
    }),
    null
  );
  assert.throws(
    () =>
      repository.updateSourceStatus('user-1', notebook.id, failed.id, {
        status: SOURCE_STATUSES.READY,
      }),
    /Only queued or processing/i
  );
  assert.throws(
    () =>
      repository.replaceSource('user-1', notebook.id, failed.id, {
        source: { ...failed, status: SOURCE_STATUSES.PROCESSING },
        content: null,
      }),
    /ready or failed/i
  );
});

test('a notebook exports to JSON and Markdown and imports without loss', () => {
  const storage = new MemoryStorage();
  const repository = createNotebookRepository(storage);
  const notebook = repository.createNotebook(
    'user-1',
    {
      title: 'Biology final',
      description: 'Cells and energy',
      kind: 'course',
      tags: ['biology', 'exam'],
    },
    now
  );
  const source = addPastedSource(repository, 'user-1', notebook.id);
  repository.appendChatMessage(
    'user-1',
    notebook.id,
    {
      role: 'assistant',
      content: 'The notes define photosynthesis.',
      citations: [citationFor(source.id)],
    },
    now
  );
  repository.saveStudyMaterials(
    'user-1',
    notebook.id,
    [
      {
        id: 'material-1',
        title: 'Energy summary',
        kind: 'summary',
        body: 'Plants convert light into chemical energy.',
        generator: 'authored',
        citations: [citationFor(source.id)],
        createdAt: now,
      },
    ],
    now
  );
  repository.saveLearningContext(
    'user-1',
    notebook.id,
    contextFor(notebook.id, source.id),
    now
  );

  const jsonExport = repository.exportNotebook('user-1', notebook.id, {
    format: 'json',
    now: '2026-10-21T10:00:00.000Z',
  });
  assert.equal(jsonExport.ok, true);
  assert.match(jsonExport.filename, /^biology-final-2026-10-21\.json$/);
  assert.match(jsonExport.content, /Photosynthesis/);

  const markdownExport = repository.exportNotebook('user-1', notebook.id, {
    format: 'markdown',
    now: '2026-10-21T10:00:00.000Z',
  });
  assert.equal(markdownExport.ok, true);
  assert.match(markdownExport.filename, /^biology-final-2026-10-21\.md$/);
  assert.match(markdownExport.content, /# Biology final/);
  assert.match(markdownExport.content, /Energy summary/);
  assert.match(markdownExport.content, /The notes define photosynthesis/);
  assert.match(markdownExport.content, /Biology notes, characters 0-14/);
  assert.match(markdownExport.content, /Photosynthesis/);

  const payload = JSON.parse(jsonExport.content);
  const imported = repository.importNotebook(
    'user-1',
    payload,
    '2026-10-22T10:00:00.000Z'
  );
  assert.equal(imported.ok, true);
  assert.notEqual(imported.notebook.id, notebook.id);
  assert.equal(imported.notebook.title, 'Biology final');
  assert.equal(imported.notebook.description, 'Cells and energy');
  assert.equal(imported.notebook.kind, 'course');
  assert.deepEqual(imported.notebook.tags, ['biology', 'exam']);
  assert.equal(
    imported.notebook.createdAt,
    now,
    'the exported notebook creation date must survive import'
  );
  assert.equal(imported.notebook.updatedAt, now);
  assert.equal(imported.counts.sources, 1);
  assert.equal(imported.counts.chat, 1);
  assert.equal(imported.counts.materials, 1);
  assert.equal(imported.counts.learningContext, true);

  const importedSources = repository.listSources(
    'user-1',
    imported.notebook.id
  );
  assert.equal(importedSources.length, 1);
  assert.equal(importedSources[0].id, source.id);
  assert.equal(
    repository.getSourceText('user-1', imported.notebook.id, source.id),
    secretText
  );

  const search = searchNotebookSources({
    sources: importedSources,
    sourceContents: repository.listSourceContents(
      'user-1',
      imported.notebook.id
    ),
    query: 'photosynthesis',
  });
  assert.ok(search.results.length > 0);
  assert.equal(search.results[0].citation.sourceId, source.id);

  const importedChat = repository.listChatMessages(
    'user-1',
    imported.notebook.id
  );
  assert.equal(importedChat.length, 1);
  assert.equal(importedChat[0].content, 'The notes define photosynthesis.');
  assert.equal(importedChat[0].citations[0].sourceId, source.id);

  const importedMaterials = repository.listStudyMaterials(
    'user-1',
    imported.notebook.id
  );
  assert.equal(importedMaterials.length, 1);
  assert.equal(importedMaterials[0].title, 'Energy summary');
  assert.equal(importedMaterials[0].generator, 'authored');
  assert.equal(importedMaterials[0].citations[0].sourceId, source.id);

  const importedContext = repository.getLearningContext(
    'user-1',
    imported.notebook.id
  );
  assert.equal(importedContext.notebookId, imported.notebook.id);
  assert.equal(importedContext.userId, 'user-1');
  assert.equal(importedContext.answer.citation.sourceId, source.id);

  assert.equal(
    repository.listNotebooks('user-1').length,
    2,
    'importing must not overwrite the exported notebook'
  );
});

test('a malformed import reports errors and creates no notebook', () => {
  const storage = new MemoryStorage();
  const repository = createNotebookRepository(storage);
  const notebook = repository.createNotebook('user-1', { title: 'Keep me' }, now);
  const before = repository.listNotebooks('user-1').length;

  const missingTitle = repository.importNotebook('user-1', {
    format: 'crushlearn-notebook',
    schemaVersion: 1,
    notebook: { title: '' },
    sources: [],
    chat: [],
    materials: [],
  });
  assert.equal(missingTitle.ok, false);
  assert.ok(missingTitle.errors.length > 0);
  assert.equal(repository.listNotebooks('user-1').length, before);
  assert.equal(repository.getNotebook('user-1', notebook.id).title, 'Keep me');

  const notAnExport = repository.importNotebook('user-1', { hello: 'world' });
  assert.equal(notAnExport.ok, false);
  assert.match(notAnExport.errors.join(' '), /not a CrushLearn notebook export/);
  assert.equal(repository.listNotebooks('user-1').length, before);
});

test('an import rejects unverifiable citations and dates', () => {
  const storage = new MemoryStorage();
  const repository = createNotebookRepository(storage);
  const notebook = repository.createNotebook('user-1', { title: 'Biology' }, now);
  const source = addPastedSource(repository, 'user-1', notebook.id);
  repository.appendChatMessage(
    'user-1',
    notebook.id,
    {
      role: 'assistant',
      content: 'The notes define photosynthesis.',
      citations: [citationFor(source.id)],
    },
    now
  );

  const exported = repository.exportNotebook('user-1', notebook.id, {
    format: 'json',
    now: '2026-10-21T10:00:00.000Z',
  });
  assert.equal(exported.ok, true);

  const dangling = JSON.parse(exported.content);
  dangling.chat[0].citations[0].sourceId = 'source-elsewhere';
  const danglingResult = repository.importNotebook(
    'user-1',
    dangling,
    '2026-10-22T10:00:00.000Z'
  );
  assert.equal(danglingResult.ok, false);
  assert.match(danglingResult.errors.join(' '), /not part of this export/);
  assert.equal(repository.listNotebooks('user-1').length, 1);

  const invalidDate = JSON.parse(exported.content);
  invalidDate.notebook.createdAt = 'not-a-date';
  const dateResult = repository.importNotebook(
    'user-1',
    invalidDate,
    '2026-10-22T10:00:00.000Z'
  );
  assert.equal(dateResult.ok, false);
  assert.match(dateResult.errors.join(' '), /creation date/);
  assert.equal(repository.listNotebooks('user-1').length, 1);

  const reservedId = JSON.parse(exported.content);
  reservedId.sources[0].source.id = '__proto__';
  reservedId.chat[0].citations[0].sourceId = '__proto__';
  const reservedResult = repository.importNotebook(
    'user-1',
    reservedId,
    '2026-10-22T10:00:00.000Z'
  );
  assert.equal(reservedResult.ok, false);
  assert.match(reservedResult.errors.join(' '), /reserved source id/);
  assert.equal(repository.listNotebooks('user-1').length, 1);
});
