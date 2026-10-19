// Error Analysis Utility
// Analyzes incorrect quiz answers to identify patterns and provide targeted feedback.

/**
 * Analyze incorrect answers for a specific lesson
 *
 * @param {Array} quizResults - Array of quiz result objects
 * @param {Array} questionPool - Array of question objects from the lesson
 * @returns {Object} Analysis object with error patterns
 *
 * @example
 * const analysis = analyzeQuizErrors(quizResults, lesson.quiz);
 * // Returns: { mostCommonErrors: [...], skillGaps: [...], recommendations: [...] }
 */
export const analyzeQuizErrors = (quizResults, questionPool = []) => {
  const analysis = {
    totalAttempts: quizResults.length,
    totalQuestions: 0,
    incorrectAnswers: 0,
    mostCommonErrors: [],
    skillGaps: [],
    questionPatterns: [],
    recommendations: [],
    avgTimePerQuestion: 0,
    sensitivity: 'neutral',
  };

  if (quizResults.length === 0) {
    return analysis;
  }

  // Flatten all questions with their correctness
  const allAttempts = quizResults.map((result) => ({
    ...result,
    lessonId: result.lessonId,
  }));

  // Analyze per question
  const questionAnalysis = {};

  questionPool.forEach((question) => {
    const questionId = question.id || question.question;
    const correctIndex = question.correctIndex;
    const skill = question.skill || 'general';
    const category = question.category || 'general';

    const attemptsForQuestion = allAttempts.filter(
      (r) => r.questionIndex === questionId
    );

    const incorrect = attemptsForQuestion.filter(
      (r) => r.selectedIndex !== correctIndex
    ).length;

    const total = attemptsForQuestion.length;

    questionAnalysis[questionId] = {
      questionId,
      skill,
      category,
      correctIndex,
      totalAttempts: total,
      incorrectCount: incorrect,
      incorrectRate: total > 0 ? incorrect / total : 0,
      isProblematic: incorrect > total * 0.5,
    };
  });

  // Aggregate by skill
  const skillStats = {};
  questionPool.forEach((q) => {
    const skill = q.skill || 'general';
    if (!skillStats[skill]) {
      skillStats[skill] = { name: skill, attempts: 0, incorrect: 0 };
    }
    const matches = allAttempts.filter(
      (a) => a.questionIndex === q.question
    );
    if (matches.length > 0) {
      skillStats[skill].attempts += matches.length;
      skillStats[skill].incorrect += matches.filter(
        (a) => a.selectedIndex !== q.correctIndex
      ).length;
    }
  });

  analysis.skillGaps = Object.values(skillStats)
    .map((s) => ({
      skill: s.name,
      incorrectRate: s.attempts > 0 ? (s.incorrect / s.attempts) * 100 : 0,
      attempts: s.attempts,
      isCritical: (s.incorrect / s.attempts) > 0.6,
    }))
    .filter((s) => s.incorrectRate > 30)
    .sort((a, b) => b.incorrectRate - a.incorrectRate);

  // Find most common errors
  const errorPatterns = {};
  allAttempts.forEach((attempt) => {
    if (attempt.selectedIndex !== attempt.correctIndex) {
      const wrongOption = attempt.selectedIndex;
      if (!errorPatterns[wrongOption]) {
        errorPatterns[wrongOption] = [];
      }
      errorPatterns[wrongOption].push(attempt.questionIndex);
    }
  });

  analysis.mostCommonErrors = Object.entries(errorPatterns)
    .map(([option, questions]) => ({
      wrongOption: parseInt(option),
      frequency: questions.length,
      questions: [...new Set(questions)],
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 5);

  // Calculate average time per question
  const totalTime = allAttempts.reduce((sum, a) => sum + (a.timeSpentMs || 0), 0);
  const questionCount = allAttempts.length;
  analysis.avgTimePerQuestion = questionCount > 0 ? totalTime / questionCount : 0;

  // Generate recommendations
  analysis.recommendations = buildRecommendations(analysis);

  return analysis;
};

/**
 * Build user-friendly recommendations from error analysis
 *
 * @param {Object} analysis - Error analysis object
 * @returns {string[]} Array of recommendation strings
 */
const buildRecommendations = (analysis) => {
  const recommendations = [];

  // Skill gaps recommendations
  analysis.skillGaps.forEach((gap) => {
    if (gap.isCritical) {
      recommendations.push(
        `Critical: Focus on ${gap.skill}. You got ${gap.incorrectRate}% of questions wrong.`
      );
    } else {
      recommendations.push(
        `Review ${gap.skill} concepts - ${gap.incorrectRate}% incorrect rate detected.`
      );
    }
  });

  // Common error recommendations
  analysis.mostCommonErrors.forEach((error) => {
    recommendations.push(
      `Check wrong option ${error.wrongOption}: ${error.frequency} users picked this. Review the concept.`
    );
  });

  // Time-based recommendations
  const avgTime = analysis.avgTimePerQuestion;
  if (analysis.avgTimePerQuestion > 0) {
    if (avgTime > 45000) {
      recommendations.push(
        'Taking too long on questions? Review the material first, then retry.'
      );
    } else if (avgTime < 10000) {
      recommendations.push(
        'Moving too quickly? Re-read the content and try again for better understanding.'
      );
    }
  }

  // Sensitivity check
  if (analysis.sensitivity === 'too_hard') {
    recommendations.push(
      'This lesson might be too challenging. Consider reviewing prerequisite material.'
    );
  } else if (analysis.sensitivity === 'too_easy') {
    recommendations.push(
      'This lesson might be too easy. You may be ready to move forward.'
    );
  }

  return recommendations.length > 0 ? recommendations : [
    'Review the lesson content and retake the quiz.',
    'Pay attention to the incorrect answers - they highlight areas to improve.',
  ];
};

/**
 * Determine if a lesson is too hard or too easy based on performance
 *
 * @param {Array} quizResults - Array of quiz attempt objects
 * @param {string} strategy - Analysis strategy ('strict', 'balanced', 'lenient')
 * @returns {Object} Sensitivity analysis
 */
export const analyzeLessonDifficulty = (quizResults, strategy = 'balanced') => {
  const stats = calculateQuizStats(quizResults);

  let sensitivity = 'neutral';
  let threshold = 0.6;

  switch (strategy) {
    case 'strict':
      threshold = 0.7;
      break;
    case 'lenient':
      threshold = 0.5;
      break;
    default:
      threshold = 0.6;
      break;
  }

  if (stats.averageScore < 60) {
    sensitivity = 'too_hard';
  } else if (stats.averageScore > 85) {
    sensitivity = 'too_easy';
  }

  return {
    sensitivity,
    score: stats.averageScore,
    attemptCount: stats.totalAttempts,
    threshold,
    isProblematic: sensitivity === 'too_hard',
  };
};

/**
 * Get context-aware feedback for incorrect answers
 *
 * @param {Object} result - Individual quiz result
 * @param {Object} question - Question object
 * @returns {string} User-friendly feedback message
 */
export const getFeedbackMessage = (result, question) => {
  const correctIndex = question?.correctIndex;
  const wrongOption = result?.selectedIndex;

  if (result?.score >= 100) {
    return 'Correct! Nice work.';
  }

  if (wrongOption === correctIndex) {
    return 'That is the correct answer!';
  }

  // Analyze common wrong options
  const wrongOptions = question?.options || [];
  const commonWrongOptions = [0, 1, 2, 3];

  if (commonWrongOptions.includes(wrongOption)) {
    return getOptionConfusionFeedback(wrongOption, question);
  }

  return 'Incorrect. Review the explanation and try again.';
};

/**
 * Generate feedback based on which option was selected
 *
 * @param {number} wrongOption - The incorrect option index
 * @param {Object} question - Question object
 * @returns {string} Feedback message
 */
const getOptionConfusionFeedback = (wrongOption, question) => {
  const options = question?.options || [];
  const correctIndex = question?.correctIndex;

  if (wrongOption === correctIndex) {
    return 'That is the correct answer!';
  }

  // Common confusion patterns
  if (wrongOption === 0 && correctIndex === 1) {
    return 'Common confusion between first and second option. Re-read the material.';
  }
  if (wrongOption === 1 && correctIndex === 0) {
    return 'Common confusion between first and second option. Re-read the material.';
  }
  if (wrongOption === 0 && correctIndex === 2) {
    return 'Third option might be the answer. Review the concept.';
  }
  if (wrongOption === 2 && correctIndex === 0) {
    return 'First option might be the answer. Review the concept.';
  }

  return 'Incorrect. Review the explanation and try again.';
};

/**
 * Calculate improvement between attempts
 *
 * @param {Array} attempts - Array of quiz attempt objects (sorted by date)
 * @returns {Object} Improvement analysis
 */
export const analyzeImprovement = (attempts) => {
  if (attempts.length < 2) {
    return {
      hasImproved: null,
      initialScore: null,
      latestScore: null,
      improvement: null,
      percentImprovement: null,
      recommendation: 'Not enough attempts to determine improvement.',
    };
  }

  const sorted = [...attempts].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );

  const latestScore = sorted[0].score;
  const initialScore = sorted[sorted.length - 1].score;
  const improvement = latestScore - initialScore;
  const percentImprovement = initialScore > 0 ? (improvement / initialScore) * 100 : 0;

  const hasImproved = improvement >= 10;

  return {
    hasImproved,
    initialScore,
    latestScore,
    improvement,
    percentImprovement: Math.round(percentImprovement * 10) / 10,
    recommendation:
      hasImproved
        ? 'Great improvement! Keep practicing to maintain your progress.'
        : 'Consider reviewing the lesson content before retaking.',
  };
};

/**
 * Get a comprehensive error summary for a user
 *
 * @param {Array} quizResults - Array of quiz result objects
 * @param {Array} questionPool - Array of question objects
 * @returns {Object} Comprehensive error summary
 */
export const getErrorSummary = (quizResults, questionPool) => {
  const analysis = analyzeQuizErrors(quizResults, questionPool);

  return {
    ...analysis,
    totalQuestions: questionPool.length,
    totalAttempts: quizResults.length,
    incorrectTotal: quizResults.reduce((sum, r) => sum + (r.correctCount || 0), 0),
    errorRate: quizResults.length > 0
      ? (quizResults.reduce((sum, r) => sum + (r.questionCount - r.correctCount || 0), 0) /
          quizResults.reduce((sum, r) => sum + r.questionCount, 0)) *
        100
      : 0,
  };
};
