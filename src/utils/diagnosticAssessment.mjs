// Diagnostic Assessment Utility
// Creates and manages short diagnostic assessments before lessons.
// Assesses relevant prerequisite knowledge, records answers, and
// distinguishes unknown or unassessed skills from demonstrated weaknesses.

import {
  getLearningObjectives,
  checkObjectivePrerequisites,
} from './learningObjectives.mjs';

// Default diagnostic configuration
const DIAGNOSTIC_CONFIG = {
  // Minimum questions per diagnostic
  minQuestions: 3,
  // Skip diagnostic if lesson has no prerequisites
  skipIfNoPrerequisites: true,
  // Allow skipping the diagnostic
  allowSkip: true,
  // Hint: minimum correct answers to consider diagnostic passed
  passingThreshold: 2, // out of 3
};

// Track diagnostic answers in localStorage
const DIAGNOSTIC_KEY_PREFIX = 'diagnostic_answers_';

/**
 * Create a diagnostic assessment for a lesson.
 *
 * A diagnostic assesses prerequisite knowledge before a lesson.
 * It uses the prerequisite graph to determine which objectives
 * the learner should understand before attempting the lesson.
 *
 * @param {Object} lesson - Lesson object from mockCourseData
 * @param {string} courseId - Course ID
 * @param {string} lessonId - Lesson ID
 * @returns {Object} Diagnostic assessment object
 */
export const createDiagnosticAssessment = (lesson, courseId, lessonId) => {
  // Skip diagnostic if configured to skip
  if (DIAGNOSTIC_CONFIG.skipIfNoPrerequisites && !lesson.prerequisiteLessonIds) {
    return null;
  }

  // Collect prerequisite skills from prerequisite lessons
  const prerequisiteSkills = [];
  const prerequisiteLessons = lesson.prerequisiteLessonIds || [];

  prerequisiteLessons.forEach((prereqId) => {
    // Find the prerequisite lesson in the course
    const prereqLesson = findLessonInCourse(courseId, prereqId);
    if (prereqLesson) {
      // Extract quiz questions from prerequisite lessons
      prereqLesson.quiz?.forEach((q) => {
        prerequisiteSkills.push({
          ...q,
          skill: q.skill || 'general',
          category: q.category || 'general',
          sourceLesson: prereqId,
        });
      });
    }
  });

  // If no prerequisite questions found, use lesson's own quiz
  const questions = prerequisiteSkills.length > 0 ? prerequisiteSkills : lesson.quiz || [];

  // Limit to minimum questions
  const diagnosticQuestions = questions.slice(0, DIAGNOSTIC_CONFIG.minQuestions);

  return {
    id: `diag_${courseId}_${lessonId}`,
    lessonId,
    courseId,
    title: `Diagnostic: ${lesson.title}`,
    questions: diagnosticQuestions,
    status: 'not-started', // not-started | in-progress | completed
    answers: [],
    skipped: false,
    completedAt: null,
  };
};

/**
 * Find a lesson in a course by ID.
 *
 * @param {string} courseId - Course ID
 * @param {string} lessonId - Lesson ID
 * @returns {Object|null} Lesson object
 */
const findLessonInCourse = (courseId, lessonId) => {
  // In a real app, this would query the course data
  // For now, return null (caller should provide lesson data)
  return null;
};

/**
 * Submit a diagnostic answer.
 *
 * @param {string} courseId - Course ID
 * @param {string} lessonId - Lesson ID
 * @param {number} questionIndex - Index of the question answered
 * @param {boolean} isCorrect - Whether the answer was correct
 * @param {string} [answer] - The answer value (optional)
 * @returns {Object} Updated diagnostic state
 */
