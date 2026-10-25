import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getLearningJourney } from '../../src/data/learningJourneys.mjs';
import { getCourseLearningMap } from '../../src/data/courseLearningMaps.mjs';
import {
  JOURNEY_STAGES,
  createInitialJourneyState,
  createJourneyReducer,
} from '../../src/learning/journeyEngine.mjs';
import {
  createEmptyEvidence,
  recordAttempt,
  EVIDENCE_SOURCES,
} from '../../src/learning/gapDetection.mjs';
import {
  analyzeError,
  evaluateRemediation,
} from '../../src/learning/errorAnalysis.mjs';
import { evaluateProgression } from '../../src/learning/mastery.mjs';
import { createTestViteServer } from '../support/viteTestServer.mjs';


const journey = getLearningJourney('web-dev-101', 'lesson-1');
const webDevMap = getCourseLearningMap('web-dev-101');

let viteServer;
let LessonJourneyView;
let ErrorCoachView;

before(async () => {
  viteServer = await createTestViteServer();
  const module = await viteServer.ssrLoadModule(
    '/src/components/learning/LessonJourneyView.jsx'
  );
  LessonJourneyView = module.default;
  const coachModule = await viteServer.ssrLoadModule(
    '/src/components/learning/ErrorCoachView.jsx'
  );
  ErrorCoachView = coachModule.default;
});

after(async () => {
  if (viteServer) await viteServer.close();
});

const renderView = (state, extraProps = {}) =>
  renderToStaticMarkup(
    React.createElement(LessonJourneyView, {
      content: journey,
      state,
      dispatch: () => {},
      ...extraProps,
    })
  );

const correctValue = (item) =>
  item.kind === 'single_choice' ? item.correctIndex : item.answer;

const wrongValue = (item) =>
  item.kind === 'single_choice'
    ? (item.correctIndex + 1) % item.options.length
    : 'definitely wrong';

const CONTINUE = { type: 'CONTINUE' };

function buildState(actions) {
  const reducer = createJourneyReducer(journey);
  let state = createInitialJourneyState(journey, {}, null);
  actions.forEach((action) => {
    state = reducer(state, action);
  });
  return state;
}

function drivePractice(reducer, state, phaseKey) {
  const items = journey[phaseKey].items;
  items.forEach(() => {
    const item = items[state[phaseKey].index];
    state = reducer(state, {
      type: 'SELECT_PRACTICE_OPTION',
      value: correctValue(item),
    });
    state = reducer(state, { type: 'SUBMIT_PRACTICE' });
    state = reducer(state, { type: 'NEXT_PRACTICE_ITEM' });
  });
  return state;
}

function reachAssessmentState() {
  const reducer = createJourneyReducer(journey);
  let state = buildState([CONTINUE, CONTINUE, CONTINUE]);
  state = drivePractice(reducer, state, 'guidedPractice');
  state = drivePractice(reducer, state, 'independentPractice');
  return { reducer, state };
}

function answerAllAssessment(reducer, state, correct) {
  journey.assessment.items.forEach((item) => {
    state = reducer(state, {
      type: 'SET_ASSESSMENT_ANSWER',
      itemId: item.id,
      value: correct ? correctValue(item) : wrongValue(item),
    });
  });
  return reducer(state, {
    type: 'SUBMIT_ASSESSMENT',
    now: '2026-01-01T00:00:00.000Z',
  });
}

test('renders the objectives stage with the objectives and a start button', () => {
  const state = createInitialJourneyState(journey, {}, null);
  const html = renderView(state);
  assert.match(html, /Learning objectives/);
  assert.match(html, /Describe the three main parts of an HTML document/);
  assert.match(html, /Start lesson/);
});

test('renders the explanation stage with its content and continue button', () => {
  const state = buildState([CONTINUE]);
  assert.equal(state.stage, JOURNEY_STAGES.EXPLANATION);
  const html = renderView(state);
  assert.match(html, /How an HTML page is put together/);
  assert.match(html, /Key points/);
  assert.match(html, /Continue to worked example/);
});

test('renders the worked example with code and a continue button', () => {
  const state = buildState([CONTINUE, CONTINUE]);
  assert.equal(state.stage, JOURNEY_STAGES.WORKED_EXAMPLE);
  const html = renderView(state);
  assert.match(html, /Build a tiny page, step by step/);
  assert.match(html, /DOCTYPE html/);
  assert.match(html, /Continue to guided practice/);
});

test('renders immediate feedback and a retry control after a wrong practice answer', () => {
  const reducer = createJourneyReducer(journey);
  let state = buildState([CONTINUE, CONTINUE, CONTINUE]);
  const item = journey.guidedPractice.items[0];
  state = reducer(state, {
    type: 'SELECT_PRACTICE_OPTION',
    value: wrongValue(item),
  });
  state = reducer(state, { type: 'SUBMIT_PRACTICE' });

  const html = renderView(state);
  assert.match(html, /Not quite yet/);
  assert.match(html, /Try again/);
  assert.match(html, /Attempts on this question: 1/);
  assert.doesNotMatch(html, /Correct answer:/);
  // The error coach is opt-in through errorSupport and stays absent otherwise.
  assert.doesNotMatch(html, /Error analysis/);
});

