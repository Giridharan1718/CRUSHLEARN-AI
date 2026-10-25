import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { visualExplanations } from '../../src/content/visual/index.mjs';
import {
  analyzeTopic,
  selectVisualStrategy,
} from '../../src/visual/topicAnalysis.mjs';
import { listVisualTopics } from '../../src/visual/visualCatalog.mjs';
import { createTestViteServer } from '../support/viteTestServer.mjs';


let viteServer;
let VisualLearningHomeView;
let VisualTopic;
let VisualTopicView;
let ProcessExplorer;
let PracticeCheck;
let VisualExplanationRenderer;

before(async () => {
  viteServer = await createTestViteServer();

  const load = async (modulePath) =>
    (await viteServer.ssrLoadModule(modulePath)).default;

  VisualLearningHomeView = await load(
    '/src/components/visual/VisualLearningHomeView.jsx'
  );
  VisualTopicView = await load('/src/components/visual/VisualTopicView.jsx');
  VisualTopic = await load('/src/pages/VisualTopic.jsx');
  ProcessExplorer = await load('/src/components/visual/ProcessExplorer.jsx');
  PracticeCheck = await load('/src/components/visual/PracticeCheck.jsx');
  VisualExplanationRenderer = await load(
    '/src/components/visual/VisualExplanationRenderer.jsx'
  );
});

after(async () => {
  if (viteServer) await viteServer.close();
});

const render = (component, props) =>
  renderToStaticMarkup(React.createElement(component, props));

const renderWithRouter = (component, props) =>
  renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(component, props)
    )
  );

test('the visual home page states its scope and lists verified topics', () => {
  const html = renderWithRouter(VisualLearningHomeView, {
    topics: listVisualTopics(),
    analysis: null,
    strategy: null,
    searchedTopic: '',
    onAnalyze: () => ({ ok: true }),
  });

  assert.match(html, /Universal Visual Learning Engine/);
  assert.match(html, /Choose an explanation that fits the idea/);
  assert.match(html, /Only step-by-step process diagrams are implemented/);
  assert.match(html, /AI generation and\s+source-grounded visual explanations are not connected/);
  assert.match(html, /Electricity in a simple circuit/);
  assert.match(html, /From source code to a running program/);
  assert.match(html, /4 topics/);
  assert.match(html, /href="\/visual\/electricity-circuit"/);
  assert.doesNotMatch(html, /AI-generated explanation for any topic/i);
});

const renderVisualRoute = (url) =>
  renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: [url] },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: '/visual/:topicId',
          element: React.createElement(VisualTopic),
        })
      )
    )
  );

test('a visual opened from a notebook shows a safe return link and authored-content notice', () => {
  const notebookId = 'notebook_4f9454e1-2d50-4221-a3e5-2b89ea02a690';
  const html = renderVisualRoute(
    `/visual/electricity-circuit?fromNotebook=${notebookId}&returnTab=study&q=How+does+electricity+flow%3F`
  );

  assert.match(html, /Opened from your notebook/);
  assert.match(html, /curated, authored explanation/);
  assert.match(html, /Back to notebook/);
  assert.match(
    html,
    new RegExp(`href="/notebooks/${notebookId}\\?tab=study`)
  );
  assert.match(html, /How\+does\+electricity/);
  assert.match(html, /Electricity in a simple circuit/);
});

test('an invalid notebook return target is not rendered', () => {
  const html = renderVisualRoute(
    '/visual/electricity-circuit?fromNotebook=../../admin&returnTab=chat'
  );

  assert.doesNotMatch(html, /Opened from your notebook/);
  assert.doesNotMatch(html, /Back to notebook/);
});

