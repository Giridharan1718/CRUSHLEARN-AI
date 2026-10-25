import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTEBOOK_TRANSFER_FORMAT,
  NOTEBOOK_TRANSFER_VERSION,
  buildNotebookMarkdown,
  createNotebookExport,
  notebookExportFilename,
  validateNotebookImportPayload,
} from '../../src/notebooks/notebookTransfer.mjs';

const now = '2026-10-20T10:00:00.000Z';
const text = 'Photosynthesis converts light energy into chemical energy.';

const citation = {
  sourceId: 'source-1',
  quote: 'Photosynthesis',
  locator: { kind: 'offset', start: 0, end: 14 },
};

function makePayload() {
  return createNotebookExport({
    notebook: {
      id: 'notebook-original',
      title: 'Biology final',
      description: 'Cells and energy',
      kind: 'course',
      tags: ['biology', 'exam'],
      createdAt: now,
      updatedAt: now,
    },
    sources: [
      {
        id: 'source-1',
        notebookId: 'notebook-original',
        title: 'Biology notes',
        sourceType: 'pasted_text',
        status: 'ready',
        error: null,
        hasExtractedText: true,
        characterCount: text.length,
        pageCount: 0,
        fileName: null,
        mimeType: null,
        sizeBytes: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'source-2',
        notebookId: 'notebook-original',
        title: 'Scanned handout',
        sourceType: 'pdf',
        status: 'failed',
        error: 'No readable text was found in this file.',
        hasExtractedText: false,
        characterCount: 0,
        pageCount: 0,
        fileName: 'handout.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 4096,
        createdAt: now,
        updatedAt: now,
      },
    ],
    sourceContents: {
      'source-1': { text, pageOffsets: [] },
    },
    messages: [
      {
        id: 'message-1',
        role: 'user',
        content: 'What is photosynthesis?',
        citations: [],
        createdAt: now,
      },
      {
        id: 'message-2',
        role: 'assistant',
        content: 'The notes define photosynthesis.',
        citations: [citation],
        createdAt: now,
      },
    ],
    materials: [
      {
        id: 'material-1',
        title: 'Energy summary',
        kind: 'summary',
        body: 'Plants convert light into chemical energy.',
        generator: 'authored',
        citations: [citation],
        createdAt: now,
      },
    ],
    exportedAt: now,
  });
}

test('a JSON export contains metadata, source text, chat and materials', () => {
  const payload = makePayload();

  assert.equal(payload.format, NOTEBOOK_TRANSFER_FORMAT);
  assert.equal(payload.schemaVersion, NOTEBOOK_TRANSFER_VERSION);
  assert.equal(payload.notebook.title, 'Biology final');
  assert.equal(payload.sources.length, 2);
  assert.equal(payload.sources[0].content.text, text);
  assert.equal(payload.sources[1].content, null);
  assert.equal(payload.sources[1].source.error, 'No readable text was found in this file.');
  assert.equal(payload.chat.length, 2);
  assert.equal(payload.materials.length, 1);

  const validation = validateNotebookImportPayload(payload);
  assert.equal(validation.ok, true);
  assert.equal(validation.errors.length, 0);
  assert.equal(validation.value.sources.length, 2);
  assert.equal(validation.value.chat.length, 2);
  assert.equal(validation.value.materials.length, 1);
});

test('a Markdown export includes every source, chat turn, material and citation', () => {
  const markdown = buildNotebookMarkdown(makePayload());

  assert.match(markdown, /# Biology final/);
  assert.match(markdown, /Cells and energy/);
  assert.match(markdown, /## Sources/);
  assert.match(markdown, /### 1\. Biology notes/);
  assert.match(markdown, /### 2\. Scanned handout/);
  assert.match(markdown, /Photosynthesis converts light energy into chemical energy\./);
  assert.match(markdown, /No readable text was found in this file\./);
  assert.match(markdown, /## Chat history/);
  assert.match(markdown, /What is photosynthesis\?/);
  assert.match(markdown, /The notes define photosynthesis\./);
  assert.match(markdown, /## Study materials/);
  assert.match(markdown, /### 1\. Energy summary/);
  assert.match(markdown, /Authored by the learner/);
  assert.match(markdown, /Plants convert light into chemical energy\./);
  assert.match(markdown, /Biology notes, characters 0-14: “Photosynthesis”/);
});

test('malformed export envelopes fail before any import', () => {
  assert.equal(
    validateNotebookImportPayload({ format: 'something-else' }).ok,
    false
  );
  assert.match(
    validateNotebookImportPayload({ format: 'something-else' }).errors[0],
    /not a CrushLearn notebook export/
  );

  const newer = makePayload();
  newer.schemaVersion = NOTEBOOK_TRANSFER_VERSION + 1;
  const newerResult = validateNotebookImportPayload(newer);
  assert.equal(newerResult.ok, false);
  assert.match(newerResult.errors[0], /newer|format version/i);

  const noNotebook = makePayload();
  delete noNotebook.notebook;
  assert.equal(validateNotebookImportPayload(noNotebook).ok, false);

  assert.equal(
    validateNotebookImportPayload(null).ok,
    false
  );
});

test('invalid source, chat and material records reject the whole import', () => {
  const missingText = makePayload();
  missingText.sources[0].content = null;
  const missingTextResult = validateNotebookImportPayload(missingText);
  assert.equal(missingTextResult.ok, false);
  assert.match(missingTextResult.errors.join(' '), /no readable stored text/);

  const duplicateSource = makePayload();
  duplicateSource.sources[1].source.id = 'source-1';
  assert.match(
    validateNotebookImportPayload(duplicateSource).errors.join(' '),
    /repeats the source id/
  );

  const badChat = makePayload();
  badChat.chat.push({ id: 'message-bad', role: 'narrator', content: '' });
  assert.match(
    validateNotebookImportPayload(badChat).errors.join(' '),
    /Chat message 3 is not a valid record/
  );

  const badMaterial = makePayload();
  badMaterial.materials[0].body = '';
  assert.match(
    validateNotebookImportPayload(badMaterial).errors.join(' '),
    /Study material 1 is not a valid record/
  );
});

test('export filenames are safe and dated', () => {
  assert.equal(
    notebookExportFilename('Biology final: exam #1', 'json', now),
    'biology-final-exam-1-2026-10-20.json'
  );
  assert.equal(
    notebookExportFilename('', 'md', now),
    'notebook-2026-10-20.md'
  );
});
