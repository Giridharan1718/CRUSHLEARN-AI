import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVIDENCE_SOURCES,
  READINESS_STATES,
  RECOMMENDATION_TYPES,
  analyzeLessonReadiness,
  classifyObjectiveEvidence,
  createEmptyEvidence,
  evaluateAnswers,
  getReassessmentItems,
  recordAttempt,
  selectPracticeItems,
  summarizeEvidence,
  validateLearningMap,
} from '../../src/learning/gapDetection.mjs';
import { ASSESSMENT_STATES } from '../../src/utils/evidenceClassification.mjs';

const choice = (id, objectiveId, correctIndex = 0) => ({
  id,
  kind: 'single_choice',
  objectiveId,
  prompt: `Prompt for ${id}`,
  options: ['Correct', 'Wrong', 'Also wrong'],
  correctIndex,
});

const legacyMap = {
  courseId: 'test-course',
  subject: 'Test subject',
  objectives: [
    { id: 'foundation', title: 'Foundation skill', prerequisiteIds: [] },
    {
      id: 'second-foundation',
      title: 'Second foundation skill',
      prerequisiteIds: ['foundation'],
    },
    {
      id: 'target',
      title: 'Target skill',
      prerequisiteIds: ['foundation'],
    },
  ],
  lessons: {
    'lesson-1': {
      objectiveIds: ['foundation'],
      prerequisiteObjectiveIds: [],
      diagnostic: {
        title: 'Foundation check',
        items: [choice('l1-check', 'foundation')],
        practiceItems: [choice('l1-practice', 'foundation')],
        reassessmentItems: [choice('l1-reassess', 'foundation')],
      },
    },
    'lesson-2': {
      objectiveIds: ['target'],
      prerequisiteObjectiveIds: ['foundation', 'second-foundation'],
      diagnostic: {
        title: 'Readiness check',
        items: [
          choice('l2-foundation', 'foundation'),
          choice('l2-second-foundation', 'second-foundation'),
        ],
        practiceItems: [
          choice('l2-practice-foundation', 'foundation'),
          choice('l2-practice-second', 'second-foundation'),
        ],
        reassessmentItems: [
          choice('l2-reassess-foundation', 'foundation'),
          choice('l2-reassess-second', 'second-foundation'),
        ],
      },
    },
    'lesson-no-diagnostic': {
      objectiveIds: ['foundation'],
      prerequisiteObjectiveIds: [],
      diagnostic: null,
    },
  },
};

function recordSequence(evidence, objectiveId, results, source = 'diagnostic') {
  let current = evidence;
  results.forEach((isCorrect, index) => {
    const item = choice(
      `seq-${objectiveId}-${current.attempts.length}-${index}`,
      objectiveId
    );
    current = recordAttempt(current, {
      items: [item],
      answers: {
        [item.id]: isCorrect ? item.correctIndex : item.correctIndex + 1,
      },
      source,
      at: `2026-01-01T00:00:0${current.attempts.length}.000Z`,
    }).evidence;
  });
  return current;
}

function observationsFor(objectiveId, results) {
  return results.map((isCorrect, index) => ({
    objectiveId,
    itemId: `${objectiveId}-${index}`,
    isCorrect,
  }));
}

test('a new learner is NOT_ASSESSED, not diagnosed with a gap', () => {
  const result = classifyObjectiveEvidence([], {
    objectiveId: 'foundation',
    title: 'Foundation skill',
  });
  assert.equal(result.state, ASSESSMENT_STATES.NOT_ASSESSED);
  assert.equal(result.rule, 'no-evidence');
  assert.equal(result.confirmedGap, false);
  assert.equal(result.evidenceCount, 0);
  assert.match(result.reason, /not assessed/i);
  assert.match(result.reason, /different from having a gap/i);
});

test('one incorrect answer is a single-miss signal, never a confirmed gap', () => {
  const result = classifyObjectiveEvidence(observationsFor('foundation', [false]), {
    objectiveId: 'foundation',
    title: 'Foundation skill',
  });
  assert.equal(result.state, ASSESSMENT_STATES.NEEDS_PRACTICE);
  assert.equal(result.rule, 'single-miss');
  assert.equal(result.confirmedGap, false);
  assert.equal(result.confidenceLabel, 'low');
  assert.match(result.reason, /not enough to diagnose a gap/i);
});

