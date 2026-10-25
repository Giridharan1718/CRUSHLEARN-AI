import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_REVIEW_POLICY,
  REVIEW_OUTCOMES,
  buildNextReview,
  buildReviewQueue,
  createEmptyReviewState,
  getReviewSummary,
  mergeReviewQueues,
  normalizeReviewState,
} from '../../src/learning/reviewScheduler.mjs';

const NOW = '2026-03-01T12:00:00.000Z';
const ONE_DAY_LATER = '2026-03-02T12:00:00.000Z';
const THREE_DAYS_LATER = '2026-03-04T12:00:00.000Z';
const FOUR_DAYS_LATER = '2026-03-05T12:00:00.000Z';

const concept = {
  id: 'concept-1',
  conceptId: 'concept-1',
  courseId: 'course-1',
  lessonId: 'lesson-1',
  objectiveId: 'objective-1',
  objectiveTitle: 'Objective one',
  title: 'Concept one',
  prompt: 'What is the answer?',
  answer: 'answer',
  acceptedAnswers: ['answer'],
  explanation: 'Because this is the explanation.',
};

function activity(id, objectiveId = 'objective-1', title = id) {
  return {
    ...concept,
    id,
    conceptId: id,
    objectiveId,
    objectiveTitle: `Objective ${objectiveId}`,
    title,
  };
}

function evidenceFor(objectiveId, results) {
  return {
    version: 1,
    observations: results.map((isCorrect, index) => ({
      objectiveId,
      itemId: `${objectiveId}-${index}`,
      isCorrect,
    })),
    attempts: [],
  };
}

function reviewAt(outcome, selfAssessment = null, now = NOW, policy) {
  return buildNextReview({
    concept,
    outcome,
    selfAssessment,
    now,
    policy,
  });
}

function stateAfterReviews(steps) {
  let state = createEmptyReviewState();
  steps.forEach((step) => {
    state = buildNextReview({
      state,
      concept,
      outcome: step.outcome,
      selfAssessment: step.selfAssessment || null,
      now: step.now,
    }).state;
  });
  return state;
}

test('a new concept is due immediately without creating a persisted record', () => {
  const reviewState = createEmptyReviewState();
  const queue = buildReviewQueue({
    activities: [activity('concept-1')],
    reviewState,
    now: NOW,
  });

  assert.equal(queue.due.length, 1);
  assert.equal(queue.upcoming.length, 0);
  assert.equal(queue.due[0].isNew, true);
  assert.equal(queue.due[0].dueAt, NOW);
  assert.equal(queue.due[0].reviewCount, 0);
  assert.deepEqual(reviewState.records, {});
});

test('a correct answer schedules the next review one day later', () => {
  const result = reviewAt(REVIEW_OUTCOMES.CORRECT);

  assert.equal(result.record.intervalDays, 1);
  assert.equal(result.record.dueAt, ONE_DAY_LATER);
  assert.equal(result.record.stage, 1);
  assert.equal(result.record.correctCount, 1);
  assert.equal(result.record.incorrectCount, 0);
  assert.equal(result.record.reviewCount, 1);
  assert.equal(result.record.lastOutcome, 'correct');
  assert.equal(result.state.records['concept-1'].dueAt, ONE_DAY_LATER);
});

test('successive correct answers move up the interval ladder', () => {
  const first = reviewAt(REVIEW_OUTCOMES.CORRECT);
  const second = buildNextReview({
    state: first.state,
    concept,
    outcome: REVIEW_OUTCOMES.CORRECT,
    now: first.dueAt,
  });

  assert.equal(second.record.stage, 2);
  assert.equal(second.record.intervalDays, 3);
  assert.equal(second.record.dueAt, FOUR_DAYS_LATER);
  assert.equal(second.record.correctCount, 2);
  assert.equal(second.record.reviewCount, 2);
});

