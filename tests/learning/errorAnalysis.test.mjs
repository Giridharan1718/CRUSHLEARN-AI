import test from 'node:test';
import assert from 'node:assert/strict';
import { getLearningJourney } from '../../src/data/learningJourneys.mjs';
import { getCourseLearningMap } from '../../src/data/courseLearningMaps.mjs';
import {
  EVIDENCE_SOURCES,
  createEmptyEvidence,
  recordAttempt,
} from '../../src/learning/gapDetection.mjs';
import {
  ERROR_CATEGORIES,
  analyzeError,
  evaluateRemediation,
  selectAdaptiveExercise,
  validateErrorContent,
  validateItemErrorPatterns,
} from '../../src/learning/errorAnalysis.mjs';

const webDevMap = getCourseLearningMap('web-dev-101');
const pythonMap = getCourseLearningMap('python-basics');
const journey = getLearningJourney('web-dev-101', 'lesson-1');
const gp1 = journey.guidedPractice.items[0]; // structure, option 0 = known misconception
const gp2 = journey.guidedPractice.items[1]; // tag anatomy, option 0 = procedural
const ip1 = journey.independentPractice.items[0]; // semantics, option 2 = known misconception
const ip2 = journey.independentPractice.items[1]; // short text, no matching pattern for 'database'

function recordWrong(evidence, item, value, source = EVIDENCE_SOURCES.LESSON_PRACTICE) {
  return recordAttempt(evidence, {
    items: [item],
    answers: { [item.id]: value },
    source,
  }).evidence;
}

function analyze(item, value, { evidence = createEmptyEvidence(), attemptNumber = 1 } = {}) {
  return analyzeError({
    item,
    value,
    attemptNumber,
    courseMap: webDevMap,
    evidence,
  });
}

test('a first mistake names a possible pattern but keeps the evidence status insufficient', () => {
  const analysis = analyze(gp1, 0);
  assert.equal(analysis.isCorrect, false);
  assert.equal(analysis.category, ERROR_CATEGORIES.CONCEPT_MISUNDERSTANDING);
  assert.equal(analysis.categoryLabel, 'Concept misunderstanding');
  assert.equal(analysis.objectiveId, 'html-document-structure');
  assert.ok(analysis.objectiveTitle.length > 0);
  assert.equal(analysis.evidenceStatus, 'insufficient');
  assert.ok(analysis.confidence < 0.4);
  assert.match(analysis.summary, /one answer is not enough/i);
  assert.ok(analysis.feedback.length > 0);
  assert.ok(analysis.hint.length > 0);
  assert.equal(analysis.recommendation.type, 'ask_another_response');
  assert.equal(analysis.matchedPatternId, 'gp1-head-vs-body');
});

test('a blank answer is an incomplete answer, not a knowledge gap', () => {
  const analysis = analyze(gp1, null);
  assert.equal(analysis.isCorrect, false);
  assert.equal(analysis.category, ERROR_CATEGORIES.INCOMPLETE_ANSWER);
  assert.equal(analysis.evidenceStatus, 'direct');
  assert.match(analysis.summary, /blank/i);
  assert.match(analysis.summary, /not an inference/i);
  assert.equal(analysis.recommendation.type, 'complete_answer');
});

test('repeated errors on the same exercise become supported evidence and change the recommendation', () => {
  let evidence = createEmptyEvidence();
  evidence = recordWrong(evidence, gp1, 0);
  evidence = recordWrong(evidence, gp1, 0);

  const analysis = analyze(gp1, 0, { evidence, attemptNumber: 2 });
  assert.equal(analysis.category, ERROR_CATEGORIES.CONCEPT_MISUNDERSTANDING);
  assert.equal(analysis.evidenceStatus, 'supported');
  assert.equal(analysis.objectiveKnowledge.confirmedGap, true);
  assert.equal(analysis.recommendation.type, 'try_different_exercise');
  assert.match(analysis.summary, /repeated evidence|repeated/i);

  const alternative = selectAdaptiveExercise({
    courseMap: webDevMap,
    objectiveId: 'html-document-structure',
    evidence,
    excludeItemIds: [gp1.id],
  });
  assert.ok(alternative, 'a different exercise should be available');
  assert.notEqual(alternative.id, gp1.id);
  assert.equal(alternative.objectiveId, 'html-document-structure');
});

