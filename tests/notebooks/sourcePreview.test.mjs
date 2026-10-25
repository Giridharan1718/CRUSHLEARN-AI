import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOURCE_PREVIEW_CHARS,
  getSourcePreview,
} from '../../src/notebooks/sourceAccess.mjs';

test('the preview is an exact slice of the stored source text', () => {
  const text = `Line one with CRLF\r\nLine two with “quotes” and <markup>.\n${'x'.repeat(500)}`;
  const sourceContents = {
    'source-1': { text, pageOffsets: [] },
  };

  const preview = getSourcePreview(sourceContents, 'source-1');
  assert.equal(preview.available, true);
  assert.equal(preview.text, text.slice(0, SOURCE_PREVIEW_CHARS));
  assert.equal(preview.text.length, SOURCE_PREVIEW_CHARS);
  assert.equal(preview.totalChars, text.length);
  assert.equal(preview.hasMore, true);
});

test('a short source has a complete preview and no full-text control', () => {
  const text = 'Photosynthesis converts light energy.';
  const preview = getSourcePreview(
    { 'source-1': { text, pageOffsets: [] } },
    'source-1'
  );

  assert.equal(preview.available, true);
  assert.equal(preview.text, text);
  assert.equal(preview.hasMore, false);
  assert.equal(preview.totalChars, text.length);
});

test('the preview length can be bounded and a missing source is honest', () => {
  const text = '0123456789';
  const preview = getSourcePreview(
    { 'source-1': { text, pageOffsets: [] } },
    'source-1',
    4
  );
  assert.equal(preview.text, '0123');
  assert.equal(preview.hasMore, true);

  assert.deepEqual(getSourcePreview({}, 'missing'), {
    available: false,
    text: '',
    hasMore: false,
    totalChars: 0,
  });
});
