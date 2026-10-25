import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCitationLabel,
  validateCitation,
  validateMessageCitations,
} from '../../src/notebooks/citations.mjs';

const sourceId = 'source-1';
const text = 'Alpha beta gamma delta';
const sourceTexts = { [sourceId]: text };

test('an offset citation is verified against the stored source text', () => {
  const result = validateCitation(
    {
      sourceId,
      quote: 'beta gamma',
      locator: { kind: 'offset', start: 6, end: 16 },
    },
    { sourceIds: [sourceId], sourceTexts, requireSourceText: true }
  );

  assert.equal(result.ok, true);
  assert.equal(result.verified, true);
  assert.deepEqual(result.citation.locator, {
    kind: 'offset',
    start: 6,
    end: 16,
  });
});

test('a mismatched quote or wrong offset is rejected', () => {
  const mismatch = validateCitation(
    {
      sourceId,
      quote: 'beta delta',
      locator: { kind: 'offset', start: 6, end: 16 },
    },
    { sourceIds: [sourceId], sourceTexts }
  );
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.verified, false);
  assert.match(mismatch.errors.join(' '), /does not match the source/i);

  const wrongLength = validateCitation(
    {
      sourceId,
      quote: 'beta',
      locator: { kind: 'offset', start: 6, end: 16 },
    },
    { sourceIds: [sourceId], sourceTexts }
  );
  assert.equal(wrongLength.ok, false);
  assert.match(wrongLength.errors.join(' '), /offsets do not match/i);
});

test('citations outside the notebook or without a locator are rejected', () => {
  const unknownSource = validateCitation(
    {
      sourceId: 'source-2',
      quote: 'beta gamma',
      locator: { kind: 'offset', start: 6, end: 16 },
    },
    { sourceIds: [sourceId], sourceTexts }
  );
  assert.equal(unknownSource.ok, false);
  assert.match(unknownSource.errors.join(' '), /outside this notebook/i);

  const noLocator = validateCitation({
    sourceId,
    quote: 'beta gamma',
  });
  assert.equal(noLocator.ok, false);
  assert.match(noLocator.errors.join(' '), /page or offset locator/i);
});

test('page citations are supported when source text cannot be checked', () => {
  const result = validateCitation(
    {
      sourceId,
      quote: 'beta gamma',
      locator: { kind: 'page', page: 4 },
    },
    { sourceIds: [sourceId] }
  );

  assert.equal(result.ok, true);
  assert.equal(result.verified, false);
  assert.equal(
    formatCitationLabel(result.citation, { title: 'Biology notes' }),
    'Biology notes, page 4'
  );
});

test('a message is rejected if any citation is invalid', () => {
  const valid = validateMessageCitations(
    {
      citations: [
        {
          sourceId,
          quote: 'beta gamma',
          locator: { kind: 'offset', start: 6, end: 16 },
        },
      ],
    },
    { sources: [{ id: sourceId }], sourceTexts }
  );
  assert.equal(valid.ok, true);

  const invalid = validateMessageCitations(
    {
      citations: [
        {
          sourceId,
          quote: 'not in the source',
          locator: { kind: 'offset', start: 0, end: 17 },
        },
      ],
    },
    { sources: [{ id: sourceId }], sourceTexts }
  );
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join(' '), /Citation 1/i);
  assert.equal(
    formatCitationLabel(
      {
        sourceId,
        locator: { kind: 'offset', start: 6, end: 16 },
      },
      { title: 'Biology notes' }
    ),
    'Biology notes, characters 6-16'
  );
});