test('existing repeated evidence upgrades a brand-new first answer on the objective', () => {
  let evidence = createEmptyEvidence();
  evidence = recordWrong(evidence, gp2, 0);
  evidence = recordWrong(evidence, gp2, 0);

  // attemptNumber is 1 because this specific exercise is new, yet the shared
  // knowledge state already holds repeated incorrect evidence for the objective.
  const analysis = analyze(gp2, 0, { evidence });
  assert.equal(analysis.evidenceStatus, 'supported');
  assert.equal(analysis.recommendation.type, 'try_different_exercise');
});

test('an unmatched answer is an unknown error and asks for more evidence first', () => {
  const first = analyze(ip2, 'database');
  assert.equal(first.category, ERROR_CATEGORIES.UNKNOWN_ERROR);
  assert.equal(first.evidenceStatus, 'insufficient');
  assert.match(first.summary, /does not match a known error pattern/i);
  assert.equal(first.recommendation.type, 'ask_another_response');

  let evidence = createEmptyEvidence();
  evidence = recordWrong(evidence, ip2, 'database');
  evidence = recordWrong(evidence, ip2, 'database');
  const repeated = analyze(ip2, 'database', { evidence, attemptNumber: 2 });
  assert.equal(repeated.category, ERROR_CATEGORIES.UNKNOWN_ERROR);
  assert.equal(repeated.recommendation.type, 'try_different_exercise');
});

test('short-text patterns are matched deterministically and stay subject-configured', () => {
  const incomplete = analyze(ip2, 'HyperText Markup');
  assert.equal(incomplete.category, ERROR_CATEGORIES.INCOMPLETE_ANSWER);
  assert.equal(incomplete.matchedPatternId, 'ip2-missing-language');

  const confusing = analyze(ip2, 'hypertext hyperlink language');
  assert.equal(confusing.category, ERROR_CATEGORIES.CONCEPT_MISUNDERSTANDING);
  assert.equal(confusing.matchedPatternId, 'ip2-hyperlink-confusion');
});

test('a repeated error with repeated prerequisite difficulty becomes a prerequisite gap', () => {
  const structureItem = webDevMap.adaptiveExercises['html-document-structure'][0];
  let evidence = createEmptyEvidence();
  evidence = recordWrong(evidence, structureItem, 0);
  evidence = recordWrong(evidence, structureItem, 0);

  const analysis = analyze(ip1, 2, { evidence, attemptNumber: 2 });
  assert.equal(analysis.prerequisiteCheck.status, 'difficulty_evidence');
  assert.equal(analysis.category, ERROR_CATEGORIES.PREREQUISITE_GAP);
  assert.equal(analysis.recommendation.type, 'review_prerequisite');
  assert.equal(analysis.recommendation.objectiveId, 'html-document-structure');
  assert.equal(analysis.recommendation.lessonId, 'lesson-1');
  assert.match(analysis.summary, /inference, not a certainty/i);
});

test('one prerequisite miss is never promoted to a prerequisite gap', () => {
  const structureItem = webDevMap.adaptiveExercises['html-document-structure'][0];
  let evidence = createEmptyEvidence();
  evidence = recordWrong(evidence, structureItem, 0);

  const analysis = analyze(ip1, 2, { evidence, attemptNumber: 2 });
  assert.equal(analysis.prerequisiteCheck.status, 'partial_evidence');
  assert.notEqual(analysis.category, ERROR_CATEGORIES.PREREQUISITE_GAP);
  assert.notEqual(analysis.recommendation.type, 'review_prerequisite');
});

test('missing prerequisite evidence stays missing and is not called a gap', () => {
  const analysis = analyze(ip1, 2, { attemptNumber: 2 });
  assert.equal(analysis.prerequisiteCheck.status, 'not_assessed');
  assert.match(analysis.prerequisiteCheck.summary, /missing evidence is not a gap/i);
  assert.notEqual(analysis.category, ERROR_CATEGORIES.PREREQUISITE_GAP);
  assert.notEqual(analysis.recommendation.type, 'review_prerequisite');
});

