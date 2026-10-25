// Reusable learning-journey engine.
//
// This module contains the logic shared by every lesson journey: stage
// sequencing, answer evaluation, scoring, retry rules, completion rules and
// restore semantics. It is pure (no DOM, no storage, no React) so it can be
// unit tested and reused for any subject. Lesson-specific content lives in
// src/data/learningJourneys.mjs.

export const JOURNEY_SCHEMA_VERSION = 1;

export const JOURNEY_STAGES = Object.freeze({
  OBJECTIVES: 'objectives',
  EXPLANATION: 'explanation',
  WORKED_EXAMPLE: 'worked_example',
  GUIDED_PRACTICE: 'guided_practice',
  INDEPENDENT_PRACTICE: 'independent_practice',
  ASSESSMENT: 'assessment',
  COMPLETE: 'complete',
});

export const PRACTICE_STAGES = Object.freeze([
  JOURNEY_STAGES.GUIDED_PRACTICE,
  JOURNEY_STAGES.INDEPENDENT_PRACTICE,
]);

export const DEFAULT_POLICY = Object.freeze({
  passingScore: 80,
  maxAssessmentAttempts: 3,
  maxPracticeAttempts: 2,
});

const ALL_STAGES = Object.freeze(Object.values(JOURNEY_STAGES));

export function resolveJourneyPolicy(content, overrides = {}) {
  return {
    ...DEFAULT_POLICY,
    ...((content && content.policy) || {}),
    ...(overrides || {}),
  };
}

export function normalizeShortText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function isBlankValue(value) {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '')
  );
}

// ---------------------------------------------------------------------------
// Answer evaluation
// ---------------------------------------------------------------------------

export function evaluateItem(item, value) {
  if (!item || typeof item !== 'object') {
    throw new Error('evaluateItem requires a valid item');
  }

  if (item.kind === 'single_choice') {
    const isCorrect = value === item.correctIndex;
    const specific =
      !isCorrect && item.errorMap ? item.errorMap[value] : undefined;
    return {
      isCorrect,
      expected: item.correctIndex,
      message: isCorrect
        ? (item.feedback && item.feedback.correct) || 'Correct!'
        : specific ||
          (item.feedback && item.feedback.incorrect) ||
          'Not quite. Review the explanation and try again.',
    };
  }

  if (item.kind === 'short_text') {
    const accepted = Array.from(
      new Set(
        [...(item.acceptedAnswers || []), item.answer]
          .filter((entry) => !isBlankValue(entry))
          .map(normalizeShortText)
      )
    );
    const isCorrect =
      !isBlankValue(value) && accepted.includes(normalizeShortText(value));
    return {
      isCorrect,
      expected: item.answer,
      message: isCorrect
        ? (item.feedback && item.feedback.correct) || 'Correct!'
        : (item.feedback && item.feedback.incorrect) ||
          `Not quite. A correct answer would be: ${item.answer}`,
    };
  }

  throw new Error(`Unsupported item kind: ${item.kind}`);
}

export function scoreAssessment(
  items,
  answers = {},
  passingScore = DEFAULT_POLICY.passingScore
) {
  const results = (items || []).map((item) => {
    const value = answers[item.id];
    const evaluation = evaluateItem(item, value);
    return {
      itemId: item.id,
      value: value === undefined ? null : value,
      isCorrect: evaluation.isCorrect,
      expected: evaluation.expected,
      message: evaluation.message,
    };
  });

  const total = results.length;
  const correctCount = results.filter((result) => result.isCorrect).length;
  const percentage = total === 0 ? 0 : Math.round((correctCount / total) * 100);

  return {
    results,
    correctCount,
    total,
    percentage,
    passed: percentage >= passingScore,
  };
}

// ---------------------------------------------------------------------------
// Journey state
// ---------------------------------------------------------------------------

function emptyPhaseState() {
  return { index: 0, records: {}, selected: null, feedback: null };
}

function sanitizePhaseState(phaseState) {
  const base = emptyPhaseState();
  if (!phaseState || typeof phaseState !== 'object') return base;
  return {
    index:
      Number.isInteger(phaseState.index) && phaseState.index >= 0
        ? phaseState.index
        : base.index,
    records:
      phaseState.records && typeof phaseState.records === 'object'
        ? phaseState.records
        : base.records,
    selected: isBlankValue(phaseState.selected) ? null : phaseState.selected,
    feedback:
      phaseState.feedback && typeof phaseState.feedback === 'object'
        ? phaseState.feedback
        : base.feedback,
  };
}

export function isRestorableJourneyState(savedState, content) {
  return Boolean(
    savedState &&
      typeof savedState === 'object' &&
      savedState.schemaVersion === JOURNEY_SCHEMA_VERSION &&
      content &&
      savedState.courseId === content.courseId &&
      savedState.lessonId === content.lessonId
  );
}

