import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SOURCE_BYTES,
  MAX_SOURCE_TEXT_CHARS,
  SOURCE_STATUSES,
  SOURCE_TYPES,
} from '../../src/notebooks/sourceSchema.mjs';
import {
  ingestFileSource,
  ingestPastedSource,
} from '../../src/notebooks/sourceIngestion.mjs';

const now = '2026-10-20T10:00:00.000Z';

function textFile(name, content, extra = {}) {
  return {
    name,
    size: extra.size ?? new TextEncoder().encode(content).length,
    type: extra.type || 'text/plain',
    text: extra.text || (async () => content),
  };
}

function binaryFile(name, type, size = 2048) {
  return {
    name,
    size,
    type,
    arrayBuffer: async () => new Uint8Array(size).buffer,
  };
}

test('text and Markdown files are extracted into ready sources', async () => {
  const textResult = await ingestFileSource({
    notebookId: 'notebook-1',
    file: textFile('notes.txt', 'Line one\r\nLine two'),
    now,
  });

  assert.equal(textResult.ok, true);
  assert.equal(textResult.source.status, SOURCE_STATUSES.READY);
  assert.equal(textResult.source.sourceType, SOURCE_TYPES.TEXT);
  assert.equal(textResult.source.title, 'notes.txt');
  assert.equal(textResult.source.hasExtractedText, true);
  assert.equal(textResult.source.characterCount, 'Line one\nLine two'.length);
  assert.equal(textResult.content.text, 'Line one\nLine two');

  const markdownResult = await ingestFileSource({
    notebookId: 'notebook-1',
    file: textFile('guide.md', '# Heading\n\n- item'),
    now,
  });

  assert.equal(markdownResult.source.sourceType, SOURCE_TYPES.MARKDOWN);
  assert.equal(markdownResult.source.status, SOURCE_STATUSES.READY);
  assert.equal(markdownResult.content.text, '# Heading\n\n- item');
});

test('PDF and DOCX files use injected local extractors', async () => {
  const pdf = await ingestFileSource({
    notebookId: 'notebook-1',
    file: binaryFile('paper.pdf', 'application/pdf'),
    extractPdf: async () => ({
      text: 'A paper about cells.\n\nA second page about genes.',
      pageOffsets: [
        { page: 1, start: 0, end: 21 },
        { page: 2, start: 23, end: 48 },
      ],
    }),
    now,
  });

  assert.equal(pdf.ok, true);
  assert.equal(pdf.source.sourceType, SOURCE_TYPES.PDF);
  assert.equal(pdf.source.status, SOURCE_STATUSES.READY);
  assert.equal(pdf.source.hasExtractedText, true);
  assert.equal(pdf.source.pageCount, 2);
  assert.equal(pdf.content.pageOffsets.length, 2);

  const docx = await ingestFileSource({
    notebookId: 'notebook-1',
    file: binaryFile(
      'report.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ),
    extractDocx: async () => ({ text: 'A Word document about cells.' }),
    now,
  });

  assert.equal(docx.ok, true);
  assert.equal(docx.source.sourceType, SOURCE_TYPES.DOCX);
  assert.equal(docx.source.status, SOURCE_STATUSES.READY);
  assert.equal(docx.content.text, 'A Word document about cells.');
});

test('document extraction failures are recorded without throwing', async () => {
  const result = await ingestFileSource({
    notebookId: 'notebook-1',
    file: binaryFile('scanned.pdf', 'application/pdf'),
    extractPdf: async () => {
      throw new Error(
        'No selectable text was found. Scanned PDFs require OCR, which is not available in this browser.'
      );
    },
    now,
  });

  assert.equal(result.ok, true);
  assert.equal(result.source.status, SOURCE_STATUSES.FAILED);
  assert.match(result.source.error, /Scanned PDFs require OCR/i);
  assert.equal(result.content, null);
});

test('unsupported, empty and oversized files are rejected before storage', async () => {
  const legacyWord = await ingestFileSource({
    notebookId: 'notebook-1',
    file: textFile('report.doc', 'not used'),
  });
  assert.equal(legacyWord.ok, false);
  assert.match(legacyWord.errors.join(' '), /Legacy .doc files are not supported/i);

  const empty = await ingestFileSource({
    notebookId: 'notebook-1',
    file: { name: 'empty.txt', size: 0, type: 'text/plain', text: async () => '' },
  });
  assert.equal(empty.ok, false);
  assert.match(empty.errors.join(' '), /empty/i);

  const oversized = await ingestFileSource({
    notebookId: 'notebook-1',
    file: {
      name: 'huge.txt',
      size: MAX_SOURCE_BYTES + 1,
      type: 'text/plain',
      text: async () => 'unused',
    },
  });
  assert.equal(oversized.ok, false);
  assert.match(oversized.errors.join(' '), /5 MB or smaller/i);
});

test('extraction failures are recorded without throwing', async () => {
  const unreadable = await ingestFileSource({
    notebookId: 'notebook-1',
    file: textFile('broken.txt', 'unused', {
      text: async () => {
        throw new Error('read failed');
      },
    }),
    now,
  });
  assert.equal(unreadable.ok, true);
  assert.equal(unreadable.source.status, SOURCE_STATUSES.FAILED);
  assert.match(unreadable.source.error, /could not be read/i);

  const blank = await ingestFileSource({
    notebookId: 'notebook-1',
    file: textFile('blank.txt', ' \n\t '),
    now,
  });
  assert.equal(blank.ok, true);
  assert.equal(blank.source.status, SOURCE_STATUSES.FAILED);
  assert.match(blank.source.error, /No readable text/i);
});

test('extracted text over the character limit fails explicitly', async () => {
  const content = 'a'.repeat(MAX_SOURCE_TEXT_CHARS + 1);
  const result = await ingestFileSource({
    notebookId: 'notebook-1',
    file: textFile('long.txt', content),
    now,
  });

  assert.equal(result.ok, true);
  assert.equal(result.source.status, SOURCE_STATUSES.FAILED);
  assert.match(result.source.error, /character limit/i);
  assert.equal(result.content, null);
});

test('pasted text is normalized and receives a fallback title', () => {
  const result = ingestPastedSource({
    notebookId: 'notebook-1',
    title: '   ',
    text: '\uFEFF  First line\r\nSecond line  ',
    now,
  });

  assert.equal(result.ok, true);
  assert.equal(result.source.sourceType, SOURCE_TYPES.PASTED_TEXT);
  assert.equal(result.source.title, 'Pasted text');
  assert.equal(result.source.status, SOURCE_STATUSES.READY);
  assert.equal(result.content.text, 'First line\nSecond line');
  assert.equal(result.source.characterCount, 'First line\nSecond line'.length);
});

test('empty pasted text is rejected with a validation error', () => {
  const result = ingestPastedSource({
    notebookId: 'notebook-1',
    title: 'Notes',
    text: '   ',
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /Paste some text/i);
});

test('source text is treated as data, not executable input', async () => {
  const payload = '<script>window.__sourceExecuted = true</script>';
  const result = await ingestFileSource({
    notebookId: 'notebook-1',
    file: textFile('untrusted.txt', payload),
    now,
  });

  assert.equal(result.content.text, payload);
  assert.equal(globalThis.__sourceExecuted, undefined);
});
