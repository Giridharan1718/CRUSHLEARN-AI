// Local document text extraction.
//
// PDF and DOCX parsers are loaded only when a matching file is uploaded, so the
// initial application bundle does not pay their size cost. Extracted text is
// treated as untrusted data. Parsers are configured not to evaluate document
// JavaScript or document markup.

import { normalizeExtractedText } from './sourceSchema.mjs';

export const MAX_PDF_PAGES = 500;
export const MAX_PDF_TEXT_ITEMS = 250_000;

let pdfLibraryPromise = null;

async function loadPdfLibrary() {
  if (!pdfLibraryPromise) {
    pdfLibraryPromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfLibraryPromise;
}

function toArrayBuffer(value) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  throw new Error('The document data could not be read.');
}

function toUint8Array(value) {
  const arrayBuffer = toArrayBuffer(value);
  return new Uint8Array(arrayBuffer);
}

// Build readable lines from PDF text items. PDF coordinates place the origin at
// the bottom-left, so larger y values appear earlier on the page.
export function buildPdfPageText(items) {
  if (!Array.isArray(items)) return '';
  const lines = new Map();

  items.forEach((item) => {
    if (!item || typeof item.str !== 'string' || !item.str.trim()) return;
    const transform = Array.isArray(item.transform) ? item.transform : [];
    const x = Number(transform[4]);
    const y = Number(transform[5]);
    const safeX = Number.isFinite(x) ? x : 0;
    const safeY = Number.isFinite(y) ? Math.round(y * 2) / 2 : 0;
    if (!lines.has(safeY)) lines.set(safeY, []);
    lines.get(safeY).push({ x: safeX, text: item.str });
  });

  return [...lines.entries()]
    .sort(([leftY], [rightY]) => rightY - leftY)
    .map(([, entries]) =>
      entries
        .sort((left, right) => left.x - right.x)
        .map((entry) => entry.text.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/[ \t]+/g, ' ')
        .trim()
    )
    .filter(Boolean)
    .join('\n');
}

export async function extractPdfText(
  input,
  { loadPdf = loadPdfLibrary, maxPages = MAX_PDF_PAGES } = {}
) {
  const data = toUint8Array(input);
  const pdfjs = await loadPdf();
  let pdf = null;

  try {
    const loadingTask = pdfjs.getDocument({
      data,
      isEvalSupported: false,
      useSystemFonts: true,
      disableFontFace: true,
      verbosity: 0,
    });
    pdf = await loadingTask.promise;

    if (!Number.isInteger(pdf.numPages) || pdf.numPages < 1) {
      throw new Error('This PDF has no pages.');
    }
    if (pdf.numPages > maxPages) {
      throw new Error(`PDFs with more than ${maxPages} pages are not supported.`);
    }

    let text = '';
    let itemCount = 0;
    const pageOffsets = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = Array.isArray(content?.items) ? content.items : [];
      itemCount += items.length;
      if (itemCount > MAX_PDF_TEXT_ITEMS) {
        throw new Error('This PDF contains too much text to process locally.');
      }

      const pageText = normalizeExtractedText(buildPdfPageText(items));
      page.cleanup();
      if (!pageText) continue;

      if (text) text += '\n\n';
      const start = text.length;
      text += pageText;
      pageOffsets.push({ page: pageNumber, start, end: text.length });
    }

    if (!text.trim()) {
      throw new Error(
        'No selectable text was found. Scanned PDFs require OCR, which is not available in this browser.'
      );
    }

    return { text, pageOffsets };
  } catch (error) {
    if (error?.message && /PDFs with more than|too much text|no pages|No selectable text/i.test(error.message)) {
      throw error;
    }
    throw new Error(
      'The PDF could not be read. It may be damaged, encrypted or unsupported.'
    );
  } finally {
    if (pdf) {
      try {
        await pdf.destroy();
      } catch {
        // Cleanup failures do not change the extracted text.
      }
    }
  }
}

export async function extractDocxText(
  input,
  { loadMammoth = () => import('mammoth') } = {}
) {
  const arrayBuffer = toArrayBuffer(input);
  const mammoth = await loadMammoth();

  try {
    const options = { arrayBuffer };
    if (typeof Buffer !== 'undefined') {
      options.buffer = Buffer.from(arrayBuffer);
    }
    const result = await mammoth.extractRawText(options);
    const text = normalizeExtractedText(result?.value);

    if (!text) {
      throw new Error('No readable text was found in this DOCX file.');
    }

    return { text, pageOffsets: [] };
  } catch (error) {
    if (error?.message && /No readable text/i.test(error.message)) {
      throw error;
    }
    throw new Error(
      'The DOCX file could not be read. It may be damaged or in an unsupported format.'
    );
  }
}
