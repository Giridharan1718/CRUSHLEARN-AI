import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  analyzeLessonReadiness,
  createEmptyEvidence,
  recordAttempt,
  selectPracticeItems,
} from '../../src/learning/gapDetection.mjs';
import {
  getCourseLearningMap,
  getLessonLearningSpec,
} from '../../src/data/courseLearningMaps.mjs';
import { createTestViteServer } from '../support/viteTestServer.mjs';


const courseMap = getCourseLearningMap('web-dev-101');
const lessonSpec = getLessonLearningSpec('web-dev-101', 'lesson-2');
const spec = lessonSpec.diagnostic;

let viteServer;
let DiagnosticCheckView;

before(async () => {
  viteServer = await createTestViteServer();
  const module = await viteServer.ssrLoadModule(
    '/src/components/learning/DiagnosticCheckView.jsx'
  );
  DiagnosticCheckView = module.default;
});

after(async () => {
  if (viteServer) await viteServer.close();
});

function render(analysis, extraProps = {}) {
  return renderToStaticMarkup(
    React.createElement(DiagnosticCheckView, {
      courseId: 'web-dev-101',
      spec,
      mode: 'summary',
      collapsed: false,
      analysis,
      evidenceSummary: analysis.evidenceSummary,
      items: [],
      answers: {},
      feedback: null,
      practiceCount: 0,
      canReassess: true,
      lastAttempt: null,
      onToggle: () => {},
      onAnswer: () => {},
      onSubmit: () => {},
      onStartDiagnostic: () => {},
      onStartPractice: () => {},
      onStartReassessment: () => {},
      onShowSummary: () => {},
      ...extraProps,
    })
  );
}

function recordWrongStructureAnswers(evidence) {
  const items = spec.items.filter(
    (item) => item.objectiveId === 'html-document-structure'
  );
  const answers = {};
  items.forEach((item) => {
    answers[item.id] = (item.correctIndex + 1) % item.options.length;
  });
  return recordAttempt(evidence, {
    items,
    answers,
    source: 'diagnostic',
  }).evidence;
}

test('the no-evidence panel offers the check and says missing evidence is not a gap', () => {
  const analysis = analyzeLessonReadiness({
    courseMap,
    lessonId: 'lesson-2',
    evidence: createEmptyEvidence(),
  });
  const html = render(analysis);
  assert.match(html, /Start short check/);
  assert.match(html, /prerequisite/i);
  assert.match(html, /optional/i);
  assert.match(html, /One incorrect answer is an early signal, never a confirmed gap/i);
});

test('missing evidence is shown as Not Assessed with an explanation', () => {
  const foundationItem = spec.items.find(
    (item) => item.objectiveId === 'html-document-structure'
  );
  const evidence = recordAttempt(createEmptyEvidence(), {
    items: [foundationItem],
    answers: { [foundationItem.id]: foundationItem.correctIndex },
    source: 'diagnostic',
  }).evidence;
  const analysis = analyzeLessonReadiness({
    courseMap,
    lessonId: 'lesson-2',
    evidence,
  });
  const html = render(analysis);
  assert.match(html, /Not Assessed/);
  assert.match(html, /not assessed, which is different from having a gap/i);
  assert.match(html, /Take the short check/);
  assert.match(html, /No evidence yet for prerequisite/i);
});

test('repeated misses show a prerequisite review recommendation with a reason and lesson link', () => {
  const evidence = recordWrongStructureAnswers(createEmptyEvidence());
  const analysis = analyzeLessonReadiness({
    courseMap,
    lessonId: 'lesson-2',
    evidence,
  });
  const practiceCount = selectPracticeItems(spec, analysis.recommendations).length;
  const html = render(analysis, { practiceCount });
  assert.match(html, /Support recommended before continuing/);
  assert.match(html, /Review prerequisite/);
  assert.match(html, /Review prerequisite lesson/);
  assert.match(html, /href="\/course\/web-dev-101\/lesson\/lesson-1"/);
  assert.match(html, /no correct evidence yet/i);
  assert.match(html, /Start targeted practice/);
  assert.match(html, /How this is decided/);
});

test('practice feedback offers reassessment and explains incorrect answers', () => {
  const analysis = analyzeLessonReadiness({
    courseMap,
    lessonId: 'lesson-2',
    evidence: createEmptyEvidence(),
  });
  const items = spec.practiceItems.slice(0, 2);
  const answers = {};
  items.forEach((item, index) => {
    answers[item.id] =
      index === 0 ? item.correctIndex : (item.correctIndex + 1) % item.options.length;
  });
  const outcome = {
    results: items.map((item, index) => ({
      itemId: item.id,
      isCorrect: index === 0,
      message: index === 0 ? 'Correct!' : 'Not quite.',
    })),
    correctCount: 1,
    answeredCount: 2,
    total: 2,
  };
  const html = render(analysis, {
    mode: 'practice',
    items,
    answers,
    feedback: outcome,
  });
  assert.match(html, /Targeted practice/);
  assert.match(html, /1 of 2 answered correctly/);
  assert.match(html, /Reassess now/);
  assert.match(html, /Not quite/);
});

test('the panel can collapse without losing its summary entry point', () => {
  const analysis = analyzeLessonReadiness({
    courseMap,
    lessonId: 'lesson-2',
    evidence: createEmptyEvidence(),
  });
  const html = render(analysis, { collapsed: true });
  assert.match(html, /Readiness check available/);
  assert.match(html, /Open readiness check/);
  assert.doesNotMatch(html, /Start short check/);
});
