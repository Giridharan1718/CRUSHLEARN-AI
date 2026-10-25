import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_POLICY,
  JOURNEY_STAGES,
  canCompleteJourney,
  createInitialJourneyState,
  createJourneyReducer,
  evaluateItem,
  normalizeShortText,
  resolveJourneyPolicy,
  scoreAssessment,
  validateJourneyContent,
} from '../../src/learning/journeyEngine.mjs';

// ---------------------------------------------------------------------------
// Fixture journey (content only; logic must all live in the engine)
// ---------------------------------------------------------------------------

const content = {
  schemaVersion: 1,
  courseId: 'test-course',
  lessonId: 'test-lesson',
  title: 'Test lesson',
  policy: { passingScore: 80, maxAssessmentAttempts: 3, maxPracticeAttempts: 2 },
  objectives: [
    { id: 'obj-1', title: 'Objective one', description: 'Do a thing' },
  ],
  explanation: {
    title: 'Explanation',
    paragraphs: ['Explain it'],
    keyPoints: ['Point'],
  },
  workedExample: {
    title: 'Example',
    steps: [{ title: 'Step 1', code: 'x', note: 'note' }],
    result: { title: 'Result', code: 'x' },
  },
  guidedPractice: {
    title: 'Guided',
    instructions: '',
    items: [
      {
        id: 'gp-1',
        kind: 'single_choice',
        prompt: 'G1',
        options: ['a', 'b'],
        correctIndex: 0,
        errorMap: { 1: 'specific feedback for option 1' },
        feedback: { correct: 'yes', incorrect: 'no' },
        explanation: 'e',
      },
      {
        id: 'gp-2',
        kind: 'short_text',
        prompt: 'G2',
        answer: 'Hyper Text',
        acceptedAnswers: ['hypertext'],
        explanation: 'e',
      },
    ],
  },
  independentPractice: {
    title: 'Independent',
    items: [
      {
        id: 'ip-1',
        kind: 'single_choice',
        prompt: 'I1',
        options: ['a', 'b', 'c'],
        correctIndex: 2,
        explanation: 'e',
      },
    ],
  },
  assessment: {
    title: 'Assessment',
    items: [0, 1, 2, 3, 4].map((n) => ({
      id: `as-${n + 1}`,
      kind: 'single_choice',
      prompt: `A${n + 1}`,
      options: ['a', 'b'],
      correctIndex: n % 2 === 0 ? 0 : 1,
      explanation: 'e',
    })),
  },
  completion: { title: 'Done', message: 'Nice.' },
};

const correctValue = (item) =>
  item.kind === 'single_choice' ? item.correctIndex : item.answer;

const wrongValue = (item) =>
  item.kind === 'single_choice'
    ? (item.correctIndex + 1) % item.options.length
    : 'definitely wrong';

function createHarness(journey = content, policy = {}) {
  const reducer = createJourneyReducer(journey, policy);
  let state = createInitialJourneyState(journey, policy, null);
  return {
    get state() {
      return state;
    },
    send(action) {
      state = reducer(state, action);
      return state;
    },
    sendAll(actions) {
      actions.forEach((action) => this.send(action));
      return state;
    },
    reducer,
  };
}

function completePractice(harness, journey, phaseKey) {
  const items =
    phaseKey === 'guidedPractice'
      ? journey.guidedPractice.items
      : journey.independentPractice.items;
  items.forEach(() => {
    const item = items[harness.state[phaseKey].index];
    harness.send({ type: 'SELECT_PRACTICE_OPTION', value: correctValue(item) });
    harness.send({ type: 'SUBMIT_PRACTICE' });
    harness.send({ type: 'NEXT_PRACTICE_ITEM' });
  });
}

function reachAssessment(journey = content, policy = {}) {
  const harness = createHarness(journey, policy);
  harness.sendAll([{ type: 'CONTINUE' }, { type: 'CONTINUE' }, { type: 'CONTINUE' }]);
  assert.equal(harness.state.stage, JOURNEY_STAGES.GUIDED_PRACTICE);
  completePractice(harness, journey, 'guidedPractice');
  assert.equal(harness.state.stage, JOURNEY_STAGES.INDEPENDENT_PRACTICE);
  completePractice(harness, journey, 'independentPractice');
  assert.equal(harness.state.stage, JOURNEY_STAGES.ASSESSMENT);
  return harness;
}

