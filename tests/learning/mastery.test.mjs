import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MASTERY_CRITERIA,
  MASTERY_STATUSES,
  PROGRESSION_STATUSES,
  evaluateObjectiveMastery,
  evaluateProgression,
  resolveMasteryCriteria,
  selectRemediationItems,
  validateMasteryConfiguration,
} from '../../src/learning/mastery.mjs';
import {
  EVIDENCE_SOURCES,
  createEmptyEvidence,
  recordAttempt,
} from '../../src/learning/gapDetection.mjs';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const T0 = '2026-03-01T12:00:00.000Z';
const T1_DAY = '2026-03-02T13:00:00.000Z'; // 25 hours after T0
const NOW = '2026-03-03T12:00:00.000Z';

function criteria(overrides = {}) {
  const base = {
    ...DEFAULT_MASTERY_CRITERIA,
    requiredSources: [],
    retention: { ...DEFAULT_MASTERY_CRITERIA.retention },
  };
  return {
    ...base,
    ...overrides,
    retention: {
      ...base.retention,
      ...(overrides.retention || {}),
    },
  };
}

function choiceItem(id, objectiveId) {
  return {
    id,
    kind: 'single_choice',
    objectiveId,
    prompt: `Prompt for ${id}`,
    options: ['Correct', 'Wrong'],
    correctIndex: 0,
  };
}

function addAnswer(evidence, { itemId, objectiveId, correct, source, at }) {
  return recordAttempt(evidence, {
    items: [choiceItem(itemId, objectiveId)],
    answers: { [itemId]: correct ? 0 : 1 },
    source,
    at,
  }).evidence;
}

function makeMap({ first, second } = {}) {
  const firstCriteria = first || criteria();
  const secondCriteria = second || criteria();
  return {
    courseId: 'mastery-course',
    subject: 'Test subject',
    masteryPolicy: criteria(),
    objectives: [
      {
        id: 'obj-1',
        title: 'First objective',
        prerequisiteIds: [],
        masteryCriteria: firstCriteria,
      },
      {
        id: 'obj-2',
        title: 'Second objective',
        prerequisiteIds: ['obj-1'],
        masteryCriteria: secondCriteria,
      },
    ],
    reviewConcepts: [
      { id: 'review-obj-1', objectiveId: 'obj-1' },
      { id: 'review-obj-2', objectiveId: 'obj-2' },
    ],
    lessons: {
      'lesson-1': {
        title: 'First lesson',
        objectiveIds: ['obj-1'],
        prerequisiteObjectiveIds: [],
        diagnostic: {
          practiceItems: [
            choiceItem('practice-obj-1-a', 'obj-1'),
            choiceItem('practice-obj-1-b', 'obj-1'),
          ],
          reassessmentItems: [
            choiceItem('reassess-obj-1', 'obj-1'),
          ],
          items: [choiceItem('diagnostic-obj-1', 'obj-1')],
        },
      },
      'lesson-2': {
        title: 'Second lesson',
        objectiveIds: ['obj-2'],
        prerequisiteObjectiveIds: ['obj-1'],
        diagnostic: {
          practiceItems: [
            choiceItem('practice-obj-1-c', 'obj-1'),
            choiceItem('practice-obj-2-a', 'obj-2'),
          ],
          items: [choiceItem('diagnostic-obj-1-b', 'obj-1')],
        },
      },
    },
  };
}

function observationsFor(evidence, objectiveId) {
  return evidence.observations.filter(
    (observation) => observation.objectiveId === objectiveId
  );
}

// ---------------------------------------------------------------------------
// Criteria resolution and configuration
// ---------------------------------------------------------------------------

test('criteria resolve from defaults, course policy and objective overrides', () => {
  const resolved = resolveMasteryCriteria(
    { masteryCriteria: { minimumCorrect: 3 } },
    {
      masteryPolicy: {
        criteria: { minimumAccuracy: 0.8, accuracyWindow: 6 },
        retention: { minimumDelayHours: 48 },
      },
    }
  );
  assert.equal(resolved.minimumCorrect, 3);
  assert.equal(resolved.minimumAccuracy, 0.8);
  assert.equal(resolved.accuracyWindow, 6);
  assert.equal(resolved.retention.minimumDelayHours, 48);
  assert.equal(
    resolved.minimumDistinctItems,
    DEFAULT_MASTERY_CRITERIA.minimumDistinctItems
  );
});

