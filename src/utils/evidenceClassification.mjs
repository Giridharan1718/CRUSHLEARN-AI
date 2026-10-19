// Evidence Classification
// Transparent rules for classifying learner evidence into states.
// States: NOT_ASSESSED, NEEDS_PRACTICE, DEVELOPING, DEMONSTRATED, REVIEW_RECOMMENDED

/**
 * Evidence classification states for learner skills.
 *
 * These states represent transparent initial rules, not an advanced AI model.
 * A single wrong answer normally triggers a hint or follow-up question, not a
 * definitive claim that the learner lacks the skill.
 */
export const ASSESSMENT_STATES = {
  NOT_ASSESSED: 'NOT_ASSESSED',
  NEEDS_PRACTICE: 'NEEDS_PRACTICE',
  DEVELOPING: 'DEVELOPING',
  DEMONSTRATED: 'DEMONSTRATED',
  REVIEW_RECOMMENDED: 'REVIEW_RECOMMENDED',
};

/**
 * Get the human-readable label for an assessment state.
 *
 * @param {string} state - Assessment state
 * @returns {string} Human-readable label
 */
export const getStateLabel = (state) => {
  const labels = {
    [ASSESSMENT_STATES.NOT_ASSESSED]: 'Not Assessed',
    [ASSESSMENT_STATES.NEEDS_PRACTICE]: 'Needs Practice',
    [ASSESSMENT_STATES.DEVELOPING]: 'Developing',
    [ASSESSMENT_STATES.DEMONSTRATED]: 'Demonstrated',
    [ASSESSMENT_STATES.REVIEW_RECOMMENDED]: 'Review Recommended',
  };
  return labels[state] || state;
};

/**
 * Get the color associated with an assessment state for UI display.
 *
 * @param {string} state - Assessment state
 * @returns {string} CSS color class
 */
export const getStateColor = (state) => {
  const colors = {
    [ASSESSMENT_STATES.NOT_ASSESSED]: 'bg-gray-100 text-gray-600',
    [ASSESSMENT_STATES.NEEDS_PRACTICE]: 'bg-amber-100 text-amber-700',
    [ASSESSMENT_STATES.DEVELOPING]: 'bg-blue-100 text-blue-700',
    [ASSESSMENT_STATES.DEMONSTRATED]: 'bg-green-100 text-green-700',
    [ASSESSMENT_STATES.REVIEW_RECOMMENDED]: 'bg-red-100 text-red-700',
  };
  return colors[state] || colors[ASSESSMENT_STATES.NOT_ASSESSED];
};

/**
 * Get the icon associated with an assessment state for UI display.
 *
 * @param {string} state - Assessment state
 * @returns {string} Icon
 */
export const getStateIcon = (state) => {
  const icons = {
    [ASSESSMENT_STATES.NOT_ASSESSED]: '⚪',
    [ASSESSMENT_STATES.NEEDS_PRACTICE]: '🔶',
    [ASSESSMENT_STATES.DEVELOPING]: '🔵',
    [ASSESSMENT_STATES.DEMONSTRATED]: '🟢',
    [ASSESSMENT_STATES.REVIEW_RECOMMENDED]: '🟠',
  };
  return icons[state] || '⚪';
};

/**
 * Define the evidence rules for moving between states.
 *
 * Each rule specifies:
 * - condition: what triggers the transition
 * - fromState: the source state
 * - toState: the target state
 * - confidence: how confident we are in this transition
 *
 * @returns {Array} Array of transition rules
 */
export const getTransitionRules = () => {
  return [
    {
      from: ASSESSMENT_STATES.NOT_ASSESSED,
      to: ASSESSMENT_STATES.NEEDS_PRACTICE,
      condition: 'diagnostic taken but score below threshold',
      confidence: 0.5,
      note: 'Single incorrect answer is not definitive.',
    },
    {
      from: ASSESSMENT_STATES.NOT_ASSESSED,
      to: ASSESSMENT_STATES.DEVELOPING,
      condition: 'diagnostic score meets threshold but not high confidence',
      confidence: 0.6,
      note: 'Partial demonstration of skill.',
    },
    {
      from: ASSESSMENT_STATES.NOT_ASSESSED,
      to: ASSESSMENT_STATES.DEMONSTRATED,
      condition: 'diagnostic score meets threshold with high confidence',
      confidence: 0.9,
      note: 'Consistent correct answers indicate skill mastery.',
    },
    {
      from: ASSESSMENT_STATES.NOT_ASSESSED,
      to: ASSESSMENT_STATES.REVIEW_RECOMMENDED,
      condition: 'repeated failures across multiple attempts',
      confidence: 0.7,
      note: 'Multiple failures increase confidence that targeted practice is needed.',
    },
    {
      from: ASSESSMENT_STATES.NEEDS_PRACTICE,
      to: ASSESSMENT_STATES.DEVELOPING,
      condition: 'second diagnostic with improved score',
      confidence: 0.6,
      note: 'Improvement indicates progress.',
    },
    {
      from: ASSESSMENT_STATES.DEVELOPING,
      to: ASSESSMENT_STATES.DEMONSTRATED,
      condition: 'consistent correct answers across attempts',
      confidence: 0.9,
      note: 'Repeated demonstration confirms skill mastery.',
    },
    {
      from: ASSESSMENT_STATES.DEVELOPING,
      to: ASSESSMENT_STATES.REVIEW_RECOMMENDED,
      condition: 'score drops below threshold on retake',
      confidence: 0.7,
      note: 'Regression suggests need for review.',
    },
    {
      from: ASSESSMENT_STATES.NEEDS_PRACTICE,
      to: ASSESSMENT_STATES.REVIEW_RECOMMENDED,
      condition: 'two or more failed diagnostic attempts',
      confidence: 0.8,
      note: 'Repeated failures indicate targeted practice needed.',
    },
  ];
};