test('an incorrect answer resets the ladder and schedules a short retry', () => {
  const demonstrated = stateAfterReviews([
    { outcome: 'correct', now: NOW },
    { outcome: 'correct', now: ONE_DAY_LATER },
    { outcome: 'correct', now: FOUR_DAYS_LATER },
  ]);
  const result = buildNextReview({
    state: demonstrated,
    concept,
    outcome: REVIEW_OUTCOMES.INCORRECT,
    now: '2026-03-12T12:00:00.000Z',
  });

  assert.equal(result.record.stage, 0);
  assert.equal(result.record.intervalDays, 1);
  assert.equal(result.record.dueAt, '2026-03-13T12:00:00.000Z');
  assert.equal(result.record.correctCount, 3);
  assert.equal(result.record.incorrectCount, 1);
  assert.equal(result.record.lapses, 1);
  assert.equal(result.record.lastOutcome, 'incorrect');
});

test('self-assessment changes the interval and is recorded', () => {
  const first = reviewAt(REVIEW_OUTCOMES.CORRECT);
  const easy = buildNextReview({
    state: first.state,
    concept,
    outcome: REVIEW_OUTCOMES.CORRECT,
    selfAssessment: 'easy',
    now: first.dueAt,
  });
  assert.equal(easy.record.stage, 3);
  assert.equal(easy.record.intervalDays, 7);
  assert.equal(easy.record.lastSelfAssessment, 'easy');

  const hard = buildNextReview({
    state: first.state,
    concept,
    outcome: REVIEW_OUTCOMES.CORRECT,
    selfAssessment: 'hard',
    now: first.dueAt,
  });
  assert.equal(hard.record.stage, 2);
  assert.equal(hard.record.intervalDays, 2);
  assert.equal(hard.record.dueAt, THREE_DAYS_LATER);
  assert.equal(hard.record.lastSelfAssessment, 'hard');
});

test('the interval ladder, short retry and limits are configurable', () => {
  const policy = {
    intervalsDays: [2, 5],
    incorrectIntervalDays: 2,
    hardFactor: 0.5,
    easyStageBonus: 0,
    maxIntervalDays: 5,
  };
  const first = reviewAt(REVIEW_OUTCOMES.CORRECT, null, NOW, policy);
  assert.equal(first.record.intervalDays, 2);
  assert.equal(first.record.dueAt, '2026-03-03T12:00:00.000Z');

  const second = buildNextReview({
    state: first.state,
    concept,
    outcome: REVIEW_OUTCOMES.CORRECT,
    now: first.dueAt,
    policy,
  });
  assert.equal(second.record.intervalDays, 5);

  const missed = buildNextReview({
    state: second.state,
    concept,
    outcome: REVIEW_OUTCOMES.INCORRECT,
    now: second.dueAt,
    policy,
  });
  assert.equal(missed.record.intervalDays, 2);
  assert.equal(missed.record.dueAt, '2026-03-10T12:00:00.000Z');
  assert.deepEqual(DEFAULT_REVIEW_POLICY.intervalsDays, [1, 3, 7, 14, 30, 60]);
});

test('due reviews put weak evidence ahead of stronger evidence', () => {
  const weak = activity('concept-weak', 'objective-weak');
  const strong = activity('concept-strong', 'objective-strong');
  const queue = buildReviewQueue({
    activities: [strong, weak],
    reviewState: createEmptyReviewState(),
    evidence: {
      version: 1,
      observations: [
        ...evidenceFor('objective-weak', [false, false]).observations,
        ...evidenceFor('objective-strong', [true, true]).observations,
      ],
      attempts: [],
    },
    now: NOW,
  });

  assert.equal(queue.due.length, 2);
  assert.equal(queue.due[0].id, 'concept-weak');
  assert.equal(queue.due[0].priority, 'high');
  assert.equal(queue.due[0].weakEvidence, true);
  assert.equal(queue.due[1].id, 'concept-strong');
  assert.equal(queue.due[1].priority, 'medium');
  assert.equal(queue.due[1].weakEvidence, false);
});

test('a first miss is prioritised for review without being labelled a gap', () => {
  const queue = buildReviewQueue({
    activities: [activity('concept-weak', 'objective-weak')],
    evidence: evidenceFor('objective-weak', [false]),
    now: NOW,
  });

  assert.equal(queue.due[0].objectiveState, 'NEEDS_PRACTICE');
  assert.equal(queue.due[0].confirmedGap, false);
  assert.equal(queue.due[0].weakEvidence, true);
  assert.equal(queue.due[0].priority, 'high');
});

