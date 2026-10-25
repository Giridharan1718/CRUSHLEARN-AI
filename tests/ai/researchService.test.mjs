import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyModelClaims,
  buildEvidenceRows,
  buildResearchAnswer,
  buildResearchPlan,
  classifyClaim,
  compareNotebookEvidence,
  detectNotebookDisagreements,
  exploreNotebookTopic,
  mapGatewayClaims,
  mapGatewayConflicts,
  rerankNotebookResults,
  runGroundedResearch,
} from '../../src/ai/researchService.mjs';
import { extractSourceConcepts } from '../../src/notebooks/sourceConcepts.mjs';

const sourceOneText =
  'Chlorophyll absorbs light energy during photosynthesis. ' +
  'The experiment measured leaf colour in twenty plants. ' +
  'We conclude that chlorophyll increases light absorption.';

const sourceTwoText =
  'Chlorophyll does not absorb light energy during photosynthesis. ' +
  'The experiment used a different sample of leaves. ' +
  'We conclude that chlorophyll decreases light absorption.';

const sourceThreeText =
  'Chlorophyll captures photons in the visible spectrum. ' +
  'The sample was collected from shade leaves.';

const sources = [
  {
    id: 'source-1',
    title: 'Light and leaves',
    status: 'ready',
    hasExtractedText: true,
    sourceType: 'pdf',
  },
  {
    id: 'source-2',
    title: 'A conflicting trial',
    status: 'ready',
    hasExtractedText: true,
    sourceType: 'pdf',
  },
  {
    id: 'source-3',
    title: 'Photon notes',
    status: 'ready',
    hasExtractedText: true,
    sourceType: 'text',
  },
];

const sourceContents = {
  'source-1': { text: sourceOneText, pageOffsets: [{ start: 0, end: 72, page: 1 }] },
  'source-2': { text: sourceTwoText, pageOffsets: [{ start: 0, end: 76, page: 2 }] },
  'source-3': { text: sourceThreeText, pageOffsets: [] },
};

test('rule-based concepts keep a verified first quotation and source spread', () => {
  const concepts = extractSourceConcepts({ sources, sourceContents });
  assert.ok(concepts.length > 0);
  assert.equal(concepts[0].label, 'Rule-based key term');
  assert.ok(concepts.every((concept) => concept.term.length >= 3));
  const chlorophyll = concepts.find((concept) => concept.term === 'chlorophyll');
  assert.ok(chlorophyll);
  assert.equal(chlorophyll.sourceCount, 3);
  assert.ok(chlorophyll.firstEvidence.citation.quote.length > 0);
  assert.match(chlorophyll.firstEvidence.citation.quote, /Chlorophyll/i);
});

