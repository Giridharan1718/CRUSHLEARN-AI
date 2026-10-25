// Deterministic helpers for the interactive circuit learning experience.
//
// The experience uses Ohm's law and power for a simple resistive circuit:
//   I = V / R
//   P = V * I = V^2 / R
//
// The helpers are intentionally small and side-effect free so the UI and tests
// can share the same calculation.

export const DEFAULT_VOLTAGE = 6;
export const DEFAULT_RESISTANCE = 6;
export const MIN_VOLTAGE = 1;
export const MAX_VOLTAGE = 12;
export const MIN_RESISTANCE = 1;
export const MAX_RESISTANCE = 20;

export function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

export function calculateCurrent(voltage, resistance) {
  const v = clamp(voltage, MIN_VOLTAGE, MAX_VOLTAGE);
  const r = clamp(resistance, MIN_RESISTANCE, MAX_RESISTANCE);
  return v / r;
}

export function calculatePower(voltage, resistance) {
  const current = calculateCurrent(voltage, resistance);
  return clamp(voltage, MIN_VOLTAGE, MAX_VOLTAGE) * current;
}

export function formatAmps(value) {
  const amps = Number(value);
  if (!Number.isFinite(amps)) return '0.00 A';
  return `${amps.toFixed(2)} A`;
}

export function formatWatts(value) {
  const watts = Number(value);
  if (!Number.isFinite(watts)) return '0.00 W';
  return `${watts.toFixed(2)} W`;
}

export function lampBrightness(current) {
  const amps = Number(current);
  if (!Number.isFinite(amps) || amps <= 0) return 0;
  // 0..1 scale for a compact visual indicator. 1 A is treated as full brightness.
  return Math.min(1, amps);
}

export function evaluatePrediction(optionId, correctOptionId = 'halves') {
  return {
    correct: optionId === correctOptionId,
    correctOptionId,
  };
}

export function evaluateCalculation(answer, voltage, resistance, tolerance = 0.05) {
  const expected = calculateCurrent(voltage, resistance);
  const parsed = Number(answer);
  if (!Number.isFinite(parsed)) {
    return { correct: false, expected, reason: 'not-a-number' };
  }
  if (Math.abs(parsed - expected) <= tolerance) {
    return { correct: true, expected, reason: 'within-tolerance' };
  }
  return { correct: false, expected, reason: 'outside-tolerance' };
}

export function progressPercent(completed, total) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const safeCompleted = Math.max(0, Math.min(safeTotal, Number(completed) || 0));
  return Math.round((safeCompleted / safeTotal) * 100);
}