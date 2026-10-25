// Active-recall content generation.
//
// Course authors declare `reviewConcepts` on a course learning map. A concept
// names one or more existing checkpoint items (diagnostic, practice,
// assessment or adaptive exercise) that contain the validated answer. The
// generator turns the first usable item into a free-recall prompt.
//
// Design rules:
// - Choices are never shown. A learner must type the answer from memory.
// - The explanation is returned with the activity but the UI only reveals it
//   after an answer is checked.
// - A concept with no usable source item is omitted. The scheduler therefore
//   cannot keep surfacing content that no longer exists.
// - Content authors can add accepted answer variants, but validation warns
//   when source items are missing or reused by another concept.

import { evaluateItem, isBlankValue } from './journeyEngine.mjs';

const VALID_ITEM_KINDS = new Set(['single_choice', 'short_text']);

function indexItems(items) {
  const index = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item || typeof item !== 'object' || !item.id) return;
    if (!index.has(item.id)) index.set(item.id, item);
  });
  return index;
}

function derivedAnswer(item) {
  if (!item || !VALID_ITEM_KINDS.has(item.kind)) return null;
  if (item.kind === 'single_choice') {
    if (
      !Array.isArray(item.options) ||
      !Number.isInteger(item.correctIndex) ||
      item.correctIndex < 0 ||
      item.correctIndex >= item.options.length
    ) {
      return null;
    }
    const value = item.options[item.correctIndex];
    return isBlankValue(value) ? null : String(value).trim();
  }

  if (!isBlankValue(item.answer)) return String(item.answer).trim();
  const fallback = (Array.isArray(item.acceptedAnswers)
    ? item.acceptedAnswers
    : []
  ).find((value) => !isBlankValue(value));
  return fallback ? String(fallback).trim() : null;
}

function findSourceItem(concept, itemIndex) {
  const sourceItemIds = Array.isArray(concept.sourceItemIds)
    ? concept.sourceItemIds
    : [];
  for (const sourceItemId of sourceItemIds) {
    const item = itemIndex.get(sourceItemId);
    if (!item || !VALID_ITEM_KINDS.has(item.kind)) continue;
    if (item.objectiveId !== concept.objectiveId) continue;
    if (isBlankValue(derivedAnswer(item))) continue;
    return item;
  }
  return null;
}

function buildAcceptedAnswers(concept, sourceItem, answer) {
  const accepted = new Set();
  const add = (value) => {
    if (!isBlankValue(value)) accepted.add(String(value).trim());
  };

  add(answer);
  add(concept.answer);
  add(derivedAnswer(sourceItem));
  (Array.isArray(sourceItem.acceptedAnswers)
    ? sourceItem.acceptedAnswers
    : []
  ).forEach(add);
  (Array.isArray(concept.acceptedAnswers)
    ? concept.acceptedAnswers
    : []
  ).forEach(add);

  // Typing "body" should count for "<body>", and vice versa.
  const tagMatch = answer.match(/^<\/?([a-z][a-z0-9-]*)(?:\s[^>]*)?>$/i);
  if (tagMatch) add(tagMatch[1]);

  return [...accepted];
}

function getObjectiveTitle(courseMap, objectiveId) {
  const objective = (courseMap.objectives || []).find(
    (entry) => entry && entry.id === objectiveId
  );
  return objective ? objective.title : '';
}

/**
 * Build one free-recall activity per valid authored concept.
 *
 * @param {Object} options
 * @param {Object} options.courseMap - Course learning map with reviewConcepts.
 * @param {Array} options.items - Existing validated questions to draw from.
 * @returns {Array} Review activities. Concepts without usable content are skipped.
 */