test('repeated misses with no correct evidence confirm difficulty', () => {
  const result = classifyObjectiveEvidence(
    observationsFor('foundation', [false, false]),
    { objectiveId: 'foundation', title: 'Foundation skill', isPrerequisite: true }
  );
  assert.equal(result.state, ASSESSMENT_STATES.NEEDS_PRACTICE);
  assert.equal(result.rule, 'persistent-miss');
  assert.equal(result.confirmedGap, true);
  assert.equal(result.incorrectCount, 2);
  assert.match(result.reason, /repeated evidence of difficulty/i);
});

test('one correct answer is developing evidence, not yet demonstrated', () => {
  const result = classifyObjectiveEvidence(observationsFor('foundation', [true]), {
    objectiveId: 'foundation',
    title: 'Foundation skill',
  });
  assert.equal(result.state, ASSESSMENT_STATES.DEVELOPING);
  assert.equal(result.confirmedGap, false);
  assert.match(result.reason, /not yet enough repeated success/i);
});

test('two recent correct answers demonstrate an objective', () => {
  const result = classifyObjectiveEvidence(
    observationsFor('foundation', [true, true]),
    { objectiveId: 'foundation', title: 'Foundation skill' }
  );
  assert.equal(result.state, ASSESSMENT_STATES.DEMONSTRATED);
  assert.equal(result.rule, 'repeated-success');
  assert.equal(result.recentStreak, 2);
});

test('improved performance moves evidence from difficulty to demonstrated', () => {
  const result = classifyObjectiveEvidence(
    observationsFor('foundation', [false, false, true, true]),
    { objectiveId: 'foundation', title: 'Foundation skill' }
  );
  assert.equal(result.state, ASSESSMENT_STATES.DEMONSTRATED);
  assert.equal(result.confirmedGap, false);
  assert.equal(result.incorrectCount, 2);
  assert.equal(result.correctCount, 2);
});

test('an incorrect, correct, incorrect pattern still needs practice', () => {
  const result = classifyObjectiveEvidence(
    observationsFor('foundation', [false, true, false]),
    { objectiveId: 'foundation', title: 'Foundation skill' }
  );
  assert.equal(result.state, ASSESSMENT_STATES.NEEDS_PRACTICE);
  assert.equal(result.confirmedGap, false);
});

test('a regression after demonstrated evidence becomes REVIEW_RECOMMENDED', () => {
  const result = classifyObjectiveEvidence(
    observationsFor('foundation', [true, true, false]),
    { objectiveId: 'foundation', title: 'Foundation skill' }
  );
  assert.equal(result.state, ASSESSMENT_STATES.REVIEW_RECOMMENDED);
  assert.equal(result.rule, 'regression');
  assert.equal(result.confirmedGap, false);
  assert.match(result.reason, /most recent check was incorrect/i);
});

test('a lesson with no prerequisites is ready and never blocked by prerequisite review', () => {
  const analysis = analyzeLessonReadiness({
    courseMap: legacyMap,
    lessonId: 'lesson-1',
    evidence: createEmptyEvidence(),
  });
  assert.equal(analysis.hasPrerequisites, false);
  assert.equal(analysis.readiness, READINESS_STATES.READY);
  assert.equal(analysis.ready, true);
  assert.deepEqual(analysis.prerequisiteResults, []);
  assert.equal(
    analysis.recommendations.some(
      (entry) => entry.type === RECOMMENDATION_TYPES.REVIEW_PREREQUISITE
    ),
    false
  );
  assert.equal(analysis.recommendations[0].type, RECOMMENDATION_TYPES.TAKE_DIAGNOSTIC);
  assert.equal(analysis.recommendations[0].priority, 'low');
});

test('no evidence on prerequisites recommends a check, not a gap', () => {
  const analysis = analyzeLessonReadiness({
    courseMap: legacyMap,
    lessonId: 'lesson-2',
    evidence: createEmptyEvidence(),
  });
  assert.equal(analysis.hasPrerequisites, true);
  assert.equal(analysis.readiness, READINESS_STATES.UNKNOWN);
  assert.equal(analysis.ready, false);
  assert.equal(analysis.hasConfirmedGap, false);
  assert.equal(analysis.prerequisiteResults.length, 2);
  assert.ok(
    analysis.prerequisiteResults.every(
      (result) => result.state === ASSESSMENT_STATES.NOT_ASSESSED
    )
  );
  const checkRecommendations = analysis.recommendations.filter(
    (entry) => entry.type === RECOMMENDATION_TYPES.TAKE_DIAGNOSTIC
  );
  assert.equal(checkRecommendations.length, 2);
  checkRecommendations.forEach((entry) => {
    assert.match(entry.reason, /no evidence yet/i);
    assert.match(entry.reason, /not a gap/i);
  });
  assert.equal(
    analysis.recommendations.some(
      (entry) => entry.type === RECOMMENDATION_TYPES.REVIEW_PREREQUISITE
    ),
    false
  );
});