test('a plan is built from the question and reports real retrieval gaps', () => {
  const plan = buildResearchPlan({
    question: 'chlorophyll light wavelength',
    sources,
    sourceContents,
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.data.questions.length > 0, true);
  assert.ok(plan.data.questions.every((question) => question.sourceTitle));
  assert.equal(plan.data.externalSearch.performed, false);
  assert.equal(plan.data.retrieval.performed, true);
  assert.ok(plan.data.evidenceTable.rows.length >= 2);
  assert.ok(plan.data.searchPlan.length >= 5);
  assert.ok(plan.data.coverage.missing.includes('wavelength'));
  assert.ok(plan.data.gaps.some((gap) => gap.id === 'gap-term-wavelength'));

  const otherPlan = buildResearchPlan({
    question: 'opaque mineral',
    sources,
    sourceContents,
  });
  assert.notDeepEqual(
    plan.data.searchPlan.map((step) => step.status),
    otherPlan.data.searchPlan.map((step) => step.status)
  );
});

test('evidence rows are exact verified quotations from more than one source', () => {
  const table = buildEvidenceRows({
    question: 'chlorophyll light',
    sources,
    sourceContents,
  });
  assert.equal(table.ok, true);
  assert.ok(table.rows.length >= 2);
  assert.ok(new Set(table.rows.map((row) => row.sourceId)).size >= 2);
  for (const row of table.rows) {
    assert.equal(row.status, 'supported');
    const sourceText = sourceContents[row.sourceId].text;
    assert.equal(
      sourceText.slice(row.citation.locator.start, row.citation.locator.end),
      row.citation.quote
    );
    assert.equal(row.claim, row.quote);
  }
});

test('multi-source research claims cite both sources and expose what cannot be established', () => {
  const answer = buildResearchAnswer({
    question: 'chlorophyll light absorption',
    sources,
    sourceContents,
  });

  assert.equal(answer.ok, true);
  assert.equal(answer.data.claims.length >= 2, true);
  assert.equal(answer.data.sourceCount >= 2, true);
  assert.ok(
    answer.data.claims.every(
      (claim) => claim.generator === 'local_extractive' && claim.citation
    )
  );
  assert.equal(answer.data.claimAssessment.unsupported, 0);
  assert.equal(answer.data.externalInformation.used, false);
  assert.ok(answer.unavailable.includes('external literature search'));
  assert.ok(answer.data.cannotEstablish.length > 0);
  assert.match(answer.data.answer, /directly quoted claim/i);
});

test('explicit negation creates a verified rule-based conflict, not an inferred agreement', () => {
  const result = detectNotebookDisagreements({
    question: 'chlorophyll light absorption',
    sources,
    sourceContents,
  });

  assert.equal(result.ok, true);
  assert.ok(result.conflicts.length > 0);
  const conflict = result.conflicts[0];
  assert.equal(conflict.rule, 'negation');
  assert.equal(conflict.verified, true);
  assert.equal(conflict.agreementInferred, false);
  assert.notEqual(conflict.sourceA.sourceId, conflict.sourceB.sourceId);
  for (const side of [conflict.sourceA, conflict.sourceB]) {
    const text = sourceContents[side.sourceId].text;
    assert.equal(
      text.slice(side.citation.locator.start, side.citation.locator.end),
      side.quote
    );
  }
});

test('similar wording without a negation or opposite pair is not called a disagreement', () => {
  const wordingSources = [
    { ...sources[0], id: 'word-1', title: 'Wording one' },
    { ...sources[2], id: 'word-2', title: 'Wording two' },
  ];
  const wordingContents = {
    'word-1': {
      text: 'Chlorophyll captures photons in the visible spectrum. The leaf was green.',
    },
    'word-2': {
      text: 'Chlorophyll takes in photons from sunlight. The leaf looked green.',
    },
  };
  const result = detectNotebookDisagreements({
    question: 'chlorophyll photons leaf',
    sources: wordingSources,
    sourceContents: wordingContents,
  });
  assert.equal(result.conflicts.length, 0);
});

test('comparison keeps each dimension tied to a verified source citation', () => {
  const comparison = compareNotebookEvidence({
    question: 'chlorophyll light',
    sources,
    sourceContents,
  });

  assert.equal(comparison.ok, true);
  assert.ok(comparison.data.rows.length >= 2);
  const methodRows = comparison.data.rows.filter((row) =>
    row.dimensions.find((dimension) => dimension.dimension === 'method')
  );
  assert.ok(methodRows.length > 0);
  for (const row of comparison.data.rows) {
    assert.ok(row.positionCitation);
    row.dimensions.forEach((dimension) => {
      if (dimension.status === 'supported') {
        assert.ok(dimension.citation);
        const text = sourceContents[row.sourceId].text;
        assert.equal(
          text.slice(
            dimension.citation.locator.start,
            dimension.citation.locator.end
          ),
          dimension.citation.quote
        );
      } else {
        assert.equal(dimension.citation, null);
      }
    });
  }
  assert.equal(comparison.data.agreement.inferred, false);
});

test('lexical claim classification accepts exact quotes and retains unsupported claims', () => {
  const quote = 'Chlorophyll absorbs light energy during photosynthesis.';
  const supported = classifyClaim({
    claim: quote,
    citations: [
      {
        sourceId: 'source-1',
        quote,
        locator: { kind: 'offset', start: 0, end: quote.length },
      },
    ],
    sources,
    sourceContents,
  });
  assert.equal(supported.classification, 'supported');

  const unsupported = classifyClaim({
    claim: 'Sound is stored in roots.',
    citations: [
      {
        sourceId: 'source-1',
        quote,
        locator: { kind: 'offset', start: 0, end: quote.length },
      },
    ],
    sources,
    sourceContents,
  });
  assert.equal(unsupported.classification, 'unsupported');
  assert.match(unsupported.reason, /do not contain/i);

  const local = buildResearchAnswer({
    question: 'chlorophyll',
    sources,
    sourceContents,
  });
  const combined = applyModelClaims({
    localAnswer: local,
    claims: [
      {
        text: 'Sound is stored in roots.',
        citations: [
          {
            sourceId: 'source-1',
            quote,
            locator: { kind: 'offset', start: 0, end: quote.length },
          },
        ],
      },
    ],
    sources,
    sourceContents,
    model: 'test-model',
  });
  assert.equal(combined.data.modelClaims.length, 1);
  assert.equal(combined.data.modelClaims[0].classification, 'unsupported');
  assert.equal(combined.data.claimAssessment.unsupported, 1);
  assert.equal(combined.generator, 'ai_grounded');
});

test('reranking without a provider leaves order unchanged and reranking verifies citations', async () => {
  const unchanged = await rerankNotebookResults({
    question: 'chlorophyll light',
    sources,
    sourceContents,
  });
  assert.equal(unchanged.ok, true);
  assert.equal(unchanged.data.reranked, false);
  assert.match(unchanged.data.note, /BM25 order is unchanged/i);

  const reranked = await rerankNotebookResults({
    question: 'chlorophyll light',
    sources,
    sourceContents,
    rerank: async ({ results }) => ({
      order: [...results.keys()].reverse(),
      reason: 'Fixture reordering',
    }),
  });
  assert.equal(reranked.ok, true);
  assert.equal(reranked.data.reranked, true);
  assert.equal(reranked.data.reason, 'Fixture reordering');
  for (const result of reranked.data.results) {
    const text = sourceContents[result.sourceId].text;
    assert.equal(
      text.slice(result.citation.locator.start, result.citation.locator.end),
      result.citation.quote
    );
  }
});

test('gateway span indexes map back to the exact spans that were sent', () => {
  const spans = [
    {
      sourceId: 'source-1',
      sourceTitle: 'Light and leaves',
      text: 'Chlorophyll absorbs light energy.',
      start: 0,
      end: 35,
      page: 1,
    },
  ];
  const mapped = mapGatewayClaims({
    claims: [
      { text: 'Chlorophyll absorbs light energy.', span_indexes: [0, 7] },
    ],
    spans,
  });

  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].citations.length, 1);
  assert.equal(mapped[0].citations[0].sourceId, 'source-1');
  assert.equal(mapped[0].citations[0].quote, spans[0].text);
  assert.deepEqual(mapped[0].citations[0].locator, {
    kind: 'offset',
    start: 0,
    end: 35,
  });
  assert.deepEqual(mapped[0].rejectedSpanIndexes, [7]);
});