test('demonstrated prerequisites do not produce a prerequisite recommendation', () => {
  const structureItem = webDevMap.adaptiveExercises['html-document-structure'][0];
  const anatomyItem = webDevMap.adaptiveExercises['html-tag-anatomy'][0];
  let evidence = createEmptyEvidence();
  evidence = recordAttempt(evidence, {
    items: [structureItem],
    answers: { [structureItem.id]: structureItem.correctIndex },
    source: EVIDENCE_SOURCES.LESSON_PRACTICE,
  }).evidence;
  evidence = recordAttempt(evidence, {
    items: [structureItem],
    answers: { [structureItem.id]: structureItem.correctIndex },
    source: EVIDENCE_SOURCES.LESSON_PRACTICE,
  }).evidence;
  evidence = recordAttempt(evidence, {
    items: [anatomyItem],
    answers: { [anatomyItem.id]: anatomyItem.correctIndex },
    source: EVIDENCE_SOURCES.LESSON_PRACTICE,
  }).evidence;
  evidence = recordAttempt(evidence, {
    items: [anatomyItem],
    answers: { [anatomyItem.id]: anatomyItem.correctIndex },
    source: EVIDENCE_SOURCES.LESSON_PRACTICE,
  }).evidence;

  const analysis = analyze(ip1, 2, { evidence, attemptNumber: 2 });
  assert.equal(analysis.prerequisiteCheck.status, 'demonstrated');
  assert.notEqual(analysis.recommendation.type, 'review_prerequisite');
});

test('an objective with no prerequisites never reports a prerequisite check problem', () => {
  const analysis = analyze(gp1, 0);
  assert.equal(analysis.prerequisiteCheck.checked, true);
  assert.equal(analysis.prerequisiteCheck.status, 'none');
  assert.equal(analysis.prerequisiteCheck.objectives.length, 0);
});

test('remediation records whether performance improved', () => {
  const before = analyze(gp1, 0);
  const alternative = selectAdaptiveExercise({
    courseMap: webDevMap,
    objectiveId: 'html-document-structure',
    evidence: createEmptyEvidence(),
  });

  const corrected = analyzeError({
    item: alternative,
    value: alternative.correctIndex,
    courseMap: webDevMap,
    evidence: createEmptyEvidence(),
  });
  const improved = evaluateRemediation({ before, after: corrected });
  assert.equal(improved.improved, true);
  assert.equal(improved.sameError, false);
  assert.equal(improved.beforeItemId, gp1.id);
  assert.equal(improved.afterItemId, alternative.id);
  assert.equal(improved.nextRecommendation.type, 'continue');
  assert.match(improved.note, /improved/i);

  const same = evaluateRemediation({ before, after: analyze(gp1, 0) });
  assert.equal(same.improved, false);
  assert.equal(same.sameError, true);
  assert.equal(same.nextRecommendation.type, 'try_different_exercise');

  const different = evaluateRemediation({ before, after: analyze(ip2, 'database') });
  assert.equal(different.improved, false);
  assert.equal(different.sameError, false);
  assert.equal(different.nextRecommendation.type, 'ask_another_response');
});

test('improvement metadata is preserved on the recorded attempt', () => {
  const item = webDevMap.adaptiveExercises['html-document-structure'][0];
  const result = recordAttempt(createEmptyEvidence(), {
    items: [item],
    answers: { [item.id]: item.correctIndex },
    source: EVIDENCE_SOURCES.ADAPTIVE_PRACTICE,
    metadata: { remediationFor: gp1.id, improved: true },
  });
  assert.equal(result.attempt.metadata.improved, true);
  assert.equal(result.attempt.metadata.remediationFor, gp1.id);
  assert.equal(result.evidence.attempts[0].metadata.improved, true);
});

test('adaptive exercise selection skips attempted items and respects an exclude list', () => {
  const bank = webDevMap.adaptiveExercises['html-document-structure'];
  assert.equal(bank.length, 2);
  const first = bank[0];

  let evidence = createEmptyEvidence();
  evidence = recordWrong(evidence, first, 0);
  const second = selectAdaptiveExercise({
    courseMap: webDevMap,
    objectiveId: 'html-document-structure',
    evidence,
  });
  assert.equal(second.id, bank[1].id);

  const none = selectAdaptiveExercise({
    courseMap: webDevMap,
    objectiveId: 'html-document-structure',
    evidence,
    excludeItemIds: [bank[1].id],
  });
  assert.equal(none, null);
});

