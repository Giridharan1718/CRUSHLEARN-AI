import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import {
  getCourseById,
  getLessonById,
  getLessonContext,
} from '../../src/content/index.mjs';
import { createTestViteServer } from '../support/viteTestServer.mjs';


let viteServer;
let ContentBlockRenderer;
let ActivityRenderer;
let StructuredLesson;

before(async () => {
  viteServer = await createTestViteServer();
  ContentBlockRenderer = (
    await viteServer.ssrLoadModule(
      '/src/components/course/ContentBlockRenderer.jsx'
    )
  ).default;
  ActivityRenderer = (
    await viteServer.ssrLoadModule('/src/components/course/ActivityRenderer.jsx')
  ).default;
  StructuredLesson = (
    await viteServer.ssrLoadModule('/src/components/course/StructuredLesson.jsx')
  ).default;
});

after(async () => {
  if (viteServer) await viteServer.close();
});

const render = (component, props) =>
  renderToStaticMarkup(React.createElement(component, props));

const renderActivity = (activity, course) =>
  render(ActivityRenderer, {
    activity,
    course,
    completed: false,
    onComplete: () => {},
  });

test('content blocks render text, video and image content', () => {
  const text = render(ContentBlockRenderer, {
    block: {
      id: 'text',
      type: 'text',
      title: 'Read this',
      paragraphs: ['A paragraph of explanation.'],
      bullets: ['A key point'],
    },
  });
  assert.match(text, /Read this/);
  assert.match(text, /A paragraph of explanation/);
  assert.match(text, /A key point/);

  const video = render(ContentBlockRenderer, {
    block: {
      id: 'video',
      type: 'video',
      title: 'Watch this',
      src: 'https://example.com/video.mp4',
      transcript: 'The transcript text.',
    },
  });
  assert.match(video, /<video/);
  assert.match(video, /https:\/\/example.com\/video.mp4/);
  assert.match(video, /The transcript text/);

  const image = render(ContentBlockRenderer, {
    block: {
      id: 'image',
      type: 'image',
      title: 'Diagram',
      src: 'https://example.com/image.png',
      alt: 'A helpful diagram',
      caption: 'Figure one',
    },
  });
  assert.match(image, /<img/);
  assert.match(image, /alt="A helpful diagram"/);
  assert.match(image, /Figure one/);
});

test('missing and unknown content blocks render a safe fallback', () => {
  const missing = render(ContentBlockRenderer, { block: null });
  assert.match(missing, /Content unavailable/);

  const unknown = render(ContentBlockRenderer, {
    block: { id: 'chart', type: 'chart', title: 'Chart' },
  });
  assert.match(unknown, /No renderer is available/);
});

test('the generic quiz, exercise and simulation activities render', () => {
  const course = getCourseById('web-dev-101');
  const lesson = getLessonById('web-dev-101', 'lesson-2');
  const quiz = lesson.activities.find((activity) => activity.type === 'quiz');
  const exercise = lesson.activities.find(
    (activity) => activity.type === 'exercise'
  );
  const simulation = lesson.activities.find(
    (activity) => activity.type === 'simulation'
  );

  const quizHtml = renderActivity(quiz, course);
  assert.match(quizHtml, /CSS selector check/);
  assert.match(quizHtml, /Submit quiz/);
  assert.match(quizHtml, /Which selector targets class/);

  const exerciseHtml = renderActivity(exercise, course);
  assert.match(exerciseHtml, /Write a declaration/);
  assert.match(exerciseHtml, /Check answer/);

  const simulationHtml = renderActivity(simulation, course);
  assert.match(simulationHtml, /Practice Simulation/);
  assert.match(simulationHtml, /Your Solution:/);
  assert.match(simulationHtml, /Create a valid CSS declaration/);
});

test('project activities render requirements and their rubric', () => {
  const course = getCourseById('web-dev-101');
  const lesson = getLessonById('web-dev-101', 'lesson-4');
  const project = lesson.activities.find(
    (activity) => activity.type === 'project'
  );

  const html = renderActivity(project, course);
  assert.match(html, /Build and self-review a portfolio page/);
  assert.match(html, /Requirements/);
  assert.match(html, /Deliverables/);
  assert.match(html, /Self-assess against the rubric/);
  assert.match(html, /Semantic structure/);
  assert.match(html, /Submit project review/);
});

test('a subject-specific activity type renders through the registry', () => {
  const course = getCourseById('python-basics');
  const lesson = getLessonById('python-basics', 'lesson-1');
  const trace = lesson.activities.find(
    (activity) => activity.type === 'python_trace'
  );

  const html = renderActivity(trace, course);
  assert.match(html, /Python output trace/);
  assert.match(html, /Trace a short Python program/);
  assert.match(html, /for number in \[1, 2, 3\]/);
  assert.match(html, /Expected output/);
  assert.match(html, /Check output/);
});

test('unknown and incomplete activities fail gracefully', () => {
  const unknown = renderActivity(
    { id: 'mystery', type: 'mystery_task', title: 'Mystery task' },
    getCourseById('web-dev-101')
  );
  assert.match(unknown, /Activity unavailable/);
  assert.match(unknown, /No renderer is registered/);

  const emptyQuiz = renderActivity(
    { id: 'empty-quiz', type: 'quiz', title: 'Empty quiz', questions: [] },
    getCourseById('web-dev-101')
  );
  assert.match(emptyQuiz, /This quiz has no questions yet/);

  const emptyProject = renderActivity(
    { id: 'empty-project', type: 'project', title: 'Empty project', rubric: [] },
    getCourseById('web-dev-101')
  );
  assert.match(emptyProject, /This project is missing its rubric/);
});

test('a structured lesson renders modules, content and every authored activity', () => {
  const context = getLessonContext('web-dev-101', 'lesson-2');
  assert.ok(context);

  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(StructuredLesson, {
        context,
        completed: false,
        onComplete: () => {},
      })
    )
  );

  assert.match(html, /Page Structure and Styling/);
  assert.match(html, /CSS Styling Basics/);
  assert.match(html, /Lesson content/);
  assert.match(html, /Selectors connect HTML and CSS/);
  assert.match(html, /Practice and assessment/);
  assert.match(html, /CSS selector check/);
  assert.match(html, /Write a declaration/);
  assert.match(html, /Create a valid CSS declaration/);
  assert.match(html, /Learning objectives/);
  assert.match(html, /Finish the required activities/);
});

test('a structured lesson can render its completed state and next link', () => {
  const context = getLessonContext('python-basics', 'lesson-1');
  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(StructuredLesson, {
        context,
        completed: true,
        onComplete: () => {},
      })
    )
  );

  assert.match(html, /Lesson complete/);
  assert.match(html, /Next: Control Flow &amp; Functions/);
  assert.match(html, /Python output trace/);
});
