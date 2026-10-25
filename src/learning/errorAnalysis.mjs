// Reusable error analysis and adaptive-practice logic.
//
// Pure and deterministic: item content declares known error patterns, the
// engine matches them, checks the existing knowledge state (including
// prerequisite evidence), and recommends a next step. It never claims to know
// what a learner was thinking from a single answer.
//
// No network, AI service, DOM or storage access belongs in this module.

import { ASSESSMENT_STATES } from '../utils/evidenceClassification.mjs';
import { evaluateItem, isBlankValue } from './journeyEngine.mjs';
import {
  classifyObjectiveEvidence,
  createEmptyEvidence,
  findLessonForObjective,
  getConfidenceLabel,
  groupObservationsByObjective,
  normalizeEvidence,
} from './gapDetection.mjs';

export const ERROR_CATEGORIES = Object.freeze({
  CONCEPT_MISUNDERSTANDING: 'concept_misunderstanding',
  PROCEDURAL_ERROR: 'procedural_error',
  PREREQUISITE_GAP: 'prerequisite_gap',
  CALCULATION_ERROR: 'calculation_error',
  SYNTAX_ERROR: 'syntax_error',
  INCOMPLETE_ANSWER: 'incomplete_answer',
  UNKNOWN_ERROR: 'unknown_error',
});

export const ERROR_CATEGORY_DEFINITIONS = Object.freeze({
  [ERROR_CATEGORIES.CONCEPT_MISUNDERSTANDING]: {
    id: ERROR_CATEGORIES.CONCEPT_MISUNDERSTANDING,
    label: 'Concept misunderstanding',
    description:
      'The answer suggests a possible mismatch between the idea being tested and the learner’s current model.',
    defaultFeedback:
      'Re-read the key idea and compare it with the answer you chose. What changed in your understanding?',
    defaultHint:
      'Focus on the definition or purpose of the concept before choosing an answer.',
  },
  [ERROR_CATEGORIES.PROCEDURAL_ERROR]: {
    id: ERROR_CATEGORIES.PROCEDURAL_ERROR,
    label: 'Procedural error',
    description:
      'The answer suggests a step or rule may have been applied in the wrong order or left out.',
    defaultFeedback:
      'Walk through the steps one at a time and check which step produced the mismatch.',
    defaultHint:
      'Write the steps in order, then compare each step with the worked example.',
  },
  [ERROR_CATEGORIES.PREREQUISITE_GAP]: {
    id: ERROR_CATEGORIES.PREREQUISITE_GAP,
    label: 'Prerequisite gap',
    description:
      'Earlier evidence shows repeated difficulty with a prerequisite objective that this exercise depends on.',
    defaultFeedback:
      'Review the prerequisite objective before retrying this exercise. The current answer alone did not establish this.',
    defaultHint:
      'Return to the prerequisite lesson, rebuild the foundation, then come back to this exercise.',
  },
  [ERROR_CATEGORIES.CALCULATION_ERROR]: {
    id: ERROR_CATEGORIES.CALCULATION_ERROR,
    label: 'Calculation error',
    description:
      'The method may be right but the arithmetic or computed value does not match.',
    defaultFeedback:
      'Check the arithmetic independently, then compare it with your result.',
    defaultHint:
      'Recompute slowly and check units, signs and intermediate values.',
  },
  [ERROR_CATEGORIES.SYNTAX_ERROR]: {
    id: ERROR_CATEGORIES.SYNTAX_ERROR,
    label: 'Syntax error',
    description:
      'The answer appears to use an invalid form, symbol or structure for the language being learned.',
    defaultFeedback:
      'Compare the answer with a valid example and check the symbols and structure character by character.',
    defaultHint:
      'Check the opening and closing symbols, spelling and order of the syntax.',
  },
  [ERROR_CATEGORIES.INCOMPLETE_ANSWER]: {
    id: ERROR_CATEGORIES.INCOMPLETE_ANSWER,
    label: 'Incomplete answer',
    description:
      'No answer (or only part of an answer) was provided. This is directly observable and is not a claim about the learner’s thinking.',
    defaultFeedback:
      'The response was blank or incomplete. Complete each part of the question before submitting.',
    defaultHint:
      'Answer every part of the prompt, even if you are unsure. A partial attempt gives us evidence to work with.',
  },
  [ERROR_CATEGORIES.UNKNOWN_ERROR]: {
    id: ERROR_CATEGORIES.UNKNOWN_ERROR,
    label: 'Unknown error',
    description:
      'The answer is incorrect, but the available evidence does not match a known error pattern.',
    defaultFeedback:
      'We could not identify a known pattern from this answer alone. Use the explanation, then try another response so we can gather more evidence.',
    defaultHint:
      'Try the question again, or move to a different exercise on the same objective.',
  },
});