test('an overdue review outranks a fresh unknown concept', () => {
  const overdue = activity('concept-overdue', 'objective-demonstrated');
  const fresh = activity('concept-fresh', 'objective-unknown');
  const reviewState = {
    version: 1,
    records: {
      'concept-overdue': {
        conceptId: 'concept-overdue',
        courseId: 'course-1',
        objectiveId: 'objective-demonstrated',
        lessonId: 'lesson-1',
        title: 'Overdue concept',
        stage: 2,
        intervalDays: 7,
        dueAt: '2026-02-24T12:00:00.000Z',
        reviewCount: 2,
        correctCount: 2,
        incorrectCount: 0,
        lapses: 0,
        lastOutcome: 'correct',
        lastSelfAssessment: null,
        lastReviewedAt: '2026-02-17T12:00:00.000Z',
        updatedAt: '2026-02-17T12:00:00.000Z',
      },
    },
  };

  const queue = buildReviewQueue({
    activities: [fresh, overdue],
    reviewState,
    evidence: evidenceFor('objective-demonstrated', [true, true]),
    now: NOW,
  });

  assert.equal(queue.due[0].id, 'concept-overdue');
  assert.equal(queue.due[0].overdueDays, 5);
  assert.equal(queue.due[0].outdated, true);
  assert.equal(queue.due[1].id, 'concept-fresh');
});

test('due and upcoming reviews are separated and invalid records fall back safely', () => {
  const first = reviewAt(REVIEW_OUTCOMES.CORRECT);
  const queue = buildReviewQueue({
    activities: [activity('concept-1'), activity('concept-2')],
    reviewState: first.state,
    now: NOW,
  });

  assert.equal(queue.due.length, 1);
  assert.equal(queue.due[0].id, 'concept-2');
  assert.equal(queue.upcoming.length, 1);
  assert.equal(queue.upcoming[0].id, 'concept-1');
  assert.equal(queue.upcoming[0].daysUntilDue, 1);

  const corrupt = normalizeReviewState({
    records: {
      'concept-1': { conceptId: 'concept-1', dueAt: 'not a date' },
    },
  });
  assert.deepEqual(corrupt.records, {});
  const fallbackQueue = buildReviewQueue({
    activities: [activity('concept-1')],
    reviewState: corrupt,
    now: NOW,
  });
  assert.equal(fallbackQueue.due.length, 1);
  assert.equal(fallbackQueue.due[0].isNew, true);
});

test('orphaned saved records are counted but never scheduled', () => {
  const reviewState = {
    version: 1,
    records: {
      'removed-concept': {
        conceptId: 'removed-concept',
        courseId: 'course-1',
        objectiveId: 'objective-1',
        lessonId: 'lesson-1',
        title: 'Removed concept',
        stage: 1,
        intervalDays: 1,
        dueAt: '2026-02-01T12:00:00.000Z',
        reviewCount: 1,
        correctCount: 1,
        incorrectCount: 0,
        lapses: 0,
        lastOutcome: 'correct',
        lastSelfAssessment: null,
        lastReviewedAt: '2026-01-31T12:00:00.000Z',
        updatedAt: '2026-01-31T12:00:00.000Z',
      },
    },
  };

  const queue = buildReviewQueue({
    activities: [],
    reviewState,
    now: NOW,
  });

  assert.equal(queue.due.length, 0);
  assert.equal(queue.upcoming.length, 0);
  assert.equal(queue.unavailableCount, 1);
  assert.equal(getReviewSummary(queue).unavailableCount, 1);
});

test('queues from multiple courses merge with due priority sorting', () => {
  const queueA = buildReviewQueue({
    activities: [activity('weak-a', 'objective-weak')],
    evidence: evidenceFor('objective-weak', [false, false]),
    now: NOW,
  });
  const queueB = buildReviewQueue({
    activities: [activity('soon-b', 'objective-strong')],
    evidence: evidenceFor('objective-strong', [true, true]),
    now: NOW,
  });

  const merged = mergeReviewQueues([queueB, queueA]);
  assert.equal(merged.due.length, 2);
  assert.equal(merged.due[0].id, 'weak-a');
  assert.equal(merged.activityCount, 2);
  assert.equal(getReviewSummary(merged).dueCount, 2);
  assert.equal(getReviewSummary(merged).highPriorityCount, 1);
});