test('a misconfigured single-answer criterion is clamped to two answers', () => {
  const resolved = resolveMasteryCriteria({
    masteryCriteria: { minimumCorrect: 1, minimumDistinctItems: 1 },
  });
  assert.equal(resolved.minimumCorrect, 2);
  assert.equal(resolved.minimumDistinctItems, 2);
});

test('authored configuration validation requires explicit objective criteria', () => {
  const map = makeMap();
  assert.deepEqual(validateMasteryConfiguration(map), []);

  const missing = {
    ...map,
    objectives: [{ id: 'obj-1', title: 'First objective' }],
  };
  assert.ok(
    validateMasteryConfiguration(missing).some((error) =>
      /explicit masteryCriteria/.test(error)
    )
  );

  const weak = {
    ...map,
    objectives: [
      {
        ...map.objectives[0],
        masteryCriteria: criteria({ minimumCorrect: 1 }),
      },
      map.objectives[1],
    ],
  };
  assert.ok(
    validateMasteryConfiguration(weak).some((error) =>
      /at least 2/.test(error)
    )
  );

  const requiredRetention = {
    ...map,
    reviewConcepts: [],
    objectives: [
      {
        ...map.objectives[0],
        masteryCriteria: criteria({
          retention: { required: true, minimumDelayHours: 24 },
        }),
      },
      map.objectives[1],
    ],
  };
  assert.ok(
    validateMasteryConfiguration(requiredRetention).some((error) =>
      /no review concept/.test(error)
    )
  );
});

// ---------------------------------------------------------------------------
// Objective-level decisions
// ---------------------------------------------------------------------------

test('no evidence is unassessed and never described as a gap', () => {
  const map = makeMap();
  const report = evaluateObjectiveMastery({
    objective: map.objectives[0],
    courseMap: map,
    observations: [],
    now: NOW,
  });
  assert.equal(report.status, MASTERY_STATUSES.UNASSESSED);
  assert.equal(report.criteriaMet, false);
  assert.equal(report.progressionEligible, false);
  assert.match(report.reason, /unassessed, not failed/);
});

test('a single correct answer is developing evidence, not mastery', () => {
  const map = makeMap();
  let evidence = createEmptyEvidence();
  evidence = addAnswer(evidence, {
    itemId: 'a-1',
    objectiveId: 'obj-1',
    correct: true,
    source: EVIDENCE_SOURCES.LESSON_ASSESSMENT,
    at: T0,
  });
  const report = evaluateObjectiveMastery({
    objective: map.objectives[0],
    courseMap: map,
    observations: observationsFor(evidence, 'obj-1'),
    now: NOW,
  });
  assert.equal(report.status, MASTERY_STATUSES.DEVELOPING);
  assert.equal(report.criteriaMet, false);
  assert.equal(report.correctCount, 1);
  assert.ok(
    report.coreChecks.some(
      (entry) =>
        entry.id === 'correct-evidence' &&
        !entry.passed &&
        /One correct answer is not enough/.test(entry.reason)
    )
  );
});

test('repeating one question never satisfies the different-questions criterion', () => {
  const map = makeMap();
  const singleSource = criteria({ minimumDistinctSources: 1 });
  const report = evaluateObjectiveMastery({
    objective: { ...map.objectives[0], masteryCriteria: singleSource },
    courseMap: map,
    observations: [
      { objectiveId: 'obj-1', itemId: 'same-item', isCorrect: true, source: 'practice', at: T0 },
      { objectiveId: 'obj-1', itemId: 'same-item', isCorrect: true, source: 'practice', at: T0 },
      { objectiveId: 'obj-1', itemId: 'same-item', isCorrect: true, source: 'practice', at: T0 },
    ],
    now: NOW,
  });
  assert.equal(report.evidenceState, 'DEMONSTRATED');
  assert.equal(report.status, MASTERY_STATUSES.DEVELOPING);
  const distinct = report.coreChecks.find(
    (entry) => entry.id === 'distinct-items'
  );
  assert.equal(distinct.passed, false);
  assert.equal(distinct.actual, 1);
});