test('an unknown topic shows analysis and never fabricates an explanation', () => {
  const analysisResult = analyzeTopic(
    'How does an unknown machine of tomorrow work?'
  );
  const strategy = selectVisualStrategy(analysisResult.analysis);

  const html = renderWithRouter(VisualLearningHomeView, {
    topics: [],
    analysis: analysisResult.analysis,
    strategy,
    searchedTopic: analysisResult.analysis.topic,
    onAnalyze: () => ({ ok: true }),
  });

  assert.match(html, /Topic analysis preview/);
  assert.match(html, /General knowledge and everyday systems/);
  assert.match(html, /Heuristic, not AI/);
  assert.match(html, /no verified explanation yet/i);
  assert.match(html, /No AI provider is connected/);
  assert.match(html, /will not\s+fabricate steps, examples, or practice feedback/);
  assert.doesNotMatch(html, /Step 1 of/);
});

test('the topic view renders the full learning sequence and controls', () => {
  const explanation = visualExplanations[0];
  const html = renderWithRouter(VisualTopicView, { explanation });

  assert.match(html, /Electricity in a simple circuit/);
  assert.match(html, /Learning objective/);
  assert.match(html, /Curated local explanation/);
  assert.match(html, /not\s+AI-generated at runtime/);
  assert.match(html, /Explanation level/);
  assert.match(html, /Beginner/);
  assert.match(html, /Intermediate/);
  assert.match(html, /Advanced/);
  assert.match(html, /Simpler/);
  assert.match(html, /Deeper/);
  assert.match(html, /See the big picture/);
  assert.match(html, /Follow the process/);
  assert.match(html, /aria-current="step"/);
  assert.match(html, /Explore the process/);
  assert.match(html, /Walk through an example/);
  assert.match(html, /Try it/);
  assert.match(html, /Check answer/);
  assert.match(html, /Apply it/);
  assert.match(html, /What this model leaves out/);
  assert.match(html, /Authored explanation/);
  assert.match(html, /does not update course mastery/);
});

test('process steps are native buttons in a semantic ordered list', () => {
  const html = render(ProcessExplorer, {
    explanation: visualExplanations[1],
    level: 'advanced',
  });

  assert.match(html, /<ol/);
  assert.match(html, /aria-label="Process steps for From source code to a running program"/);
  assert.match(html, /aria-label="Step 1:/);
  assert.match(html, /aria-current="step"/);
  assert.match(html, /type="button"/);
  assert.match(html, /lg:grid-cols/);
  assert.match(html, /Explored 1 of 6 steps/);
  assert.match(html, /Previous step/);
  assert.match(html, /Next step/);
});

test('the renderer safely escapes long labels and injected HTML', () => {
  const explanation = structuredClone(visualExplanations[0]);
  explanation.title = '<img src=x onerror="alert(1)">';
  explanation.process.steps[0].title = `<script>alert(2)</script>${'A'.repeat(180)}`;

  const html = render(ProcessExplorer, { explanation, level: 'beginner' });

  assert.match(html, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
  assert.match(html, /A{180}/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /break-words/);
});

test('practice renders accessible radio options and a deterministic reset control', () => {
  const html = render(PracticeCheck, {
    explanation: visualExplanations[2],
  });

  assert.match(html, /<fieldset/);
  assert.match(html, /<legend/);
  assert.match(html, /type="radio"/);
  const radioNames = [...html.matchAll(/name="([^"]+)"/g)].map(
    (match) => match[1]
  );
  assert.equal(radioNames.length, 4);
  assert.equal(new Set(radioNames).size, 1);
  assert.match(html, /\$50,000/);
  assert.match(html, /Check answer/);
  assert.match(html, /Try again/);
  assert.match(html, /Need a hint/);
});

test('unsupported and missing explanations show graceful fallbacks', () => {
  const unsupported = render(VisualExplanationRenderer, {
    explanation: { visualType: 'timeline', title: 'A timeline' },
  });
  assert.match(unsupported, /No renderer is available/);
  assert.match(unsupported, /timeline/);

  const missing = render(VisualExplanationRenderer, { explanation: null });
  assert.match(missing, /Visual explanation unavailable/);

  const noExplanation = renderWithRouter(VisualTopicView, {
    explanation: null,
  });
  assert.match(noExplanation, /This visual explanation is unavailable/);
});
