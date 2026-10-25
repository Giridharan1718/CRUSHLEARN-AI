// Deterministic text utilities for notebook search and local study tools.
//
// These helpers do not generate claims. They only tokenize, split, chunk and
// locate text that already exists in a source. Every returned quotation keeps
// character offsets so the citation verifier can check it against the source.

export const CHUNK_TARGET_CHARS = 620;
export const CHUNK_MAX_CHARS = 900;
export const CHUNK_MIN_CHARS = 80;
export const MAX_SEARCH_QUERY_CHARS = 300;
export const MAX_QUERY_TERMS = 12;
export const MAX_SENTENCE_CHARS = 420;

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'also', 'am',
  'an', 'and', 'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before',
  'being', 'below', 'between', 'both', 'but', 'by', 'can', 'could', 'did',
  'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from',
  'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers',
  'herself', 'him', 'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is',
  'it', 'its', 'itself', 'just', 'me', 'more', 'most', 'my', 'myself', 'no',
  'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our',
  'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', 'should', 'so',
  'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them',
  'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through',
  'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what',
  'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with',
  'would', 'you', 'your', 'yours', 'yourself', 'yourselves',
]);

export function tokenize(text) {
  const matches = String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .match(/[\p{L}\p{N}][\p{L}\p{N}'_-]*/gu);

  if (!matches) return [];

  return matches
    .filter((term) => {
      if (STOP_WORDS.has(term)) return false;
      if (/^\p{Script=Han}+$/u.test(term)) return true;
      return term.length >= 2 && !/^\d+$/.test(term);
    })
    .slice(0, 5000);
}

export function getContentText(content) {
  if (typeof content === 'string') return content;
  if (content && typeof content.text === 'string') return content.text;
  return '';
}

export function getPageOffsets(content) {
  if (!content || typeof content !== 'object') return [];
  return Array.isArray(content.pageOffsets) ? content.pageOffsets : [];
}

export function findPageNumber(content, offset) {
  if (!Number.isInteger(offset)) return null;
  const page = getPageOffsets(content).find(
    (item) => offset >= item.start && offset < item.end
  );
  return page ? page.page : null;
}

function trimRange(text, start, end) {
  let nextStart = start;
  let nextEnd = end;
  while (nextStart < nextEnd && /\s/.test(text[nextStart])) nextStart += 1;
  while (nextEnd > nextStart && /\s/.test(text[nextEnd - 1])) nextEnd -= 1;
  return { start: nextStart, end: nextEnd };
}

export function splitTextIntoSentences(text) {
  const source = String(text ?? '');
  const sentences = [];
  const pattern = /[^.!?\n]+(?:[.!?]+|$)/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const raw = match[0];
    if (!raw.trim()) continue;

    let cleaned = raw
      .replace(/^\s*[-*•]\s+/, '')
      .replace(/^#{1,6}\s*/, '')
      .trim();
    if (!cleaned) continue;

    const rawStart = match.index + raw.indexOf(cleaned);
    if (cleaned.length > MAX_SENTENCE_CHARS) {
      // Split over-long runs at the last useful space so every quotation stays
      // bounded and can be verified as a citation.
      let cursor = rawStart;
      let remaining = cleaned;

      while (remaining.length > MAX_SENTENCE_CHARS) {
        let cut = remaining.lastIndexOf(' ', MAX_SENTENCE_CHARS);
        if (cut < 120) cut = MAX_SENTENCE_CHARS;

        const rawPiece = remaining.slice(0, cut);
        const piece = rawPiece.trim();
        if (piece.length >= 30) {
          const leading = rawPiece.length - rawPiece.trimStart().length;
          const start = cursor + leading;
          sentences.push({
            text: piece,
            start,
            end: start + piece.length,
          });
        }

        cursor += cut;
        remaining = remaining.slice(cut);
        const leadingWhitespace = remaining.length - remaining.trimStart().length;
        cursor += leadingWhitespace;
        remaining = remaining.trimStart();
      }

      if (remaining.length >= 30) {
        sentences.push({
          text: remaining,
          start: cursor,
          end: cursor + remaining.length,
        });
      }
      continue;
    }

    if (cleaned.length < 30) continue;
    sentences.push({
      text: cleaned,
      start: rawStart,
      end: rawStart + cleaned.length,
    });
  }

  return sentences;
}

export function chunkSourceText(
  text,
  {
    sourceId = 'source',
    targetChars = CHUNK_TARGET_CHARS,
    maxChars = CHUNK_MAX_CHARS,
    minChars = CHUNK_MIN_CHARS,
  } = {}
) {
  const source = String(text ?? '');
  if (!source.trim()) return [];

  const chunks = [];
  let cursor = 0;

  while (cursor < source.length) {
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    if (cursor >= source.length) break;

    let end = Math.min(cursor + maxChars, source.length);

    if (end < source.length) {
      const lowerBound = Math.min(
        end,
        cursor + Math.max(minChars, targetChars - 80)
      );
      let boundary = -1;

      for (let index = end - 1; index >= lowerBound; index -= 1) {
        if (source[index] === '\n' && source[index + 1] === '\n') {
          boundary = index + 2;
          break;
        }
      }

      if (boundary < 0) {
        for (let index = end - 1; index >= lowerBound; index -= 1) {
          if (/[.!?]/.test(source[index])) {
            boundary = index + 1;
            break;
          }
        }
      }

      if (boundary < 0) {
        for (let index = end - 1; index >= lowerBound; index -= 1) {
          if (/\s/.test(source[index])) {
            boundary = index;
            break;
          }
        }
      }

      if (boundary > cursor) end = boundary;
    }

    const range = trimRange(source, cursor, Math.min(end, source.length));
    if (range.end > range.start) {
      const value = source.slice(range.start, range.end);
      if (value.trim()) {
        chunks.push({
          id: `${sourceId}:${range.start}-${range.end}`,
          sourceId,
          start: range.start,
          end: range.end,
          text: value,
        });
      }
    }

    cursor = end > cursor ? end : cursor + 1;
  }

  return chunks;
}

export function normalizeSearchQuery(query) {
  return String(query ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_SEARCH_QUERY_CHARS);
}
