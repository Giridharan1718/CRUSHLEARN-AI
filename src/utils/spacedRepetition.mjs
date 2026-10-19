// Spaced Repetition Scheduler
// Implements a spaced repetition algorithm for reviewing material
// at optimal intervals to maximize long-term retention.

/**
 * Calculate the next review interval using the SM-2 algorithm
 * (used in SuperMemo and other spaced repetition systems)
 *
 * @param {Object} item - The item to review
 * @param {number} item.easeFactor - Ease factor (typically 2.5)
 * @param {number} item.quality - Quality rating (0-5)
 * @param {number} item.interval - Current interval in days
 * @param {number} item.repetitions - Number of repetitions
 * @returns {Object} Updated item with new interval and ease factor
 */
export const calculateNextInterval = (item, quality) => {
  // Clamp quality to 0-5
  const q = Math.max(0, Math.min(5, quality));

  // If quality is < 3, reset interval
  if (q < 3) {
    return {
      ...item,
      interval: 1, // 1 day
      repetitions: 0,
      easeFactor: item.easeFactor || 2.5,
    };
  }

  // SM-2 algorithm
  let newInterval;
  if (item.repetitions === 0) {
    newInterval = 1; // 1 day
  } else if (item.repetitions === 1) {
    newInterval = 6; // 6 days
  } else {
    // Use ease factor for intervals >= 2
    const ease = item.easeFactor || 2.5;
    newInterval = Math.round(item.interval * ease);
  }

  // Update ease factor
  const newEaseFactor =
    item.easeFactor || 2.5 +
    (0.1 - (3 - q) * (0.08 + (3 - q) * 0.02));

  return {
    ...item,
    interval: newInterval,
    repetitions: item.repetitions + 1,
    easeFactor: Math.max(1.3, newEaseFactor), // Ease factor should not go below 1.3
  };
};

/**
 * Schedule review for a lesson
 *
 * @param {string} lessonId - The lesson ID
 * @param {number} currentDate - Current date (in days since some epoch)
 * @param {Object} existingReview - Existing review data (optional)
 * @returns {Object} Review schedule
 */
export const scheduleReview = (
  lessonId,
  currentDate,
  existingReview = null
) => {
  const today = currentDate || 0;

  if (existingReview) {
    const { interval, repetitions, easeFactor } = existingReview;
    const { interval: newInterval, repetitions: newRepetitions, easeFactor: newEaseFactor } =
      calculateNextInterval(
        {
          interval,
          repetitions,
          easeFactor,
        },
        3 // Default quality
      );

    const nextReviewDate = today + newInterval;

    return {
      ...existingReview,
      interval: newInterval,
      repetitions: newRepetitions,
      easeFactor: newEaseFactor,
      nextReviewDate,
      lastReviewDate: today,
    };
  }

  return {
    lessonId,
    interval: 1, // Review tomorrow
    repetitions: 0,
    easeFactor: 2.5,
    nextReviewDate: today + 1,
    lastReviewDate: null,
    quality: 3, // Default quality
  };
};

/**
 * Get items due for review
 *
 * @param {Array} reviews - Array of review objects
 * @param {number} currentDate - Current date (in days since epoch)
 * @returns {Array} Items that need review now
 */
export const getItemsDueForReview = (reviews, currentDate = 0) => {
  if (!reviews || reviews.length === 0) {
    return [];
  }

  return reviews.filter((review) => {
    // Due if interval <= 2 days past last review (or no last review)
    if (!review.lastReviewDate) {
      return true; // Always review new items
    }

    const daysSinceReview = currentDate - review.lastReviewDate;
    return daysSinceReview >= review.interval;
  });
};

/**
 * Get items due for review grouped by priority
 *
 * @param {Array} reviews - Array of review objects
 * @param {number} currentDate - Current date (in days since epoch)
 * @returns {Object} Reviews grouped by priority (critical, urgent, normal, later)
 */
export const getPriorityReviewItems = (reviews, currentDate = 0) => {
  const dueItems = getItemsDueForReview(reviews, currentDate);

  const grouped = {
    critical: [], // Past due by 3+ days
    urgent: [], // Due today
    normal: [], // Due in 1-2 days
    later: [], // Not due yet
  };

  dueItems.forEach((review) => {
    const daysSinceReview = currentDate - review.lastReviewDate;
    const daysOverdue = daysSinceReview - review.interval;

    if (daysOverdue >= 3) {
      grouped.critical.push(review);
    } else if (daysSinceReview >= review.interval) {
      grouped.urgent.push(review);
    } else {
      grouped.normal.push(review);
    }
  });

  return {
    critical: grouped.critical.map((r) => ({ ...r, priority: 'critical' })),
    urgent: grouped.urgent.map((r) => ({ ...r, priority: 'urgent' })),
    normal: grouped.normal.map((r) => ({ ...r, priority: 'normal' })),
    later: [],
  };
};