test('one miss on a prerequisite recommends practice, not prerequisite review', () => {
  const evidence = recordSequence(createEmptyEvidence(), 'foundation', [false]);
  const analysis = analyzeLessonReadiness({
    courseMap: legacyMap,
    lessonId: 'lesson-2',
    evidence,
  });
  const foundation = analysis.prerequisiteResults.find(
    (result) => result.objectiveId === 'foundation'
  );
  assert.equal(foundation.state, ASSESSMENT_STATES.NEEDS_PRACTICE);
  assert.equal(foundation.confirmedGap, false);

  const recommendation = analysis.recommendations.find(
    (entry) => entry.objectiveId === 'foundation'
  );
  assert.equal(recommendation.type, RECOMMENDATION_TYPES.TARGETED_PRACTICE);
  assert.equal(recommendation.priority, 'medium');
  assert.match(recommendation.reason, /not enough to diagnose a gap/i);
  assert.equal(
    analysis.recommendations.some(
      (entry) =>
        entry.type === RECOMMENDATION_TYPES.REVIEW_PREREQUISITE &&
        entry.objectiveId === 'foundation'
    ),
    false
  );
});

test('repeated misses on prerequisites recommend prerequisite review with reasons', () => {
  let evidence = recordSequence(createEmptyEvidence(), 'foundation', [false, false]);
  evidence = recordSequence(evidence, 'second-foundation', [false, false]);
  const analysis = analyzeLessonReadiness({
    courseMap: legacyMap,
    lessonId: 'lesson-2',
    evidence,
  });

  assert.equal(analysis.readiness, READINESS_STATES.NEEDS_SUPPORT);
  assert.equal(analysis.hasConfirmedGap, true);
  assert.equal(analysis.prerequisiteResults.length, 2);
  assert.ok(
    analysis.prerequisiteResults.every((result) => result.confirmedGap)
  );

  const reviews = analysis.recommendations.filter(
    (entry) => entry.type === RECOMMENDATION_TYPES.REVIEW_PREREQUISITE
  );
  assert.equal(reviews.length, 2);
  assert.equal(analysis.recommendations[0].priority, 'high');
  reviews.forEach((entry) => {
    assert.ok(entry.reason.length > 0);
    assert.match(entry.reason, /prerequisite/i);
    assert.match(entry.reason, /no correct evidence/i);
    assert.ok(entry.evidenceSummary.length > 0);
  });
});

test('practice and reassessment evidence can remove a confirmed prerequisite gap', () => {
  let evidence = recordSequence(createEmptyEvidence(), 'foundation', [false, false]);
  evidence = recordSequence(evidence, 'second-foundation', [false, false]);
  evidence = recordSequence(evidence, 'foundation', [true, true, true], 'practice');
  evidence = recordSequence(evidence, 'second-foundation', [true, true], 'reassessment');

  const analysis = analyzeLessonReadiness({
    courseMap: legacyMap,
    lessonId: 'lesson-2',
    evidence,
  });

  assert.equal(analysis.hasConfirmedGap, false);
  assert.equal(analysis.readiness, READINESS_STATES.READY);
  assert.ok(
    analysis.prerequisiteResults.every(
      (result) => result.state === ASSESSMENT_STATES.DEMONSTRATED
    )
  );
  assert.equal(
    analysis.recommendations.some(
      (entry) => entry.type === RECOMMENDATION_TYPES.REVIEW_PREREQUISITE
    ),
    false
  );
  assert.equal(analysis.recommendations[0].type, RECOMMENDATION_TYPES.CONTINUE_LESSON);
});

