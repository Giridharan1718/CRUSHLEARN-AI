// Quiz Engagement Analytics
// Tracks and analyzes quiz completion patterns to measure learning effectiveness.

/**
 * Track a quiz attempt for later analysis
 *
 * @param {Object} attempt - Quiz attempt data
 * @param {string} attempt.courseId - Course ID
 * @param {string} attempt.lessonId - Lesson ID
 * @param {number} attempt.score - Quiz score (0-100)
 * @param {number} attempt.timeSpentMs - Time spent on quiz (milliseconds)
 * @param {number} attempt.questionCount - Total questions
 * @param {number} attempt.correctCount - Correctly answered questions
 * @param {Array} attempt.questionTimesMs - Time spent per question (ms)
 * @param {Object} [attempt.userData] - User information (optional)
 * @returns {Object} Storage key and attempt data
 */
export const trackQuizAttempt = (
  courseId,
  lessonId,
  score,
  timeSpentMs,
  questionCount,
  correctCount,
  questionTimesMs,
  userData = {}
) => {
  const key = `quiz_attempt_${courseId}_${lessonId}`;

  const attempt = {
    id: Date.now().toString(),
    courseId,
    lessonId,
    score,
    timeSpentMs,
    questionCount,
    correctCount,
    incorrectCount: questionCount - correctCount,
    questionTimesMs,
    timestamp: new Date().toISOString(),
    userData,
  };

  // Store in localStorage
  const stored = JSON.parse(localStorage.getItem(key) || '[]');
  stored.push(attempt);
  localStorage.setItem(key, JSON.stringify(stored));

  return attempt;
};

/**
 * Get all quiz attempts for a specific course
 *
 * @param {string} courseId - Course ID
 * @returns {Array} Array of quiz attempt objects
 */
export const getQuizAttemptsByCourse = (courseId) => {
  const attempts = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('quiz_attempt_')) {
      const stored = JSON.parse(localStorage.getItem(key));
      stored.forEach((attempt) => {
        if (attempt.courseId === courseId) {
          attempts.push(attempt);
        }
      });
    }
  }

  return attempts;
};

/**
 * Get quiz attempts for a specific lesson
 *
 * @param {string} courseId - Course ID
 * @param {string} lessonId - Lesson ID
 * @returns {Array} Array of quiz attempt objects
 */
export const getQuizAttemptsForLesson = (courseId, lessonId) => {
  const attempts = getQuizAttemptsByCourse(courseId);
  return attempts.filter((a) => a.lessonId === lessonId);
};

/**
 * Calculate quiz attempt statistics for a lesson
 *
 * @param {Array} attempts - Array of quiz attempt objects
 * @returns {Object} Statistics object
 */
export const calculateQuizStats = (attempts) => {
  if (!attempts || attempts.length === 0) {
    return {
      totalAttempts: 0,
      averageScore: null,
      medianScore: null,
      minScore: null,
      maxScore: null,
      averageTime: null,
      averageQuestionsPerMinute: null,
      successRate: null,
    };
  }

  const scores = attempts.map((a) => a.score);
  const times = attempts.map((a) => a.timeSpentMs);
  const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;

  // Sort for median
  const sortedScores = [...scores].sort((a, b) => a - b);
  const medianScore =
    sortedScores.length % 2 === 0
      ? (sortedScores[sortedScores.length / 2 - 1] +
          sortedScores[sortedScores.length / 2]) /
          2
      : sortedScores[Math.floor(sortedScores.length / 2)];

  const totalTime = times.reduce((sum, t) => sum + t, 0);
  const avgTime = totalTime / times.length;
  const avgQuestionsPerMinute = avgTime > 0 ? (attempts[0].questionCount * 60000) / avgTime : null;

  const successRate = scores.filter((s) => s >= 80).length / scores.length;

  return {
    totalAttempts: attempts.length,
    averageScore: Math.round(avgScore * 10) / 10,
    medianScore: Math.round(medianScore * 10) / 10,
    minScore: Math.min(...scores),
    maxScore: Math.max(...scores),
    averageTime: Math.round(avgTime),
    averageQuestionsPerMinute: Math.round((avgQuestionsPerMinute || 0) * 10) / 10,
    successRate: Math.round(successRate * 100),
  };
};

/**
 * Analyze a user's quiz performance across all courses
 *
 * @param {Object} user - User object
 * @returns {Array} Array of course statistics objects
 */