test('provider conflicts map to two different verified sources and drop same-source pairs', () => {
  const spans = [
    {
      sourceId: 'source-1',
      sourceTitle: 'Light and leaves',
      text: 'Chlorophyll absorbs light energy.',
      start: 0,
      end: 33,
      page: 1,
    },
    {
      sourceId: 'source-1',
      sourceTitle: 'Light and leaves',
      text: 'The sample was small.',
      start: 60,
      end: 81,
      page: 1,
    },
    {
      sourceId: 'source-2',
      sourceTitle: 'A conflicting trial',
      text: 'Chlorophyll does not absorb light energy.',
      start: 0,
      end: 41,
      page: 2,
    },
  ];
  const mapped = mapGatewayConflicts({
    spans,
    conflicts: [
      {
        text: 'Absorption disagreement',
        explanation: 'One passage says absorption occurs; another denies it.',
        span_indexes: [0, 1, 2, 9],
      },
      {
        text: 'Same source only',
        explanation: 'This pair is not a cross-source conflict.',
        span_indexes: [0, 1],
      },
    ],
  });

  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].sourceA.sourceId, 'source-1');
  assert.equal(mapped[0].sourceB.sourceId, 'source-2');
  assert.equal(mapped[0].sourceA.citation.locator.start, 0);
  assert.equal(mapped[0].sourceB.citation.locator.end, 41);
  assert.match(mapped[0].label, /not a judgment/i);
  assert.deepEqual(mapped[0].rejectedSpanIndexes, [9]);
});

test('a provider research answer is re-verified and keeps the local answer on failure', async () => {
  let capturedSpans = [];
  const gateway = async ({ spans, operation }) => {
    capturedSpans = spans;
    assert.equal(operation, 'claims');
    assert.ok(spans.length > 0);
    assert.ok(
      spans.every(
        (span) =>
          Number.isInteger(span.start) &&
          Number.isInteger(span.end) &&
          span.end - span.start === span.text.length
      )
    );
    return {
      ok: true,
      data: {
        claims: [
          {
            text: spans[0].text,
            span_indexes: [0],
          },
        ],
        model: 'test-model',
      },
    };
  };
  const combined = await runGroundedResearch({
    question: 'chlorophyll light',
    sources,
    sourceContents,
    gateway,
  });

  assert.equal(combined.ok, true);
  assert.equal(combined.data.gateway.used, true);
  assert.equal(combined.data.modelClaims.length, 1);
  assert.equal(combined.data.modelClaims[0].classification, 'supported');
  assert.equal(
    combined.data.modelClaims[0].citation.sourceId,
    capturedSpans[0].sourceId
  );
  assert.equal(
    combined.data.modelClaims[0].citation.locator.start,
    capturedSpans[0].start
  );
  assert.equal(combined.generator, 'ai_grounded');

  const failed = await runGroundedResearch({
    question: 'chlorophyll light',
    sources,
    sourceContents,
    gateway: async () => ({ ok: false, error: 'provider unavailable' }),
  });
  assert.equal(failed.ok, true);
  assert.equal(failed.data.gateway.used, false);
  assert.match(failed.data.gateway.reason, /provider unavailable/i);
  assert.ok(failed.data.claims.length >= 1);
});

test('topic exploration separates covered aspects from uncovered terms', () => {
  const exploration = exploreNotebookTopic({
    topic: 'chlorophyll wavelength',
    sources,
    sourceContents,
  });
  assert.equal(exploration.ok, true);
  assert.ok(exploration.data.coveredAspects.length > 0);
  assert.ok(
    exploration.data.uncoveredAspects.some(
      (aspect) => aspect.aspect === 'wavelength'
    )
  );
  assert.ok(exploration.data.questions.length > 0);
  assert.match(exploration.data.label, /not a model-generated topic map/i);
});