test('borderline recent accuracy blocks mastery until new evidence lifts it', () => {
  const map = makeMap();
  const shortWindow = criteria({ minimumDistinctSources: 1, accuracyWindow: 5 });
  const objective = { ...map.objectives[0], masteryCriteria: shortWindow };

  let evidence = createEmptyEvidence();
  evidence = addAnswer(evidence, { itemId: 'a', objectiveId: 'obj-1', correct: false, source: 'practice', at: T0 });
  evidence = addAnswer(evidence, { itemId: 'b', objectiveId: 'obj-1', correct: false, source: 'practice', at: T0 });
  evidence = addAnswer(evidence, { itemId: 'c', objectiveId: 'obj-1', correct: true, source: 'practice', at: T0 });
  evidence = addAnswer(evidence, { itemId: 'd', objectiveId: 'obj-1', correct: true, source: 'practice', at: T0 });
  evidence = addAnswer(evidence, { itemId: 'e', objectiveId: 'obj-1', correct: true, source: 'practice', at: T0 });

  const borderline = evaluateObjectiveMastery({
    objective,
    courseMap: map,
    observations: observationsFor(evidence, 'obj-1'),
    now: NOW,
  });
  const accuracyCheck = borderline.coreChecks.find(
    (entry) => entry.id === 'recent-accuracy'
  );
  assert.equal(borderline.status, MASTERY_STATUSES.DEVELOPING);
  assert.equal(accuracyCheck.actual, 0.6);
  assert.equal(accuracyCheck.passed, false);

  evidence = addAnswer(evidence, { itemId: 'f', objectiveId: 'obj-1', correct: true, source: 'practice', at: T0 });
  const recovered = evaluateObjectiveMastery({
    objective,
    courseMap: map,
    observations: observationsFor(evidence, 'obj-1'),
    now: NOW,
  });
  assert.equal(recovered.coreChecks.find((entry) => entry.id === 'recent-accuracy').actual, 0.8);
  assert.equal(recovered.status, MASTERY_STATUSES.DEMONSTRATED);
  assert.equal(recovered.progressionEligible, true);
});

// ---------------------------------------------------------------------------
// Progression decisions
// ---------------------------------------------------------------------------