export const submitDiagnosticAnswer = (
  courseId,
  lessonId,
  questionIndex,
  isCorrect,
  answer = null
) => {
  const key = `${DIAGNOSTIC_KEY_PREFIX}${courseId}_${lessonId}`;
  let answers = JSON.parse(localStorage.getItem(key) || '[]');

  // Add or update the answer
  const existingIndex = answers.findIndex(
    (a) => a.questionIndex === questionIndex
  );

  if (existingIndex >= 0) {
    answers[existingIndex] = {
      questionIndex,
      isCorrect,
      answer,
      timestamp: new Date().toISOString(),
    };
  } else {
    answers.push({
      questionIndex,
      isCorrect,
      answer,
      timestamp: new Date().toISOString(),
    });
  }

  localStorage.setItem(key, JSON.stringify(answers));

  return {
    courseId,
    lessonId,
    status: 'in-progress',
    answers,
    completedAt: null,
  };
};

/**
 * Mark the diagnostic as complete.
 *
 * @param {string} courseId - Course ID
 * @param {string} lessonId - Lesson ID
 * @returns {Object} Updated diagnostic state
 */
export const completeDiagnostic = (courseId, lessonId) => {
  const key = `${DIAGNOSTIC_KEY_PREFIX}${courseId}_${lessonId}`;
  const answers = JSON.parse(localStorage.getItem(key) || '[]');

  const completed = {
    courseId,
    lessonId,
    status: 'completed',
    answers,
    completedAt: new Date().toISOString(),
  };

  localStorage.setItem(key, JSON.stringify(completed));

  return completed;
};

/**
 * Calculate the diagnostic score.
 *
 * @param {string} courseId - Course ID
 * @param {string} lessonId - Lesson ID
 * @returns {Object} Score and analysis
 */
export const getDiagnosticScore = (courseId, lessonId) => {
  const key = `${DIAGNOSTIC_KEY_PREFIX}${courseId}_${lessonId}`;
  const answers = JSON.parse(localStorage.getItem(key) || '[]');

  if (answers.length === 0) {
    return {
      score: 0,
      totalQuestions: 0,
      correctCount: 0,
      unanswered: 0,
      percentage: null,
      isPassing: false,
    };
  }

  const correctCount = answers.filter((a) => a.isCorrect).length;
  const total = answers.length;
  const correctAnswered = answers.filter((a) => a.isCorrect === true).length;
  const unanswered = total - correctAnswered;

  const percentage = total > 0 ? (correctAnswered / total) * 100 : 0;

  return {
    score: correctAnswered,
    totalQuestions: total,
    correctCount,
    unanswered,
    percentage: Math.round(percentage * 10) / 10,
    isPassing: percentage >= DIAGNOSTIC_CONFIG.passingThreshold * 100,
    strength: calculateDiagnosticStrength(answers),
  };
};

/**
 * Calculate the diagnostic strength (how confident we are in the result).
 *
 * @param {Array} answers - Array of answer objects
 * @returns {string} Strength level: 'low', 'medium', 'high'
 */
export const calculateDiagnosticStrength = (answers) => {
  const answered = answers.filter((a) => a.isCorrect !== null).length;

  if (answered < 2) {
    return 'low';
  }

  const correct = answers.filter((a) => a.isCorrect).length;
  if (correct === answered && answered >= 3) {
    return 'high';
  }

  if (correct >= Math.ceil(answered * 0.66)) {
    return 'medium';
  }

  return 'low';
};

/**
 * Classify the learner's evidence for a skill based on diagnostic results.
 *
 * States:
 * - NOT_ASSESSED: No diagnostic has been taken
 * - NEEDS_PRACTICE: Score below threshold, but not enough attempts
 * - DEVELOPING: Some correct answers but not yet demonstrated
 * - DEMONSTRATED: Score meets or exceeds threshold
 * - REVIEW_RECOMMENDED: Repeated failures across attempts
 *
 * @param {string} courseId - Course ID
 * @param {string} lessonId - Lesson ID
 * @param {Object} skill - Skill definition
 * @returns {Object} Classification result
 */