test('missing evidence for one prerequisite does not label it as a gap', () => {
  let evidence = recordAttempt(createEmptyEvidence(), {
    items: [choice('only-foundation', 'foundation')],
    answers: { 'only-foundation': 0 },
    source: EVIDENCE_SOURCES.DIAGNOSTIC,
  }).evidence;
  const analysis = analyzeLessonReadiness({
    courseMap: legacyMap,
    lessonId: 'lesson-2',
    evidence,
  });

  const second = analysis.prerequisiteResults.find(
    (result) => result.objectiveId === 'second-foundation'
  );
  assert.equal(second.state, ASSESSMENT_STATES.NOT_ASSESSED);
  assert.equal(second.confirmedGap, false);
  const recommendation = analysis.recommendations.find(
    (entry) => entry.objectiveId === 'second-foundation'
  );
  assert.equal(recommendation.type, RECOMMENDATION_TYPES.TAKE_DIAGNOSTIC);
  assert.match(recommendation.reason, /not a gap/i);
  assert.equal(
    analysis.prerequisiteResults.find(
      (result) => result.objectiveId === 'foundation'
    ).state,
    ASSESSMENT_STATES.DEVELOPING
  );
});

test('unanswered diagnostic questions create no evidence and stay unassessed', () => {
  const items = [
    choice('answered', 'foundation'),
    choice('unanswered', 'second-foundation'),
  ];
  const evidence = recordAttempt(createEmptyEvidence(), {
    items,
    answers: { answered: 0 },
    source: EVIDENCE_SOURCES.DIAGNOSTIC,
  });

  assert.equal(evidence.evidence.observations.length, 1);
  assert.equal(evidence.evidence.observations[0].objectiveId, 'foundation');
  assert.equal(evidence.attempt.answered, 1);
  assert.equal(evidence.attempt.total, 2);

  const analysis = analyzeLessonReadiness({
    courseMap: legacyMap,
    lessonId: 'lesson-2',
    evidence: evidence.evidence,
  });
  const unanswered = analysis.prerequisiteResults.find(
    (result) => result.objectiveId === 'second-foundation'
  );
  assert.equal(unanswered.state, ASSESSMENT_STATES.NOT_ASSESSED);
  assert.equal(unanswered.evidenceCount, 0);
});

test('recording attempts preserves source counts and short-text evaluation', () => {
  let evidence = createEmptyEvidence();
  const first = recordAttempt(evidence, {
    items: [choice('choice-item', 'foundation')],
    answers: { 'choice-item': 0 },
    source: EVIDENCE_SOURCES.DIAGNOSTIC,
    at: '2026-01-01T00:00:00.000Z',
  });
  evidence = first.evidence;

  const shortTextItem = {
    id: 'short-item',
    kind: 'short_text',
    objectiveId: 'second-foundation',
    prompt: 'Explain the prerequisite.',
    answer: 'Because it comes first',
  };
  const second = recordAttempt(evidence, {
    items: [shortTextItem],
    answers: { 'short-item': ' because it comes first ' },
    source: EVIDENCE_SOURCES.REASSESSMENT,
    at: '2026-01-01T00:01:00.000Z',
  });

  assert.equal(second.outcome.results[0].isCorrect, true);
  const summary = summarizeEvidence(second.evidence);
  assert.equal(summary.attempts, 2);
  assert.equal(summary.observations, 2);
  assert.equal(summary.bySource[EVIDENCE_SOURCES.DIAGNOSTIC], 1);
  assert.equal(summary.bySource[EVIDENCE_SOURCES.REASSESSMENT], 1);
  assert.equal(summary.attemptsBySource[EVIDENCE_SOURCES.DIAGNOSTIC], 1);
});

test('evaluateAnswers reports unanswered items without scoring them as evidence', () => {
  const outcome = evaluateAnswers(
    [choice('one', 'foundation'), choice('two', 'second-foundation')],
    { one: 1 }
  );
  assert.equal(outcome.total, 2);
  assert.equal(outcome.answeredCount, 1);
  assert.equal(outcome.correctCount, 0);
  assert.equal(outcome.observations.length, 1);
  assert.equal(outcome.observations[0].isCorrect, false);
});

test('targeted practice selects only recommended objective items and respects the limit', () => {
  const analysis = analyzeLessonReadiness({
    courseMap: legacyMap,
    lessonId: 'lesson-2',
    evidence: recordSequence(createEmptyEvidence(), 'foundation', [false]),
  });
  const items = selectPracticeItems(
    legacyMap.lessons['lesson-2'].diagnostic,
    analysis.recommendations,
    { maxItems: 1 }
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].objectiveId, 'foundation');
});

