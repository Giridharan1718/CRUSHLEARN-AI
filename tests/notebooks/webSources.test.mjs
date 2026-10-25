import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotebookRepository } from '../../src/notebooks/notebookRepository.mjs';
import { ingestWebSource } from '../../src/notebooks/sourceIngestion.mjs';
import {
  SOURCE_STATUSES,
  SOURCE_TYPES,
  normalizeSourceRecord,
  validateWebInput,
} from '../../src/notebooks/sourceSchema.mjs';
import {
  createNotebookExport,
  buildNotebookMarkdown,
  validateNotebookImportPayload,
} from '../../src/notebooks/notebookTransfer.mjs';
import { fetchWebPage } from '../../src/notebooks/gatewayClient.mjs';
import { MemoryStorage } from './memoryStorage.mjs';

const now = '2026-10-25T09:00:00.000Z';
const pageText =
  'Chlorophyll absorbs light in the visible spectrum. It reflects green light.';

function makeRepository() {
  const repository = createNotebookRepository(new MemoryStorage());
  const notebook = repository.createNotebook(
    'user-1',
    {
      title: 'Biology',
      description: 'Photosynthesis',
      kind: 'subject',
      tags: ['biology'],
    },
    now
  );
  return { repository, notebook };
}

test('web input accepts only complete http and https URLs without credentials', () => {
  assert.equal(validateWebInput({ url: 'https://example.com/article' }).ok, true);
  assert.equal(validateWebInput({ url: 'http://example.com' }).ok, true);

  for (const url of [
    '',
    'example.com/article',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'ftp://example.com/file',
    'https://user:pass@example.com',
  ]) {
    assert.equal(validateWebInput({ url }).ok, false, url);
  }
});

test('a fetched page becomes a ready web source with URL and retrieval time', async () => {
  const fetchedAt = '2026-10-25T09:01:02.000Z';
  let requested = null;

  const result = await ingestWebSource({
    notebookId: 'notebook-1',
    url: 'https://example.com/article',
    now,
    fetchPage: async (input) => {
      requested = input;
      return {
        ok: true,
        error: null,
        data: {
          ok: true,
          requested_url: input.url,
          final_url: 'https://www.example.com/article',
          fetched_at: fetchedAt,
          title: 'How leaves work',
          text: pageText,
          content_type: 'text/html',
          bytes_read: 2048,
          truncated: false,
        },
      };
    },
  });

  assert.equal(requested.url, 'https://example.com/article');
  assert.equal(result.ok, true);
  assert.equal(result.source.sourceType, SOURCE_TYPES.WEB);
  assert.equal(result.source.status, SOURCE_STATUSES.READY);
  assert.equal(result.source.title, 'How leaves work');
  assert.equal(result.source.url, 'https://www.example.com/article');
  assert.equal(result.source.retrievedAt, fetchedAt);
  assert.equal(result.source.characterCount, pageText.length);
  assert.equal(result.content.text, pageText);
});