test('missing prerequisite evidence defers progression without calling it a gap', () => {
  const map = makeMap();
  let evidence = createEmptyEvidence();
  evidence = addAnswer(evidence, {
    itemId: 'obj-2-a',
    objectiveId: 'obj-2',
    correct: true,
    source: EVIDENCE_SOURCES.LESSON_ASSESSMENT,
    at: T0,
  });
  evidence = addAnswer(evidence, {
    itemId: 'obj-2-b',
    objectiveId: 'obj-2',
    correct: true,
    source: EVIDENCE_SOURCES.LESSON_PRACTICE,
    at: T0,
  });

  const decision = evaluateProgression({
    courseMap: map,
    lessonId: 'lesson-2',
    evidence,
    now: NOW,
    activityComplete: true,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.status, PROGRESSION_STATUSES.DEFERRED);
  const prerequisiteCheck = decision.checks.find(
    (entry) => entry.id === 'prerequisites'
  );
  assert.equal(prerequisiteCheck.passed, false);
  assert.match(prerequisiteCheck.reason, /no evidence yet/i);
  assert.match(prerequisiteCheck.reason, /unknown, not a gap/);
  assert.ok(decision.remediation.objectiveIds.includes('obj-1'));
  assert.deepEqual(decision.remediation.prerequisiteLessons, [
    { objectiveId: 'obj-1', lessonId: 'lesson-1' },
  ]);
});

test('successful remediation turns a deferred decision into an allowed one', () => {
  const map = makeMap({
    first: criteria({
      minimumDistinctSources: 1,
      minimumAccuracy: 0.75,
      accuracyWindow: 5,
    }),
  });
  let evidence = createEmptyEvidence();
  evidence = addAnswer(evidence, { itemId: 'miss-a', objectiveId: 'obj-1', correct: false, source: 'diagnostic', at: T0 });
  evidence = addAnswer(evidence, { itemId: 'miss-b', objectiveId: 'obj-1', correct: false, source: 'diagnostic', at: T0 });

  const deferred = evaluateProgression({
    courseMap: map,
    lessonId: 'lesson-1',
    evidence,
    now: NOW,
    activityComplete: true,
  });
  assert.equal(deferred.allowed, false);
  assert.ok(
    deferred.reasons.some((reason) => /developing/.test(reason))
  );

  evidence = addAnswer(evidence, { itemId: 'new-1', objectiveId: 'obj-1', correct: true, source: 'practice', at: T0 });
  evidence = addAnswer(evidence, { itemId: 'new-2', objectiveId: 'obj-1', correct: true, source: 'practice', at: T0 });
  const stillBorderline = evaluateProgression({
    courseMap: map,
    lessonId: 'lesson-1',
    evidence,
    now: NOW,
    activityComplete: true,
  });
  assert.equal(stillBorderline.allowed, false);

  evidence = addAnswer(evidence, { itemId: 'new-3', objectiveId: 'obj-1', correct: true, source: 'practice', at: T0 });
  evidence = addAnswer(evidence, { itemId: 'new-4', objectiveId: 'obj-1', correct: true, source: 'practice', at: T0 });
  const remediated = evaluateProgression({
    courseMap: map,
    lessonId: 'lesson-1',
    evidence,
    now: NOW,
    activityComplete: true,
  });
  assert.equal(remediated.allowed, true);
  assert.equal(remediated.status, PROGRESSION_STATUSES.ALLOWED);
  assert.match(remediated.summary, /Progression allowed/);
});

test('a required delayed retention check defers until later review evidence exists', () => {
  const map = makeMap({
    first: criteria({
      minimumDistinctSources: 1,
      retention: { required: true, minimumDelayHours: 24 },
    }),
  });
  let evidence = createEmptyEvidence();
  evidence = addAnswer(evidence, {
    itemId: 'a-1',
    objectiveId: 'obj-1',
    correct: true,
    source: 'lesson_assessment',
    at: T0,
  });
  evidence = addAnswer(evidence, {
    itemId: 'a-2',
    objectiveId: 'obj-1',
    correct: true,
    source: 'lesson_assessment',
    at: T0,
  });

  const deferred = evaluateProgression({
    courseMap: map,
    lessonId: 'lesson-1',
    evidence,
    now: NOW,
    activityComplete: true,
  });
  const report = deferred.objectives[0];
  assert.equal(report.status, MASTERY_STATUSES.DEMONSTRATED);
  assert.equal(report.criteriaMet, true);
  assert.equal(report.retention.required, true);
  assert.equal(report.retention.met, false);
  assert.equal(deferred.allowed, false);
  assert.match(
    deferred.reasons.join(' '),
    /waiting for a delayed retention check/
  );

  evidence = addAnswer(evidence, {
    itemId: 'review-1',
    objectiveId: 'obj-1',
    correct: true,
    source: EVIDENCE_SOURCES.REVIEW,
    at: T1_DAY,
  });
  const retained = evaluateProgression({
    courseMap: map,
    lessonId: 'lesson-1',
    evidence,
    now: NOW,
    activityComplete: true,
  });
  assert.equal(retained.objectives[0].status, MASTERY_STATUSES.RETAINED);
  assert.equal(retained.objectives[0].retention.met, true);
  assert.equal(retained.allowed, true);
  assert.equal(retained.status, PROGRESSION_STATUSES.ALLOWED);
});

test('optional retention is reported as pending without blocking progression', () => {
  const map = makeMap({ first: criteria({ minimumDistinctSources: 1 }) });
  let evidence = createEmptyEvidence();
  evidence = addAnswer(evidence, {
    itemId: 'a-1',
    objectiveId: 'obj-1',
    correct: true,
    source: 'lesson_assessment',
    at: T0,
  });
  evidence = addAnswer(evidence, {
    itemId: 'a-2',
    objectiveId: 'obj-1',
    correct: true,
    source: 'lesson_assessment',
    at: T0,
  });

  const decision = evaluateProgression({
    courseMap: map,
    lessonId: 'lesson-1',
    evidence,
    now: NOW,
    activityComplete: true,
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.objectives[0].status, MASTERY_STATUSES.DEMONSTRATED);
  assert.deepEqual(decision.retention.pendingObjectiveIds, ['obj-1']);
  assert.equal(decision.retention.nextEligibleAt, '2026-03-02T12:00:00.000Z');
  assert.match(decision.objectives[0].reason, /delayed retention check is still pending/);
});

test('an incomplete journey activity defers progression even when criteria are met', () => {
  const map = makeMap({ first: criteria({ minimumDistinctSources: 1 }) });
  let evidence = createEmptyEvidence();
  evidence = addAnswer(evidence, {
    itemId: 'a-1',
    objectiveId: 'obj-1',
    correct: true,
    source: 'lesson_assessment',
    at: T0,
  });
  evidence = addAnswer(evidence, {
    itemId: 'a-2',
    objectiveId: 'obj-1',
    correct: true,
    source: 'lesson_assessment',
    at: T0,
  });

  const decision = evaluateProgression({
    courseMap: map,
    lessonId: 'lesson-1',
    evidence,
    now: NOW,
    activityComplete: false,
  });
  assert.equal(decision.allowed, false);
  const activityCheck = decision.checks.find(
    (entry) => entry.id === 'activity-complete'
  );
  assert.equal(activityCheck.passed, false);
  assert.match(activityCheck.reason, /Guided practice/);
});

test('the decision records positive and negative reasons, not just a boolean', () => {
  const map = makeMap({ first: criteria({ minimumDistinctSources: 1 }) });
  let evidence = createEmptyEvidence();
  evidence = addAnswer(evidence, {
    itemId: 'a-1',
    objectiveId: 'obj-1',
    correct: true,
    source: 'lesson_assessment',
    at: T0,
  });
  const deferred = evaluateProgression({
    courseMap: map,
    lessonId: 'lesson-1',
    evidence,
    now: NOW,
    activityComplete: true,
  });
  assert.equal(deferred.allowed, false);
  assert.ok(deferred.reasons.length >= 1);
  assert.ok(deferred.checks.some((entry) => entry.passed === false));
  assert.equal(deferred.summary.includes('Progression deferred'), true);
  assert.equal(typeof deferred.decisionId, 'string');
  assert.equal(deferred.version, 1);
});

// ---------------------------------------------------------------------------
// Remediation selection
// ---------------------------------------------------------------------------

test('a missing required assessment source recommends a retake, not more practice', () => {
  const map = makeMap({
    first: criteria({
      minimumDistinctSources: 1,
      requiredSources: ['lesson_assessment'],
    }),
  });
  let evidence = createEmptyEvidence();
  evidence = addAnswer(evidence, {
    itemId: 'practice-a',
    objectiveId: 'obj-1',
    correct: true,
    source: 'practice',
    at: T0,
  });
  evidence = addAnswer(evidence, {
    itemId: 'practice-b',
    objectiveId: 'obj-1',
    correct: true,
    source: 'practice',
    at: T0,
  });

  const decision = evaluateProgression({
    courseMap: map,
    lessonId: 'lesson-1',
    evidence,
    now: NOW,
    activityComplete: true,
  });
  assert.equal(decision.allowed, false);
  assert.deepEqual(decision.remediation.practiceObjectiveIds, []);
  assert.deepEqual(decision.remediation.practiceItemIds, []);
  assert.deepEqual(decision.remediation.assessmentRetakeObjectiveIds, [
    'obj-1',
  ]);
  assert.equal(decision.remediation.requiresAssessmentRetake, true);
  assert.match(
    decision.reasons.join(' '),
    /required lesson_assessment source/
  );
});

test('remediation selection picks new questions for blocked objectives', () => {
  const map = makeMap();
  const items = selectRemediationItems({
    courseMap: map,
    lessonId: 'lesson-2',
    objectiveIds: ['obj-1'],
    excludeItemIds: ['practice-obj-1-c'],
    maxItems: 3,
  });
  assert.ok(items.length > 0);
  assert.ok(items.every((item) => item.objectiveId === 'obj-1'));
  assert.equal(items.some((item) => item.id === 'practice-obj-1-c'), false);
  assert.equal(items.some((item) => item.id === 'practice-obj-2-a'), false);
});

test('remediation selection does nothing without blocked objectives', () => {
  const map = makeMap();
  assert.deepEqual(
    selectRemediationItems({
      courseMap: map,
      lessonId: 'lesson-2',
      objectiveIds: [],
    }),
    []
  );
});