export function createInitialJourneyState(
  content,
  policyOverrides = {},
  savedState = null
) {
  const base = {
    schemaVersion: JOURNEY_SCHEMA_VERSION,
    courseId: content.courseId,
    lessonId: content.lessonId,
    stage: JOURNEY_STAGES.OBJECTIVES,
    guidedPractice: emptyPhaseState(),
    independentPractice: emptyPhaseState(),
    assessment: {
      answers: {},
      attempts: [],
      results: null,
      passed: false,
      bestPercentage: 0,
      exhausted: false,
    },
    completed: false,
    completedAt: null,
  };

  if (!isRestorableJourneyState(savedState, content)) return base;

  const policy = resolveJourneyPolicy(content, policyOverrides);
  const attempts = Array.isArray(
    savedState.assessment && savedState.assessment.attempts
  )
    ? savedState.assessment.attempts
    : [];
  const failedAttempts = attempts.filter(
    (attempt) => !attempt || !attempt.passed
  ).length;

  return {
    ...base,
    stage: ALL_STAGES.includes(savedState.stage)
      ? savedState.stage
      : base.stage,
    guidedPractice: sanitizePhaseState(savedState.guidedPractice),
    independentPractice: sanitizePhaseState(savedState.independentPractice),
    assessment: {
      answers:
        savedState.assessment &&
        savedState.assessment.answers &&
        typeof savedState.assessment.answers === 'object'
          ? savedState.assessment.answers
          : {},
      attempts,
      results:
        savedState.assessment && Array.isArray(savedState.assessment.results)
          ? savedState.assessment.results
          : null,
      passed: Boolean(savedState.assessment && savedState.assessment.passed),
      bestPercentage:
        savedState.assessment &&
        Number.isFinite(savedState.assessment.bestPercentage)
          ? savedState.assessment.bestPercentage
          : 0,
      exhausted: failedAttempts >= policy.maxAssessmentAttempts,
    },
    completed: Boolean(savedState.completed),
    completedAt: savedState.completedAt || null,
  };
}