test('categories are configurable per course and not every category applies everywhere', () => {
  assert.equal(webDevMap.errorCategories.includes('calculation_error'), false);
  assert.equal(pythonMap.errorCategories.includes('calculation_error'), false);

  const mathItem = {
    id: 'math-fractions-1',
    kind: 'single_choice',
    objectiveId: 'fractions',
    prompt: 'What is 1/2 + 1/4?',
    options: ['3/4', '2/6', '1/6', '3/6'],
    correctIndex: 0,
    errorPatterns: [
      {
        id: 'add-denominators',
        category: 'calculation_error',
        optionIndex: 1,
        feedback: 'Adding numerators and denominators straight across is a common slip.',
        hint: 'Rewrite both fractions with the same denominator first.',
      },
      {
        id: 'denominator-rule',
        category: 'calculation_error',
        optionIndex: 3,
        feedback: 'The denominator changed without a valid reason.',
        hint: 'Convert to quarters, then add the numerators.',
      },
    ],
  };
  const mathAdaptive = {
    id: 'math-fractions-2',
    kind: 'single_choice',
    objectiveId: 'fractions',
    prompt: 'What is 1/3 + 1/3?',
    options: ['2/3', '2/6', '1/6', '3/3'],
    correctIndex: 0,
  };
  const mathMap = {
    courseId: 'math-101',
    subject: 'Math',
    objectives: [{ id: 'fractions', title: 'Add fractions', prerequisiteIds: [] }],
    errorCategories: ['calculation_error', 'incomplete_answer', 'unknown_error'],
    adaptiveExercises: { fractions: [mathItem, mathAdaptive] },
  };

  assert.deepEqual(validateErrorContent(mathMap), []);
  const analysis = analyzeError({
    item: mathItem,
    value: 1,
    courseMap: mathMap,
    evidence: createEmptyEvidence(),
  });
  assert.equal(analysis.category, ERROR_CATEGORIES.CALCULATION_ERROR);
  assert.equal(analysis.categoryLabel, 'Calculation error');

  // The same pattern is rejected on a course that does not enable calculation errors.
  const enabled = webDevMap.errorCategories;
  const errors = validateItemErrorPatterns(mathItem, {
    enabledCategories: enabled,
    objectiveIds: new Set(['html-document-structure', 'fractions']),
  });
  assert.ok(errors.some((error) => /not enabled for this course/.test(error)));

  // A disabled category is never silently reported as a known pattern.
  const disabled = analyzeError({
    item: mathItem,
    value: 1,
    courseMap: { ...mathMap, errorCategories: ['unknown_error'] },
    evidence: createEmptyEvidence(),
  });
  assert.equal(disabled.category, ERROR_CATEGORIES.UNKNOWN_ERROR);
  assert.match(disabled.summary, /not enabled for this course/i);
});

test('content validation rejects broken error patterns and accepts the authored maps', () => {
  Object.values({ webDevMap, pythonMap }).forEach((courseMap) => {
    assert.deepEqual(validateErrorContent(courseMap), []);
  });

  const invalid = {
    courseId: 'broken',
    objectives: [{ id: 'objective-1', title: 'Objective', prerequisiteIds: [] }],
    errorCategories: [
      'concept_misunderstanding',
      'concept_misunderstanding',
      'not_a_real_category',
    ],
    adaptiveExercises: {
      'objective-1': [
        {
          id: 'broken-1',
          kind: 'single_choice',
          objectiveId: 'objective-1',
          prompt: 'Pick one',
          options: ['a', 'b'],
          correctIndex: 0,
          errorPatterns: [
            {
              id: 'bad',
              category: 'calculation_error',
              optionIndex: 9,
            },
            { id: 'bad', category: 'concept_misunderstanding', optionIndex: 1 },
          ],
        },
      ],
    },
  };
  const errors = validateErrorContent(invalid);
  assert.ok(errors.some((error) => /duplicates/.test(error)));
  assert.ok(errors.some((error) => /unknown category/.test(error)));
  assert.ok(errors.some((error) => /not enabled/.test(error)));
  assert.ok(errors.some((error) => /invalid option index/.test(error)));
  assert.ok(errors.some((error) => /duplicate pattern id/.test(error)));
});

test('every authored journey practice item with patterns passes content validation', () => {
  const objectiveIds = new Set(webDevMap.objectives.map((entry) => entry.id));
  const items = [
    ...journey.guidedPractice.items,
    ...journey.independentPractice.items,
    ...journey.assessment.items,
  ];
  items.forEach((item) => {
    assert.deepEqual(
      validateItemErrorPatterns(item, {
        enabledCategories: webDevMap.errorCategories,
        objectiveIds,
      }),
      [],
      `${item.id} should have valid error patterns`
    );
  });
});
