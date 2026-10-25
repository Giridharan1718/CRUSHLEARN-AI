import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  buildPdfPageText,
  extractDocxText,
  extractPdfText,
} from '../../src/notebooks/documentExtraction.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => path.join(here, '..', 'fixtures', name);

test('real PDF extraction preserves page text and page offsets', async () => {
  const bytes = await fs.readFile(fixture('two-page.pdf'));
  const result = await extractPdfText(bytes, {
    loadPdf: async () => pdfjs,
  });

  assert.match(result.text, /Photosynthesis converts light energy/);
  assert.match(result.text, /Chlorophyll absorbs light/);
  assert.equal(result.pageOffsets.length, 2);

  result.pageOffsets.forEach((page) => {
    assert.equal(
      result.text.slice(page.start, page.end),
      page.page === 1
        ? 'Photosynthesis converts light energy into chemical energy.'
        : 'Chlorophyll absorbs light in the visible spectrum.'
    );
  });
});

test('real DOCX extraction reads document text', async () => {
  const bytes = await fs.readFile(fixture('single-paragraph.docx'));
  const result = await extractDocxText(bytes, {
    loadMammoth: () => import('mammoth'),
  });

  assert.equal(result.text, 'Walking on imported air');
  assert.deepEqual(result.pageOffsets, []);
});

test('PDF line reconstruction uses coordinates and escapes document text as data', () => {
  const text = buildPdfPageText([
    { str: 'Second line', transform: [1, 0, 0, 1, 72, 700] },
    { str: '<script>', transform: [1, 0, 0, 1, 150, 720] },
    { str: 'First line', transform: [1, 0, 0, 1, 72, 720] },
  ]);

  assert.equal(text, 'First line <script>\nSecond line');
  assert.equal(globalThis.__pdfTextExecuted, undefined);
});

test('damaged documents produce bounded errors rather than parser crashes', async () => {
  await assert.rejects(
    () =>
      extractPdfText(new Uint8Array([1, 2, 3]), {
        loadPdf: async () => pdfjs,
      }),
    /could not be read|damaged|encrypted|unsupported/i
  );

  await assert.rejects(
    () =>
      extractDocxText(new Uint8Array([1, 2, 3]), {
        loadMammoth: () => import('mammoth'),
      }),
    /could not be read|damaged|unsupported/i
  );
});