export function canCompleteJourney(state, content) {
  if (!state || !content) return false;
  const allRecorded = (items, records) =>
    (items || []).every(
      (item) => records && (records[item.id]?.attempts || 0) >= 1
    );
  const guidedDone = allRecorded(
    content.guidedPractice && content.guidedPractice.items,
    state.guidedPractice && state.guidedPractice.records
  );
  const independentDone = allRecorded(
    content.independentPractice && content.independentPractice.items,
    state.independentPractice && state.independentPractice.records
  );
  return Boolean(
    guidedDone && independentDone && state.assessment && state.assessment.passed
  );
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function createJourneyReducer(content, policyOverrides = {}) {
  const policy = resolveJourneyPolicy(content, policyOverrides);
  const guidedItems =
    (content.guidedPractice && content.guidedPractice.items) || [];
  const independentItems =
    (content.independentPractice && content.independentPractice.items) || [];
  const assessmentItems =
    (content.assessment && content.assessment.items) || [];

  const itemsForStage = (stage) =>
    stage === JOURNEY_STAGES.GUIDED_PRACTICE ? guidedItems : independentItems;

  const phaseKeyFor = (stage) =>
    stage === JOURNEY_STAGES.GUIDED_PRACTICE
      ? 'guidedPractice'
      : 'independentPractice';

  return function journeyReducer(state, action) {
    if (!state || !action) return state;

    switch (action.type) {
      case 'CONTINUE': {
        const nextStage = {
          [JOURNEY_STAGES.OBJECTIVES]: JOURNEY_STAGES.EXPLANATION,
          [JOURNEY_STAGES.EXPLANATION]: JOURNEY_STAGES.WORKED_EXAMPLE,
          [JOURNEY_STAGES.WORKED_EXAMPLE]: JOURNEY_STAGES.GUIDED_PRACTICE,
        }[state.stage];
        return nextStage ? { ...state, stage: nextStage } : state;
      }

      case 'SELECT_PRACTICE_OPTION': {
        if (!PRACTICE_STAGES.includes(state.stage)) return state;
        const key = phaseKeyFor(state.stage);
        const phase = state[key];
        if (phase.feedback) return state;
        return {
          ...state,
          [key]: { ...phase, selected: action.value },
        };
      }

      case 'SUBMIT_PRACTICE': {
        if (!PRACTICE_STAGES.includes(state.stage)) return state;
        const key = phaseKeyFor(state.stage);
        const items = itemsForStage(state.stage);
        const phase = state[key];
        const item = items[phase.index];
        if (!item || phase.feedback || phase.selected === null) return state;

        const evaluation = evaluateItem(item, phase.selected);
        const previous = phase.records[item.id];
        const attempts = ((previous && previous.attempts) || 0) + 1;
        const revealed =
          !evaluation.isCorrect && attempts >= policy.maxPracticeAttempts;

        return {
          ...state,
          [key]: {
            ...phase,
            records: {
              ...phase.records,
              [item.id]: {
                attempts,
                lastCorrect: evaluation.isCorrect,
                lastAnswer: phase.selected,
                revealed,
              },
            },
            feedback: {
              itemId: item.id,
              isCorrect: evaluation.isCorrect,
              message: evaluation.message,
              expected: evaluation.expected,
              revealed,
            },
          },
        };
      }

      case 'RETRY_PRACTICE': {
        if (!PRACTICE_STAGES.includes(state.stage)) return state;
        const key = phaseKeyFor(state.stage);
        const phase = state[key];
        if (
          !phase.feedback ||
          phase.feedback.isCorrect ||
          phase.feedback.revealed
        ) {
          return state;
        }
        return {
          ...state,
          [key]: { ...phase, selected: null, feedback: null },
        };
      }

      case 'NEXT_PRACTICE_ITEM': {
        if (!PRACTICE_STAGES.includes(state.stage)) return state;
        const key = phaseKeyFor(state.stage);
        const items = itemsForStage(state.stage);
        const phase = state[key];
        const item = items[phase.index];
        if (!item || !phase.feedback) return state;

        const record = phase.records[item.id];
        const answered =
          Boolean(record) && (record.lastCorrect || record.revealed);
        if (!answered) return state;

        const isLast = phase.index >= items.length - 1;
        if (!isLast) {
          return {
            ...state,
            [key]: {
              ...phase,
              index: phase.index + 1,
              selected: null,
              feedback: null,
            },
          };
        }

        return {
          ...state,
          stage:
            state.stage === JOURNEY_STAGES.GUIDED_PRACTICE
              ? JOURNEY_STAGES.INDEPENDENT_PRACTICE
              : JOURNEY_STAGES.ASSESSMENT,
        };
      }

      case 'SET_ASSESSMENT_ANSWER': {
        if (
          state.stage !== JOURNEY_STAGES.ASSESSMENT ||
          state.assessment.results
        ) {
          return state;
        }
        return {
          ...state,
          assessment: {
            ...state.assessment,
            answers: {
              ...state.assessment.answers,
              [action.itemId]: action.value,
            },
          },
        };
      }

      case 'SUBMIT_ASSESSMENT': {
        if (
          state.stage !== JOURNEY_STAGES.ASSESSMENT ||
          state.assessment.results
        ) {
          return state;
        }
        const allAnswered = assessmentItems.every(
          (item) => !isBlankValue(state.assessment.answers[item.id])
        );
        if (!allAnswered) return state;

        const scored = scoreAssessment(
          assessmentItems,
          state.assessment.answers,
          policy.passingScore
        );
        const attempts = [
          ...state.assessment.attempts,
          {
            attempt: state.assessment.attempts.length + 1,
            answers: { ...state.assessment.answers },
            correctCount: scored.correctCount,
            total: scored.total,
            percentage: scored.percentage,
            passed: scored.passed,
            submittedAt: action.now || null,
          },
        ];
        const failedAttempts = attempts.filter(
          (attempt) => !attempt.passed
        ).length;

        return {
          ...state,
          assessment: {
            ...state.assessment,
            results: scored.results,
            attempts,
            passed: state.assessment.passed || scored.passed,
            bestPercentage: Math.max(
              state.assessment.bestPercentage,
              scored.percentage
            ),
            exhausted:
              !scored.passed && failedAttempts >= policy.maxAssessmentAttempts,
          },
        };
      }

      case 'RETRY_ASSESSMENT': {
        if (state.stage !== JOURNEY_STAGES.ASSESSMENT) return state;
        const { assessment } = state;
        if (!assessment.results) return state;
        // A passed score can still be insufficient for the mastery criteria
        // (for example, a required objective was missed). The view can request
        // an explicit retake to produce new evidence for the same objectives.
        if (assessment.passed && action.masteryRetake !== true) return state;
        return {
          ...state,
          assessment: { ...assessment, answers: {}, results: null },
        };
      }

      case 'REVIEW_LESSON': {
        if (state.stage !== JOURNEY_STAGES.ASSESSMENT) return state;
        return {
          ...state,
          stage: JOURNEY_STAGES.EXPLANATION,
          assessment: { ...state.assessment, answers: {}, results: null },
        };
      }

      case 'COMPLETE_JOURNEY': {
        if (!canCompleteJourney(state, content)) return state;
        // Callers can layer an additional mastery decision on top of the
        // journey's own completion rules. Omitted for backwards compatibility.
        if (action.masteryAllowed === false) return state;
        return {
          ...state,
          stage: JOURNEY_STAGES.COMPLETE,
          completed: true,
          completedAt: action.now || state.completedAt || null,
        };
      }

      default:
        return state;
    }
  };
}

// ---------------------------------------------------------------------------
// Content validation (used by tests and any authoring tooling later)
// ---------------------------------------------------------------------------

export function validateJourneyContent(content) {
  const errors = [];
  if (!content || typeof content !== 'object') {
    return ['content must be an object'];
  }
  if (!content.courseId) errors.push('courseId is required');
  if (!content.lessonId) errors.push('lessonId is required');

  const objectiveIds = new Set();
  const objectives = content.objectives || [];
  objectives.forEach((objective, index) => {
    if (!objective || !objective.id) {
      errors.push(`objectives[${index}].id is required`);
    } else if (objectiveIds.has(objective.id)) {
      errors.push(`duplicate objective id: ${objective.id}`);
    } else {
      objectiveIds.add(objective.id);
    }
    if (!objective || !objective.title) {
      errors.push(`objectives[${index}].title is required`);
    }
  });
  if (objectiveIds.size === 0) errors.push('at least one objective is required');

  if (!content.explanation || !(content.explanation.paragraphs || []).length) {
    errors.push('explanation.paragraphs must not be empty');
  }
  if (!content.workedExample || !(content.workedExample.steps || []).length) {
    errors.push('workedExample.steps must not be empty');
  }

  const collections = [
    ['guidedPractice', content.guidedPractice && content.guidedPractice.items],
    ['independentPractice', content.independentPractice && content.independentPractice.items],
    ['assessment', content.assessment && content.assessment.items],
  ];

  const seenItemIds = new Map();
  collections.forEach(([name, items]) => {
    if (!items || !items.length) {
      errors.push(`${name}.items must not be empty`);
      return;
    }
    items.forEach((item, index) => {
      const label = `${name}.items[${index}]`;
      if (!item || !item.id) {
        errors.push(`${label}.id is required`);
      } else if (seenItemIds.has(item.id)) {
        errors.push(
          `duplicate item id ${item.id} (${seenItemIds.get(item.id)} and ${label})`
        );
      } else {
        seenItemIds.set(item.id, label);
      }
      if (!item || !item.prompt) errors.push(`${label}.prompt is required`);
      if (!item || !item.explanation) {
        errors.push(`${label}.explanation is required`);
      }
      if (item && item.objectiveId && !objectiveIds.has(item.objectiveId)) {
        errors.push(`${label}.objectiveId references unknown objective ${item.objectiveId}`);
      }
      if (item && item.kind === 'single_choice') {
        const optionCount = (item.options || []).length;
        if (optionCount < 2) {
          errors.push(`${label}.options must have at least 2 entries`);
        }
        if (
          !Number.isInteger(item.correctIndex) ||
          item.correctIndex < 0 ||
          item.correctIndex >= optionCount
        ) {
          errors.push(`${label}.correctIndex is out of range`);
        }
        Object.keys(item.errorMap || {}).forEach((key) => {
          const optionIndex = Number(key);
          if (
            !Number.isInteger(optionIndex) ||
            optionIndex < 0 ||
            optionIndex >= optionCount
          ) {
            errors.push(`${label}.errorMap has invalid option key ${key}`);
          }
        });
      } else if (item && item.kind === 'short_text') {
        if (!item.answer) errors.push(`${label}.answer is required`);
      } else if (item) {
        errors.push(`${label}.kind must be single_choice or short_text`);
      }
    });
  });

  if ((content.assessment && (content.assessment.items || []).length || 0) < 3) {
    errors.push('assessment.items must contain at least 3 items');
  }

  const assessmentIds = new Set(
    (content.assessment && content.assessment.items
      ? content.assessment.items
      : []
    ).map((item) => item.id)
  );
  ['guidedPractice', 'independentPractice'].forEach((name) => {
    ((content[name] && content[name].items) || []).forEach((item, index) => {
      if (assessmentIds.has(item.id)) {
        errors.push(
          `${name}.items[${index}] reuses assessment item id ${item.id}`
        );
      }
    });
  });

  const passing =
    content.policy && content.policy.passingScore !== undefined
      ? content.policy.passingScore
      : DEFAULT_POLICY.passingScore;
  if (typeof passing !== 'number' || passing <= 0 || passing > 100) {
    errors.push('policy.passingScore must be between 1 and 100');
  }

  return errors;
}
