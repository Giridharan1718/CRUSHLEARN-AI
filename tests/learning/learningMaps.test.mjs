import test from 'node:test';
import assert from 'node:assert/strict';
import {
  courseLearningMaps,
  getCourseLearningMap,
  getCourseReviewItems,
  getLessonLearningSpec,
  getReviewConcepts,
} from '../../src/data/courseLearningMaps.mjs';
import { courses } from '../../src/data/mockCourseData.mjs';
import { getLearningJourney } from '../../src/data/learningJourneys.mjs';
import { validateLearningMap } from '../../src/learning/gapDetection.mjs';
import {
  evaluateProgression,
  validateMasteryConfiguration,
} from '../../src/learning/mastery.mjs';
import {
  buildReviewActivities,
  validateReviewConcepts,
} from '../../src/learning/activeRecall.mjs';

test('every authored course learning map is valid', () => {
  Object.values(courseLearningMaps).forEach((courseMap) => {
    assert.deepEqual(
      validateLearningMap(courseMap),
      [],
      `${courseMap.courseId} should have no validation errors`
    );
  });
});

test('every authored learning objective declares valid mastery criteria', () => {
  Object.values(courseLearningMaps).forEach((courseMap) => {
    assert.deepEqual(
      validateMasteryConfiguration(courseMap),
      [],
      `${courseMap.courseId} should have explicit, valid mastery criteria`
    );
    courseMap.objectives.forEach((objective) => {
      assert.ok(
        objective.masteryCriteria &&
          typeof objective.masteryCriteria === 'object',
        `objective ${courseMap.courseId}/${objective.id} needs masteryCriteria`
      );
    });
  });
});

