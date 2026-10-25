import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectSourceCitationIds,
  countSourceCitations,
  findSourceDependents,
} from '../../src/notebooks/sourceDependencies.mjs';

const sourceId = 'source-1';
const otherSourceId = 'source-2';

const citation = {
  sourceId,
  quote: 'Photosynthesis converts light energy.',
  locator: { kind: 'offset', start: 0, end: 37 },
};

const otherCitation = {
  ...citation,
  sourceId: otherSourceId,
};

test('source dependents list materials, chat and the learning context once', () => {
  const dependents = findSourceDependents({
    sourceId,
    materials: [
      {
        id: 'material-1',
        title: 'Photosynthesis summary',
        kind: 'summary',
        body: 'A saved summary that quotes the source.',
        citations: [citation],
      },
      {
        id: 'material-2',
        title: 'Unrelated note',
        kind: 'note',
        body: 'This does not cite the source.',
        citations: [otherCitation],
      },
    ],
    messages: [
      {
        id: 'message-1',
        role: 'assistant',
        content: 'The source says photosynthesis converts light.',
        citations: [citation],
      },
      {
        id: 'message-2',
        role: 'user',
        content: 'A question without a citation.',
        citations: [],
      },
    ],
    learningContext: {
      userId: 'user-1',
      notebookId: 'notebook-1',
      currentQuestion: 'How does photosynthesis work?',
      answer: {
        text: 'Photosynthesis converts light energy.',
        citation,
      },
      evidence: [
        {
          sourceId,
          sourceTitle: 'Biology notes',
          quote: citation.quote,
          citation,
        },
      ],
      adaptive: {
        sourceFacts: [
          {
            sourceId,
            sourceTitle: 'Biology notes',
            quote: citation.quote,
            citation,
          },
        ],
      },
      turns: [],
    },
  });

  assert.deepEqual(
    dependents.map((item) => item.kind),
    ['material', 'chat', 'learning_context']
  );
  assert.equal(dependents[0].label, 'Saved material: Photosynthesis summary');
  assert.match(dependents[0].excerpt, /quotes the source/);
  assert.equal(dependents[1].label, 'Chat message (assistant)');
  assert.match(dependents[1].excerpt, /photosynthesis/);
  assert.equal(dependents[2].label, 'Saved learning context');
  assert.match(dependents[2].excerpt, /How does photosynthesis work/);
  assert.equal(dependents[2].citationCount, 3);
});

test('a source with no citations has no dependents', () => {
  assert.deepEqual(
    findSourceDependents({
      sourceId,
      materials: [
        {
          id: 'material-1',
          title: 'Other source only',
          body: 'Uses another source.',
          citations: [otherCitation],
        },
      ],
      messages: [
        {
          id: 'message-1',
          role: 'assistant',
          content: 'Uses another source.',
          citations: [otherCitation],
        },
      ],
      learningContext: null,
    }),
    []
  );
  assert.deepEqual(findSourceDependents({ sourceId: '' }), []);
  assert.deepEqual(findSourceDependents(), []);
});

test('the dependency scan follows nested records and tolerates cycles', () => {
  const nested = {
    adaptive: {
      hypotheses: [
        {
          text: 'A hypothesis that cites a source.',
          citation,
        },
      ],
    },
  };
  nested.self = nested;

  assert.equal(countSourceCitations(nested, sourceId), 1);
  assert.equal(countSourceCitations(nested, otherSourceId), 0);

  const ids = collectSourceCitationIds(nested);
  assert.deepEqual([...ids], [sourceId]);
});

test('citation ids are collected once from chat, materials and context', () => {
  const record = {
    chat: [{ citations: [citation, citation] }, { citations: [otherCitation] }],
    materials: [{ citations: [citation] }],
    learningContext: {
      answer: { citation },
      evidence: [{ citation: otherCitation }],
    },
  };

  assert.deepEqual(
    [...collectSourceCitationIds(record)].sort(),
    [sourceId, otherSourceId].sort()
  );
  assert.deepEqual([...collectSourceCitationIds(null)], []);
});
