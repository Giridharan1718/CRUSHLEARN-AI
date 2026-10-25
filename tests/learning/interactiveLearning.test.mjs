import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createTestViteServer } from '../support/viteTestServer.mjs';


let viteServer;
let CircuitExperience;
let InteractiveLearningPage;
let interactiveExperiences = [];

before(async () => {
  viteServer = await createTestViteServer();
  CircuitExperience = (
    await viteServer.ssrLoadModule(
      '/src/components/learning/CircuitExperience.jsx'
    )
  ).default;
  const pageModule = await viteServer.ssrLoadModule(
    '/src/pages/InteractiveLearning.jsx'
  );
  InteractiveLearningPage = pageModule.default;
  interactiveExperiences = pageModule.INTERACTIVE_EXPERIENCES ?? [];
});

after(async () => {
  await viteServer?.close();
});

test('the interactive circuit experience renders its core sections', () => {
  const html = renderToStaticMarkup(React.createElement(CircuitExperience));
  assert.match(html, /Interactive learning experience/);
  assert.match(html, /Electricity in a simple circuit/);
  assert.match(html, /Interactive circuit/);
  assert.match(html, /Prediction challenge/);
  assert.match(html, /Guided practice with hints/);
  assert.match(html, /Practical application/);
  assert.match(html, /Understanding check/);
  assert.match(html, /Suggested next activity/);
  assert.match(html, /Voltage: 6 V/);
  assert.match(html, /Resistance: 6 Ω/);
  assert.match(html, /Current: <span class="font-semibold">1\.00 A<\/span>/);
  assert.match(html, /Power: <span class="font-semibold">6\.00 W<\/span>/);
});

function renderPage(initialPath) {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: [initialPath] },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: '/interactive',
          element: React.createElement(InteractiveLearningPage),
        }),
        React.createElement(Route, {
          path: '/interactive/:experienceId',
          element: React.createElement(InteractiveLearningPage),
        })
      )
    )
  );
}

test('the experience registry exposes only fully built implementations', () => {
  assert.equal(interactiveExperiences.length, 2);

  const ids = interactiveExperiences.map((experience) => experience.id);
  assert.ok(ids.includes('simple-circuit'));
  assert.ok(ids.includes('code-trace'));

  interactiveExperiences.forEach((experience) => {
    assert.ok(experience.title.length > 0);
    assert.ok(experience.blurb.length > 0);
    assert.equal(typeof experience.Component, 'function');
  });
});

test('the interactive home lists every experience and the topic lookup', () => {
  const html = renderPage('/interactive');

  assert.match(html, /Explore concepts by doing/);
  assert.match(html, /Electricity in a simple circuit/);
  assert.match(html, /Science/);
  assert.match(html, /Tracing and debugging a small program/);
  assert.match(html, /Programming/);
  assert.match(html, /Check any topic/);
  assert.ok(html.includes('/interactive/simple-circuit'));
  assert.ok(html.includes('/interactive/code-trace'));

  // The home view must not fake availability for anything else.
  assert.doesNotMatch(html, /not built yet/);
});

test('the registry route renders the requested experience', () => {
  const html = renderPage('/interactive/code-trace');
  assert.match(html, /Tracing and debugging a small program/);
  assert.match(html, /Interactive code trace/);
  assert.match(html, /of 5 milestones complete/);
});

test('an unknown experience id falls back to an honest unavailable state', () => {
  const html = renderPage('/interactive/nonexistent-topic');
  assert.match(html, /That experience is not built yet/);
  assert.match(html, /everything currently available/);
  assert.match(html, /Browse visual learning/);
  // It must not render a fabricated experience.
  assert.doesNotMatch(html, /Interactive code trace/);
});

