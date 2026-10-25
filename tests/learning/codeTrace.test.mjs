import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import {
  BUGGY_LINE_INDEX,
  BUGGY_LINES,
  CORRECT_LINES,
  EXTENSION_EXTRA_READING,
  PREDICTION_OPTIONS,
  buildTrace,
  evaluateDebugAnswer,
  evaluateExtensionAnswer,
  evaluatePrediction,
  progressPercent,
} from '../../src/learning/codeTrace.mjs';
import { createTestViteServer } from '../support/viteTestServer.mjs';


test('the correct program executes deterministically and prints 22', () => {
  const first = buildTrace('correct');
  const second = buildTrace('correct');

  assert.deepEqual(first, second, 'traces must be deterministic');
  assert.equal(first.variant, 'correct');
  assert.equal(first.finalOutput, 22);
  assert.equal(first.lines, CORRECT_LINES);

  // init, bind, 2 steps per reading (4 readings), loop end, print = 12 steps.
  assert.equal(first.steps.length, 12);

  // Totals across the loop: 4, 11, 13, 22.
  const totals = first.steps
    .filter((step) => step.lineIndex === 3)
    .map((step) => step.variables.total);
  assert.deepEqual(totals, [4, 11, 13, 22]);

  // The loop reads each value once, in order.
  const readings = first.steps
    .filter((step) => step.lineIndex === 2)
    .map((step) => step.variables.reading);
  assert.deepEqual(readings, [4, 7, 2, 9]);

  // Before the loop nothing has accumulated yet and reading is unassigned.
  assert.equal(first.steps[0].variables.total, 0);
  assert.equal(first.steps[0].lineIndex, 0);
  assert.equal(first.steps[1].variables.total, 0);
  assert.equal(first.steps[1].variables.reading, null);

  // The loop exits and the final step prints the output.
  assert.equal(first.steps[10].lineIndex, 4);
  assert.equal(first.steps[10].variables.reading, null);
  assert.equal(first.steps[11].lineIndex, 5);
  assert.equal(first.steps[11].output, 22);
});

test('the buggy variant overwrites total and prints 9', () => {
  const trace = buildTrace('buggy');

  assert.equal(trace.variant, 'buggy');
  assert.equal(trace.finalOutput, 9);
  assert.equal(BUGGY_LINES[3], '  total = reading;');
  assert.equal(trace.steps.length, 12);

  const totals = trace.steps
    .filter((step) => step.lineIndex === 3)
    .map((step) => step.variables.total);
  // Each iteration replaces the total instead of accumulating.
  assert.deepEqual(totals, [4, 7, 2, 9]);

  // The executing machine still steps through the buggy line.
  const buggyStep = trace.steps.find(
    (step) => step.lineIndex === BUGGY_LINE_INDEX
  );
  assert.ok(buggyStep, 'the trace steps through the buggy line');

  // Same structure as the correct program apart from line 4.
  assert.deepEqual(
    BUGGY_LINES.filter((_, index) => index !== 3),
    CORRECT_LINES.filter((_, index) => index !== 3)
  );
});

test('step snapshots are isolated copies, not shared mutable state', () => {
  const trace = buildTrace('correct');
  const snapshot = trace.steps[2].variables;
  snapshot.total = 999;

  assert.notEqual(trace.steps[3].variables, trace.steps[2].variables);
  assert.equal(trace.steps[3].variables.total, 4);
});

test('prediction evaluation is exact and explains both outcomes', () => {
  const correct = evaluatePrediction('sum-22');
  assert.equal(correct.correct, true);
  assert.equal(correct.correctOptionId, 'sum-22');
  assert.ok(correct.explanation.length >= 20);

  const wrong = evaluatePrediction('sum-13');
  assert.equal(wrong.correct, false);
  assert.ok(wrong.explanation.length >= 20);

  assert.equal(evaluatePrediction('sum-26').correct, false);
  assert.equal(evaluatePrediction(undefined).correct, false);
  assert.equal(evaluatePrediction('nope').correct, false);

  // The component renders exactly the options the engine knows how to grade.
  assert.deepEqual(
    PREDICTION_OPTIONS.map((option) => option.id),
    ['sum-22', 'sum-13', 'sum-26']
  );
});

