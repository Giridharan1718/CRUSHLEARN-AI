import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReviewActivities,
  createRecallItem,
  evaluateRecall,
  validateReviewConcepts,
} from '../../src/learning/activeRecall.mjs';
import {
  buildReviewQueue,
  createEmptyReviewState,
} from '../../src/learning/reviewScheduler.mjs';
import {
  EVIDENCE_SOURCES,
  createEmptyEvidence,
  recordAttempt,
} from '../../src/learning/gapDetection.mjs';

const choice = {
  id: 'q-no-body',
  kind: 'single_choice',
  objectiveId: 'objective-1',
  prompt: 'Which element holds visible content?',
  options: ['<head>', '<body>'],
  correctIndex: 1,
  explanation: '<body> holds the content a visitor sees.',
};

const text = {
  id: 'q-html-name',
  kind: 'short_text',
  objectiveId: 'objective-1',
  prompt: 'What does HTML stand for?',
  answer: 'HyperText Markup Language',
  acceptedAnswers: ['hypertext markup language'],
  explanation: 'HTML expands to HyperText Markup Language.',
};

function mapWith(concepts) {
  return {
    courseId: 'test-course',
    objectives: [
      { id: 'objective-1', title: 'Objective one' },
      { id: 'objective-2', title: 'Objective two' },
    ],
    lessons: {
      'lesson-1': {
        objectiveIds: ['objective-1', 'objective-2'],
        prerequisiteObjectiveIds: [],
      },
    },
    reviewConcepts: concepts,
  };
}

const bodyConcept = {
  id: 'body-content',
  title: 'Visible content lives in the body',
  objectiveId: 'objective-1',
  lessonId: 'lesson-1',
  sourceItemIds: ['q-no-body'],
  acceptedAnswers: ['body'],
};

test('builds free-recall activities from existing questions without choices', () => {
  const activities = buildReviewActivities({
    courseMap: mapWith([bodyConcept]),
    items: [choice],
  });

  assert.equal(activities.length, 1);
  assert.equal(activities[0].prompt, choice.prompt);
  assert.equal(activities[0].answer, '<body>');
  assert.equal(activities[0].sourceItemId, 'q-no-body');
  assert.equal(activities[0].sourceKind, 'single_choice');
  assert.equal(activities[0].options, undefined);
  assert.ok(activities[0].acceptedAnswers.includes('<body>'));
  assert.ok(activities[0].acceptedAnswers.includes('body'));
  assert.equal(activities[0].objectiveTitle, 'Objective one');
});

test('checks recall case-insensitively and records whether an answer was given', () => {
  const [activity] = buildReviewActivities({
    courseMap: mapWith([
      {
        ...bodyConcept,
        id: 'html-expansion',
        sourceItemIds: ['q-html-name'],
      },
    ]),
    items: [choice, text],
  });

  assert.equal(activity.answer, 'HyperText Markup Language');
  assert.equal(
    evaluateRecall(activity, '  hypertext   markup language ').isCorrect,
    true
  );
  assert.equal(evaluateRecall(activity, 'HTML').isCorrect, false);
  const blank = evaluateRecall(activity, '   ');
  assert.equal(blank.isCorrect, false);
  assert.equal(blank.answered, false);
  assert.equal(blank.expected, 'HyperText Markup Language');
  assert.match(blank.explanation, /HyperText/);

  const item = createRecallItem(activity);
  assert.equal(item.objectiveId, 'objective-1');
  assert.equal(item.kind, 'short_text');
  assert.equal(item.id, 'review:test-course:html-expansion');
});

test('a checked recall is recorded as review evidence with its answer', () => {
  const [activity] = buildReviewActivities({
    courseMap: mapWith([bodyConcept]),
    items: [choice],
  });
  const item = createRecallItem(activity);
  const { evidence, attempt } = recordAttempt(createEmptyEvidence(), {
    items: [item],
    answers: { [item.id]: '<body>' },
    source: EVIDENCE_SOURCES.REVIEW,
    at: '2026-03-01T12:00:00.000Z',
    metadata: { conceptId: activity.id, selfAssessment: 'easy' },
  });

  assert.equal(attempt.kind, 'review');
  assert.equal(attempt.metadata.selfAssessment, 'easy');
  assert.equal(evidence.observations.length, 1);
  assert.equal(evidence.observations[0].objectiveId, 'objective-1');
  assert.equal(evidence.observations[0].isCorrect, true);
  assert.equal(evidence.observations[0].value, '<body>');
});

test('falls back to a later valid source item and skips unusable concepts', () => {
  const activities = buildReviewActivities({
    courseMap: mapWith([
      {
        ...bodyConcept,
        sourceItemIds: ['q-is-gone', 'q-no-body'],
      },
      {
        ...bodyConcept,
        id: 'no-source',
        sourceItemIds: ['q-is-also-gone'],
      },
    ]),
    items: [choice],
  });

  assert.equal(activities.length, 1);
  assert.equal(activities[0].id, 'body-content');
  assert.equal(activities[0].sourceItemId, 'q-no-body');

  const queue = buildReviewQueue({
    activities,
    reviewState: createEmptyReviewState(),
    now: '2026-03-01T12:00:00.000Z',
  });
  assert.equal(queue.due.length, 1);
  assert.equal(queue.unavailableCount, 0);
});

test('a source item is not turned into repeated review activities', () => {
  const activities = buildReviewActivities({
    courseMap: mapWith([
      bodyConcept,
      {
        ...bodyConcept,
        id: 'second-body-concept',
      },
    ]),
    items: [choice],
  });

  assert.equal(activities.length, 1);
  assert.equal(activities[0].id, 'body-content');
});

test('validation reports missing content, shared sources and lesson mismatches', () => {
  const errors = validateReviewConcepts({
    courseMap: mapWith([
      bodyConcept,
      {
        ...bodyConcept,
        id: 'second-body-concept',
      },
      {
        ...bodyConcept,
        id: 'missing-source',
        sourceItemIds: ['not-there'],
      },
      {
        ...bodyConcept,
        id: 'wrong-lesson',
        lessonId: 'lesson-999',
      },
    ]),
    items: [choice],
  });

  assert.ok(errors.some((error) => /more than one review concept/.test(error)));
  assert.ok(errors.some((error) => /missing source item "not-there"/.test(error)));
  assert.ok(errors.some((error) => /unknown lesson "lesson-999"/.test(error)));
  assert.ok(errors.some((error) => /no reviewable content/.test(error)));
});

test('valid authored review concepts have no validation errors', () => {
  assert.deepEqual(
    validateReviewConcepts({
      courseMap: mapWith([bodyConcept]),
      items: [choice],
    }),
    []
  );
});
