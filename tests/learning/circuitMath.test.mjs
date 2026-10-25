import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_RESISTANCE,
  MAX_VOLTAGE,
  MIN_RESISTANCE,
  MIN_VOLTAGE,
  calculateCurrent,
  calculatePower,
  evaluateCalculation,
  evaluatePrediction,
  formatAmps,
  formatWatts,
  lampBrightness,
  progressPercent,
} from '../../src/learning/circuitMath.mjs';

test('Ohm’s law calculations are deterministic and bounded', () => {
  assert.equal(calculateCurrent(6, 6), 1);
  assert.equal(calculateCurrent(12, 4), 3);
  assert.equal(calculateCurrent(1, 20), 0.05);
  assert.equal(calculatePower(6, 6), 6);
  assert.equal(calculatePower(12, 4), 36);
  assert.equal(formatAmps(1), '1.00 A');
  assert.equal(formatWatts(36), '36.00 W');
  assert.equal(lampBrightness(0.5), 0.5);
  assert.equal(lampBrightness(2), 1);
  assert.equal(lampBrightness(0), 0);
});

test('controls clamp invalid values to safe ranges', () => {
  assert.equal(calculateCurrent(0, 0), MIN_VOLTAGE / MIN_RESISTANCE);
  assert.equal(calculateCurrent(100, 0), MAX_VOLTAGE / MIN_RESISTANCE);
  assert.equal(calculateCurrent('abc', 'xyz'), MIN_VOLTAGE / MIN_RESISTANCE);
});

test('prediction and calculation feedback are deterministic', () => {
  assert.deepEqual(evaluatePrediction('halves'), {
    correct: true,
    correctOptionId: 'halves',
  });
  assert.deepEqual(evaluatePrediction('doubles'), {
    correct: false,
    correctOptionId: 'halves',
  });
  assert.deepEqual(evaluateCalculation('2', 6, 3), {
    correct: true,
    expected: 2,
    reason: 'within-tolerance',
  });
  assert.deepEqual(evaluateCalculation('abc', 6, 3), {
    correct: false,
    expected: 2,
    reason: 'not-a-number',
  });
  assert.deepEqual(evaluateCalculation('1.9', 6, 3), {
    correct: false,
    expected: 2,
    reason: 'outside-tolerance',
  });
});

test('progress is bounded and reports milestones', () => {
  assert.equal(progressPercent(0, 5), 0);
  assert.equal(progressPercent(3, 5), 60);
  assert.equal(progressPercent(5, 5), 100);
  assert.equal(progressPercent(10, 5), 100);
  assert.equal(progressPercent(2, 0), 100);
});