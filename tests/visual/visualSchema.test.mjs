import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visualExplanations } from '../../src/content/visual/index.mjs';
import {
  evaluatePracticeAnswer,
  validateVisualCatalog,
  validateVisualExplanation,
} from '../../src/visual/visualSchema.mjs';

const valid = visualExplanations[0];

test('every authored explanation validates and the catalog has unique ids', () => {
  const result = validateVisualCatalog(visualExplanations);
  assert.deepEqual(result, { ok: true, errors: [] });

  visualExplanations.forEach((explanation) => {
    const individual = validateVisualExplanation(explanation);
    assert.deepEqual(individual, { ok: true, errors: [] }, explanation.id);
    assert.equal(explanation.visualType, 'process');
    assert.equal(explanation.provenance.kind, 'authored');
    assert.ok(explanation.process.limitations.length > 0);
  });
});

test('the schema version is explicit and required', () => {
  const explanation = structuredClone(valid);
  explanation.schemaVersion = 99;
  const result = validateVisualExplanation(explanation);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /schemaVersion/.test(error)));
});

test('unsupported visual types are rejected instead of silently rendered', () => {
  const explanation = structuredClone(valid);
  explanation.visualType = 'timeline';
  const result = validateVisualExplanation(explanation);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /Unsupported visual type/.test(error)));
});

test('a process must contain unique, fully explained steps', () => {
  const tooFew = structuredClone(valid);
  tooFew.process.steps = tooFew.process.steps.slice(0, 2);
  assert.equal(validateVisualExplanation(tooFew).ok, false);

  const duplicate = structuredClone(valid);
  duplicate.process.steps[1].id = duplicate.process.steps[0].id;
  const duplicateResult = validateVisualExplanation(duplicate);
  assert.equal(duplicateResult.ok, false);
  assert.ok(duplicateResult.errors.some((error) => /must be unique/.test(error)));

  const noAdvanced = structuredClone(valid);
  delete noAdvanced.process.steps[0].details.advanced;
  const levelResult = validateVisualExplanation(noAdvanced);
  assert.equal(levelResult.ok, false);
  assert.ok(
    levelResult.errors.some((error) =>
      /process\.steps\[0\]\.details\.advanced is required/.test(error)
    )
  );
});

test('process limitations and accessibility descriptions are required', () => {
  const noLimits = structuredClone(valid);
  noLimits.process.limitations = [];
  assert.equal(validateVisualExplanation(noLimits).ok, false);

  const noAccessibility = structuredClone(valid);
  noAccessibility.accessibilityDescription = '';
  assert.equal(validateVisualExplanation(noAccessibility).ok, false);
});

test('practice answers must point at an available option', () => {
  const invalid = structuredClone(valid);
  invalid.practice.correctIndex = invalid.practice.options.length;
  const result = validateVisualExplanation(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /correctIndex/.test(error)));

  const duplicateOptions = structuredClone(valid);
  duplicateOptions.practice.options[1] = duplicateOptions.practice.options[0];
  duplicateOptions.practice.correctIndex = 0;
  assert.equal(validateVisualExplanation(duplicateOptions).ok, false);
});

test('source-grounded explanations require a source reference', () => {
  const explanation = structuredClone(valid);
  explanation.provenance.kind = 'source_grounded';
  explanation.sources = [];
  const result = validateVisualExplanation(explanation);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => /at least one source reference/.test(error))
  );

  explanation.sources = [
    { sourceId: 'source-1', title: 'A verified source', locator: 'p. 4' },
  ];
  assert.equal(validateVisualExplanation(explanation).ok, true);
});

test('unknown fields and arbitrary HTML are ignored by the typed schema', () => {
  const explanation = structuredClone(valid);
  explanation.html = '<script>window.__executed = true</script>';
  explanation.process.steps[0].html = '<img src=x onerror=alert(1)>';
  const result = validateVisualExplanation(explanation);
  assert.equal(result.ok, true);
  assert.equal('html' in explanation, true);
});

test('long labels and unknown domains are rejected by bounded validation', () => {
  const longTitle = structuredClone(valid);
  longTitle.title = 'A'.repeat(161);
  assert.equal(validateVisualExplanation(longTitle).ok, false);

  const unknownDomain = structuredClone(valid);
  unknownDomain.domainId = 'underwater basket weaving';
  assert.equal(validateVisualExplanation(unknownDomain).ok, false);
});

test('practice evaluation is deterministic for correct, incorrect and invalid answers', () => {
  const startup = visualExplanations.find(
    (explanation) => explanation.id === 'startup-revenue'
  );
  const correct = evaluatePracticeAnswer(startup, startup.practice.correctIndex);
  assert.equal(correct.ok, true);
  assert.equal(correct.isCorrect, true);
  assert.equal(correct.correctAnswer, '$50,000');
  assert.match(correct.explanation, /Revenue is the \$50,000 inflow/);

  const incorrect = evaluatePracticeAnswer(startup, 0);
  assert.equal(incorrect.ok, true);
  assert.equal(incorrect.isCorrect, false);
  assert.equal(incorrect.correctIndex, 2);
  assert.equal(incorrect.correctAnswer, '$50,000');

  const outOfRange = evaluatePracticeAnswer(startup, 99);
  assert.equal(outOfRange.ok, false);
  assert.match(outOfRange.errors[0], /available answers/);

  const invalidExplanation = evaluatePracticeAnswer({ id: 'broken' }, 0);
  assert.equal(invalidExplanation.ok, false);
  assert.ok(invalidExplanation.errors.length > 0);
});
