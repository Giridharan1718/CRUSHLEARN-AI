import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countCompletedLessons,
  getCompletedLessonIds,
  getCourseCompletionStats,
  getLessonCompletionKey,
  getOverallCompletionStats,
  isLessonCompleted,
  markLessonCompleted,
  parseLessonCompletionKey,
} from '../../src/utils/lessonProgress.mjs';

const courses = [
  {
    id: 'web-dev-101',
    lessons: [{ id: 'lesson-1' }, { id: 'lesson-2' }],
  },
  {
    id: 'python-basics',
    lessons: [{ id: 'lesson-1' }, { id: 'lesson-2' }],
  },
];

test('the same lesson id in different courses is isolated', () => {
  const user = {
    completedLessons: [
      getLessonCompletionKey('web-dev-101', 'lesson-1'),
    ],
  };

  assert.equal(isLessonCompleted(user, 'web-dev-101', 'lesson-1'), true);
  assert.equal(isLessonCompleted(user, 'python-basics', 'lesson-1'), false);
  assert.deepEqual(getCompletedLessonIds(user, 'python-basics', courses[1].lessons), []);
});

test('legacy bare lesson ids still count for the original web course', () => {
  const user = { completedLessons: ['lesson-1', 'lesson-2'] };

  assert.equal(isLessonCompleted(user, 'web-dev-101', 'lesson-1'), true);
  assert.equal(isLessonCompleted(user, 'python-basics', 'lesson-1'), false);
  assert.equal(getCourseCompletionStats(user, courses[0]).completed, 2);
  assert.equal(getCourseCompletionStats(user, courses[1]).completed, 0);
});

test('marking completion writes a course-scoped key and migrates a legacy id', () => {
  const user = { completedLessons: ['lesson-1'] };
  const updated = markLessonCompleted(user, 'web-dev-101', 'lesson-1');

  assert.deepEqual(updated.completedLessons, ['web-dev-101:lesson-1']);
  assert.equal(isLessonCompleted(updated, 'web-dev-101', 'lesson-1'), true);

  const repeated = markLessonCompleted(updated, 'web-dev-101', 'lesson-1');
  assert.deepEqual(repeated.completedLessons, ['web-dev-101:lesson-1']);
});

test('completion stats count unique course lessons, not raw storage keys', () => {
  const user = {
    completedLessons: [
      'lesson-1',
      'web-dev-101:lesson-1',
      'web-dev-101:lesson-2',
      'python-basics:lesson-2',
    ],
  };

  const webStats = getCourseCompletionStats(user, courses[0]);
  assert.equal(webStats.completed, 2);
  assert.equal(webStats.total, 2);
  assert.equal(webStats.percentage, 100);
  assert.equal(webStats.remaining, 0);

  const pythonStats = getCourseCompletionStats(user, courses[1]);
  assert.equal(pythonStats.completed, 1);
  assert.equal(pythonStats.percentage, 50);

  assert.equal(countCompletedLessons(user, courses), 3);
  assert.deepEqual(getOverallCompletionStats(user, courses), {
    completed: 3,
    total: 4,
    percentage: 75,
  });
});

test('completion helpers tolerate missing or malformed user data', () => {
  assert.equal(isLessonCompleted(null, 'web-dev-101', 'lesson-1'), false);
  assert.equal(getCourseCompletionStats(null, courses[0]).completed, 0);
  assert.equal(countCompletedLessons({ completedLessons: null }, courses), 0);
  assert.deepEqual(parseLessonCompletionKey('python-basics:lesson-2'), {
    courseId: 'python-basics',
    lessonId: 'lesson-2',
  });
  assert.equal(parseLessonCompletionKey('lesson-1'), null);
  assert.equal(parseLessonCompletionKey(':lesson-1'), null);
  assert.equal(parseLessonCompletionKey('course:'), null);
});