test('a failed fetch is stored as a failed source with the real reason, not fake text', async () => {
  const result = await ingestWebSource({
    notebookId: 'notebook-1',
    url: 'https://example.com/blocked',
    now,
    fetchPage: async () => ({
      ok: false,
      data: null,
      error:
        'The host "example.com" resolves to a private or reserved address and was not fetched.',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.source.status, SOURCE_STATUSES.FAILED);
  assert.equal(result.source.url, 'https://example.com/blocked');
  assert.equal(result.source.retrievedAt, null);
  assert.match(result.source.error, /private or reserved address/);
  assert.equal(result.content, null);
});

test('a missing gateway produces a failed source instead of a browser fetch', async () => {
  const result = await ingestWebSource({
    notebookId: 'notebook-1',
    url: 'https://example.com/article',
    now,
    fetchPage: async () => ({
      ok: false,
      data: null,
      status: 0,
      error: 'The web reader gateway is not running.',
    }),
  });

  assert.equal(result.source.status, SOURCE_STATUSES.FAILED);
  assert.match(result.source.error, /gateway is not running/);
});

test('a repository stores a web source and its text and can export it losslessly', async () => {
  const { repository, notebook } = makeRepository();
  const fetchedAt = '2026-10-25T09:01:02.000Z';
  const result = await ingestWebSource({
    notebookId: notebook.id,
    url: 'https://example.com/article',
    now,
    fetchPage: async () => ({
      ok: true,
      error: null,
      data: {
        ok: true,
        final_url: 'https://example.com/article',
        fetched_at: fetchedAt,
        title: 'How leaves work',
        text: pageText,
        content_type: 'text/html',
        bytes_read: pageText.length,
      },
    }),
  });

  repository.addSource('user-1', notebook.id, {
    source: result.source,
    content: result.content,
  });

  const stored = repository.listSources('user-1', notebook.id)[0];
  assert.equal(stored.url, 'https://example.com/article');
  assert.equal(stored.retrievedAt, fetchedAt);
  assert.equal(
    repository.getSourceText('user-1', notebook.id, stored.id),
    pageText
  );

  const exported = createNotebookExport({
    notebook,
    sources: repository.listSources('user-1', notebook.id),
    sourceContents: repository.listSourceContents('user-1', notebook.id),
    exportedAt: now,
  });
  assert.equal(exported.sources[0].source.url, 'https://example.com/article');
  assert.equal(exported.sources[0].source.retrievedAt, fetchedAt);

  const validation = validateNotebookImportPayload(exported);
  assert.equal(validation.ok, true);
  assert.equal(validation.value.sources[0].source.url, 'https://example.com/article');
  assert.equal(validation.value.sources[0].content.text, pageText);

  const markdown = buildNotebookMarkdown(exported);
  assert.match(markdown, /- URL: https:\/\/example\.com\/article/);
  assert.match(markdown, /- Retrieved: 2026-10-25T09:01:02\.000Z/);
  assert.match(markdown, /Chlorophyll absorbs light/);
});

test('import rejects a web source without provenance or with a dangerous scheme', () => {
  const base = {
    format: 'crushlearn-notebook',
    schemaVersion: 1,
    exportedAt: now,
    notebook: {
      title: 'Biology',
      description: '',
      kind: 'subject',
      tags: [],
      createdAt: now,
      updatedAt: now,
    },
    sources: [
      {
        source: {
          id: 'source-web',
          title: 'Page',
          sourceType: 'web',
          status: 'failed',
          error: 'Not fetched',
          createdAt: now,
          updatedAt: now,
        },
        content: null,
      },
    ],
    chat: [],
    materials: [],
  };

  const missingUrl = validateNotebookImportPayload(base);
  assert.equal(missingUrl.ok, false);
  assert.match(missingUrl.errors.join(' '), /invalid source metadata/);

  const unsafe = structuredClone(base);
  unsafe.sources[0].source.url = 'javascript:alert(1)';
  unsafe.sources[0].source.retrievedAt = now;
  const unsafeResult = validateNotebookImportPayload(unsafe);
  assert.equal(unsafeResult.ok, false);
  assert.match(unsafeResult.errors.join(' '), /invalid source metadata/);
});

test('normalizing a web source canonicalizes its URL and drops invalid retrieval dates', () => {
  const normalized = normalizeSourceRecord({
    id: 'source-web',
    notebookId: 'notebook-1',
    title: 'Page',
    sourceType: 'web',
    url: 'https://Example.com/a b',
    retrievedAt: 'not-a-date',
    status: 'failed',
    error: 'Not fetched',
    createdAt: now,
    updatedAt: now,
  });

  assert.equal(normalized.url, 'https://example.com/a%20b');
  assert.equal(normalized.retrievedAt, null);
});

test('the client sends the URL to the gateway and never fetches the page itself', async () => {
  let captured = null;
  const result = await fetchWebPage({
    url: 'https://example.com/article',
    fetchImpl: async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            requested_url: 'https://example.com/article',
            final_url: 'https://example.com/article',
            fetched_at: now,
            title: 'Article',
            text: 'Readable text.',
            content_type: 'text/html',
            bytes_read: 14,
            truncated: false,
          }),
      };
    },
  });

  assert.equal(captured.url, '/api/fetch');
  assert.equal(captured.body.url, 'https://example.com/article');
  assert.equal(result.ok, true);
  assert.equal(result.data.text, 'Readable text.');
});

test('the client reports an unreachable gateway without trying the URL directly', async () => {
  const result = await fetchWebPage({
    url: 'https://example.com/article',
    fetchImpl: async () => {
      throw new Error('connect ECONNREFUSED');
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /gateway is not running/);
});