test('renders revealed answers after the retry is used up', () => {
  const reducer = createJourneyReducer(journey);
  let state = buildState([CONTINUE, CONTINUE, CONTINUE]);
  const item = journey.guidedPractice.items[0];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    state = reducer(state, {
      type: 'SELECT_PRACTICE_OPTION',
      value: wrongValue(item),
    });
    state = reducer(state, { type: 'SUBMIT_PRACTICE' });
    if (attempt === 0) state = reducer(state, { type: 'RETRY_PRACTICE' });
  }

  const html = renderView(state);
  assert.match(html, /Answer revealed/);
  assert.match(html, /Correct answer:/);
  assert.match(html, /Next question/);
});

test('renders assessment results with retry controls after failing', () => {
  const { reducer, state: atAssessment } = reachAssessmentState();
  const state = answerAllAssessment(reducer, atAssessment, false);

  assert.equal(state.assessment.passed, false);
  const html = renderView(state);
  assert.match(html, /Assessment results/);
  assert.match(html, /Try assessment again/);
  assert.match(html, /Review the lesson/);
  assert.match(html, /Attempt 1 of 3/);
});

test('renders the completion summary with objectives and a back button after passing', () => {
  const { reducer, state: atAssessment } = reachAssessmentState();
  let state = answerAllAssessment(reducer, atAssessment, true);
  assert.equal(state.assessment.passed, true);
  state = reducer(state, {
    type: 'COMPLETE_JOURNEY',
    now: '2026-02-02T00:00:00.000Z',
  });

  const html = renderView(state, { onBackToCourse: () => {} });
  assert.match(html, /Lesson complete: Introduction to HTML/);
  assert.match(html, /Objectives covered/);
  assert.match(html, /Best assessment score/);
  assert.match(html, /Back to course/);
});

test('a deferred mastery decision disables completion and renders its reasons', () => {
  const { reducer, state: atAssessment } = reachAssessmentState();
  const passedState = answerAllAssessment(reducer, atAssessment, true);
  const masteryDecision = evaluateProgression({
    courseMap: webDevMap,
    lessonId: 'lesson-1',
    evidence: createEmptyEvidence(),
    now: '2026-03-03T12:00:00.000Z',
    activityComplete: true,
  });

  const html = renderView(passedState, {
    masteryDecision,
    onStartRemediation: () => {},
  });
  assert.match(html, /Configurable mastery check/);
  assert.match(html, /More evidence needed/);
  assert.match(html, /Not assessed/);
  assert.match(html, /Open targeted practice/);
  assert.match(html, /Retake assessment for mastery/);
  assert.match(html, /disabled/);
  assert.match(html, /Why this decision is recorded/);
  assert.match(html, /never satisfies mastery/);
});

test('an allowed mastery decision renders its evidence-aware status', () => {
  const { reducer, state: atAssessment } = reachAssessmentState();
  const passedState = answerAllAssessment(reducer, atAssessment, true);
  const masteryDecision = evaluateProgression({
    courseMap: webDevMap,
    lessonId: 'lesson-1',
    evidence: {
      observations: [
        {
          objectiveId: 'html-document-structure',
          itemId: 'gp-1',
          isCorrect: true,
          source: 'lesson_practice',
          at: '2026-03-01T12:00:00.000Z',
        },
        {
          objectiveId: 'html-document-structure',
          itemId: 'as-1',
          isCorrect: true,
          source: 'lesson_assessment',
          at: '2026-03-01T12:00:00.000Z',
        },
        {
          objectiveId: 'html-tag-anatomy',
          itemId: 'gp-2',
          isCorrect: true,
          source: 'lesson_practice',
          at: '2026-03-01T12:00:00.000Z',
        },
        {
          objectiveId: 'html-tag-anatomy',
          itemId: 'as-2',
          isCorrect: true,
          source: 'lesson_assessment',
          at: '2026-03-01T12:00:00.000Z',
        },
        {
          objectiveId: 'html-semantics',
          itemId: 'ip-1',
          isCorrect: true,
          source: 'lesson_practice',
          at: '2026-03-01T12:00:00.000Z',
        },
        {
          objectiveId: 'html-semantics',
          itemId: 'as-3',
          isCorrect: true,
          source: 'lesson_assessment',
          at: '2026-03-01T12:00:00.000Z',
        },
      ],
      attempts: [],
    },
    now: '2026-03-03T12:00:00.000Z',
    activityComplete: true,
  });
  assert.equal(masteryDecision.allowed, true);

  const html = renderView(passedState, { masteryDecision });
  assert.match(html, /Progression allowed/);
  assert.match(html, /Demonstrated/);
  assert.match(html, /Complete lesson/);
  assert.doesNotMatch(html, /Retake assessment for mastery/);
});

// ---------------------------------------------------------------------------
// Error coach rendering
// ---------------------------------------------------------------------------

