// Deterministic helpers for the interactive code-tracing learning experience.
//
// The learner steps through a small authored program, predicts its output,
// finds and fixes a bug in a buggy variant, and applies the same reasoning to a
// slightly different program. Every step below is produced by executing a
// restricted statement machine — values are computed by real operations, never
// quoted from a table.
//
// The correct program:
//   0  let total = 0;
//   1  const readings = [4, 7, 2, 9];
//   2  for (const reading of readings) {
//   3    total = total + reading;
//   4  }
//   5  console.log(total);
//
// The buggy variant replaces line 3 with `total = reading;` (overwrite instead
// of accumulate) and therefore prints 9 instead of 22.

import { progressPercent } from './circuitMath.mjs';

export const CORRECT_LINES = [
  'let total = 0;',
  'const readings = [4, 7, 2, 9];',
  'for (const reading of readings) {',
  '  total = total + reading;',
  '}',
  'console.log(total);',
];

export const BUGGY_LINES = [
  'let total = 0;',
  'const readings = [4, 7, 2, 9];',
  'for (const reading of readings) {',
  '  total = reading;',
  '}',
  'console.log(total);',
];

// The last line that still mutates `total` — used as the correct answer for the
// defect-finding question.
export const BUGGY_LINE_INDEX = 3;
export const ACCUMULATE_LINE_INDEX = 3;

const READINGS = [4, 7, 2, 9];

export const TRACE_VARIANTS = ['correct', 'buggy'];

function snapshot(state) {
  return {
    total: state.total,
    reading: state.reading === undefined ? null : state.reading,
  };
}

function traceStep(state) {
  return {
    lineIndex: state.lineIndex,
    variables: snapshot(state),
    note: state.note,
  };
}

/**
 * Builds the walk-through of either program variant by actually executing the
 * mini machine. The loop is unrolled over READINGS so each iteration appears
 * as its own step, with snapshots of every variable along the way.
 */
export function buildTrace(variant = 'correct') {
  const isBuggy = variant === 'buggy';
  const lines = isBuggy ? BUGGY_LINES : CORRECT_LINES;
  const steps = [];
  const state = { total: 0, reading: null, lineIndex: 0, note: '' };

  // Line 0: initialisation.
  state.total = 0;
  state.lineIndex = 0;
  state.note = 'total starts at 0';
  steps.push(traceStep(state));

  // Line 1: the array is bound; no variable changes.
  state.lineIndex = 1;
  state.note = 'readings is bound; nothing changes yet';
  steps.push({ ...traceStep(state), variables: snapshot(state) });

  // Line 2 + 3: one step per loop-carried reading, then the body step.
  let expectedOutput = 0;
  READINGS.forEach((reading, position) => {
    state.reading = reading;
    state.lineIndex = 2;
    state.note = `iteration ${position + 1}: reading is ${reading}`;
    steps.push(traceStep(state));

    if (isBuggy) {
      // `total = reading;` — overwrite instead of accumulate.
      state.total = reading;
      expectedOutput = state.total;
      state.lineIndex = 3;
      state.note = `total is overwritten with ${reading}`;
    } else {
      // `total = total + reading;`
      state.total = state.total + reading;
      expectedOutput = state.total;
      state.lineIndex = 3;
      state.note = `total becomes ${state.total}`;
    }
    steps.push(traceStep(state));
  });

  // Line 4: loop exits.
  state.reading = null;
  state.lineIndex = 4;
  state.note = 'the loop ends';
  steps.push(traceStep(state));

  // Line 5: output.
  state.lineIndex = 5;
  state.note = 'the program prints total';
  steps.push({ ...traceStep(state), output: expectedOutput });

  return {
    variant: isBuggy ? 'buggy' : 'correct',
    lines,
    steps,
    finalOutput: expectedOutput,
  };
}

export const PREDICTION_OPTIONS = [
  { id: 'sum-22', label: 'The program prints 22.' },
  { id: 'sum-13', label: 'The program prints 13, because the last reading is skipped.' },
  { id: 'sum-26', label: 'The program prints 26, because a reading is added twice.' },
];

export function evaluatePrediction(optionId) {
  const correctOptionId = 'sum-22';
  const correct = optionId === correctOptionId;
  return {
    correct,
    correctOptionId,
    explanation: correct
      ? 'Correct. Each loop iteration adds the current reading to total, so 4 + 7 + 2 + 9 = 22.'
      : 'Not quite. Every iteration adds the current reading once. Trace the totals: 4, then 11, then 13, then 22.',
  };
}

export const BUG_FIX_OPTIONS = [
  {
    id: 'accumulate',
    label: 'total = total + reading;',
    explanation:
      'Correct. Adding the current reading to the running total keeps every sensor value in the sum.',
  },
  {
    id: 'add-one',
    label: 'total = total + 1;',
    explanation:
      'Not quite. That counts adds, not values. The machine needed the reading itself in the sum.',
  },
  {
    id: 'keep-overwrite',
    label: 'total = reading;',
    explanation:
      'That is the bug itself: it overwrites the running total, so only the last reading survives.',
  },
];

export function evaluateDebugAnswer(input) {
  const buggyLineIndex = input?.buggyLineIndex;
  const fixOptionId = input?.fixOptionId;
  const lineIndex = Number(buggyLineIndex);
  const foundLine =
    typeof buggyLineIndex === 'number' &&
    Number.isInteger(lineIndex) &&
    lineIndex >= 0 &&
    lineIndex <= 5 &&
    lineIndex === BUGGY_LINE_INDEX;

  const fix = BUG_FIX_OPTIONS.find((option) => option.id === fixOptionId);
  const fixCorrect = fix?.id === 'accumulate';

  return {
    foundLine,
    fixCorrect,
    correctLineIndex: BUGGY_LINE_INDEX,
    correctFixOptionId: 'accumulate',
    explanation: foundLine
      ? `Right line ${
          foundLine && fixCorrect
            ? '— and the replacement keeps the running total.'
            : '— but check the replacement line before calling it fixed.'
        }`
      : 'The defect hides in the line that changes total inside the loop. Compare the buggy program with the trace of the correct one.',
  };
}

export const EXTENSION_EXTRA_READING = 5;

export function evaluateExtensionAnswer(answer) {
  const expected = 22 + EXTENSION_EXTRA_READING;
  const raw = String(answer ?? '').trim();
  if (raw === '') {
    return { correct: false, expected, reason: 'not-a-number' };
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return { correct: false, expected, reason: 'not-a-number' };
  }
  if (Math.abs(parsed - expected) <= 0.001) {
    return { correct: true, expected, reason: 'within-tolerance' };
  }
  return { correct: false, expected, reason: 'outside-tolerance' };
}

export { progressPercent };
