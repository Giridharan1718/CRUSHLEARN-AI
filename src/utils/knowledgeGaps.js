// Knowledge Gaps Utility
// Analyzes quiz results and lesson completion data to identify knowledge gaps
// for personalized learning recommendations.

/**
 * Analyze quiz results to identify knowledge gaps
 *
 * A knowledge gap is a topic where the user scored below the mastery threshold
 * (80%) on one or more questions. This helps identify specific areas where
 * the user needs more practice before moving forward.
 *
 * @param {Array} quizResults - Array of quiz result objects
 * @param {Object} courseSkills - Map of course IDs to skill definitions
 * @returns {Array} Array of gap objects with course, lesson, skill, and details
 *
 * @example
 * const gaps = analyzeKnowledgeGaps(quizResults, courseSkills);
 * // Returns: [{ courseId: 'web-dev-101', lessonId: 'lesson-1', skill: 'HTML', questions: [...] }]
 */
export const analyzeKnowledgeGaps = (quizResults, courseSkills = {}) => {
  const gaps = [];

  if (!quizResults || quizResults.length === 0) {
    return gaps;
  }

  // Group results by course and lesson
  const resultsByCourse = {};

  quizResults.forEach((result) => {
    const { courseId, lessonId, score, questions } = result;

    if (!resultsByCourse[courseId]) {
      resultsByCourse[courseId] = {};
    }

    if (!resultsByCourse[courseId][lessonId]) {
      resultsByCourse[courseId][lessonId] = [];
    }

    resultsByCourse[courseId][lessonId].push({
      ...questions,
      score,
      correctCount: questions.correctCount || 0,
      totalQuestions: questions.totalQuestions || questions.length,
    });
  });

  // Identify gaps per course
  Object.entries(resultsByCourse).forEach(([courseId, lessons]) => {
    const course = courseSkills[courseId] || {};
    const courseSkillsMap = course.skills || [];

    Object.entries(lessons).forEach(([lessonId, lessonResults]) => {
      // Calculate average score for the lesson
      const avgScore =
        lessonResults.reduce((sum, lr) => sum + lr.score, 0) /
        lessonResults.length;

      // Check if the lesson score is below mastery threshold
      if (avgScore < 80) {
        // Determine which skills are affected
        const affectedSkills = courseSkillsMap.filter((skill) => {
          // Check if any questions in this lesson relate to this skill
          const relatedQuestions = lessonResults.filter((lr) => {
            const questions = lr.questions || [];
            return questions.some(
              (q) => q.skill === skill.name || q.category === skill.name
            );
          });
          return relatedQuestions.length > 0;
        });

        gaps.push({
          courseId,
          lessonId,
          avgScore: Math.round(avgScore * 10) / 10,
          affectedSkills: affectedSkills.map((s) => s.name),
          totalQuestions: lessonResults.length,
          incorrectQuestions: lessonResults.filter(
            (lr) => lr.score < 100
          ).length,
          suggestion: `Review ${affectedSkills
            .map((s) => s.name)
            .join(', ')} concepts before retrying this lesson.`,
        });
      }
    });
  });

  return gaps;
};

/**
 * Get personalized recommendations for filling knowledge gaps
 *
 * Returns specific practice recommendations based on identified gaps,
 * including suggested lessons, review resources, and practice exercises.
 *
 * @param {Array} gaps - Array of knowledge gaps (from analyzeKnowledgeGaps)
 * @param {Array} courses - Array of course objects (mockCourseData.courses)
 * @returns {Array} Array of recommendation objects
 *
 * @example
 * const recommendations = getGapRecommendations(gaps, courses);
 */
export const getGapRecommendations = (gaps, courses = []) => {
  const recommendations = [];

  if (!gaps || gaps.length === 0) {
    return [
      {
        type: 'ready',
        message: 'No knowledge gaps detected! You are ready to proceed to your next lesson.',
        priority: 'high',
      },
    ];
  }

  // Deduplicate gaps by course
  const uniqueGaps = [];
  const seenCourses = new Set();

  gaps.forEach((gap) => {
    if (!seenCourses.has(gap.courseId)) {
      seenCourses.add(gap.courseId);
      uniqueGaps.push(gap);
    }
  });

  // Find recommended lesson to address the gap
  uniqueGaps.forEach((gap) => {
    const course = courses.find((c) => c.id === gap.courseId);
    if (!course) return;

    // Find the lesson that contains the gap
    const lesson = course.lessons.find((l) => l.id === gap.lessonId);
    if (!lesson) return;

    // Find prerequisite lessons for this lesson
    const prerequisiteLessons = lesson?.prerequisiteLessonIds || [];
    const prerequisiteCompleted = prerequisiteLessons.every((id) =>
      (gap.userCompletedLessons || []).includes(id)
    );

    const recommendation = {
      courseId: gap.courseId,
      lessonId: gap.lessonId,
      skill: gap.affectedSkills[0] || 'general',
      priority: 'high',
      type: 'review',
      message: `You need to strengthen your ${gap.skill} skills. Your quiz score was ${
        gap.avgScore
      }% on ${lesson?.title || 'this lesson'}.`,
      suggestedAction: prerequisiteCompleted
        ? 'Re-watch lesson or complete practice exercises before retrying.'
        : 'Complete prerequisite lessons first, then retry this lesson.',
      estimatedTime: '15-20 minutes',
      resources: [
        `Review ${lesson?.title || 'this lesson'} content`,
        'Complete the quiz exercises',
        'Practice with additional examples',
      ],
    };

    recommendations.push(recommendation);
  });

  // Sort by priority (highest first)
  return recommendations.sort((a, b) => {
    if (a.priority === b.priority) return 0;
    return a.priority === 'high' ? -1 : 1;
  });
};

