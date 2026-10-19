// Recommendation Engine
// Recommends the next learning activity based on diagnostic results,
// prerequisite relationships, and learner progress.

import {
  getLearningPath,
  checkObjectivePrerequisites,
  getObjectiveById,
} from './learningObjectives.mjs';
import {
  getObjectiveProgress,
  getCourseProgress,
} from './prerequisiteProgress.mjs';
import {
  getDiagnosticScore,
  classifySkillEvidence,
  getDiagnosticStatus,
} from './diagnosticAssessment.mjs';
import {
  classifyEvidence,
  ASSESSMENT_STATES,
} from './evidenceClassification.mjs';
import {
  getLessonReviewSchedule,
} from './spacedRepetition.mjs';

/**
 * Recommendation types for next learning activity.
 */
export const RECOMMENDATION_TYPES = {
  CONTINUE_LESSON: 'continue-lesson',
  REVIEW_PREREQUISITE: 'prerequisite-review',
  READ_SIMPLE_EXPLANATION: 'read-simpler-explanation',
  COMPLETE_GUIDED_EXAMPLE: 'guided-example',
  TRY_TARGETED_EXERCISE: 'targeted-exercise',
  TAKE_DIAGNOSTIC: 'take-diagnostic',
};

/**
 * Get human-readable label for a recommendation type.
 *
 * @param {string} type - Recommendation type
 * @returns {string} Human-readable label
 */
export const getRecommendationLabel = (type) => {
  const labels = {
    [RECOMMENDATION_TYPES.CONTINUE_LESSON]: 'Continue to Lesson',
    [RECOMMENDATION_TYPES.REVIEW_PREREQUISITE]: 'Review Prerequisite',
    [RECOMMENDATION_TYPES.READ_SIMPLE_EXPLANATION]: 'Read Simpler Explanation',
    [RECOMMENDATION_TYPES.COMPLETE_GUIDED_EXAMPLE]: 'Complete Guided Example',
    [RECOMMENDATION_TYPES.TRY_TARGETED_EXERCISE]: 'Try Targeted Exercise',
    [RECOMMENDATION_TYPES.TAKE_DIAGNOSTIC]: 'Take Diagnostic',
  };
  return labels[type] || type;
};

/**
 * Recommend the next learning activity based on diagnostic results,
 * prerequisite relationships, and learner progress.
 *
 * @param {Object} context - Recommendation context
 * @param {string} context.courseId - Course ID
 * @param {string} context.lessonId - Current lesson ID
 * @param {string} [context.userId] - User ID (for localStorage lookups)
 * @param {Object} [context.user] - User object (optional)
 * @returns {Object} Recommendation object
 */