/**
 * Calculate review schedule for a lesson based on user performance
 *
 * @param {Array} quizAttempts - Array of quiz attempt objects
 * @param {string} lessonId - Lesson ID
 * @returns {Object} Review schedule
 */
export const getLessonReviewSchedule = (quizAttempts, lessonId) => {
  const attempts = quizAttempts.filter((a) => a.lessonId === lessonId);

  if (attempts.length === 0) {
    return scheduleReview(lessonId);
  }

  // Calculate average quality based on scores
  const avgScore = attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length;
  const quality = Math.round(Math.max(0, Math.min(5, avgScore / 20)));

  const lastAttempt = attempts.reduce((latest, attempt) => {
    return new Date(attempt.timestamp) > new Date(latest.timestamp) ? attempt : latest;
  });

  const startDate = new Date(lastAttempt.timestamp);

  return scheduleReview(lessonId, 0, {
    interval: 1,
    repetitions: attempts.length - 1,
    easeFactor: 2.5,
    lastReviewDate: 0,
  });
};

/**
 * Get review recommendations based on current schedule
 *
 * @param {Array} reviewSchedule - Array of review schedule objects
 * @param {number} currentDate - Current date (in days since epoch)
 * @returns {Array} Array of review recommendation objects
 */
export const getReviewRecommendations = (reviewSchedule, currentDate = 0) => {
  const recommendations = [];

  reviewSchedule.forEach((item) => {
    if (!item.nextReviewDate && item.lastReviewDate === null) {
      // New item - recommend immediate review
      recommendations.push({
        ...item,
        priority: 'urgent',
        daysUntilReview: 1,
        action: 'Review immediately',
        message: 'New item - review tomorrow',
      });
    } else if (currentDate >= (item.nextReviewDate || 0)) {
      const daysOverdue = currentDate - item.nextReviewDate;
      recommendations.push({
        ...item,
        priority: 'critical',
        daysUntilReview: 0,
        action: 'Review immediately',
        message: `Overdue by ${daysOverdue} days`,
      });
    } else {
      const daysUntil = item.nextReviewDate - currentDate;
      recommendations.push({
        ...item,
        priority: daysUntil <= 1 ? 'urgent' : 'normal',
        daysUntilReview: daysUntil,
        action: daysUntil === 1 ? 'Review tomorrow' : 'Review soon',
        message: `Review in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`,
      });
    }
  });

  return recommendations.sort((a, b) => {
    if (a.priority === b.priority) return 0;
    return a.priority === 'critical' ? -1 : 1;
  });
};

/**
 * Get confidence-based review difficulty
 *
 * @param {number} confidence - Confidence rating (1-5)
 * @returns {Object} Difficulty adjustment
 */
export const getReviewDifficulty = (confidence) => {
  const clamped = Math.max(1, Math.min(5, confidence));

  const today = Math.floor(Date.now() / (1000 * 60 * 60 * 24));

  return {
    interval: 1, // Default 1 day
    nextReview: today + 1,
    difficulty: 'easy' + Math.floor((clamped - 1) / 4 * 4),
    message: confidence === 5
      ? 'Excellent! Consider increasing review interval.'
      : confidence === 4
      ? 'Good. Review in 2 days.'
      : confidence === 3
      ? 'Fair. Review in 1 day.'
      : confidence <= 2
      ? 'Poor. Review tomorrow and practice more.'
      : 'Review tomorrow.',
  };
};

/**
 * Analyze review performance over time
 *
 * @param {Array} reviews - Array of review objects
 * @returns {Object} Performance summary
 */
export const analyzeReviewPerformance = (reviews) => {
  const totalReviews = reviews.length;

  if (totalReviews === 0) {
    return {
      totalReviewSessions: 0,
      averageInterval: null,
      retentionRate: null,
      getReviewRecommendations: null,
    };
  }

  const intervals = reviews
    .map((r) => {
      if (r.lastReviewDate !== null && r.interval > 0) {
        return r.interval;
      }
      return null;
    })
    .filter((i) => i !== null);

  const avgInterval = intervals.length > 0
    ? intervals.reduce((sum, i) => sum + i, 0) / intervals.length
    : null;

  // Calculate retention rate (simplified)
  const retentionRate = 0.75; // Default 75% retention

  return {
    totalReviewSessions: totalReviews,
    averageInterval: Math.round(avgInterval * 10) / 10,
    retentionRate: Math.round(retentionRate * 100),
    getReviewRecommendations: getReviewRecommendations(reviews),
  };
};