test('debug evaluation grades the line and the fix independently', () => {
  const correct = evaluateDebugAnswer({
    buggyLineIndex: BUGGY_LINE_INDEX,
    fixOptionId: 'accumulate',
  });
  assert.equal(correct.foundLine, true);
  assert.equal(correct.fixCorrect, true);
  assert.equal(correct.correctLineIndex, 3);
  assert.equal(correct.correctFixOptionId, 'accumulate');
  assert.ok(correct.explanation.length >= 20);

  // Wrong line, wrong fix, and their combinations all fail honestly.
  assert.equal(
    evaluateDebugAnswer({ buggyLineIndex: 0, fixOptionId: 'accumulate' }).foundLine,
    false
  );
  assert.equal(
    evaluateDebugAnswer({ buggyLineIndex: 5, fixOptionId: 'accumulate' }).foundLine,
    false
  );
  assert.equal(
    evaluateDebugAnswer({ buggyLineIndex: 3, fixOptionId: 'add-one' }).fixCorrect,
    false
  );
  assert.equal(
    evaluateDebugAnswer({ buggyLineIndex: 3, fixOptionId: 'keep-overwrite' }).fixCorrect,
    false
  );

  // Invalid inputs must not crash or accidentally pass.
  assert.equal(evaluateDebugAnswer({}).foundLine, false);
  assert.equal(evaluateDebugAnswer(null).foundLine, false);
  assert.equal(
    evaluateDebugAnswer({ buggyLineIndex: '3', fixOptionId: 'accumulate' }).foundLine,
    false,
    'line choices are typed as integers, not strings'
  );
  assert.equal(
    evaluateDebugAnswer({ buggyLineIndex: 3.5, fixOptionId: 'accumulate' }).foundLine,
    false
  );
  assert.equal(
    evaluateDebugAnswer({ buggyLineIndex: -1, fixOptionId: 'accumulate' }).foundLine,
    false
  );
});

test('extension answers are checked numerically with honest input handling', () => {
  assert.equal(EXTENSION_EXTRA_READING, 5);

  const ok = evaluateExtensionAnswer(27);
  assert.equal(ok.correct, true);
  assert.equal(ok.expected, 27);

  assert.equal(evaluateExtensionAnswer('27').correct, true);
  assert.equal(evaluateExtensionAnswer('  27.000 ').correct, true);

  const wrong = evaluateExtensionAnswer(26.98);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.reason, 'outside-tolerance');
  assert.equal(wrong.expected, 27);

  for (const bad of ['', '   ', 'abc', null, undefined]) {
    assert.equal(evaluateExtensionAnswer(bad).reason, 'not-a-number');
  }
});

test('the experience reuses the shared bounded progress helper', () => {
  assert.equal(progressPercent(0, 5), 0);
  assert.equal(progressPercent(4, 5), 80);
  assert.equal(progressPercent(5, 5), 100);
});

// ---------------------------------------------------------------------------
// SSR rendering through Vite (mirrors tests/learning/interactiveLearning.test.mjs)
// ---------------------------------------------------------------------------

let viteServer;
let CodeTraceExperience;

before(async () => {
  viteServer = await createTestViteServer();
  CodeTraceExperience = (
    await viteServer.ssrLoadModule('/src/components/learning/CodeTraceExperience.jsx')
  ).default;
});

after(async () => {
  await viteServer?.close();
});

test('SSR of the code trace experience renders every learning section', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(CodeTraceExperience)
    )
  );

  // Section headings for the six-part experience.
  for (const heading of [
    'Opening question',
    'Interactive code trace',
    'Prediction challenge',
    'Guided debugging with hints',
    'Practical application',
    'Understanding check',
    'Suggested next activity',
  ]) {
    assert.ok(html.includes(heading), `expected heading: ${heading}`);
  }

  // The authored program appears verbatim, including the buggy line.
  assert.ok(html.includes('total = reading;'));
  assert.ok(html.includes('console.log(total);'));

  // Initial variables readout and step controls.
  assert.ok(html.includes('total = 0'));
  assert.ok(html.includes('Next step'));
  assert.ok(html.includes('Previous step'));
  assert.ok(html.includes('Run to end'));
  assert.ok(html.includes('Reset experience'));

  // Milestone counter starts at zero.
  assert.ok(html.includes('of 5 milestones complete'));

  // The trace starts on the first line and marks it as the current step.
  assert.ok(html.includes('aria-current="step"'));
});