export const ERROR_EVIDENCE_STATUS = Object.freeze({
  INSUFFICIENT: 'insufficient',
  DIRECT: 'direct',
  SUPPORTED: 'supported',
});

export const ERROR_RECOMMENDATIONS = Object.freeze({
  ASK_ANOTHER_RESPONSE: 'ask_another_response',
  TRY_DIFFERENT_EXERCISE: 'try_different_exercise',
  REVIEW_PREREQUISITE: 'review_prerequisite',
  COMPLETE_ANSWER: 'complete_answer',
  CONTINUE: 'continue',
});

export const ERROR_RECOMMENDATION_LABELS = Object.freeze({
  [ERROR_RECOMMENDATIONS.ASK_ANOTHER_RESPONSE]: 'Try another response',
  [ERROR_RECOMMENDATIONS.TRY_DIFFERENT_EXERCISE]: 'Try a different exercise',
  [ERROR_RECOMMENDATIONS.REVIEW_PREREQUISITE]: 'Review the prerequisite',
  [ERROR_RECOMMENDATIONS.COMPLETE_ANSWER]: 'Complete the answer',
  [ERROR_RECOMMENDATIONS.CONTINUE]: 'Continue',
});

const VALID_MATCH_TYPES = Object.freeze(['equals', 'includes', 'regex']);

export function getCategoryDefinition(category) {
  return (
    ERROR_CATEGORY_DEFINITIONS[category] ||
    ERROR_CATEGORY_DEFINITIONS[ERROR_CATEGORIES.UNKNOWN_ERROR]
  );
}

export function getCategoryLabel(category) {
  return getCategoryDefinition(category).label;
}

export function getEnabledCategories(courseMap) {
  if (
    courseMap &&
    Array.isArray(courseMap.errorCategories) &&
    courseMap.errorCategories.length > 0
  ) {
    return [...new Set(courseMap.errorCategories)];
  }
  return Object.values(ERROR_CATEGORIES);
}

function isCategoryEnabled(category, enabledCategories) {
  return enabledCategories.includes(category);
}

function normalizeMatchText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function patternMatchesAnswer(pattern, item, value) {
  if (!pattern || !item) return false;

  if (item.kind === 'single_choice') {
    if (Number.isInteger(pattern.optionIndex)) {
      return value === pattern.optionIndex;
    }
    if (Array.isArray(pattern.optionIndexes)) {
      return pattern.optionIndexes.includes(value);
    }
    return false;
  }

  if (item.kind === 'short_text' && pattern.match) {
    const raw = String(value ?? '');
    const normalized = normalizeMatchText(raw);
    if (pattern.match.type === 'equals') {
      return normalized === normalizeMatchText(pattern.match.value);
    }
    if (pattern.match.type === 'includes') {
      return normalized.includes(normalizeMatchText(pattern.match.value));
    }
    if (pattern.match.type === 'regex') {
      try {
        return new RegExp(
          pattern.match.pattern,
          pattern.match.flags || 'i'
        ).test(raw);
      } catch {
        return false;
      }
    }
  }

  return false;
}

export function findMatchingErrorPattern(item, value) {
  const patterns = Array.isArray(item && item.errorPatterns)
    ? item.errorPatterns
    : [];
  return (
    patterns.find((pattern) => patternMatchesAnswer(pattern, item, value)) ||
    null
  );
}

// ---------------------------------------------------------------------------
// Existing knowledge state and prerequisite evidence
// ---------------------------------------------------------------------------

export function getObjectiveKnowledge({
  courseMap,
  objectiveId,
  evidence = createEmptyEvidence(),
}) {
  const objective =
    courseMap && Array.isArray(courseMap.objectives)
      ? courseMap.objectives.find((entry) => entry.id === objectiveId)
      : null;
  const observations = groupObservationsByObjective(evidence).get(objectiveId) || [];
  const result = classifyObjectiveEvidence(observations, {
    objectiveId,
    title: objective ? objective.title : objectiveId || 'this objective',
    isPrerequisite: false,
  });
  return { objective, observations, result };
}

