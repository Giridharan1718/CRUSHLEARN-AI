import test from 'node:test';
import assert from 'node:assert/strict';
import {
  learningJourneys,
  getLearningJourney,
} from '../../src/data/learningJourneys.mjs';
import {
  JOURNEY_STAGES,
  createInitialJourneyState,
  resolveJourneyPolicy,
  validateJourneyContent,
} from '../../src/learning/journeyEngine.mjs';

test('the authored web-dev-101 lesson-1 journey is valid content', () => {
  const content = getLearningJourney('web-dev-101', 'lesson-1');
  assert.ok(content, 'journey content should exist for web-dev-101/lesson-1');
  assert.deepEqual(validateJourneyContent(content), []);
});

test('assessment items are separate from practice items', () => {
  const content = getLearningJourney('web-dev-101', 'lesson-1');
  const practiceIds = new Set(
    [...content.guidedPractice.items, ...content.independentPractice.items].map(
      (item) => item.id
    )
  );
  content.assessment.items.forEach((item) => {
    assert.equal(
      practiceIds.has(item.id),
      false,
      `assessment item ${item.id} must not reuse a practice item id`
    );
  });
});

test('every authored journey has objectives, enough assessment items and a pass score', () => {
  Object.values(learningJourneys).forEach((content) => {
    assert.ok(content.objectives.length >= 2, 'at least two objectives');
    assert.ok(
      content.assessment.items.length >= 3,
      'at least three assessment items'
    );
    assert.ok(
      resolveJourneyPolicy(content).passingScore > 0 &&
        resolveJourneyPolicy(content).passingScore <= 100,
      'passing score within 1..100'
    );
  });
});

test('a fresh journey starts at objectives and is not complete', () => {
  const content = getLearningJourney('web-dev-101', 'lesson-1');
  const state = createInitialJourneyState(content);
  assert.equal(state.stage, JOURNEY_STAGES.OBJECTIVES);
  assert.equal(state.completed, false);
});

test('unknown course/lesson pairs return null instead of crashing', () => {
  assert.equal(getLearningJourney('web-dev-101', 'lesson-999'), null);
  assert.equal(getLearningJourney('python-basics', 'lesson-1'), null);
  assert.equal(getLearningJourney(undefined, undefined), null);
});