/**
 * Classify learner evidence into an assessment state.
 *
 * Uses transparent initial rules rather than pretending to have an advanced AI model.
 *
 * @param {Object} evidence - Evidence object with:
 * @param {number} evidence.score - Diagnostic score (0-100)
 * @param {number} evidence.totalQuestions - Total questions answered
 * @param {number} evidence.correctAnswers - Number of correct answers
 * @param {string} evidence.strength - Diagnostic strength ('low', 'medium', 'high')
 * @param {number} evidence.attempts - Number of attempts
 * @returns {Object} Classification result with state, confidence, and recommendation
 */
export const classifyEvidence = (evidence) => {
  const {
    score,
    totalQuestions,
    correctAnswers,
    strength,
    attempts = 1,
  } = evidence;

  // Handle missing evidence
  if (totalQuestions === 0) {
    return {
      state: ASSESSMENT_STATES.NOT_ASSESSED,
      confidence: 0,
      evidence: 'No assessment taken',
      recommendation: 'Take a diagnostic assessment first.',
    };
  }

  const percentage = (correctAnswers / totalQuestions) * 100;
  const passingThreshold = 80;

  // NOT_ASSESSED handled above

  // Below threshold: NEEDS_PRACTICE
  if (percentage < passingThreshold) {
    if (attempts >= 2) {
      return {
        state: ASSESSMENT_STATES.REVIEW_RECOMMENDED,
        confidence: 0.8,
        evidence: `Score ${Math.round(percentage)}% after ${attempts} attempts`,
        recommendation: 'Review prerequisite lessons and retake the diagnostic.',
      };
    }
    return {
      state: ASSESSMENT_STATES.NEEDS_PRACTICE,
      confidence: 0.5,
      evidence: `Score ${Math.round(percentage)}% (${totalQuestions - correctAnswers} unanswered)`,
      recommendation: 'Review the material and retake the diagnostic.',
    };
  }

  // Above threshold: check confidence
  if (strength === 'high') {
    return {
      state: ASSESSMENT_STATES.DEMONSTRATED,
      confidence: 0.9,
      evidence: `Score ${Math.round(percentage)}% (high confidence)`,
      recommendation: 'Skill demonstrated. Proceed to the next activity.',
    };
  }

  if (strength === 'medium') {
    return {
      state: ASSESSMENT_STATES.DEVELOPING,
      confidence: 0.6,
      evidence: `Score ${Math.round(percentage)}% (medium confidence, ${totalQuestions - correctAnswers} unanswered)`,
      recommendation: 'Review the material and retake the diagnostic for higher confidence.',
    };
  }

  // Low strength but above threshold
  return {
    state: ASSESSMENT_STATES.DEVELOPING,
    confidence: 0.4,
    evidence: `Score ${Math.round(percentage)}% (low confidence)`,
    recommendation: 'Review the material and retake the diagnostic to confirm.',
  };
};

/**
 * Get the recommended next activity based on assessment state.
 *
 * @param {string} state - Assessment state
 * @returns {string} Recommended activity type
 */
export const getRecommendedActivity = (state) => {
  const activities = {
    [ASSESSMENT_STATES.NOT_ASSESSED]: 'diagnostic',
    [ASSESSMENT_STATES.NEEDS_PRACTICE]: 'targeted-exercise',
    [ASSESSMENT_STATES.DEVELOPING]: 'guided-example',
    [ASSESSMENT_STATES.DEMONSTRATED]: 'continue-lesson',
    [ASSESSMENT_STATES.REVIEW_RECOMMENDED]: 'prerequisite-review',
  };

  return activities[state] || 'continue-lesson';
};

/**
 * Get the recommended next activity with description.
 *
 * @param {string} state - Assessment state
 * @returns {Object} Recommendation object
 */
export const getRecommendedActivityDetail = (state) => {
  const activities = {
    [ASSESSMENT_STATES.NOT_ASSESSED]: {
      type: 'diagnostic',
      message: 'Take the diagnostic assessment to identify knowledge gaps.',
    },
    [ASSESSMENT_STATES.NEEDS_PRACTICE]: {
      type: 'targeted-exercise',
      message: 'Complete targeted exercises to strengthen weak areas.',
    },
    [ASSESSMENT_STATES.DEVELOPING]: {
      type: 'guided-example',
      message: 'Work through a guided example to build understanding.',
    },
    [ASSESSMENT_STATES.DEMONSTRATED]: {
      type: 'continue-lesson',
      message: 'Proceed to the next lesson.',
    },
    [ASSESSMENT_STATES.REVIEW_RECOMMENDED]: {
      type: 'prerequisite-review',
      message: 'Review prerequisite lessons before continuing.',
    },
  };

  return activities[state] || activities[ASSESSMENT_STATES.DEMONSTRATED];
};