export const classifySkillEvidence = (courseId, lessonId, skill) => {
  const diagnostic = getDiagnosticScore(courseId, lessonId);

  // NOT_ASSESSED: no diagnostic taken
  if (diagnostic.totalQuestions === 0) {
    return {
      state: 'NOT_ASSESSED',
      confidence: 0,
      evidence: 'No diagnostic taken yet',
      recommendation: 'Complete the diagnostic assessment.',
    };
  }

  // Determine state based on score and strength
  const { percentage, strength, unanswered } = diagnostic;

  if (percentage >= DIAGNOSTIC_CONFIG.passingThreshold * 100 && strength === 'high') {
    return {
      state: 'DEMONSTRATED',
      confidence: 0.9,
      evidence: `Score ${percentage}% (high confidence)`,
      recommendation: 'Ready to proceed to the lesson.',
    };
  }

  if (percentage >= DIAGNOSTIC_CONFIG.passingThreshold * 100) {
    return {
      state: 'DEVELOPING',
      confidence: 0.6,
      evidence: `Score ${percentage}% (unanswered ${unanswered} questions)`,
      recommendation: 'Review prerequisite material before proceeding.',
    };
  }

  // Below threshold
  if (percentage < DIAGNOSTIC_CONFIG.passingThreshold * 100 && strength === 'low') {
    return {
      state: 'NEEDS_PRACTICE',
      confidence: 0.5,
      evidence: `Score ${percentage}% (low diagnostic strength)`,
      recommendation: 'Take the diagnostic again after reviewing.',
    };
  }

  // Repeated failures - signal for review
  return {
    state: 'REVIEW_RECOMMENDED',
    confidence: 0.7,
    evidence: `Score ${percentage}% (low confidence)`,
    recommendation: 'Review prerequisite lessons and retry the diagnostic.',
  };
};

/**
 * Check if a diagnostic is complete for a lesson.
 *
 * @param {string} courseId - Course ID
 * @param {string} lessonId - Lesson ID
 * @returns {boolean} True if diagnostic is complete
 */
export const isDiagnosticComplete = (courseId, lessonId) => {
  const key = `${DIAGNOSTIC_KEY_PREFIX}${courseId}_${lessonId}`;
  const data = JSON.parse(localStorage.getItem(key) || '[]');

  return data.length > 0;
};

/**
 * Get the diagnostic status for a lesson.
 *
 * @param {string} courseId - Course ID
 * @param {string} lessonId - Lesson ID
 * @returns {Object} Diagnostic status
 */
export const getDiagnosticStatus = (courseId, lessonId) => {
  const key = `${DIAGNOSTIC_KEY_PREFIX}${courseId}_${lessonId}`;
  const data = JSON.parse(localStorage.getItem(key) || '[]');

  if (data.length === 0) {
    return {
      status: 'not-started',
      answers: 0,
      correct: 0,
      incorrect: 0,
    };
  }

  const correct = data.filter((a) => a.isCorrect).length;
  const incorrect = data.filter((a) => a.isCorrect === false).length;

  return {
    status: data[0]?.status || 'in-progress',
    answers: data.length,
    correct,
    incorrect,
  };
};

/**
 * Get all diagnostic results for a course.
 *
 * @param {string} courseId - Course ID
 * @returns {Array} Array of diagnostic result objects
 */
export const getAllDiagnosticsForCourse = (courseId) => {
  const diagnostics = [];
  const keys = Object.keys(localStorage)
    .filter((k) => k.startsWith(DIAGNOSTIC_KEY_PREFIX))
    .filter((k) => k.includes(`${courseId}_`));

  keys.forEach((key) => {
    const data = JSON.parse(localStorage.getItem(key));
    data.forEach((item) => {
      if (item.courseId === courseId) {
        diagnostics.push({
          ...item,
          score: getDiagnosticScore(item.courseId, item.lessonId),
        });
      }
    });
  });

  return diagnostics;
};
