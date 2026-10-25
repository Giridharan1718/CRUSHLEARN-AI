// Dashboard helper utilities

import {
  getCourseCompletionStats,
  getOverallCompletionStats,
  isLessonCompleted,
  markLessonCompleted,
} from './lessonProgress.mjs';
import { getActivitySummary } from './learningActivity.mjs';

/**
 * The learning streak, derived from the learner's recorded activity.
 *
 * There is no stored counter to read here any more: the streak is computed
 * from the dated activity entries, so it always matches what the learner
 * actually did. It is null when activity tracking is off, so a caller can
 * tell "no activity" apart from "not being tracked".
 */
export const calculateLearningStreak = () => getActivitySummary().streak;

/**
 * Get today's recommended lesson for the user
 * Returns the first incomplete lesson from enrolled courses
 */
export const getTodaysLesson = (user, courses) => {
  for (const courseId of user.enrolledCourses || []) {
    const course = courses.find((c) => c.id === courseId);
    if (!course) continue;

    const nextLesson = course.lessons.find(
      (lesson) => !isLessonCompleted(user, course.id, lesson.id)
    );

    if (nextLesson) {
      return { lesson: nextLesson, course };
    }
  }
  return null;
};

/**
 * Calculate overall progress across all enrolled courses
 */
export const calculateOverallProgress = (user, courses) => {
  const enrolled = (user.enrolledCourses || [])
    .map((courseId) => courses.find((course) => course.id === courseId))
    .filter(Boolean);
  const overall = getOverallCompletionStats(user, enrolled);

  return {
    totalLessons: overall.total,
    completedCount: overall.completed,
    percentage: overall.percentage,
  };
};

/**
 * Calculate progress for a specific course
 */
export const getCourseProgress = (user, courseId, courses) => {
  const course = courses.find((c) => c.id === courseId);
  if (!course) return 0;

  return getCourseCompletionStats(user, course).percentage;
};

/**
 * Get skills with status based on user's progress
 * Maps courses to skills and determines status
 */
export const getUserSkills = (user, courses) => {
  // Skill mapping for each course
  const skillsMap = {
    'web-dev-101': [
      { name: 'HTML5', lessonThreshold: 1 },
      { name: 'CSS3', lessonThreshold: 2 },
      { name: 'JavaScript', lessonThreshold: 3 },
      { name: 'Responsive Design', lessonThreshold: 4 },
    ],
    'python-basics': [
      { name: 'Python Syntax', lessonThreshold: 1 },
      { name: 'Control Flow', lessonThreshold: 2 },
      { name: 'Data Structures', lessonThreshold: 3 },
    ],
    'react-advanced': [
      { name: 'Custom Hooks', lessonThreshold: 1 },
      { name: 'Performance Optimization', lessonThreshold: 2 },
    ],
  };

  const skills = [];

  (user.enrolledCourses || []).forEach((courseId) => {
    const course = courses.find((c) => c.id === courseId);
    if (!course) return;

    const courseSkills = skillsMap[courseId] || [];
    const completedCount = getCourseCompletionStats(user, course).completed;

    courseSkills.forEach((skill) => {
      let status = 'not-started';
      
      if (completedCount >= skill.lessonThreshold) {
        status = 'completed';
      } else if (completedCount > 0) {
        status = 'in-progress';
      }

      skills.push({
        name: skill.name,
        status,
        course: course.title,
      });
    });
  });

  return skills;
};

/**
 * Get weekly stats for the dashboard
 */
export const getWeeklyStats = (user) => {
  // The lessons the learner has completed, counted from their own record.
  const completedLessons = (user.completedLessons || []).length;

  return {
    lessonsCompleted: completedLessons,
    coursesActive: (user.enrolledCourses || []).length,
  };
};

/**
 * Mark a lesson as complete
 */
export const completeLesson = (user, lessonId, courseId = 'web-dev-101') => {
  return markLessonCompleted(user, courseId, lessonId);
};
