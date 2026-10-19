// Prerequisite Progress Tracking
// Tracks learner progress through prerequisite objectives.

import { getLearningPath } from './learningObjectives.mjs';
import { courses } from '../data/mockCourseData.mjs';

/**
 * Get the progress status for a specific objective.
 *
 * @param {string} objectiveId - Objective ID
 * @param {Array} completedObjectiveIds - Array of completed objective IDs
 * @returns {Object} Progress object
 */
export const getObjectiveProgress = (objectiveId, completedObjectiveIds = []) => {
  const completedSet = new Set(completedObjectiveIds);
  const isComplete = completedSet.has(objectiveId);

  return {
    objectiveId,
    isComplete,
    completed: isComplete,
    progress: isComplete ? 100 : 0,
  };
};

/**
 * Get overall progress for a subject's learning path.
 *
 * @param {string} subject - Subject key (e.g., 'programming')
 * @param {Array} completedObjectiveIds - Array of completed objective IDs
 * @returns {Object} Overall progress object
 */
export const getSubjectProgress = (subject, completedObjectiveIds = []) => {
  const objectives = getLearningPath(subject);
  const total = objectives.length;
  const completed = objectives.filter((id) =>
    completedObjectiveIds.includes(id)
  ).length;

  return {
    subject,
    totalObjectives: total,
    completedObjectives: completed,
    percentage: total > 0 ? (completed / total) * 100 : 0,
    isComplete: completed === total,
  };
};

/**
 * Get progress for all subjects.
 *
 * @param {Array} completedObjectiveIds - Array of completed objective IDs
 * @returns {Object} Progress for all subjects
 */
export const getProgressForAllSubjects = (completedObjectiveIds = []) => {
  const subjects = ['programming', 'mathematics', 'science', 'languages', 'business', 'design'];
  const progress = {};

  subjects.forEach((subject) => {
    progress[subject] = getSubjectProgress(subject, completedObjectiveIds);
  });

  return progress;
};

/**
 * Get prerequisite progress for a lesson.
 *
 * @param {string} lessonId - Lesson ID
 * @param {Array} completedObjectiveIds - Array of completed objective IDs
 * @returns {Object} Prerequisite progress
 */
export const getLessonPrerequisiteProgress = (
  lessonId,
  completedObjectiveIds = []
) => {
  // Find the lesson in mockCourseData
  const lesson = findLessonById(lessonId);
  if (!lesson) {
    return {
      lessonId,
      prerequisitesMet: true,
      required: 0,
      completed: 0,
      missing: [],
    };
  }

  const prerequisiteIds = lesson.prerequisiteLessonIds || [];
  const completedSet = new Set(completedObjectiveIds);
  const missing = prerequisiteIds.filter(
    (id) => !completedSet.has(id)
  );

  return {
    lessonId,
    prerequisitesMet: missing.length === 0,
    required: prerequisiteIds.length,
    completed: prerequisiteIds.length - missing.length,
    missing,
  };
};

/**
 * Check if learner can access a lesson.
 *
 * @param {string} lessonId - Lesson ID
 * @param {Array} completedObjectiveIds - Array of completed objective IDs
 * @returns {Object} Access check result
 */
export const canAccessLesson = (lessonId, completedObjectiveIds = []) => {
  const { prerequisitesMet } = getLessonPrerequisiteProgress(
    lessonId,
    completedObjectiveIds
  );

  // Allow access if no prerequisites or all prerequisites met
  return prerequisitesMet;
};

/**
 * Find a lesson in mockCourseData.
 *
 * @param {string} lessonId - Lesson ID
 * @returns {Object|null} Lesson object
 */
export const findLessonById = (lessonId) => {
  const found = courses.flatMap((c) => c.lessons).find((l) => l.id === lessonId);
  return found || null;
};

/**
 * Get progress for a specific course.
 *
 * @param {Object} user - User object
 * @param {string} courseId - Course ID
 * @param {Array} courses - Array of course objects
 * @returns {Object} Course progress object
 */
export const getCourseProgress = (user, courseId, courses) => {
  const course = courses.find((c) => c.id === courseId);
  if (!course) return 0;

  const completedLessons = (user.completedLessons || []).filter((id) =>
    course.lessons.some((lesson) => lesson.id === id)
  );

  return (completedLessons.length / course.lessons.length) * 100;
};