function answerAssessment(harness, journey, correct) {
  journey.assessment.items.forEach((item) => {
    harness.send({
      type: 'SET_ASSESSMENT_ANSWER',
      itemId: item.id,
      value: correct ? correctValue(item) : wrongValue(item),
    });
  });
  return harness.send({
    type: 'SUBMIT_ASSESSMENT',
    now: '2026-01-01T00:00:00.000Z',
  });
}

// ---------------------------------------------------------------------------
// Answer evaluation
// ---------------------------------------------------------------------------

test('evaluateItem scores single choice answers and prefers error-specific feedback', () => {
  const item = content.guidedPractice.items[0];

  const right = evaluateItem(item, item.correctIndex);
  assert.equal(right.isCorrect, true);
  assert.equal(right.message, 'yes');

  const wrong = evaluateItem(item, 1);
  assert.equal(wrong.isCorrect, false);
  assert.equal(wrong.message, 'specific feedback for option 1');
});

test('evaluateItem falls back to generic feedback when no errorMap entry exists', () => {
  const item = {
    id: 'x',
    kind: 'single_choice',
    prompt: 'p',
    options: ['a', 'b'],
    correctIndex: 0,
    explanation: 'e',
    feedback: { correct: 'Yes!', incorrect: 'No.' },
  };
  assert.equal(evaluateItem(item, 1).message, 'No.');
});

test('evaluateItem normalizes short text answers', () => {
  const item = content.guidedPractice.items[1];
  assert.equal(normalizeShortText('  Hyper   Text '), 'hyper text');
  assert.equal(evaluateItem(item, '  hypertext ').isCorrect, true);
  assert.equal(evaluateItem(item, 'HYPER TEXT').isCorrect, true);
  assert.equal(evaluateItem(item, 'Hyper  Text').isCorrect, true);
  assert.equal(evaluateItem(item, '').isCorrect, false);
  assert.equal(evaluateItem(item, 'nope').isCorrect, false);
});

test('evaluateItem rejects unsupported item kinds', () => {
  assert.throws(
    () => evaluateItem({ id: 'z', kind: 'essay' }, 'x'),
    /Unsupported item kind/
  );
});

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

test('scoreAssessment applies the passing threshold at the boundary', () => {
  const scoreWith = (correctCount) => {
    const answers = {};
    content.assessment.items.slice(0, correctCount).forEach((item) => {
      answers[item.id] = correctValue(item);
    });
    return scoreAssessment(content.assessment.items, answers, 80);
  };

  assert.equal(scoreWith(5).percentage, 100);
  assert.equal(scoreWith(5).passed, true);
  assert.equal(scoreWith(4).percentage, 80);
  assert.equal(scoreWith(4).passed, true);
  assert.equal(scoreWith(3).percentage, 60);
  assert.equal(scoreWith(3).passed, false);
  assert.equal(scoreWith(0).percentage, 0);
  assert.equal(scoreAssessment([], {}).percentage, 0);
  assert.equal(scoreAssessment([], {}).passed, false);
});

test('resolveJourneyPolicy merges defaults, content policy and overrides', () => {
  const resolved = resolveJourneyPolicy(
    { policy: { passingScore: 70 } },
    { passingScore: 90 }
  );
  assert.equal(resolved.passingScore, 90);
  assert.equal(
    resolved.maxAssessmentAttempts,
    DEFAULT_POLICY.maxAssessmentAttempts
  );
  assert.equal(resolved.maxPracticeAttempts, DEFAULT_POLICY.maxPracticeAttempts);
});

// ---------------------------------------------------------------------------
// Stage flow, retries and completion
// ---------------------------------------------------------------------------

test('a fresh journey starts at objectives and is not complete', () => {
  const state = createInitialJourneyState(content);
  assert.equal(state.stage, JOURNEY_STAGES.OBJECTIVES);
  assert.deepEqual(state.assessment.attempts, []);
  assert.equal(state.completed, false);
  assert.equal(canCompleteJourney(state, content), false);
});