test('the authored web-dev lesson 1 objectives remain achievable with the journey sources', () => {
  const map = getCourseLearningMap('web-dev-101');
  const lesson = getLessonLearningSpec('web-dev-101', 'lesson-1');
  const decision = evaluateProgression({
    courseMap: map,
    lessonId: 'lesson-1',
    evidence: {
      observations: [
        {
          objectiveId: 'html-document-structure',
          itemId: 'gp-1',
          isCorrect: true,
          source: 'lesson_practice',
          at: '2026-03-01T12:00:00.000Z',
        },
        {
          objectiveId: 'html-document-structure',
          itemId: 'as-1',
          isCorrect: true,
          source: 'lesson_assessment',
          at: '2026-03-01T12:00:00.000Z',
        },
        {
          objectiveId: 'html-tag-anatomy',
          itemId: 'gp-2',
          isCorrect: true,
          source: 'lesson_practice',
          at: '2026-03-01T12:00:00.000Z',
        },
        {
          objectiveId: 'html-tag-anatomy',
          itemId: 'as-2',
          isCorrect: true,
          source: 'lesson_assessment',
          at: '2026-03-01T12:00:00.000Z',
        },
        {
          objectiveId: 'html-semantics',
          itemId: 'ip-1',
          isCorrect: true,
          source: 'lesson_practice',
          at: '2026-03-01T12:00:00.000Z',
        },
        {
          objectiveId: 'html-semantics',
          itemId: 'as-3',
          isCorrect: true,
          source: 'lesson_assessment',
          at: '2026-03-01T12:00:00.000Z',
        },
      ],
      attempts: [],
    },
    now: '2026-03-03T12:00:00.000Z',
    activityComplete: true,
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.status, 'allowed');
  assert.deepEqual(lesson.objectiveIds, decision.objectives.map((entry) => entry.objectiveId));
});

test('every authored review concept points at validated course content', () => {
  Object.values(courseLearningMaps).forEach((courseMap) => {
    const concepts = getReviewConcepts(courseMap.courseId);
    const items = getCourseReviewItems(courseMap.courseId);
    assert.ok(
      concepts.length > 0,
      `${courseMap.courseId} should author at least one review concept`
    );
    assert.deepEqual(
      validateReviewConcepts({ courseMap, items }),
      [],
      `${courseMap.courseId} should have valid review concepts`
    );

    const activities = buildReviewActivities({ courseMap, items });
    assert.equal(activities.length, concepts.length);
    activities.forEach((activity) => {
      assert.ok(activity.prompt);
      assert.ok(activity.answer);
      assert.ok(activity.explanation);
      assert.ok(activity.sourceItemId);
      assert.equal(activity.courseId, courseMap.courseId);
      assert.ok(
        courseMap.objectives.some(
          (objective) => objective.id === activity.objectiveId
        )
      );
      assert.ok(courseMap.lessons[activity.lessonId]);
      assert.equal(activity.options, undefined);
    });
  });
});

test('learning maps only reference real courses and lessons', () => {
  Object.entries(courseLearningMaps).forEach(([courseId, courseMap]) => {
    const course = courses.find((entry) => entry.id === courseId);
    assert.ok(course, `course ${courseId} should exist`);
    const lessonIds = new Set(course.lessons.map((lesson) => lesson.id));
    Object.keys(courseMap.lessons).forEach((lessonId) => {
      assert.ok(
        lessonIds.has(lessonId),
        `lesson ${courseId}/${lessonId} should exist`
      );
    });
  });
});

test('web-dev lesson 1 objectives match the authored journey objectives', () => {
  const map = getCourseLearningMap('web-dev-101');
  const lesson = getLessonLearningSpec('web-dev-101', 'lesson-1');
  const journey = getLearningJourney('web-dev-101', 'lesson-1');

  assert.ok(map);
  assert.ok(lesson);
  assert.ok(journey);
  assert.deepEqual(
    lesson.objectiveIds,
    journey.objectives.map((objective) => objective.id)
  );
  lesson.objectiveIds.forEach((objectiveId) => {
    const mapObjective = map.objectives.find((entry) => entry.id === objectiveId);
    const journeyObjective = journey.objectives.find(
      (entry) => entry.id === objectiveId
    );
    assert.equal(mapObjective.title, journeyObjective.title);
  });
});

test('lesson 2 declares prerequisites that exist in the same course', () => {
  const webDev = getCourseLearningMap('web-dev-101');
  const lesson = getLessonLearningSpec('web-dev-101', 'lesson-2');
  assert.ok(lesson.prerequisiteObjectiveIds.length > 0);
  const ids = new Set(webDev.objectives.map((objective) => objective.id));
  lesson.prerequisiteObjectiveIds.forEach((objectiveId) => {
    assert.ok(ids.has(objectiveId), `missing prerequisite objective ${objectiveId}`);
  });
  assert.deepEqual(
    new Set(lesson.prerequisiteObjectiveIds),
    new Set(['html-document-structure', 'html-tag-anatomy', 'html-semantics'])
  );
});

test('a real course lesson without prerequisites exists and stays unblocked by data', () => {
  const python = getCourseLearningMap('python-basics');
  const lesson = getLessonLearningSpec('python-basics', 'lesson-1');
  assert.ok(python);
  assert.deepEqual(lesson.prerequisiteObjectiveIds, []);
});

test('web-dev practice content reuses the journey practice items', () => {
  const journey = getLearningJourney('web-dev-101', 'lesson-1');
  const lesson = getLessonLearningSpec('web-dev-101', 'lesson-1');
  const journeyItemIds = new Set([
    ...journey.guidedPractice.items,
    ...journey.independentPractice.items,
  ].map((item) => item.id));
  assert.ok(lesson.diagnostic.practiceItems.length > 0);
  lesson.diagnostic.practiceItems.forEach((item) => {
    assert.ok(
      journeyItemIds.has(item.id),
      `practice item ${item.id} should come from the authored journey`
    );
  });
});

test('unknown course or lesson lookups return null', () => {
  assert.equal(getCourseLearningMap('unknown-course'), null);
  assert.equal(getLessonLearningSpec('unknown-course', 'lesson-1'), null);
  assert.equal(getLessonLearningSpec('web-dev-101', 'lesson-999'), null);
});
