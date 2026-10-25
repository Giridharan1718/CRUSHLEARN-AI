import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCitation } from '../../src/notebooks/citations.mjs';
import {
  chunkSourceText,
  splitTextIntoSentences,
  tokenize,
} from '../../src/notebooks/sourceText.mjs';
import {
  buildPassageContext,
  formatSearchResultLocation,
  searchNotebookSources,
} from '../../src/notebooks/sourceRetrieval.mjs';

const plantNotes = [
  'Photosynthesis is the process by which plants convert light energy into chemical energy.',
  'Chlorophyll is the green pigment that absorbs light in the visible spectrum.',
  'The Calvin cycle uses ATP and NADPH to build sugars from carbon dioxide.',
  'Mitochondria release usable energy from glucose during cellular respiration.',
].join(' ');

const economicsNotes = [
  'Demand is the quantity of a good that buyers are willing and able to purchase.',
  'A market price coordinates buyers and sellers when supply and demand meet.',
  'Energy prices connect fuel suppliers with the buyers who need power.',
].join(' ');

const sources = [
  {
    id: 'source-biology',
    title: 'Biology notes',
    status: 'ready',
    hasExtractedText: true,
  },
  {
    id: 'source-economics',
    title: 'Economics notes',
    status: 'ready',
    hasExtractedText: true,
  },
  {
    id: 'source-failed',
    title: 'Scanned scan',
    status: 'failed',
    hasExtractedText: false,
  },
];

const sourceContents = {
  'source-biology': {
    text: plantNotes,
    pageOffsets: [
      { page: 1, start: 0, end: 165 },
      { page: 2, start: 166, end: plantNotes.length },
    ],
  },
  'source-economics': { text: economicsNotes, pageOffsets: [] },
};

test('chunks preserve exact offsets and remain bounded', () => {
  const longText = `${plantNotes} `.repeat(4);
  const chunks = chunkSourceText(longText);
  assert.ok(chunks.length >= 2);

  chunks.forEach((chunk) => {
    assert.equal(chunk.text, longText.slice(chunk.start, chunk.end));
    assert.ok(chunk.text.length <= 900);
    assert.equal(chunk.text.trim(), chunk.text);
  });
});

test('sentence splitting keeps offsets exact and reaches long text', () => {
  const text = `The first sentence describes cells and their energy needs. ${'A very long clause, '.repeat(30)}Final sentence about genes.`;
  const sentences = splitTextIntoSentences(text);

  assert.ok(sentences.length >= 3);
  sentences.forEach((sentence) => {
    assert.equal(text.slice(sentence.start, sentence.end), sentence.text);
    assert.ok(sentence.text.length <= 420);
  });
});

test('tokenization removes common words but keeps domain terms', () => {
  assert.deepEqual(
    tokenize('The supply and demand for chlorophyll').slice(0, 4),
    ['supply', 'demand', 'chlorophyll']
  );
});

test('search finds exact source spans and verifies every citation', () => {
  const result = searchNotebookSources({
    sources,
    sourceContents,
    query: 'chlorophyll light',
  });

  assert.equal(result.ok, true);
  assert.ok(result.results.length >= 1);
  const top = result.results[0];
  assert.equal(top.sourceId, 'source-biology');
  assert.equal(top.page, 1);
  assert.match(top.text, /Chlorophyll/);
  assert.match(formatSearchResultLocation(top), /Biology notes, page 1/);

  const verification = validateCitation(top.citation, {
    sourceIds: sources.map((source) => source.id),
    sourceTexts: {
      'source-biology': plantNotes,
      'source-economics': economicsNotes,
    },
    requireSourceText: true,
  });
  assert.equal(verification.ok, true);
  assert.equal(verification.verified, true);
});

test('search ignores failed sources and returns honest empty/error states', () => {
  const noText = searchNotebookSources({
    sources: [sources[2]],
    sourceContents,
    query: 'scanned',
  });
  assert.equal(noText.ok, false);
  assert.match(noText.errors.join(' '), /ready source/i);

  const empty = searchNotebookSources({
    sources,
    sourceContents,
    query: '   ',
  });
  assert.equal(empty.ok, false);
  assert.match(empty.errors.join(' '), /Enter a word/i);

  const stopWords = searchNotebookSources({
    sources,
    sourceContents,
    query: 'the and of',
  });
  assert.equal(stopWords.ok, false);
  assert.match(stopWords.errors.join(' '), /searchable terms/i);

  const noMatch = searchNotebookSources({
    sources,
    sourceContents,
    query: 'quantum chromodynamics',
  });
  assert.equal(noMatch.ok, true);
  assert.deepEqual(noMatch.results, []);
});

