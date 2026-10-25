// The difference between a citation that is well-formed and a citation that
// has been checked.
//
// A citation naming a page, or a citation whose source text has not been
// loaded, can be perfectly well-formed. It is still not evidence. These
// tests pin the rule that when a caller asks for verified citations, a
// citation that was never compared against the source text must not be
// reported as good.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CITATION_LOCATOR_KINDS,
  validateCitation,
  validateMessageCitations,
} from '../../src/notebooks/citations.mjs';
import { revalidateLearningContext } from '../../src/intelligence/learningContext.mjs';

const sourceId = 'source-1';
const text = 'Alpha beta gamma delta epsilon';
const sourceTexts = { [sourceId]: text };

test('a page citation is not verified, and asking for verified citations rejects it', () => {
  const citation = {
    sourceId,
    quote: 'beta gamma',
    locator: { kind: CITATION_LOCATOR_KINDS.PAGE, page: 4 },
  };

  // Without the requirement it is well-formed: it names a source and a page.
  const lenient = validateCitation(citation, { sourceIds: [sourceId] });
  assert.equal(lenient.ok, true);
  assert.equal(lenient.verified, false);

  // With the requirement it is rejected, because nobody compared the quote to
  // the text. A page number does not prove what the passage says.
  const strict = validateCitation(citation, {
    sourceIds: [sourceId],
    sourceTexts,
    requireSourceText: true,
  });
  assert.equal(strict.ok, false);
  assert.equal(strict.verified, false);
  assert.match(strict.errors.join(' '), /page locator/i);
});

test('an offset citation whose source text is unavailable is not verified', () => {
  const citation = {
    sourceId,
    quote: 'beta gamma',
    locator: { kind: CITATION_LOCATOR_KINDS.OFFSET, start: 6, end: 16 },
  };

  const lenient = validateCitation(citation, { sourceIds: [sourceId] });
  assert.equal(lenient.ok, true);
  assert.equal(lenient.verified, false);

  const strict = validateCitation(citation, {
    sourceIds: [sourceId],
    requireSourceText: true,
  });
  assert.equal(strict.ok, false);
  assert.equal(strict.verified, false);
  assert.match(strict.errors.join(' '), /source text is unavailable/i);
});

test('an offset citation that matches the stored text is verified', () => {
  const result = validateCitation(
    {
      sourceId,
      quote: 'beta gamma',
      locator: { kind: CITATION_LOCATOR_KINDS.OFFSET, start: 6, end: 16 },
    },
    { sourceIds: [sourceId], sourceTexts, requireSourceText: true }
  );

  assert.equal(result.ok, true);
  assert.equal(result.verified, true);
});

test('a citation that fails to match the stored text is rejected', () => {
  const result = validateCitation(
    {
      sourceId,
      quote: 'beta delta',
      locator: { kind: CITATION_LOCATOR_KINDS.OFFSET, start: 6, end: 16 },
    },
    { sourceIds: [sourceId], sourceTexts, requireSourceText: true }
  );

  assert.equal(result.ok, false);
  assert.equal(result.verified, false);
  assert.match(result.errors.join(' '), /does not match the source/i);
});

test('a message carrying an unverifiable citation is rejected when verification is required', () => {
  const message = {
    citations: [
      {
        sourceId,
        quote: 'beta gamma',
        locator: { kind: CITATION_LOCATOR_KINDS.PAGE, page: 4 },
      },
    ],
  };

  const rejected = validateMessageCitations(
    message,
    { sources: [{ id: sourceId }], sourceTexts, requireSourceText: true }
  );
  assert.equal(rejected.ok, false);
  assert.match(rejected.errors.join(' '), /Citation 1/i);
});

test('revalidation drops a page-located citation from the learning context', () => {
  const context = {
    schemaVersion: 1,
    userId: 'user-1',
    notebookId: 'notebook-1',
    answer: {
      text: 'beta gamma',
      citation: {
        sourceId,
        quote: 'beta gamma',
        locator: { kind: CITATION_LOCATOR_KINDS.PAGE, page: 4 },
      },
      sourceTitle: 'Biology notes',
      page: 4,
      generator: 'local_extractive',
      note: '',
    },
    evidence: [],
    visual: null,
    relatedVisual: null,
    practice: null,
    adaptive: null,
    turns: [],
    updatedAt: '2026-10-21T10:00:00.000Z',
  };

  const revalidated = revalidateLearningContext(context, {
    sources: [{ id: sourceId }],
    sourceContents: { [sourceId]: { text, pageOffsets: [] } },
  });

  // The context survives, but the unverified answer does not. A page locator
  // cannot support a quotation, so the answer is dropped rather than shown.
  assert.ok(revalidated);
  assert.equal(revalidated.answer, null);
});

test('revalidation keeps an answer whose citation matches the stored text', () => {
  const context = {
    schemaVersion: 1,
    userId: 'user-1',
    notebookId: 'notebook-1',
    answer: {
      text: 'beta gamma',
      citation: {
        sourceId,
        quote: 'beta gamma',
        locator: { kind: CITATION_LOCATOR_KINDS.OFFSET, start: 6, end: 16 },
      },
      sourceTitle: 'Biology notes',
      page: null,
      generator: 'local_extractive',
      note: '',
    },
    evidence: [],
    visual: null,
    relatedVisual: null,
    practice: null,
    adaptive: null,
    turns: [],
    updatedAt: '2026-10-21T10:00:00.000Z',
  };

  const revalidated = revalidateLearningContext(context, {
    sources: [{ id: sourceId }],
    sourceContents: { [sourceId]: { text, pageOffsets: [] } },
  });

  assert.ok(revalidated);
  assert.ok(revalidated.answer);
  assert.equal(revalidated.answer.citation.locator.start, 6);
});