export function buildReviewActivities({ courseMap, items = [] } = {}) {
  if (!courseMap || typeof courseMap !== 'object') return [];
  const concepts = Array.isArray(courseMap.reviewConcepts)
    ? courseMap.reviewConcepts
    : [];
  const itemIndex = indexItems(items);
  const usedSourceIds = new Set();
  const activities = [];

  concepts.forEach((concept) => {
    if (
      !concept ||
      typeof concept !== 'object' ||
      !concept.id ||
      !concept.objectiveId
    ) {
      return;
    }

    const sourceItem = findSourceItem(concept, itemIndex);
    if (!sourceItem || usedSourceIds.has(sourceItem.id)) return;

    const derived = derivedAnswer(sourceItem);
    const answer = !isBlankValue(concept.answer)
      ? String(concept.answer).trim()
      : derived;
    const prompt = !isBlankValue(concept.prompt)
      ? String(concept.prompt).trim()
      : sourceItem.prompt;
    if (isBlankValue(answer) || isBlankValue(prompt)) return;

    usedSourceIds.add(sourceItem.id);
    const explanation = !isBlankValue(concept.explanation)
      ? String(concept.explanation).trim()
      : sourceItem.explanation ||
        (sourceItem.feedback && sourceItem.feedback.correct) ||
        `The expected answer is ${answer}.`;

    activities.push({
      id: concept.id,
      conceptId: concept.id,
      courseId: courseMap.courseId,
      lessonId: concept.lessonId || null,
      objectiveId: concept.objectiveId,
      objectiveTitle: getObjectiveTitle(courseMap, concept.objectiveId),
      title: concept.title || prompt,
      prompt,
      answer,
      acceptedAnswers: buildAcceptedAnswers(concept, sourceItem, answer),
      explanation,
      sourceItemId: sourceItem.id,
      sourceKind: sourceItem.kind,
      selfAssessment: concept.selfAssessment !== false,
    });
  });

  return activities;
}

/**
 * Build the short-text item used for both checking the recall and recording
 * evidence. Keeping this in one place means the UI and evidence store cannot
 * disagree about what counted as correct.
 */
export function createRecallItem(activity) {
  if (!activity || typeof activity !== 'object' || !activity.id) {
    throw new Error('createRecallItem requires a review activity');
  }
  return {
    id: `review:${activity.courseId}:${activity.id}`,
    kind: 'short_text',
    objectiveId: activity.objectiveId,
    prompt: activity.prompt,
    answer: activity.answer,
    acceptedAnswers: activity.acceptedAnswers,
    explanation: activity.explanation,
    feedback: {
      correct: 'Correct recall. Compare your answer with the explanation.',
      incorrect: `Not quite. The expected answer is: ${activity.answer}`,
    },
  };
}

export function evaluateRecall(activity, answer) {
  if (!activity) throw new Error('evaluateRecall requires a review activity');
  const evaluation = evaluateItem(createRecallItem(activity), answer);
  return {
    ...evaluation,
    isCorrect: evaluation.isCorrect,
    answered: !isBlankValue(answer),
    expected: activity.answer,
    explanation: activity.explanation,
  };
}

/**
 * Authoring validation. This is intentionally stricter than the runtime
 * generator: missing source item ids, objective mismatches and duplicate
 * source usage should be fixed by the author rather than silently skipped.
 */
