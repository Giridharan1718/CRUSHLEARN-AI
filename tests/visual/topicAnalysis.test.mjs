import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeTopic,
  normalizeTopicText,
  selectVisualStrategy,
} from '../../src/visual/topicAnalysis.mjs';

const domainCases = [
  ['How does gradient descent train a neural network?', 'ai'],
  ['Explain derivatives and integrals in calculus', 'mathematics'],
  ['How does a compiler turn source code into a program?', 'programming'],
  ['How does electricity flow through a circuit?', 'science'],
  ['How does a startup make money?', 'business'],
  ['What are the causes of World War I?', 'history'],
  ['Explain English grammar and sentence structure', 'languages'],
  ['Explain color theory and typography', 'design'],
  ['How do I write a literature review?', 'research'],
  ['How does a refrigerator keep food cold?', 'general'],
];

test('the heuristic identifies each initial domain and uses general as fallback', () => {
  domainCases.forEach(([topic, expectedDomain]) => {
    const result = analyzeTopic(topic);
    assert.equal(result.ok, true, topic);
    assert.equal(result.analysis.domainId, expectedDomain, topic);
  });
});

test('the analysis reports heuristic confidence and honest fallback metadata', () => {
  const matched = analyzeTopic('How does a neural network learn?');
  assert.equal(matched.analysis.domainId, 'ai');
  assert.equal(matched.analysis.confidence, 'high');
  assert.equal(matched.analysis.isFallbackDomain, false);
  assert.equal(matched.analysis.explanationGoal, 'process');
  assert.equal(matched.analysis.primaryVisualType, 'process');

  const fallback = analyzeTopic('How does an unknown machine of tomorrow work?');
  assert.equal(fallback.analysis.domainId, 'general');
  assert.equal(fallback.analysis.confidence, 'low');
  assert.equal(fallback.analysis.isFallbackDomain, true);
  assert.deepEqual(fallback.analysis.matchedKeywords, []);
  assert.match(fallback.analysis.strategy.pitfalls[0], /metaphor|simplifications/i);
});

test('word boundaries prevent short domain keywords from matching inside words', () => {
  assert.equal(analyzeTopic('software').analysis.domainId, 'programming');
  assert.equal(analyzeTopic('award').analysis.domainId, 'general');
  assert.equal(analyzeTopic('war').analysis.domainId, 'history');
});

test('comparison, timeline and process goals reorder recommended representations', () => {
  const comparison = analyzeTopic('CPU vs GPU: what is the difference?');
  assert.equal(comparison.analysis.explanationGoal, 'comparison');

  const timeline = analyzeTopic('What are the causes of World War I?');
  assert.equal(timeline.analysis.domainId, 'history');
  assert.equal(timeline.analysis.primaryVisualType, 'timeline');

  const process = analyzeTopic('How does a refrigerator work?');
  assert.equal(process.analysis.explanationGoal, 'process');
  assert.equal(process.analysis.primaryVisualType, 'process');
});

test('strategy selection only chooses a renderer that is actually available', () => {
  const electricity = analyzeTopic('How does electricity flow?');
  const supported = selectVisualStrategy(electricity.analysis);
  assert.equal(supported.supported, true);
  assert.equal(supported.type, 'process');
  assert.match(supported.reason, /process representation/);

  const calculus = analyzeTopic('Explain calculus visually');
  const unsupported = selectVisualStrategy(calculus.analysis);
  assert.equal(unsupported.supported, false);
  assert.equal(unsupported.type, null);
  assert.equal(unsupported.preferredType, 'graphs');
  assert.match(unsupported.reason, /not available/);
});

test('selector rejects a supported type when the domain recommends a different first representation', () => {
  const history = analyzeTopic('What are the causes of World War I?');
  const strategy = selectVisualStrategy(history.analysis, {
    supportedVisualTypes: ['process'],
  });
  assert.equal(strategy.supported, false);
  assert.equal(strategy.preferredType, 'timeline');
  assert.match(strategy.reason, /Timeline/);
});

test('empty, short and oversized topics are rejected with clear errors', () => {
  [null, '', 'a', '   ', 'x'.repeat(301)].forEach((topic) => {
    const result = analyzeTopic(topic);
    assert.equal(result.ok, false);
    assert.equal(result.analysis, null);
    assert.match(result.errors[0], /between 2 and 300/);
  });
});

test('normalization removes punctuation and collapses whitespace', () => {
  assert.equal(
    normalizeTopicText('  How   DOES a compiler-work?!  '),
    'how does a compiler-work'
  );
});