/**
 * Check if a course has knowledge gaps
 *
 * @param {Array} gaps - Array of knowledge gaps
 * @param {string} courseId - Course ID to check
 * @returns {boolean} True if the course has gaps
 */
export const hasCourseGaps = (gaps, courseId) => {
  return gaps.some((gap) => gap.courseId === courseId);
};

/**
 * Get all unique skills with gaps
 *
 * @param {Array} gaps - Array of knowledge gaps
 * @returns {Array} Array of unique skill names with gaps
 */
export const getGappedSkills = (gaps) => {
  const skills = new Set();

  gaps.forEach((gap) => {
    gap.affectedSkills.forEach((skill) => {
      skills.add(skill);
    });
  });

  return Array.from(skills);
};

/**
 * Get comprehensive gap analysis summary
 *
 * Returns a summary of all knowledge gaps including counts, affected courses,
 * and recommended actions. Useful for dashboard display.
 *
 * @param {Array} gaps - Array of knowledge gaps
 * @param {number} totalLessons - Total number of lessons analyzed
 * @returns {Object} Summary object with gap statistics
 */
export const getGapAnalysisSummary = (gaps, totalLessons) => {
  const uniqueCourses = new Set(gaps.map((g) => g.courseId));
  const uniqueSkills = new Set();
  const totalIncorrect = gaps.reduce((sum, g) => sum + g.incorrectQuestions, 0);

  gaps.forEach((gap) => {
    gap.affectedSkills.forEach((skill) => uniqueSkills.add(skill));
  });

  return {
    totalGaps: gaps.length,
    coursesWithGaps: uniqueCourses.size,
    totalSkillsAffected: uniqueSkills.size,
    totalIncorrectQuestions: totalIncorrect,
    lessonCompletionRate: totalLessons > 0 ? Math.round((1 - gaps.length / totalLessons) * 100) : 100,
    hasGaps: gaps.length > 0,
    gapDetails: gaps.map((g) => ({
      courseId: g.courseId,
      lessonId: g.lessonId,
      score: g.avgScore,
      skills: g.affectedSkills,
      suggestion: g.suggestion,
    })),
  };
};

/**
 * Determine if a student is ready to proceed to the next lesson
 *
 * A student is ready if they meet one of the following criteria:
 * 1. Pass the quiz (score >= 80)
 * 2. Skip the simulation (explicit user choice)
 * 3. Complete prerequisite lessons
 *
 * @param {Object} lessonData - Lesson data including quiz and prerequisites
 * @param {Object} userProgress - User progress data
 * @param {number|null} quizScore - Score from the quiz (null if not taken)
 * @param {boolean} skipSimulation - User chose to skip simulation
 * @returns {Object} Object with ready flag and optional reason
 *
 * @example
 * const isReady = checkLessonReadiness(lesson, userProgress, quizScore, skipSimulation);
 */
export const checkLessonReadiness = (lessonData, userProgress, quizScore = null, skipSimulation = false) => {
  const { lesson } = lessonData;

  // Check if lesson has a quiz and if user passed it
  const hasQuiz = lesson?.quiz && lesson.quiz.length > 0;
  const quizPassed = hasQuiz && quizScore !== null && quizScore >= 80;

  // Check if prerequisites are met (only relevant if quiz exists)
  const prerequisitesMet = !hasQuiz || skipSimulation || quizPassed;

  // Check prerequisites
  let prerequisitesOk = true;
  if (lesson?.prerequisiteLessonIds) {
    prerequisitesOk = lesson.prerequisiteLessonIds.every((id) =>
      (userProgress.completedLessons || []).includes(id)
    );
  }

  const isReady = prerequisitesMet && prerequisitesOk;

  return {
    ready: isReady,
    prerequisitesOk,
    quizPassed,
    skipSimulation,
    reason: isReady
      ? 'All requirements met. Ready to proceed.'
      : quizPassed || skipSimulation
      ? 'Prerequisites not completed yet.'
      : 'Complete prerequisite lessons first.',
  };
};

/**
 * Format a gap analysis for display (e.g., in the UI)
 *
 * @param {Array} gaps - Array of knowledge gaps
 * @returns {Array} Formatted array of display objects
 */
export const formatGapsForDisplay = (gaps) => {
  if (!gaps || gaps.length === 0) {
    return [
      {
        type: 'success',
        message: '✅ No knowledge gaps detected! You are ready to proceed.',
        icon: '🎉',
      },
    ];
  }

  return gaps.map((gap, index) => ({
    id: `gap-${index}`,
    icon: '🎯',
    title: `Knowledge Gap in ${gap.courseId}: ${gap.lessonId}`,
    description: `Quiz score: ${gap.avgScore}% (${gap.totalQuestions} questions examined)`,
    details: gap.affectedSkills.map((skill) => `• ${skill}`).join('\n'),
    suggestion: gap.suggestion,
    priority: gap.avgScore < 60 ? 'critical' : 'warning',
    remediation: gap.suggestion,
  }));
};
