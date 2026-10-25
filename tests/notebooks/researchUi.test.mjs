import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createTestViteServer } from '../support/viteTestServer.mjs';

let viteServer;
let PanelState;
let ResearchToolsPanel;
let NotebookContextPanel;
let StudyMaterialsPanel;
let Sidebar;

before(async () => {
  viteServer = await createTestViteServer();
  PanelState = (
    await viteServer.ssrLoadModule('/src/components/ui/PanelState.jsx')
  ).default;
  ResearchToolsPanel = (
    await viteServer.ssrLoadModule(
      '/src/components/notebooks/ResearchToolsPanel.jsx'
    )
  ).default;
  NotebookContextPanel = (
    await viteServer.ssrLoadModule(
      '/src/components/notebooks/NotebookContextPanel.jsx'
    )
  ).default;
  StudyMaterialsPanel = (
    await viteServer.ssrLoadModule(
      '/src/components/notebooks/StudyMaterialsPanel.jsx'
    )
  ).default;
  Sidebar = (
    await viteServer.ssrLoadModule('/src/components/Sidebar.jsx')
  ).default;
});

after(async () => {
  if (viteServer) await viteServer.close();
});

const render = (component, props, children = null) =>
  renderToStaticMarkup(React.createElement(component, props, children));

const renderInRouter = (component, props) =>
  renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(component, props)
    )
  );

test('panel states are announced and errors use alert semantics', () => {
  const error = render(
    PanelState,
    { tone: 'error', title: 'Search failed' },
    'The stored source could not be read.'
  );
  assert.match(error, /role="alert"/);
  assert.match(error, /Search failed/);
  assert.match(error, /could not be read/);

  const empty = render(
    PanelState,
    { tone: 'empty', title: 'Nothing found' },
    'Try another term.'
  );
  assert.match(empty, /role="status"/);
  assert.match(empty, /aria-live="polite"/);
});

test('research tools are collapsed by default and state what they cannot do', () => {
  const html = render(ResearchToolsPanel, {
    sources: [
      { id: 's1', title: 'One', status: 'ready', hasExtractedText: true },
      { id: 's2', title: 'Two', status: 'ready', hasExtractedText: true },
    ],
    sourceContents: {},
    gatewayStatus: null,
  });

  assert.match(html, /Research tools/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /Advanced:/);
  assert.match(html, /Collapsed by default/);
  assert.doesNotMatch(html, /Research question/);
});

test('the opened research panel reports the provider state and every action', () => {
  const html = render(ResearchToolsPanel, {
    sources: [
      { id: 's1', title: 'One', status: 'ready', hasExtractedText: true },
      { id: 's2', title: 'Two', status: 'ready', hasExtractedText: true },
    ],
    sourceContents: {},
    gatewayStatus: null,
    defaultOpen: true,
  });

  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /Research question/);
  assert.match(html, /No external literature search is performed/);
  assert.match(html, /Analyze sources/);
  assert.match(html, /Explore topic/);
  assert.match(html, /Compare positions/);
  assert.match(html, /Compare findings/);
  assert.match(html, /Find explicit conflicts/);
  assert.match(html, /Add provider claims/);
  assert.match(html, /gateway not available/);
  assert.match(html, /Nothing run yet/);
  assert.match(html, /Local tools work without it/);
});

test('the context panel exposes sources, notes, rule-based concepts and materials', () => {
  const text =
    'Chlorophyll absorbs light energy during photosynthesis. It reflects green light.';
  const html = renderInRouter(NotebookContextPanel, {
    notebook: { id: 'nb-1', title: 'Biology' },
    sources: [
      {
        id: 'source-1',
        title: 'Biology notes',
        status: 'ready',
        hasExtractedText: true,
      },
    ],
    sourceContents: {
      'source-1': { text, pageOffsets: [] },
    },
    materials: [
      {
        id: 'note-1',
        title: 'My own note',
        kind: 'note',
        generator: 'authored',
        createdAt: '2026-10-24T10:00:00.000Z',
      },
      {
        id: 'material-1',
        title: 'Model-assisted summary',
        kind: 'summary',
        generator: 'ai_assisted',
        createdAt: '2026-10-25T10:00:00.000Z',
      },
    ],
    activeTab: 'chat',
    onJumpTab: () => {},
    onOpenSource: () => {},
    onInspectCitation: () => {},
    headingId: 'context-heading',
  });

  assert.match(html, /Sources/);
  assert.match(html, /Notes/);
  assert.match(html, /Concepts/);
  assert.match(html, /Related materials/);
  assert.match(html, /Biology notes/);
  assert.match(html, /Rule-based key terms from stored source text/);
  assert.match(html, /Not model-generated topics/);
  assert.match(html, /Search stored source text/);
  assert.match(html, /AI-assisted/);
  assert.match(html, /No saved learning session yet/);
});

test('an AI-assisted material is labelled and its citations are re-verified on load', () => {
  const quote = 'Chlorophyll absorbs light.';
  const html = render(StudyMaterialsPanel, {
    sources: [
      {
        id: 'source-1',
        title: 'Biology notes',
        status: 'ready',
        hasExtractedText: true,
      },
    ],
    sourceContents: {
      'source-1': {
        text: 'Chlorophyll absorbs light. It reflects green light.',
        pageOffsets: [],
      },
    },
    materials: [
      {
        id: 'material-1',
        title: 'Model-assisted summary',
        kind: 'summary',
        body: 'A model-written draft.',
        generator: 'ai_assisted',
        citations: [
          {
            sourceId: 'source-1',
            quote,
            locator: { kind: 'offset', start: 0, end: quote.length },
          },
          {
            sourceId: 'source-1',
            quote: 'This quotation is no longer present.',
            locator: { kind: 'offset', start: 900, end: 940 },
          },
        ],
      },
    ],
    onInspectCitation: () => {},
  });

  assert.match(html, /AI-assisted/);
  assert.match(html, /Model-written draft/);
  assert.match(html, /AI-assisted materials are model-written drafts/);
  assert.match(html, /Verified source spans/);
  assert.match(html, /could not be re-verified/);
  assert.match(html, /Inspect/);
  assert.match(html, /Chlorophyll absorbs light/);
});

test('the sidebar keeps its navigation and notebook sections keyboard-reachable', () => {
  const html = renderInRouter(Sidebar, {});

  assert.match(html, /aria-label="Main navigation"/);
  assert.match(html, /Notebooks/);
  assert.match(html, /Recent conversations/);
  assert.match(html, /Recent materials/);
  assert.match(html, /No notebooks yet/);
  assert.match(html, /href="\/notebooks"/);
  assert.match(html, /focus:ring-2/);
  // At exactly 768px the rail must still be a drawer, so the desktop rail
  // starts at the lg breakpoint and the trigger remains visible below it.
  assert.match(html, /lg:block/);
  assert.match(html, /lg:hidden/);
});