export const recommendNextActivity = (context) => {
  const {
    courseId,
    lessonId,
    userId = 'demo-user',
    user = null,
  } = context;

  const userProgress = user || getDefaultUserProgress(userId);
  const lesson = findLessonById(courseId, lessonId);

  if (!lesson) {
    return {
      type: RECOMMENDATION_TYPES.CONTINUE_LESSON,
      message: 'Lesson not found. Please select a valid lesson.',
      confidence: 0,
      reason: 'lesson-not-found',
    };
  }

  // Step 1: Check if diagnostic is needed
  const diagnostic = getDiagnosticScore(courseId, lessonId);

  // If no diagnostic taken, recommend diagnostic
  if (diagnostic.totalQuestions === 0) {
    return {
      type: RECOMMENDATION_TYPES.TAKE_DIAGNOSTIC,
      message: 'Take the diagnostic to identify prerequisite knowledge.',
      confidence: 0.8,
      reason: 'no-diagnostic',
      diagnostic,
    };
  }

  // Step 2: Classify evidence
  // Classify evidence using the diagnostic result
  const classification = classifyEvidence({
    score: diagnostic.score,
    totalQuestions: diagnostic.totalQuestions,
    correctAnswers: diagnostic.correctCount,
    strength: diagnostic.strength,
    attempts: 1, // Default
  });

  // Step 3: Check prerequisite objectives
  const { met: prerequisitesMet, missing: unmetPrerequisites } =
    checkObjectivePrerequisites(
      userProgress.completedObjectiveIds || [],
      lesson.prerequisiteObjectiveIds || []
    );

  // If prerequisites not met, recommend review
  if (!prerequisitesMet && lesson.prerequisiteObjectiveIds) {
    return {
      type: RECOMMENDATION_TYPES.REVIEW_PREREQUISITE,
      message: `Review prerequisite: ${unmetPrerequisites.map(
        (id) => getObjectiveById(id) || 'Missing'
      ).join(', ')}`,
      confidence: 0.7,
      reason: 'prerequisites-not-met',
      prerequisitesMet,
      unmetPrerequisites,
    };
  }

  // Step 4: Based on classification, recommend appropriate activity
  switch (classification.state) {
    case ASSESSMENT_STATES.DEMONSTRATED:
      // Skill demonstrated - continue lesson
      return {
        type: RECOMMENDATION_TYPES.CONTINUE_LESSON,
        message: 'Great! You have demonstrated the skill. Proceed to the next lesson.',
        confidence: 0.85,
        reason: 'skill-demonstrated',
        classification,
        prerequisitesMet: true,
      };

    case ASSESSMENT_STATES.DEVELOPING:
      // Skill developing - do guided example
      return {
        type: RECOMMENDATION_TYPES.COMPLETE_GUIDED_EXAMPLE,
        message: 'Review a guided example to build understanding.',
        confidence: 0.7,
        reason: 'skill-developing',
        classification,
        prerequisitesMet: true,
      };

    case ASSESSMENT_STATES.NEEDS_PRACTICE:
      // Needs practice - try targeted exercise
      return {
        type: RECOMMENDATION_TYPES.TRY_TARGETED_EXERCISE,
        message: 'Complete targeted exercises to strengthen weak areas.',
        confidence: 0.6,
        reason: 'needs-practice',
        classification,
        prerequisitesMet: true,
      };

    case ASSESSMENT_STATES.REVIEW_RECOMMENDED:
      // Review recommended - review prerequisites
      return {
        type: RECOMMENDATION_TYPES.REVIEW_PREREQUISITE,
        message: 'Review prerequisite lessons and retry the diagnostic.',
        confidence: 0.75,
        reason: 'review-recommended',
        classification,
        prerequisitesMet: false,
        unmetPrerequisites: lesson.prerequisiteLessonIds || [],
      };

    default:
      return {
        type: RECOMMENDATION_TYPES.CONTINUE_LESSON,
        message: 'Ready to proceed.',
        confidence: 0.5,
        reason: 'unknown-state',
        classification,
      };
  }
};

/**
 * Find a lesson in a course by ID.
 *
 * @param {string} courseId - Course ID
 * @param {string} lessonId - Lesson ID
 * @returns {Object|null} Lesson object
 */
const findLessonById = (courseId, lessonId) => {
  // In a real app, this would query the course data
  // For now, return null (caller should provide lesson data)
  return null;
};

/**
 * Get default user progress (for demo purposes).
 *
 * @param {string} userId - User ID
 * @returns {Object} User progress object
 */
const getDefaultUserProgress = (userId) => {
  return {
    completedObjectiveIds: [],
    enrolledCourses: ['web-dev-101'],
    completedLessons: ['lesson-1'],
  };
};

/**
 * Get a comprehensive recommendation with multiple next steps.
 *
 * @param {Object} context - Recommendation context
 * @returns {Array} Array of recommendation objects
 */
export const getComprehensiveRecommendations = (context) => {
  const recommendations = [];

  const primary = recommendNextActivity(context);
  recommendations.push(primary);

  // Also provide a secondary option if appropriate
  if (primary.type === RECOMMENDATION_TYPES.REVIEW_PREREQUISITE) {
    recommendations.push({
      type: RECOMMENDATION_TYPES.TRY_TARGETED_EXERCISE,
      message: 'Try a targeted exercise to strengthen weak areas while reviewing.',
      confidence: 0.5,
      reason: 'complementary-activity',
    });
  }

  return recommendations;
};