function isDifficulty(result) {
  return (
    result.state === ASSESSMENT_STATES.REVIEW_RECOMMENDED ||
    (result.state === ASSESSMENT_STATES.NEEDS_PRACTICE && result.confirmedGap)
  );
}

export function checkPrerequisiteEvidence({
  courseMap,
  objectiveId,
  evidence = createEmptyEvidence(),
}) {
  const objective =
    courseMap && Array.isArray(courseMap.objectives)
      ? courseMap.objectives.find((entry) => entry.id === objectiveId)
      : null;

  if (!objective) {
    return {
      checked: false,
      status: 'not_available',
      objectives: [],
      weakestPrerequisite: null,
      summary:
        'No objective metadata was available, so prerequisite evidence could not be checked.',
    };
  }

  const prerequisiteIds = objective.prerequisiteIds || [];
  if (prerequisiteIds.length === 0) {
    return {
      checked: true,
      status: 'none',
      objectives: [],
      weakestPrerequisite: null,
      summary: 'This objective has no declared prerequisite objectives.',
    };
  }

  const observationsByObjective = groupObservationsByObjective(evidence);
  const results = prerequisiteIds.map((prerequisiteId) => {
    const prerequisite = courseMap.objectives.find(
      (entry) => entry.id === prerequisiteId
    );
    const observations = observationsByObjective.get(prerequisiteId) || [];
    const result = classifyObjectiveEvidence(observations, {
      objectiveId: prerequisiteId,
      title: prerequisite ? prerequisite.title : prerequisiteId,
      isPrerequisite: true,
    });
    return {
      ...result,
      lessonId: findLessonForObjective(courseMap, prerequisiteId),
    };
  });

  const difficulty = results.filter(isDifficulty);
  const allDemonstrated = results.every(
    (result) => result.state === ASSESSMENT_STATES.DEMONSTRATED
  );
  const anyAssessed = results.some(
    (result) => result.state !== ASSESSMENT_STATES.NOT_ASSESSED
  );
  const notAssessed = results.filter(
    (result) => result.state === ASSESSMENT_STATES.NOT_ASSESSED
  );

  let status;
  let summary;
  if (difficulty.length > 0) {
    status = 'difficulty_evidence';
    summary = `Earlier evidence shows repeated difficulty with prerequisite ${
      difficulty.length === 1 ? 'objective' : 'objectives'
    }: ${difficulty.map((result) => `"${result.title}"`).join(', ')}. This answer alone does not prove the cause, but the prerequisite evidence is relevant.`;
  } else if (allDemonstrated) {
    status = 'demonstrated';
    summary =
      'The prerequisite objectives have repeated correct evidence, so this error is unlikely to be explained by missing foundational evidence.';
  } else if (!anyAssessed) {
    status = 'not_assessed';
    summary =
      'No prerequisite evidence has been recorded yet. Missing evidence is not a gap, so no prerequisite diagnosis is made.';
  } else {
    status = 'partial_evidence';
    summary = `Prerequisite evidence is partial${
      notAssessed.length > 0
        ? ` and ${notAssessed.length} prerequisite ${
            notAssessed.length === 1 ? 'objective is' : 'objectives are'
          } not assessed`
        : ''
    }. The available evidence is not strong enough to call this a prerequisite gap.`;
  }

  return {
    checked: true,
    status,
    objectives: results,
    weakestPrerequisite: difficulty[0] || null,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Error analysis
// ---------------------------------------------------------------------------

export function analyzeError({
  item,
  value,
  attemptNumber = 1,
  courseMap = null,
  evidence = createEmptyEvidence(),
  priorPatternIds = [],
}) {
  if (!item || typeof item !== 'object') {
    throw new Error('analyzeError requires a valid item');
  }

  const evaluation = evaluateItem(item, value);
  const objectiveId = item.objectiveId || null;
  const knowledge = getObjectiveKnowledge({ courseMap, objectiveId, evidence });
  const prerequisiteCheck = checkPrerequisiteEvidence({
    courseMap,
    objectiveId,
    evidence,
  });
  const enabledCategories = getEnabledCategories(courseMap);
  const base = {
    isCorrect: evaluation.isCorrect,
    itemId: item.id,
    objectiveId,
    objectiveTitle: knowledge.objective
      ? knowledge.objective.title
      : objectiveId || '',
    answer: value === undefined ? null : value,
    attemptNumber,
    category: null,
    categoryLabel: null,
    matchedPatternId: null,
    misconception: null,
    feedback: null,
    hint: null,
    evidenceStatus: null,
    confidence: 0,
    confidenceLabel: getConfidenceLabel(0),
    summary: '',
    prerequisiteCheck,
    recommendation: null,
    objectiveKnowledge: knowledge.result,
  };

  if (evaluation.isCorrect) {
    return {
      ...base,
      summary: 'The answer is correct, so there is no error to analyse.',
      evidenceStatus: ERROR_EVIDENCE_STATUS.DIRECT,
      confidence: 1,
      confidenceLabel: getConfidenceLabel(1),
      recommendation: {
        type: ERROR_RECOMMENDATIONS.CONTINUE,
        label: ERROR_RECOMMENDATION_LABELS[ERROR_RECOMMENDATIONS.CONTINUE],
        objectiveId,
        lessonId: null,
        reason: 'The answer met the target. Continue with the lesson.',
      },
    };
  }

  const blank = isBlankValue(value);
  const pattern = blank ? null : findMatchingErrorPattern(item, value);
  const patternEnabled =
    Boolean(pattern) && isCategoryEnabled(pattern.category, enabledCategories);
  const patternRepeated =
    Boolean(pattern) &&
    (attemptNumber >= 2 ||
      (Array.isArray(priorPatternIds) && priorPatternIds.includes(pattern.id)));
  const objectiveRepeated =
    knowledge.result.confirmedGap ||
    knowledge.result.state === ASSESSMENT_STATES.REVIEW_RECOMMENDED;
  const repeated = attemptNumber >= 2 || patternRepeated || objectiveRepeated;

  let category;
  let evidenceStatus;
  let confidence;
  let summary;
  let feedback;
  let hint;
  let misconception = null;
  let matchedPatternId = pattern ? pattern.id : null;

  if (blank) {
    category = ERROR_CATEGORIES.INCOMPLETE_ANSWER;
    evidenceStatus = ERROR_EVIDENCE_STATUS.DIRECT;
    confidence = 0.95;
    summary =
      'The response was blank. This is directly observable and is not an inference about your thinking. Complete the answer before we interpret the error.';
    feedback = getCategoryDefinition(category).defaultFeedback;
    hint = (pattern && pattern.hint) || item.hint || getCategoryDefinition(category).defaultHint;
    matchedPatternId = null;
  } else if (pattern && patternEnabled) {
    category = pattern.category;
    matchedPatternId = pattern.id;
    misconception = pattern.misconception || null;
    evidenceStatus = repeated
      ? ERROR_EVIDENCE_STATUS.SUPPORTED
      : ERROR_EVIDENCE_STATUS.INSUFFICIENT;
    confidence = repeated ? 0.65 : 0.25;
    const definition = getCategoryDefinition(category);
    summary = repeated
      ? `This answer matches a known pattern for ${definition.label.toLowerCase()}, and there is repeated evidence on this objective or exercise. The pattern is supported, though it remains an evidence-based inference.`
      : `This answer matches a known pattern for ${definition.label.toLowerCase()}. One answer is not enough to infer your thinking with certainty, so treat this as a possible pattern and confirm it with another response.`;
    feedback = pattern.feedback || definition.defaultFeedback;
    hint = pattern.hint || item.hint || definition.defaultHint;
  } else {
    category = ERROR_CATEGORIES.UNKNOWN_ERROR;
    matchedPatternId = pattern ? pattern.id : null;
    evidenceStatus = ERROR_EVIDENCE_STATUS.INSUFFICIENT;
    confidence = 0.15;
    summary =
      'The answer is incorrect, but it does not match a known error pattern. We do not have enough evidence to name a category with confidence. Try another response so we can gather more evidence.';
    feedback = getCategoryDefinition(category).defaultFeedback;
    hint = item.hint || getCategoryDefinition(category).defaultHint;
    if (pattern && !patternEnabled) {
      summary +=
        ' The configured pattern belongs to a category that is not enabled for this course, so it is not used.';
    }
  }

  let recommendation;
  const difficultyPrerequisite = prerequisiteCheck.weakestPrerequisite;

  if (blank) {
    recommendation = {
      type: ERROR_RECOMMENDATIONS.COMPLETE_ANSWER,
      label: ERROR_RECOMMENDATION_LABELS[ERROR_RECOMMENDATIONS.COMPLETE_ANSWER],
      objectiveId,
      lessonId: null,
      reason:
        'A blank response is an incomplete answer, not evidence of a knowledge gap. Complete the response before drawing a conclusion.',
    };
  } else if (
    difficultyPrerequisite &&
    repeated &&
    category !== ERROR_CATEGORIES.INCOMPLETE_ANSWER
  ) {
    category = ERROR_CATEGORIES.PREREQUISITE_GAP;
    evidenceStatus = ERROR_EVIDENCE_STATUS.SUPPORTED;
    confidence = 0.65;
    summary = `This answer also needs a prerequisite check. Earlier evidence shows repeated difficulty with "${difficultyPrerequisite.title}", and the error has repeated. A prerequisite gap is the best-supported explanation, but it is still an evidence-based inference, not a certainty.`;
    feedback = getCategoryDefinition(category).defaultFeedback;
    hint = getCategoryDefinition(category).defaultHint;
    recommendation = {
      type: ERROR_RECOMMENDATIONS.REVIEW_PREREQUISITE,
      label: ERROR_RECOMMENDATION_LABELS[ERROR_RECOMMENDATIONS.REVIEW_PREREQUISITE],
      objectiveId: difficultyPrerequisite.objectiveId,
      lessonId: difficultyPrerequisite.lessonId || null,
      reason: `Repeated incorrect evidence on "${difficultyPrerequisite.title}" is combined with a repeated error on this exercise. Review the prerequisite before retrying.`,
    };
  } else if (repeated) {
    recommendation = {
      type: ERROR_RECOMMENDATIONS.TRY_DIFFERENT_EXERCISE,
      label:
        ERROR_RECOMMENDATION_LABELS[ERROR_RECOMMENDATIONS.TRY_DIFFERENT_EXERCISE],
      objectiveId,
      lessonId: null,
      reason:
        'The same exercise has produced another error, or the objective already has repeated incorrect evidence. A different exercise gives a cleaner test of the same objective.',
    };
  } else {
    recommendation = {
      type: ERROR_RECOMMENDATIONS.ASK_ANOTHER_RESPONSE,
      label:
        ERROR_RECOMMENDATION_LABELS[ERROR_RECOMMENDATIONS.ASK_ANOTHER_RESPONSE],
      objectiveId,
      lessonId: null,
      reason:
        'One answer is not enough evidence. Ask for another response or a hint before naming an error pattern.',
    };
  }

  if (
    difficultyPrerequisite &&
    recommendation.type === ERROR_RECOMMENDATIONS.ASK_ANOTHER_RESPONSE
  ) {
    summary += ` Earlier evidence also shows difficulty with prerequisite "${difficultyPrerequisite.title}", but this answer alone does not show that the prerequisite caused the error.`;
  }

  return {
    ...base,
    category,
    categoryLabel: getCategoryLabel(category),
    matchedPatternId,
    misconception,
    feedback,
    hint,
    evidenceStatus,
    confidence,
    confidenceLabel: getConfidenceLabel(confidence),
    summary,
    recommendation,
  };
}

// ---------------------------------------------------------------------------
// Adaptive exercises and remediation
// ---------------------------------------------------------------------------

export function selectAdaptiveExercise({
  courseMap,
  objectiveId,
  evidence = createEmptyEvidence(),
  excludeItemIds = [],
}) {
  const bank =
    courseMap &&
    courseMap.adaptiveExercises &&
    Array.isArray(courseMap.adaptiveExercises[objectiveId])
      ? courseMap.adaptiveExercises[objectiveId]
      : [];
  const attempted = new Set(
    normalizeEvidence(evidence).observations.map((entry) => entry.itemId)
  );
  const excluded = new Set(excludeItemIds);
  return (
    bank.find(
      (item) => item && !attempted.has(item.id) && !excluded.has(item.id)
    ) || null
  );
}

export function evaluateRemediation({ before, after }) {
  const improved = Boolean(after && after.isCorrect);
  const sameError = Boolean(
    !improved &&
      before &&
      after &&
      before.category &&
      before.category === after.category
  );
  const note = improved
    ? 'Performance improved: the follow-up exercise was answered correctly. The evidence record now includes the successful response.'
    : sameError
      ? 'No improvement yet: the follow-up exercise produced the same error category. Try a different exercise or review the relevant prerequisite before continuing.'
      : 'No improvement yet: the follow-up produced a different error pattern. Read the targeted feedback and try another response.';

  return {
    improved,
    sameError,
    beforeItemId: before ? before.itemId : null,
    afterItemId: after ? after.itemId : null,
    beforeCategory: before ? before.category : null,
    afterCategory: after ? after.category : null,
    note,
    nextRecommendation: improved
      ? {
          type: ERROR_RECOMMENDATIONS.CONTINUE,
          label: ERROR_RECOMMENDATION_LABELS[ERROR_RECOMMENDATIONS.CONTINUE],
          reason: 'The learner corrected the follow-up exercise.',
        }
      : {
          type: sameError
            ? ERROR_RECOMMENDATIONS.TRY_DIFFERENT_EXERCISE
            : ERROR_RECOMMENDATIONS.ASK_ANOTHER_RESPONSE,
          label:
            ERROR_RECOMMENDATION_LABELS[
              sameError
                ? ERROR_RECOMMENDATIONS.TRY_DIFFERENT_EXERCISE
                : ERROR_RECOMMENDATIONS.ASK_ANOTHER_RESPONSE
            ],
          reason: sameError
            ? 'The same category repeated; change the exercise rather than repeating the same prompt.'
            : 'The next response may clarify whether the first pattern was stable.',
        },
  };
}

// ---------------------------------------------------------------------------
// Content validation
// ---------------------------------------------------------------------------

export function validateItemErrorPatterns(
  item,
  { enabledCategories = null, objectiveIds = null } = {}
) {
  const errors = [];
  if (!item || !item.errorPatterns) return errors;
  if (!Array.isArray(item.errorPatterns)) {
    return [`item "${item && item.id}" errorPatterns must be an array`];
  }
  const categories =
    Array.isArray(enabledCategories) && enabledCategories.length > 0
      ? enabledCategories
      : Object.values(ERROR_CATEGORIES);
  const seen = new Set();

  item.errorPatterns.forEach((pattern, index) => {
    const prefix = `${item.id || 'item'} errorPatterns[${index}]`;
    if (!pattern || typeof pattern !== 'object') {
      errors.push(`${prefix} must be an object`);
      return;
    }
    if (!pattern.id) {
      errors.push(`${prefix} needs an id`);
    } else if (seen.has(pattern.id)) {
      errors.push(`${prefix} has duplicate pattern id "${pattern.id}"`);
    } else {
      seen.add(pattern.id);
    }
    if (!Object.values(ERROR_CATEGORIES).includes(pattern.category)) {
      errors.push(`${prefix} has unknown category "${pattern.category}"`);
    } else if (!categories.includes(pattern.category)) {
      errors.push(
        `${prefix} uses category "${pattern.category}", which is not enabled for this course`
      );
    }
    if (objectiveIds && (!item.objectiveId || !objectiveIds.has(item.objectiveId))) {
      errors.push(`${prefix} item has unknown objectiveId "${item.objectiveId || ''}"`);
    }

    if (item.kind === 'single_choice') {
      const indexes = Array.isArray(pattern.optionIndexes)
        ? pattern.optionIndexes
        : Number.isInteger(pattern.optionIndex)
          ? [pattern.optionIndex]
          : [];
      if (indexes.length === 0) {
        errors.push(`${prefix} needs an optionIndex or optionIndexes`);
      }
      indexes.forEach((optionIndex) => {
        if (
          !Number.isInteger(optionIndex) ||
          optionIndex < 0 ||
          !Array.isArray(item.options) ||
          optionIndex >= item.options.length
        ) {
          errors.push(`${prefix} has invalid option index "${optionIndex}"`);
        }
      });
    } else if (item.kind === 'short_text') {
      if (!pattern.match || typeof pattern.match !== 'object') {
        errors.push(`${prefix} needs a match rule for short_text`);
      } else if (!VALID_MATCH_TYPES.includes(pattern.match.type)) {
        errors.push(`${prefix} has unsupported match type "${pattern.match.type}"`);
      } else if (
        (pattern.match.type === 'equals' || pattern.match.type === 'includes') &&
        isBlankValue(pattern.match.value)
      ) {
        errors.push(`${prefix} needs a match value`);
      } else if (pattern.match.type === 'regex') {
        try {
          new RegExp(pattern.match.pattern, pattern.match.flags || 'i');
        } catch {
          errors.push(`${prefix} has an invalid regular expression`);
        }
      }
    } else {
      errors.push(`${prefix} belongs to an unsupported item kind "${item.kind}"`);
    }
  });

  return errors;
}

function validateItemBasics(item, objectiveIds, label, enabledCategories) {
  const errors = [];
  if (!item || typeof item !== 'object') {
    return [`${label} must be an object`];
  }
  if (!item.id) errors.push(`${label} needs an id`);
  if (!item.prompt) errors.push(`${label} needs a prompt`);
  if (!item.objectiveId || !objectiveIds.has(item.objectiveId)) {
    errors.push(`${label} has unknown objectiveId "${item.objectiveId || ''}"`);
  }
  if (item.kind === 'single_choice') {
    if (!Array.isArray(item.options) || item.options.length < 2) {
      errors.push(`${label} needs at least two options`);
    } else if (
      !Number.isInteger(item.correctIndex) ||
      item.correctIndex < 0 ||
      item.correctIndex >= item.options.length
    ) {
      errors.push(`${label} needs a valid correctIndex`);
    }
  } else if (item.kind === 'short_text') {
    if (
      isBlankValue(item.answer) &&
      (!Array.isArray(item.acceptedAnswers) || item.acceptedAnswers.length === 0)
    ) {
      errors.push(`${label} needs an answer or acceptedAnswers`);
    }
  } else {
    errors.push(`${label} has unsupported kind "${item.kind}"`);
  }
  errors.push(
    ...validateItemErrorPatterns(item, {
      enabledCategories,
      objectiveIds,
    })
  );
  return errors;
}

export function validateErrorContent(courseMap) {
  const errors = [];
  if (!courseMap || typeof courseMap !== 'object') {
    return ['course map must be an object'];
  }

  const enabledCategories = getEnabledCategories(courseMap);
  const invalidCategories = enabledCategories.filter(
    (category) => !Object.values(ERROR_CATEGORIES).includes(category)
  );
  invalidCategories.forEach((category) =>
    errors.push(`errorCategories contains unknown category "${category}"`)
  );
  if (
    courseMap.errorCategories !== undefined &&
    !Array.isArray(courseMap.errorCategories)
  ) {
    errors.push('errorCategories must be an array when provided');
  } else if (Array.isArray(courseMap.errorCategories)) {
    if (courseMap.errorCategories.length === 0) {
      errors.push('errorCategories must not be empty');
    }
    if (
      new Set(courseMap.errorCategories).size !== courseMap.errorCategories.length
    ) {
      errors.push('errorCategories contains duplicates');
    }
  }

  const objectiveIds = new Set(
    (courseMap.objectives || []).map((objective) => objective.id)
  );

  if (
    courseMap.adaptiveExercises &&
    typeof courseMap.adaptiveExercises === 'object'
  ) {
    Object.entries(courseMap.adaptiveExercises).forEach(
      ([objectiveId, items]) => {
        if (!objectiveIds.has(objectiveId)) {
          errors.push(
            `adaptiveExercises references unknown objective "${objectiveId}"`
          );
        }
        if (!Array.isArray(items)) {
          errors.push(`adaptiveExercises["${objectiveId}"] must be an array`);
          return;
        }
        const seen = new Set();
        items.forEach((item, index) => {
          const label = `adaptiveExercises["${objectiveId}"][${index}]`;
          errors.push(
            ...validateItemBasics(
              item,
              objectiveIds,
              label,
              enabledCategories
            )
          );
          if (item && item.objectiveId !== objectiveId) {
            errors.push(
              `${label} objectiveId "${item.objectiveId}" does not match its bank key "${objectiveId}"`
            );
          }
          if (item && item.id) {
            if (seen.has(item.id)) {
              errors.push(`${label} duplicates item id "${item.id}"`);
            }
            seen.add(item.id);
          }
        });
      }
    );
  }

  Object.entries(courseMap.lessons || {}).forEach(([lessonId, lesson]) => {
    const diagnostic = lesson && lesson.diagnostic;
    if (!diagnostic) return;
    [
      ['items', diagnostic.items],
      ['practiceItems', diagnostic.practiceItems],
      ['reassessmentItems', diagnostic.reassessmentItems],
    ].forEach(([key, items]) => {
      (items || []).forEach((item, index) => {
        errors.push(
          ...validateItemErrorPatterns(item, {
            enabledCategories,
            objectiveIds,
          }).map(
            (error) =>
              `lesson "${lessonId}" diagnostic.${key}[${index}] ${error}`
          )
        );
      });
    });
  });

  return errors;
}