export const getUserQuizPerformance = (user) => {
  const performance = [];

  // This would typically query localStorage for all quiz attempts
  // For now, we analyze from the user's completed lessons
  const completedLessons = user.completedLessons || [];

  // Group by course
  const courseProgress = {};

  completedLessons.forEach((lessonId) => {
    const parts = lessonId.split('_');
    const courseId = parts[0];
    if (courseId) {
      if (!courseProgress[courseId]) {
        courseProgress[courseId] = { lessonIds: [], quizScores: [] };
      }
      courseProgress[courseId].lessonIds.push(lessonId);
      const attempt = getQuizAttemptsForLesson(courseId, lessonId);
      if (attempt.length > 0) {
        courseProgress[courseId].quizScores.push(attempt[attempt.length - 1].score);
      }
    }
  });

  // Calculate stats per course
  Object.entries(courseProgress).forEach(([courseId, data]) => {
    performance.push({
      courseId,
      totalLessons: data.lessonIds.length,
      quizAttempts: data.quizScores.length,
      averageScore: data.quizScores.length > 0
        ? Math.round((data.quizScores.reduce((a, b) => a + b, 0) / data.quizScores.length) * 10) / 10
        : null,
      lessonsWithQuizzes: data.lessonIds.filter((lid) =>
        getQuizAttemptsForLesson(courseId, lid).length > 0
      ).length,
    });
  });

  return performance.sort((a, b) => (a.averageScore || 0) - (b.averageScore || 0));
};

/**
 * Get learning effectiveness score for a course
 *
 * @param {string} courseId - Course ID
 * @param {string} threshold - Minimum score for effective learning (default: 80)
 * @returns {Object} Effectiveness analysis
 */
export const getLearningEffectiveness = (courseId, threshold = 80) => {
  const attempts = getQuizAttemptsByCourse(courseId);
  if (attempts.length === 0) {
    return {
      courseId,
      effective: null,
      attemptCount: 0,
      averageScore: null,
      percentageEffective: null,
      recommendation: 'No quiz attempts recorded yet.',
    };
  }

  const effective = attempts.filter((a) => a.score >= threshold);
  const averageScore = calculateQuizStats(attempts).averageScore;

  return {
    courseId,
    effective: effective.length > 0,
    attemptCount: attempts.length,
    averageScore,
    percentageEffective: Math.round((effective.length / attempts.length) * 100),
    recommendation:
      effective.length === attempts.length
        ? 'Excellent! All attempts met the mastery threshold.'
        : 'Consider reviewing lessons with lower scores.',
  };
};

/**
 * Track question-level engagement
 *
 * @param {string} courseId - Course ID
 * @param {string} lessonId - Lesson ID
 * @param {number} questionIndex - Question index (0-based)
 * @param {boolean} wasAnsweredCorrectly - Whether the question was answered correctly
 * @param {number} timeSpentMs - Time spent on this question
 * @returns {void}
 */
export const trackQuestionEngagement = (
  courseId,
  lessonId,
  questionIndex,
  wasAnsweredCorrectly,
  timeSpentMs
) => {
  const key = `question_engagement_${courseId}_${lessonId}`;

  const record = {
    questionIndex,
    wasAnsweredCorrectly,
    timeSpentMs,
    timestamp: new Date().toISOString(),
  };

  const stored = JSON.parse(localStorage.getItem(key) || '[]');
  stored.push(record);
  localStorage.setItem(key, JSON.stringify(stored));
};

/**
 * Get average time per question for a lesson
 *
 * @param {string} courseId - Course ID
 * @param {string} lessonId - Lesson ID
 * @returns {Object} Average time stats
 */
export const getQuestionEngagementStats = (courseId, lessonId) => {
  const key = `question_engagement_${courseId}_${lessonId}`;
  const records = JSON.parse(localStorage.getItem(key) || '[]');

  if (records.length === 0) {
    return { averageTime: null, totalQuestions: 0, engagementLevel: 'unknown' };
  }

  const totalTime = records.reduce((sum, r) => sum + r.timeSpentMs, 0);
  const averageTime = totalTime / records.length;
  const correctRate = records.filter((r) => r.wasAnsweredCorrectly).length / records.length;

  let engagementLevel = 'unknown';
  if (averageTime > 30000) {
    engagementLevel = 'high';
  } else if (averageTime > 10000) {
    engagementLevel = 'medium';
  } else {
    engagementLevel = 'low';
  }

  return {
    averageTime: Math.round(averageTime),
    totalQuestions: records.length,
    correctRate: Math.round(correctRate * 100),
    engagementLevel,
  };
};

/**
 * Compare quiz attempts to identify regression patterns
 *
 * @param {string} courseId - Course ID
 * @param {string} lessonId - Lesson ID
 * @returns {Array} Array of regression warnings
 */
export const detectQuizRegression = (courseId, lessonId) => {
  const attempts = getQuizAttemptsForLesson(courseId, lessonId);
  if (attempts.length < 2) {
    return [];
  }

  const sorted = [...attempts].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );

  const warnings = [];
  const recentScore = sorted[0].score;
  const previousScore = sorted[1].score;

  if (recentScore < previousScore * 0.8) {
    warnings.push({
      type: 'regression',
      message: `Score dropped from ${previousScore}% to ${recentScore}%`,
      severity: 'warning',
    });
  }

  // Check for repeated incorrect questions
  const incorrectQuestions =
    attempts.filter((a) => a.score < 100).length /
    attempts.length;
  if (incorrectQuestions > 0.5) {
    warnings.push({
      type: 'repeated_attempts',
      message: `Users are getting questions wrong ${Math.round(
        incorrectQuestions * 100
      )}% of the time`,
      severity: 'info',
    });
  }

  return warnings;
};