const renderCoach = (props) =>
  renderToStaticMarkup(
    React.createElement(ErrorCoachView, {
      courseId: 'web-dev-101',
      mode: 'analysis',
      activeItem: null,
      selected: null,
      result: null,
      alternativesAvailable: true,
      onTryDifferentExercise: () => {},
      onSelect: () => {},
      onSubmit: () => {},
      onBack: () => {},
      ...props,
    })
  );

test('the error coach renders a first mistake as insufficient evidence, not a verdict', () => {
  const item = journey.guidedPractice.items[0];
  const analysis = analyzeError({
    item,
    value: 0,
    courseMap: webDevMap,
    evidence: createEmptyEvidence(),
  });
  const html = renderCoach({ analysis });

  assert.match(html, /Error analysis/);
  assert.match(html, /Concept misunderstanding/);
  assert.match(html, /Insufficient evidence/);
  assert.match(html, /One answer is not enough/i);
  assert.match(html, /Objective: Describe the three main parts of an HTML document/);
  assert.match(html, /Targeted feedback/);
  assert.match(html, /Hint/);
  assert.match(html, /Try another response/);
  assert.match(html, /Try a different exercise/);
});

test('the error coach shows supported evidence and prerequisite review when the rules support it', () => {
  const item = journey.guidedPractice.items[0];
  let evidence = createEmptyEvidence();
  evidence = recordAttempt(evidence, {
    items: [item],
    answers: { [item.id]: 0 },
    source: EVIDENCE_SOURCES.LESSON_PRACTICE,
  }).evidence;
  evidence = recordAttempt(evidence, {
    items: [item],
    answers: { [item.id]: 0 },
    source: EVIDENCE_SOURCES.LESSON_PRACTICE,
  }).evidence;
  const repeated = analyzeError({
    item,
    value: 0,
    attemptNumber: 2,
    courseMap: webDevMap,
    evidence,
  });
  const repeatedHtml = renderCoach({ analysis: repeated });
  assert.match(repeatedHtml, /Supported by evidence/);
  assert.match(repeatedHtml, /Try a different exercise/);

  const semanticsItem = journey.independentPractice.items[0];
  const structureItem = webDevMap.adaptiveExercises['html-document-structure'][0];
  let prerequisiteEvidence = createEmptyEvidence();
  prerequisiteEvidence = recordAttempt(prerequisiteEvidence, {
    items: [structureItem],
    answers: { [structureItem.id]: 0 },
    source: EVIDENCE_SOURCES.LESSON_PRACTICE,
  }).evidence;
  prerequisiteEvidence = recordAttempt(prerequisiteEvidence, {
    items: [structureItem],
    answers: { [structureItem.id]: 0 },
    source: EVIDENCE_SOURCES.LESSON_PRACTICE,
  }).evidence;
  const prerequisite = analyzeError({
    item: semanticsItem,
    value: 2,
    attemptNumber: 2,
    courseMap: webDevMap,
    evidence: prerequisiteEvidence,
  });
  const prerequisiteHtml = renderCoach({ analysis: prerequisite });
  assert.match(prerequisiteHtml, /Prerequisite check/);
  assert.match(prerequisiteHtml, /Review the prerequisite/);
  assert.match(
    prerequisiteHtml,
    /\/course\/web-dev-101\/lesson\/lesson-1/
  );
});

test('journey practice feeds the shared evidence store and renders the error coach', () => {
  const reducer = createJourneyReducer(journey);
  let state = buildState([CONTINUE, CONTINUE, CONTINUE]);
  const item = journey.guidedPractice.items[0];
  state = reducer(state, {
    type: 'SELECT_PRACTICE_OPTION',
    value: 0,
  });
  state = reducer(state, { type: 'SUBMIT_PRACTICE' });

  const recorded = [];
  const html = renderView(state, {
    errorSupport: {
      courseMap: webDevMap,
      evidence: createEmptyEvidence(),
      recordEvidenceAttempt: (input) => recorded.push(input),
    },
  });

  assert.match(html, /Error analysis/);
  assert.match(html, /Concept misunderstanding/);
  assert.match(html, /Try a different exercise/);
  assert.equal(recorded.length, 0);
});

test('the error coach renders an adaptive exercise result and the performance check', () => {
  const item = journey.guidedPractice.items[0];
  const analysis = analyzeError({
    item,
    value: 0,
    courseMap: webDevMap,
    evidence: createEmptyEvidence(),
  });
  const alternative = webDevMap.adaptiveExercises['html-document-structure'][0];
  const after = analyzeError({
    item: alternative,
    value: alternative.correctIndex,
    courseMap: webDevMap,
    evidence: createEmptyEvidence(),
  });
  const improvement = evaluateRemediation({ before: analysis, after });
  const html = renderCoach({
    analysis,
    mode: 'adaptive',
    activeItem: alternative,
    selected: alternative.correctIndex,
    result: { ...after, improvement },
    alternativesAvailable: false,
  });

  assert.match(html, /Different exercise/);
  assert.match(html, /Performance check/);
  assert.match(html, /improved/i);
  assert.match(html, /Back to original feedback/);
});