test('cross-source search can retrieve both sources and does not expose failed text', () => {
  const biology = searchNotebookSources({
    sources,
    sourceContents,
    query: 'energy',
  });
  const economics = searchNotebookSources({
    sources,
    sourceContents,
    query: 'buyers sellers',
  });

  assert.ok(biology.results.some((result) => result.sourceId === 'source-biology'));
  assert.ok(
    economics.results.some((result) => result.sourceId === 'source-economics')
  );
  assert.ok(
    economics.results.every((result) => result.sourceId !== 'source-failed')
  );

  const synthetic = searchNotebookSources({
    sources: [
      {
        id: 'source-script',
        title: '<script>alert(1)</script>',
        status: 'ready',
        hasExtractedText: true,
      },
    ],
    sourceContents: {
      'source-script': {
        text: '<script>alert(1)</script> is text, not executable code.',
      },
    },
    query: 'script',
  });
  assert.match(synthetic.results[0].sourceTitle, /<script>/);
});

test('searching inside one source returns only that source', () => {
  const scoped = searchNotebookSources({
    sources,
    sourceContents,
    query: 'energy',
    sourceId: 'source-economics',
  });

  assert.equal(scoped.ok, true);
  assert.ok(scoped.results.length >= 1);
  assert.ok(
    scoped.results.every((result) => result.sourceId === 'source-economics'),
    'no passage from another source may appear in a scoped search'
  );

  // The biology source also matches "energy", so an unscoped search would
  // have returned it. The scoped search must not.
  const unscoped = searchNotebookSources({
    sources,
    sourceContents,
    query: 'energy',
  });
  assert.ok(unscoped.results.some((result) => result.sourceId === 'source-biology'));
});

test('a scoped search reports the right page for its passages', () => {
  const scoped = searchNotebookSources({
    sources,
    sourceContents,
    query: 'Calvin cycle',
    sourceId: 'source-biology',
  });

  assert.equal(scoped.ok, true);
  assert.ok(scoped.results.length >= 1);
  scoped.results.forEach((result) => {
    assert.equal(result.sourceId, 'source-biology');
    // The Calvin cycle sentence sits in the second page range.
    assert.equal(result.page, 2);
  });
});

test('a scoped search citation validates against its own source', () => {
  const scoped = searchNotebookSources({
    sources,
    sourceContents,
    query: 'chlorophyll',
    sourceId: 'source-biology',
  });

  const verification = validateCitation(scoped.results[0].citation, {
    sourceIds: ['source-biology'],
    sourceTexts: { 'source-biology': plantNotes },
    requireSourceText: true,
  });
  assert.equal(verification.ok, true);
  assert.equal(verification.verified, true);
});

test('searching a source that is not in the notebook fails honestly', () => {
  const missing = searchNotebookSources({
    sources,
    sourceContents,
    query: 'energy',
    sourceId: 'source-not-here',
  });

  assert.equal(missing.ok, false);
  assert.deepEqual(missing.results, []);
  assert.match(missing.errors.join(' '), /not in this notebook/i);
});

test('searching a source with no extracted text says so', () => {
  const failed = searchNotebookSources({
    sources,
    sourceContents,
    query: 'scanned',
    sourceId: 'source-failed',
  });

  assert.equal(failed.ok, false);
  assert.match(failed.errors.join(' '), /no extracted text/i);
});

test('a passage context shows the match inside the real source text', () => {
  const scoped = searchNotebookSources({
    sources,
    sourceContents,
    query: 'Calvin cycle',
    sourceId: 'source-biology',
  });
  const top = scoped.results[0];
  const context = buildPassageContext(
    sourceContents,
    top.sourceId,
    top.citation.locator.start,
    top.citation.locator.end
  );

  assert.ok(context);
  assert.equal(context.match, top.text);
  assert.equal(context.page, 2);
  // The context is the source's own text, not a paraphrase.
  assert.equal(
    plantNotes.slice(context.start - context.before.length, context.start),
    context.before
  );
  assert.equal(
    plantNotes.slice(context.end, context.end + context.after.length),
    context.after
  );
});

test('a passage context refuses offsets that are not in the source', () => {
  assert.equal(
    buildPassageContext(sourceContents, 'source-biology', 0, 99999),
    null
  );
  assert.equal(buildPassageContext(sourceContents, 'source-biology', 10, 5), null);
  assert.equal(
    buildPassageContext(sourceContents, 'source-missing', 0, 10),
    null
  );
});