test('reassessment falls back to diagnostic items when no bank is authored', () => {
  const spec = {
    items: [choice('only', 'foundation')],
  };
  assert.deepEqual(getReassessmentItems(spec), spec.items);
  assert.equal(getReassessmentItems(null).length, 0);
});

test('the engine is subject-agnostic', () => {
  const mathMap = {
    courseId: 'math-foundations',
    subject: 'Mathematics',
    objectives: [
      { id: 'fractions', title: 'Compare fractions', prerequisiteIds: [] },
      { id: 'equations', title: 'Solve one-step equations', prerequisiteIds: ['fractions'] },
    ],
    lessons: {
      'lesson-1': {
        objectiveIds: ['fractions'],
        prerequisiteObjectiveIds: [],
        diagnostic: {
          items: [choice('fractions-check', 'fractions')],
          practiceItems: [choice('fractions-practice', 'fractions')],
          reassessmentItems: [choice('fractions-reassess', 'fractions')],
        },
      },
      'lesson-2': {
        objectiveIds: ['equations'],
        prerequisiteObjectiveIds: ['fractions'],
        diagnostic: {
          items: [choice('equations-check', 'fractions')],
          practiceItems: [choice('equations-practice', 'fractions')],
          reassessmentItems: [choice('equations-reassess', 'fractions')],
        },
      },
    },
  };

  assert.deepEqual(validateLearningMap(mathMap), []);
  const analysis = analyzeLessonReadiness({
    courseMap: mathMap,
    lessonId: 'lesson-2',
    evidence: recordSequence(createEmptyEvidence(), 'fractions', [false, false]),
  });
  assert.equal(analysis.readiness, READINESS_STATES.NEEDS_SUPPORT);
  assert.equal(
    analysis.recommendations[0].type,
    RECOMMENDATION_TYPES.REVIEW_PREREQUISITE
  );
  assert.match(analysis.recommendations[0].reason, /fractions/i);
});

test('content validation rejects broken learning maps', () => {
  assert.deepEqual(validateLearningMap(legacyMap), []);

  const duplicate = {
    ...legacyMap,
    objectives: [...legacyMap.objectives, { id: 'foundation', title: 'Duplicate' }],
  };
  assert.ok(validateLearningMap(duplicate).some((error) => /duplicate objective/i.test(error)));

  const unknownPrerequisite = {
    ...legacyMap,
    objectives: [
      { id: 'foundation', title: 'Foundation', prerequisiteIds: ['missing'] },
    ],
  };
  assert.ok(
    validateLearningMap(unknownPrerequisite).some((error) =>
      /unknown prerequisite/i.test(error)
    )
  );

  const cycle = {
    ...legacyMap,
    objectives: [
      { id: 'a', title: 'A', prerequisiteIds: ['b'] },
      { id: 'b', title: 'B', prerequisiteIds: ['a'] },
    ],
    lessons: {
      'lesson-1': { objectiveIds: ['a'], prerequisiteObjectiveIds: [] },
    },
  };
  assert.ok(validateLearningMap(cycle).some((error) => /cycle/i.test(error)));

  const brokenItem = {
    ...legacyMap,
    lessons: {
      'lesson-1': {
        objectiveIds: ['foundation'],
        prerequisiteObjectiveIds: [],
        diagnostic: {
          items: [
            {
              id: 'broken',
              kind: 'single_choice',
              objectiveId: 'not-an-objective',
              prompt: 'Broken?',
              options: ['One'],
              correctIndex: 9,
            },
          ],
        },
      },
    },
  };
  const errors = validateLearningMap(brokenItem);
  assert.ok(errors.some((error) => /unknown objectiveId/i.test(error)));
  assert.ok(errors.some((error) => /at least two options/i.test(error)));
  assert.ok(errors.some((error) => /valid correctIndex/i.test(error)));
});

test('analyzing an unknown lesson fails loudly instead of inventing evidence', () => {
  assert.throws(
    () =>
      analyzeLessonReadiness({
        courseMap: legacyMap,
        lessonId: 'not-a-lesson',
        evidence: createEmptyEvidence(),
      }),
    /No learning map for lesson/
  );
});
