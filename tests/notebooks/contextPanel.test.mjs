import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTestViteServer } from '../support/viteTestServer.mjs';


let viteServer;
let NotebookContextPanel;

before(async () => {
  viteServer = await createTestViteServer();
  NotebookContextPanel = (
    await viteServer.ssrLoadModule(
      '/src/components/notebooks/NotebookContextPanel.jsx'
    )
  ).default;
});

after(async () => {
  if (viteServer) await viteServer.close();
});

const render = (props) =>
  renderToStaticMarkup(
    React.createElement(MemoryRouter, null, React.createElement(NotebookContextPanel, props))
  );

const baseNotebook = { id: 'nb_1', title: 'Physics revisions' };
const baseSources = [
  { id: 'src_1', status: 'ready' },
  { id: 'src_2', status: 'processing' },
];
const baseMaterials = [
  { id: 'mat_1', kind: 'summary' },
  { id: 'mat_2', kind: 'note' },
  { id: 'mat_3', kind: 'note' },
];

test('the context panel reports only the counts it was given', () => {
  const html = render({
    notebook: baseNotebook,
    sources: baseSources,
    materials: baseMaterials,
    learningContext: null,
    activeTab: 'study',
    headingId: 'ctx-test',
  });

  assert.match(html, /Sources ready/);
  assert.match(html, /1\/2/);
  assert.match(html, /Processing/);
  assert.match(html, /Saved study kits/);
  assert.match(html, /Saved notes/);
  // Two of the three materials are notes (kits are the remainder).
  assert.match(html, /2<\/dd>/);
  assert.match(html, /No saved learning session yet/);
});

test('the context panel states the verified learning-context facts without fabricating progress', () => {
  const html = render({
    notebook: baseNotebook,
    sources: baseSources,
    materials: [],
    learningContext: {
      answer: { content: 'Answer body' },
      practice: { question: 'What is 2 + 2?' },
      evidence: [{}, {}, {}],
      visual: { items: [{}, {}] },
      adaptive: { status: 'running' },
    },
    activeTab: 'materials',
    headingId: 'ctx-test',
  });

  assert.match(html, /saved and citation-verified/);
  assert.match(html, /verified against a source/);
  assert.match(html, /3<\/span>/);
  assert.match(html, /2<\/span>/);
  assert.match(html, /running/);
  // There is no mastery or progression claim anywhere in the panel because a
  // verified notebook context is not evidence of course mastery.
  assert.doesNotMatch(html, /mastery/);
  assert.doesNotMatch(html, /complete(d)?/i);
});

test('without a notebook or data the panel stays in a truthful empty state', () => {
  const html = render({ notebook: null, headingId: 'ctx-test' });

  assert.match(html, /Sources ready/);
  assert.match(html, /0\/0/);
  assert.match(html, /No saved learning session yet/);
});