test('practice supports one retry and then reveals the answer before advancing', () => {
  const harness = createHarness();
  harness.sendAll([
    { type: 'CONTINUE' },
    { type: 'CONTINUE' },
    { type: 'CONTINUE' },
  ]);
  const item = content.guidedPractice.items[0];

  harness.send({ type: 'SELECT_PRACTICE_OPTION', value: wrongValue(item) });
  harness.send({ type: 'SUBMIT_PRACTICE' });
  assert.equal(harness.state.guidedPractice.feedback.isCorrect, false);
  assert.equal(harness.state.guidedPractice.feedback.revealed, false);
  assert.equal(harness.state.guidedPractice.records[item.id].attempts, 1);

  // Cannot advance while the answer is still retryable.
  harness.send({ type: 'NEXT_PRACTICE_ITEM' });
  assert.equal(harness.state.guidedPractice.index, 0);

  // Retry, miss again: the answer is revealed and the learner may advance.
  harness.send({ type: 'RETRY_PRACTICE' });
  assert.equal(harness.state.guidedPractice.feedback, null);
  harness.send({ type: 'SELECT_PRACTICE_OPTION', value: wrongValue(item) });
  harness.send({ type: 'SUBMIT_PRACTICE' });
  assert.equal(harness.state.guidedPractice.feedback.revealed, true);
  assert.equal(harness.state.guidedPractice.records[item.id].attempts, 2);
  harness.send({ type: 'NEXT_PRACTICE_ITEM' });
  assert.equal(harness.state.guidedPractice.index, 1);
});

test('journey reducer walks every stage and requires a passing assessment to complete', () => {
  const harness = reachAssessment();
  assert.equal(canCompleteJourney(harness.state, content), false);

  // Submitting an incomplete assessment is ignored.
  harness.send({ type: 'SUBMIT_ASSESSMENT', now: '2026-01-01T00:00:00.000Z' });
  assert.equal(harness.state.assessment.attempts.length, 0);

  // Fail every question.
  answerAssessment(harness, content, false);
  assert.equal(harness.state.assessment.attempts.length, 1);
  assert.equal(harness.state.assessment.passed, false);
  assert.equal(harness.state.assessment.bestPercentage, 0);

  // Completion is refused while the assessment is not passed.
  harness.send({ type: 'COMPLETE_JOURNEY', now: '2026-01-01T00:00:00.000Z' });
  assert.equal(harness.state.completed, false);
  assert.equal(harness.state.stage, JOURNEY_STAGES.ASSESSMENT);

  // Retry clears the pending answers/results but keeps the attempt history.
  harness.send({ type: 'RETRY_ASSESSMENT' });
  assert.equal(harness.state.assessment.results, null);
  assert.equal(harness.state.assessment.attempts.length, 1);

  // Pass the assessment.
  answerAssessment(harness, content, true);
  assert.equal(harness.state.assessment.passed, true);
  assert.equal(harness.state.assessment.attempts.length, 2);
  assert.equal(harness.state.assessment.bestPercentage, 100);
  assert.equal(canCompleteJourney(harness.state, content), true);

  harness.send({ type: 'COMPLETE_JOURNEY', now: '2026-02-02T00:00:00.000Z' });
  assert.equal(harness.state.stage, JOURNEY_STAGES.COMPLETE);
  assert.equal(harness.state.completed, true);
  assert.equal(harness.state.completedAt, '2026-02-02T00:00:00.000Z');
});

test('a mastery decision can veto completion and request a retake after passing', () => {
  const harness = reachAssessment();
  answerAssessment(harness, content, true);
  assert.equal(canCompleteJourney(harness.state, content), true);

  // Passing the score is not enough when the mastery layer withholds consent.
  harness.send({
    type: 'COMPLETE_JOURNEY',
    masteryAllowed: false,
    now: '2026-02-02T00:00:00.000Z',
  });
  assert.equal(harness.state.completed, false);
  assert.equal(harness.state.stage, JOURNEY_STAGES.ASSESSMENT);

  // An ordinary retry is still refused after passing; the mastery path must be
  // explicit so a passed score cannot be discarded by accident.
  const passedResults = harness.state.assessment.results;
  harness.send({ type: 'RETRY_ASSESSMENT' });
  assert.equal(harness.state.assessment.results, passedResults);

  harness.send({ type: 'RETRY_ASSESSMENT', masteryRetake: true });
  assert.equal(harness.state.assessment.results, null);

  answerAssessment(harness, content, true);
  harness.send({ type: 'COMPLETE_JOURNEY', masteryAllowed: true });
  assert.equal(harness.state.completed, true);
});

