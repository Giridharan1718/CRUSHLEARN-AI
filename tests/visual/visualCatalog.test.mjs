import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visualExplanations } from '../../src/content/visual/index.mjs';
import {
  findVisualExplanationForTopic,
  getVisualExplanationById,
  listVisualTopics,
  scoreTopicMatch,
  VISUAL_CATALOG_VALIDATION,
} from '../../src/visual/visualCatalog.mjs';

test('the visual catalog is valid and contains four authored process topics', () => {
  assert.deepEqual(VISUAL_CATALOG_VALIDATION, { ok: true, errors: [] });
  assert.equal(visualExplanations.length, 4);
  assert.deepEqual(
    visualExplanations.map((explanation) => explanation.id),
    [
      'electricity-circuit',
      'compiler-pipeline',
      'startup-revenue',
      'refrigerator-cooling',
    ]
  );
});

test('each catalog topic resolves from its own topic text or aliases', () => {
  visualExplanations.forEach((explanation) => {
    [explanation.topic, ...explanation.aliases.slice(0, 2)].forEach((query) => {
      const result = findVisualExplanationForTopic(query);
      assert.equal(result.ok, true);
      assert.equal(result.explanation?.id, explanation.id, query);
      assert.ok(result.matchScore >= 20);
    });
  });
});

test('matching tolerates case, punctuation and a short content-specific query', () => {
  const result = findVisualExplanationForTopic('  ELECTRICITY!! ');
  assert.equal(result.explanation?.id, 'electricity-circuit');
  assert.equal(result.analysis.domainId, 'science');
  assert.ok(result.matchScore >= 40);
});

test('generic and unrelated questions do not receive an invented explanation', () => {
  ['How does it work?', 'How does a battery work?', 'What is quantum chromodynamics?'].forEach(
    (query) => {
      const result = findVisualExplanationForTopic(query);
      assert.equal(result.ok, true, query);
      assert.equal(result.explanation, null, query);
      assert.equal(result.matchScore, 0, query);
      assert.ok(result.analysis, query);
    }
  );
});

test('generic filler words alone score no match', () => {
  assert.equal(
    scoreTopicMatch('How does it work?', visualExplanations[0]),
    0
  );
  assert.equal(scoreTopicMatch('compiler', visualExplanations[1]), 100);
});

test('an invalid topic returns an error rather than a catalog fallback', () => {
  const result = findVisualExplanationForTopic('');
  assert.equal(result.ok, false);
  assert.equal(result.analysis, null);
  assert.equal(result.explanation, null);
  assert.match(result.errors[0], /between 2 and 300/);
});

test('topic summaries expose only presentation metadata', () => {
  const topics = listVisualTopics();
  assert.equal(topics.length, 4);
  const refrigerator = topics.find(
    (topic) => topic.id === 'refrigerator-cooling'
  );
  assert.equal(refrigerator.domainLabel, 'General knowledge and everyday systems');
  assert.equal(refrigerator.stepCount, 5);
  assert.equal(refrigerator.visualType, 'process');
  assert.equal(refrigerator.provenanceKind, 'authored');
});

test('lookup by id is exact and returns null for unknown ids', () => {
  assert.equal(
    getVisualExplanationById('compiler-pipeline').id,
    'compiler-pipeline'
  );
  assert.equal(getVisualExplanationById('not-a-topic'), null);
});
