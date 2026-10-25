import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server.js';
import { createTestViteServer } from '../support/viteTestServer.mjs';


let viteServer;
let ReviewDashboardView;
let ReviewSessionView;

before(async () => {
  viteServer = await createTestViteServer();
  ReviewDashboardView = (
    await viteServer.ssrLoadModule(
      '/src/components/learning/ReviewDashboardView.jsx'
    )
  ).default;
  ReviewSessionView = (
    await viteServer.ssrLoadModule(
      '/src/components/learning/ReviewSessionView.jsx'
    )
  ).default;
});

after(async () => {
  if (viteServer) await viteServer.close();
});

const activity = {
  id: 'html-visible-body',
  conceptId: 'html-visible-body',
  courseId: 'web-dev-101',
  lessonId: 'lesson-1',
  objectiveId: 'html-document-structure',
  objectiveTitle: 'Describe the three main parts of an HTML document',
  title: 'Visible content lives in <body>',
  prompt: 'Which element holds the content that is visible in the browser?',
  answer: '<body>',
  acceptedAnswers: ['<body>', 'body'],
  explanation:
    'Everything rendered in the viewport belongs inside the body element.',
  sourceItemId: 'diag-html-structure-1',
  sourceKind: 'single_choice',
  selfAssessment: true,
};

const dueItem = {
  ...activity,
  courseTitle: 'Web Development Fundamentals',
  status: 'due',
  dueAt: '2026-02-27T12:00:00.000Z',
  isNew: false,
  overdueDays: 2,
  daysUntilDue: 0,
  weakEvidence: true,
  outdated: true,
  priority: 'high',
  priorityScore: 800,
  reviewCount: 1,
  lastOutcome: 'incorrect',
  lastSelfAssessment: null,
  objectiveState: 'REVIEW_RECOMMENDED',
  evidenceSummary: '1 of 2 checks correct',
  evidenceReason: 'The latest check was incorrect, so a short review is recommended.',
};

const upcomingItem = {
  ...activity,
  id: 'css-class-selector',
  conceptId: 'css-class-selector',
  lessonId: 'lesson-2',
  objectiveId: 'css-selectors',
  objectiveTitle: 'Select elements with CSS',
  title: 'Class selectors start with a dot',
  sourceItemId: 'adaptive-css-selectors-1',
  courseTitle: 'Web Development Fundamentals',
  status: 'upcoming',
  dueAt: '2026-03-06T12:00:00.000Z',
  isNew: false,
  overdueDays: 0,
  daysUntilDue: 5,
  weakEvidence: false,
  outdated: false,
  priority: 'low',
  priorityScore: 0,
  reviewCount: 1,
  lastOutcome: 'correct',
  objectiveState: 'DEMONSTRATED',
  evidenceSummary: '2 of 2 checks correct',
};

const renderWithRouter = (element) =>
  renderToStaticMarkup(React.createElement(StaticRouter, null, element));

const renderDashboard = (props) =>
  renderWithRouter(
    React.createElement(ReviewDashboardView, {
      due: [dueItem],
      upcoming: [upcomingItem],
      summary: {
        dueCount: 1,
        upcomingCount: 1,
        highPriorityCount: 1,
        activityCount: 2,
        unavailableCount: 0,
      },
      activityCount: 2,
      ...props,
    })
  );

const renderSession = (props) =>
  renderWithRouter(
    React.createElement(ReviewSessionView, {
      activity,
      courseTitle: 'Web Development Fundamentals',
      phase: 'recall',
      answer: '',
      result: null,
      savedRecord: null,
      onAnswerChange: () => {},
      onCheck: () => {},
      onDontKnow: () => {},
      onComplete: () => {},
      ...props,
    })
  );

test('the review dashboard shows due and upcoming recall activities', () => {
  const html = renderDashboard();

  assert.match(html, /Active recall/);
  assert.match(html, /Review what you have learned/);
  assert.match(html, /Due now/);
  assert.match(html, /Visible content lives in/);
  assert.match(html, /High priority/);
  assert.match(html, /Weak evidence priority/);
  assert.match(html, /Review Recommended/);
  assert.match(html, /Upcoming/);
  assert.match(html, /Class selectors start with a dot/);
  assert.match(html, /In 5 days/);
  assert.match(html, /not proof of permanent memory/i);
});

test('the review dashboard has an honest empty state', () => {
  const html = renderDashboard({
    due: [],
    upcoming: [],
    summary: {
      dueCount: 0,
      upcomingCount: 0,
      highPriorityCount: 0,
      activityCount: 0,
      unavailableCount: 0,
    },
    activityCount: 0,
  });

  assert.match(html, /No review activities are available yet/);
  assert.match(html, /Course authors need to designate review concepts/);
});

test('the recall screen hides the explanation until the answer is checked', () => {
  const recallHtml = renderSession();
  assert.match(recallHtml, /answer from memory/i);
  assert.match(recallHtml, /Which element holds the content/);
  assert.match(recallHtml, /textarea/);
  assert.doesNotMatch(recallHtml, /Everything rendered in the viewport/);
  assert.doesNotMatch(recallHtml, /Expected answer/);

  const checkedHtml = renderSession({
    phase: 'checked',
    answer: 'body',
    result: {
      isCorrect: true,
      answered: true,
      expected: '<body>',
      explanation: activity.explanation,
    },
  });

  assert.match(checkedHtml, /Correct recall/);
  assert.match(checkedHtml, /Expected answer/);
  assert.match(checkedHtml, /Everything rendered in the viewport/);
  assert.match(checkedHtml, /How did that recall feel/);
  assert.match(checkedHtml, /Easy/);
  assert.match(checkedHtml, /Hard/);
  assert.match(checkedHtml, /not proof of permanent memory/i);
});

test('the saved review reports the next interval without claiming mastery', () => {
  const html = renderSession({
    phase: 'saved',
    answer: 'body',
    result: {
      isCorrect: true,
      answered: true,
      expected: '<body>',
      explanation: activity.explanation,
    },
    savedRecord: {
      lastOutcome: 'correct',
      intervalDays: 3,
      dueAt: '2026-03-04T12:00:00.000Z',
      lastSelfAssessment: 'easy',
    },
  });

  assert.match(html, /Review recorded/);
  assert.match(html, /Next review/);
  assert.match(html, /in 3 days/);
  assert.match(html, /Self-assessment: easy/);
  assert.match(html, /not proof that you remember this concept permanently/i);
});