test('assessment records every attempt and never dead-ends after the recommended maximum', () => {
  const harness = reachAssessment();

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    answerAssessment(harness, content, false);
    assert.equal(harness.state.assessment.attempts.length, attempt);
    assert.equal(harness.state.assessment.exhausted, attempt >= 3);
    if (attempt < 3) harness.send({ type: 'RETRY_ASSESSMENT' });
  }

  assert.notEqual(harness.state.assessment.results, null);
  harness.send({ type: 'RETRY_ASSESSMENT' });
  assert.equal(harness.state.assessment.results, null);
  assert.equal(Object.keys(harness.state.assessment.answers).length, 0);

  answerAssessment(harness, content, true);
  assert.equal(harness.state.assessment.passed, true);
  assert.equal(harness.state.assessment.attempts.length, 4);
});

test('reviewing the lesson clears assessment results but keeps practice records', () => {
  const harness = reachAssessment();
  answerAssessment(harness, content, false);
  harness.send({ type: 'REVIEW_LESSON' });
  assert.equal(harness.state.stage, JOURNEY_STAGES.EXPLANATION);
  assert.equal(harness.state.assessment.results, null);
  assert.equal(Object.keys(harness.state.guidedPractice.records).length, 2);
  assert.equal(Object.keys(harness.state.independentPractice.records).length, 1);
});

// ---------------------------------------------------------------------------
// Restore semantics
// ---------------------------------------------------------------------------

test('saved state restores compatible progress and rejects foreign or broken state', () => {
  const harness = reachAssessment();
  const saved = JSON.parse(JSON.stringify(harness.state));

  const restored = createInitialJourneyState(content, {}, saved);
  assert.equal(restored.stage, JOURNEY_STAGES.ASSESSMENT);
  assert.equal(Object.keys(restored.guidedPractice.records).length, 2);

  const wrongCourse = createInitialJourneyState(content, {}, {
    ...saved,
    courseId: 'other-course',
  });
  assert.equal(wrongCourse.stage, JOURNEY_STAGES.OBJECTIVES);
  assert.equal(Object.keys(wrongCourse.guidedPractice.records).length, 0);

  const wrongVersion = createInitialJourneyState(content, {}, {
    ...saved,
    schemaVersion: 99,
  });
  assert.equal(wrongVersion.stage, JOURNEY_STAGES.OBJECTIVES);

  const repaired = createInitialJourneyState(content, {}, {
    ...saved,
    guidedPractice: null,
  });
  assert.equal(repaired.stage, JOURNEY_STAGES.ASSESSMENT);
  assert.deepEqual(repaired.guidedPractice.records, {});
});

test('restored failed attempts recompute the exhausted flag', () => {
  const harness = reachAssessment();
  answerAssessment(harness, content, false);
  harness.send({ type: 'RETRY_ASSESSMENT' });
  answerAssessment(harness, content, false);
  harness.send({ type: 'RETRY_ASSESSMENT' });
  answerAssessment(harness, content, false);

  const saved = JSON.parse(JSON.stringify(harness.state));
  assert.equal(saved.assessment.exhausted, true);
  const restored = createInitialJourneyState(content, {}, saved);
  assert.equal(restored.assessment.exhausted, true);
});

// ---------------------------------------------------------------------------
// Content validation
// ---------------------------------------------------------------------------

test('validateJourneyContent accepts the fixture and reports authoring mistakes', () => {
  assert.deepEqual(validateJourneyContent(content), []);

  const badIndex = JSON.parse(JSON.stringify(content));
  badIndex.assessment.items[0].correctIndex = 99;
  assert.ok(
    validateJourneyContent(badIndex).some((error) =>
      error.includes('correctIndex')
    )
  );

  const reusedId = JSON.parse(JSON.stringify(content));
  reusedId.assessment.items[0].id = reusedId.guidedPractice.items[0].id;
  assert.ok(
    validateJourneyContent(reusedId).some(
      (error) =>
        error.includes('reuses assessment item id') ||
        error.includes('duplicate item id')
    )
  );

  const noObjectives = JSON.parse(JSON.stringify(content));
  noObjectives.objectives = [];
  assert.ok(
    validateJourneyContent(noObjectives).some((error) =>
      error.includes('objective')
    )
  );

  const shortAssessment = JSON.parse(JSON.stringify(content));
  shortAssessment.assessment.items = shortAssessment.assessment.items.slice(0, 2);
  assert.ok(
    validateJourneyContent(shortAssessment).some((error) =>
      error.includes('at least 3 items')
    )
  );
});