export function validateReviewConcepts({ courseMap, items = [] } = {}) {
  const errors = [];
  if (!courseMap || typeof courseMap !== 'object') {
    return ['courseMap must be an object'];
  }
  const concepts = courseMap.reviewConcepts;
  if (!Array.isArray(concepts)) {
    return ['reviewConcepts must be an array'];
  }

  const objectiveIds = new Set(
    (courseMap.objectives || [])
      .filter((objective) => objective && objective.id)
      .map((objective) => objective.id)
  );
  const itemIndex = indexItems(items);
  const seenConceptIds = new Set();
  const sourceOwners = new Map();

  concepts.forEach((concept, index) => {
    const prefix = `reviewConcepts[${index}]`;
    if (!concept || typeof concept !== 'object') {
      errors.push(`${prefix} must be an object`);
      return;
    }
    if (!concept.id || typeof concept.id !== 'string') {
      errors.push(`${prefix} needs a string id`);
      return;
    }
    if (seenConceptIds.has(concept.id)) {
      errors.push(`duplicate review concept id "${concept.id}"`);
    }
    seenConceptIds.add(concept.id);

    if (!concept.title || typeof concept.title !== 'string') {
      errors.push(`${prefix} needs a title`);
    }
    if (!concept.objectiveId || !objectiveIds.has(concept.objectiveId)) {
      errors.push(
        `${prefix} has unknown objectiveId "${concept.objectiveId || ''}"`
      );
    } else {
      const lesson = courseMap.lessons && courseMap.lessons[concept.lessonId];
      if (!concept.lessonId || !lesson) {
        errors.push(`${prefix} references unknown lesson "${concept.lessonId || ''}"`);
      } else {
        const lessonObjectiveIds = new Set([
          ...(lesson.objectiveIds || []),
          ...(lesson.prerequisiteObjectiveIds || []),
        ]);
        if (!lessonObjectiveIds.has(concept.objectiveId)) {
          errors.push(
            `${prefix} objective "${concept.objectiveId}" is not part of lesson "${concept.lessonId}"`
          );
        }
      }
    }

    if (
      !Array.isArray(concept.sourceItemIds) ||
      concept.sourceItemIds.length === 0
    ) {
      errors.push(`${prefix} needs at least one source item id`);
      return;
    }

    const sourceIds = concept.sourceItemIds.filter(
      (sourceItemId) => typeof sourceItemId === 'string' && sourceItemId
    );
    if (sourceIds.length !== concept.sourceItemIds.length) {
      errors.push(`${prefix} has a source item id that is not a string`);
    }

    let usableSource = null;
    sourceIds.forEach((sourceItemId) => {
      const item = itemIndex.get(sourceItemId);
      if (!item) {
        errors.push(`${prefix} references missing source item "${sourceItemId}"`);
        return;
      }
      if (item.objectiveId !== concept.objectiveId) {
        errors.push(
          `${prefix} source item "${sourceItemId}" belongs to objective "${item.objectiveId}", not "${concept.objectiveId}"`
        );
        return;
      }
      if (!VALID_ITEM_KINDS.has(item.kind)) {
        errors.push(
          `${prefix} source item "${sourceItemId}" has unsupported kind "${item.kind}"`
        );
        return;
      }
      if (isBlankValue(derivedAnswer(item))) {
        errors.push(`${prefix} source item "${sourceItemId}" has no answer`);
        return;
      }
      if (sourceOwners.has(sourceItemId) && sourceOwners.get(sourceItemId) !== concept.id) {
        errors.push(
          `source item "${sourceItemId}" is used by more than one review concept`
        );
      } else {
        sourceOwners.set(sourceItemId, concept.id);
      }
      if (!usableSource) usableSource = item;
    });

    if (!usableSource) {
      errors.push(`${prefix} has no reviewable content`);
      return;
    }

    const answer = !isBlankValue(concept.answer)
      ? String(concept.answer).trim()
      : derivedAnswer(usableSource);
    if (isBlankValue(answer)) {
      errors.push(`${prefix} needs an answer or a source item with an answer`);
    }
    if (concept.prompt !== undefined && isBlankValue(concept.prompt)) {
      errors.push(`${prefix} has a blank prompt override`);
    }
    if (concept.answer !== undefined && isBlankValue(concept.answer)) {
      errors.push(`${prefix} has a blank answer override`);
    }
    if (
      concept.acceptedAnswers !== undefined &&
      (!Array.isArray(concept.acceptedAnswers) ||
        concept.acceptedAnswers.some((value) => isBlankValue(value)))
    ) {
      errors.push(`${prefix} acceptedAnswers must be an array of non-blank strings`);
    }
  });

  return errors;
}
