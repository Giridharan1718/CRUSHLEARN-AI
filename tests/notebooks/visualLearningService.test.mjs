// The visual service and the explanation engine must agree on which visual
// representation a subject benefits from. They used to hold two copies of
// the same nine-subject map with different wording.

import test from 'node:test';
import assert from 'node:assert/strict';

import { planVisual } from '../../src/ai/visualLearningService.mjs';
import { VISUAL_REPRESENTATIONS } from '../../src/notebooks/textExplanation.mjs';
import { findVisualExplanationForTopic } from '../../src/visual/visualCatalog.mjs';
import { CAPABILITY_STATUS, RUN_STATUS } from '../../src/ai/contracts.mjs';

test('the service and the explanation engine read one visual map', () => {
  const subjects = Object.keys(VISUAL_REPRESENTATIONS);

  subjects.forEach((subject) => {
    const result = planVisual({ topic: '', subject });
    assert.equal(
      result.data.recommendation.representation,
      VISUAL_REPRESENTATIONS[subject],
      `the representation for ${subject} must match the shared map`
    );
  });
});

test('an unmatched topic completes and says what is unavailable', () => {
  const result = planVisual({ topic: 'a topic with no authored visual', subject: 'biology' });

  assert.equal(result.status, RUN_STATUS.COMPLETED);
  assert.equal(result.data.available, false);
  assert.equal(result.data.kind, 'unavailable');
  assert.ok(result.data.recommendation.reason);
  assert.ok(result.unavailable.includes('generated diagram'));
  assert.ok(result.limitations.length > 0);
  assert.equal(result.capability, CAPABILITY_STATUS.PARTIAL);
});

test('a curated topic reports the authored visual and never calls it source evidence', () => {
  const topic = 'How does a compiler turn source code into a program?';
  const match = findVisualExplanationForTopic(topic);

  assert.equal(match.ok, true);

  const result = planVisual({ topic, subject: 'programming' });
  assert.equal(result.status, RUN_STATUS.COMPLETED);
  assert.equal(result.data.available, true);
  assert.equal(result.data.kind, 'curated');
  assert.equal(result.data.id, match.explanation.id);
  assert.equal(result.generator, 'authored_catalog');
  assert.ok(
    result.limitations.some((note) => /separate from the source evidence/i.test(note))
  );
});
