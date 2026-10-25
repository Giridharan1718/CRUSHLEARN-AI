// Course-scoped lesson completion helpers.
//
// Lesson ids are only unique inside a course (web-dev-101 and python-basics
// both start at lesson-1), so new completion records use a
// "courseId:lessonId" key. Bare lesson ids are still accepted for the original
// web-dev-101 starter data so existing learner progress is not lost.

export const LEGACY_COMPLETION_COURSE_ID = 'web-dev-101';

export function getLessonCompletionKey(courseId, lessonId) {
  return `${courseId}:${lessonId}`;
}

export function parseLessonCompletionKey(key) {
  if (typeof key !== 'string') return null;
  const separator = key.indexOf(':');
  if (separator <= 0 || separator === key.length - 1) return null;
  return {
    courseId: key.slice(0, separator),
    lessonId: key.slice(separator + 1),
  };
}

export function isLessonCompleted(user, courseId, lessonId) {
  const completedLessons = Array.isArray(user?.completedLessons)
    ? user.completedLessons
    : [];
  if (completedLessons.includes(getLessonCompletionKey(courseId, lessonId))) {
    return true;
  }
  // Preserve the original starter data, where bare lesson-1/lesson-2 ids
  // belonged to the first web course.
  return (
    courseId === LEGACY_COMPLETION_COURSE_ID &&
    completedLessons.includes(lessonId)
  );
}

export function getCompletedLessonIds(user, courseId, lessons) {
  return (Array.isArray(lessons) ? lessons : [])
    .filter((lesson) => lesson && isLessonCompleted(user, courseId, lesson.id))
    .map((lesson) => lesson.id);
}

export function getCourseCompletionStats(user, course) {
  const lessons = Array.isArray(course?.lessons) ? course.lessons : [];
  const completedIds = getCompletedLessonIds(user, course?.id, lessons);
  const total = lessons.length;
  const completed = completedIds.length;
  return {
    completedIds,
    completed,
    total,
    percentage: total > 0 ? (completed / total) * 100 : 0,
    remaining: Math.max(total - completed, 0),
  };
}

function removeLegacyBareCompletion(completedLessons, courseId, lessonId) {
  if (courseId !== LEGACY_COMPLETION_COURSE_ID) return completedLessons;
  return completedLessons.filter((id) => id !== lessonId);
}

export function markLessonCompleted(user, courseId, lessonId) {
  const completedLessons = Array.isArray(user?.completedLessons)
    ? user.completedLessons
    : [];
  const key = getLessonCompletionKey(courseId, lessonId);
  const withoutLegacyBare = removeLegacyBareCompletion(
    completedLessons,
    courseId,
    lessonId
  );
  const nextCompletedLessons = withoutLegacyBare.includes(key)
    ? withoutLegacyBare
    : [...withoutLegacyBare, key];
  return { ...user, completedLessons: nextCompletedLessons };
}

export function countCompletedLessons(user, courses) {
  return (Array.isArray(courses) ? courses : []).reduce(
    (total, course) => total + getCourseCompletionStats(user, course).completed,
    0
  );
}

export function getOverallCompletionStats(user, courses) {
  const courseList = Array.isArray(courses) ? courses : [];
  const total = courseList.reduce(
    (sum, course) => sum + getCourseCompletionStats(user, course).total,
    0
  );
  const completed = countCompletedLessons(user, courseList);
  return {
    completed,
    total,
    percentage: total > 0 ? (completed / total) * 100 : 0,
  };
}
