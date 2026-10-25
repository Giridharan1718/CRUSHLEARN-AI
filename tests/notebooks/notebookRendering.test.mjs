import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createTestViteServer } from '../support/viteTestServer.mjs';


let viteServer;
let NotebookListView;
let SourceIngestionPanel;
let SourceList;
let ChatPanel;
let StudyDeskPanel;
let StudyMaterialsPanel;
let SourceEvidenceMap;
let AdaptiveLoopPanel;
let SourceViewer;
let NotebookImportPanel;

before(async () => {
  viteServer = await createTestViteServer();
  NotebookListView = (
    await viteServer.ssrLoadModule(
      '/src/components/notebooks/NotebookListView.jsx'
    )
  ).default;
  SourceIngestionPanel = (
    await viteServer.ssrLoadModule(
      '/src/components/notebooks/SourceIngestionPanel.jsx'
    )
  ).default;
  SourceList = (
    await viteServer.ssrLoadModule('/src/components/notebooks/SourceList.jsx')
  ).default;
  ChatPanel = (
    await viteServer.ssrLoadModule('/src/components/notebooks/ChatPanel.jsx')
  ).default;
  StudyDeskPanel = (
    await viteServer.ssrLoadModule(
      '/src/components/notebooks/StudyDeskPanel.jsx'
    )
  ).default;
  StudyMaterialsPanel = (
    await viteServer.ssrLoadModule(
      '/src/components/notebooks/StudyMaterialsPanel.jsx'
    )
  ).default;
  SourceEvidenceMap = (
    await viteServer.ssrLoadModule(
      '/src/components/notebooks/SourceEvidenceMap.jsx'
    )
  ).default;
  AdaptiveLoopPanel = (
    await viteServer.ssrLoadModule(
      '/src/components/notebooks/AdaptiveLoopPanel.jsx'
    )
  ).default;
  SourceViewer = (
    await viteServer.ssrLoadModule(
      '/src/components/notebooks/SourceViewer.jsx'
    )
  ).default;
  NotebookImportPanel = (
    await viteServer.ssrLoadModule(
      '/src/components/notebooks/NotebookImportPanel.jsx'
    )
  ).default;
});

after(async () => {
  if (viteServer) await viteServer.close();
});

const render = (component, props) =>
  renderToStaticMarkup(React.createElement(component, props));

test('the empty notebook list offers creation and states the AI limitation', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(NotebookListView, {
        notebooks: [],
        sourceCounts: {},
        loading: false,
        error: '',
        onCreate: () => {},
        onDelete: () => {},
      })
    )
  );

  assert.match(html, /Start with your first notebook/);
  assert.match(html, /Create notebook/);
  assert.match(html, /Local source tools are enabled/i);
  assert.match(html, /Source-grounded AI chat and AI-generated study/i);
  assert.doesNotMatch(html, /AI-generated summary is available/i);
});

test('the notebook list renders source counts and workspace links', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(NotebookListView, {
        notebooks: [
          {
            id: 'notebook-1',
            title: 'Biology final',
            description: 'Cells and genetics',
            createdAt: '2026-10-20T10:00:00.000Z',
            updatedAt: '2026-10-20T10:00:00.000Z',
          },
        ],
        sourceCounts: { 'notebook-1': 3 },
        loading: false,
        error: '',
        onCreate: () => {},
        onDelete: () => {},
      })
    )
  );

  assert.match(html, /Biology final/);
  assert.match(html, /Cells and genetics/);
  assert.match(html, /3 sources/);
  assert.match(html, /href="\/notebooks\/notebook-1"/);
});

test('the notebook list shows the kind and tags of each notebook', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(NotebookListView, {
        notebooks: [
          {
            id: 'notebook-1',
            title: 'Dissertation',
            description: 'Chapter two',
            kind: 'project',
            tags: ['psychology', 'memory'],
            archivedAt: null,
            createdAt: '2026-10-20T10:00:00.000Z',
            updatedAt: '2026-10-20T10:00:00.000Z',
          },
        ],
        sourceCounts: { 'notebook-1': 1 },
        loading: false,
        error: '',
        onCreate: () => {},
        onDelete: () => {},
      })
    )
  );

  assert.match(html, /Research project/);
  assert.match(html, /#psychology/);
  assert.match(html, /#memory/);
  assert.match(html, /1 source/);
  assert.match(html, /Archive/);
});

test('the notebook list offers an archived view and a restore action', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(NotebookListView, {
        notebooks: [],
        archivedNotebooks: [
          {
            id: 'notebook-archived',
            title: 'Finished project',
            description: '',
            kind: 'project',
            tags: [],
            archivedAt: '2026-10-20T10:00:00.000Z',
            createdAt: '2026-10-20T10:00:00.000Z',
            updatedAt: '2026-10-20T10:00:00.000Z',
          },
        ],
        showArchived: true,
        sourceCounts: { 'notebook-archived': 2 },
        loading: false,
        error: '',
        onCreate: () => {},
        onDelete: () => {},
      })
    )
  );

  assert.match(html, /Archived notebooks/);
  assert.match(html, /Finished project/);
  assert.match(html, /Restore/);
  assert.doesNotMatch(html, />Archive</);
});

test('a notebook without the organisation fields still renders', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(NotebookListView, {
        notebooks: [
          {
            id: 'notebook-legacy',
            title: 'Legacy notebook',
            description: '',
            createdAt: '2026-10-20T10:00:00.000Z',
            updatedAt: '2026-10-20T10:00:00.000Z',
          },
        ],
        sourceCounts: {},
        loading: false,
        error: '',
        onCreate: () => {},
        onDelete: () => {},
      })
    )
  );

  assert.match(html, /Legacy notebook/);
  assert.match(html, /Subject/);
});

test('source cards show ready and failed processing states', () => {
  const html = render(SourceList, {
    sources: [
      {
        id: 'source-1',
        title: '<script>alert(1)</script>',
        sourceType: 'pasted_text',
        fileName: null,
        status: 'ready',
        error: null,
        hasExtractedText: true,
        characterCount: 42,
        sizeBytes: 0,
        createdAt: '2026-10-20T10:00:00.000Z',
      },
      {
        id: 'source-2',
        title: 'paper.pdf',
        sourceType: 'pdf',
        fileName: 'paper.pdf',
        status: 'failed',
        error: 'Scanned PDFs require OCR, which is not available in this browser.',
        hasExtractedText: false,
        characterCount: 0,
        sizeBytes: 2048,
        createdAt: '2026-10-20T10:00:00.000Z',
      },
    ],
    onDelete: () => {},
  });

  assert.match(html, /Extracted text available/);
  assert.match(html, /42 characters/);
  assert.doesNotMatch(html, /0 bytes/);
  assert.match(html, /No extracted text available/);
  assert.match(html, /Scanned PDFs require OCR/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
});

test('the ingestion panel is explicit about supported and unsupported formats', () => {
  const paste = render(SourceIngestionPanel, { onIngest: () => {} });
  assert.match(paste, /Text, Markdown, PDF and DOCX files are processed locally/);
  assert.match(paste, /never executed/);
  assert.match(paste, /Add pasted text/);

  const file = render(SourceIngestionPanel, {
    onIngest: () => {},
    initialMode: 'file',
  });
  assert.match(file, /\.txt, \.md, \.markdown, \.pdf and \.docx/);
  assert.match(file, /Scanned PDFs need OCR/);
  assert.match(file, /Legacy \.doc files are not supported/);
  assert.match(file, /accept="\.txt,\.md,\.markdown,\.pdf,\.docx/);
  assert.match(file, /AI chat and generated/);
  assert.doesNotMatch(file, /PDF text extraction is not available/);

  const web = render(SourceIngestionPanel, {
    onIngest: () => {},
    initialMode: 'web',
  });
  assert.match(web, /Web page URL/);
  assert.match(web, /https:\/\/example\.com\/article/);
  assert.match(web, /gateway rejects\s+localhost, private addresses/);
  assert.match(web, /not running, the URL is added as a failed source/);
  assert.match(web, /Fetch web page/);
});

test('chat and study material panels show honest empty states', () => {
  const chat = render(ChatPanel, { messages: [], sources: [] });
  assert.match(chat, /No chat messages yet/);
  assert.match(chat, /AI gateway is not available/);
  assert.match(chat, /not\s+AI-generated explanations/);
  assert.match(chat, /Every citation is checked against the stored source text/);

  const materials = render(StudyMaterialsPanel, { materials: [], sources: [] });
  assert.match(materials, /Nothing saved yet/);
  assert.match(materials, /Local extractive study kits are available/);
  assert.match(materials, /AI-generated summaries.*remain unavailable/i);
});

test('the study desk labels local extractive tools and shows ready source counts', () => {
  const html = render(StudyDeskPanel, {
    sources: [
      {
        id: 'source-1',
        title: 'Biology notes',
        status: 'ready',
        hasExtractedText: true,
      },
      {
        id: 'source-2',
        title: 'Failed scan',
        status: 'failed',
        hasExtractedText: false,
      },
    ],
    sourceContents: {
      'source-1': {
        text: 'Photosynthesis is the process by which plants use light.',
        pageOffsets: [],
      },
    },
    onSaveStudyKit: () => {},
  });

  assert.match(html, /Source study desk/);
  assert.match(html, /1 ready source/);
  assert.match(html, /Local extractive mode/);
  assert.match(html, /do not call an AI model/);
  assert.match(html, /Ask your sources/);
  assert.match(html, /Question or search phrase/);
  assert.match(html, /Ask sources/);
  assert.match(html, /Build study kit/);
  assert.match(html, /AI chat/);
  assert.match(html, /remain unavailable/);
});

test('a saved learning context is available to restore from the study desk', () => {
  const citation = {
    sourceId: 'source-1',
    quote: 'Chlorophyll absorbs light in the visible spectrum.',
    locator: { kind: 'offset', start: 58, end: 109 },
  };
  const context = {
    schemaVersion: 1,
    userId: 'user-1',
    notebookId: 'notebook-1',
    currentQuestion: 'What does chlorophyll absorb?',
    answer: {
      text: citation.quote,
      citation,
      sourceTitle: 'Biology notes',
      page: 1,
      generator: 'local_extractive',
      note: 'Direct quotation.',
    },
    evidence: [],
    visual: null,
    relatedVisual: null,
    practice: null,
    nextAction: {
      id: 'answer_practice',
      title: 'Check your understanding',
      reason: 'A source-based recall question is ready.',
      target: 'practice',
    },
    turns: [],
    updatedAt: '2026-10-20T10:00:00.000Z',
  };

  const html = render(StudyDeskPanel, {
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
        text:
          'Photosynthesis converts light energy into chemical energy. Chlorophyll absorbs light in the visible spectrum.',
        pageOffsets: [],
      },
    },
    notebookId: 'notebook-1',
    userId: 'user-1',
    initialContext: context,
    onSaveStudyKit: () => {},
    onSaveLearningContext: () => ({ ok: true }),
    onClearLearningContext: () => ({ ok: true }),
  });

  assert.match(html, /Saved learning session/);
  assert.match(html, /What does chlorophyll absorb/);
  assert.match(html, /Restore last answer/);
  assert.match(html, /Recommended next step/);
  assert.match(html, /Check your understanding/);
});

test('source evidence maps render verified quotations as escaped data', () => {
  const html = render(SourceEvidenceMap, {
    visual: {
      title: 'Source evidence map',
      description: 'One verified quotation from one source.',
      question: 'What does <script>alert(1)</script> absorb?',
      items: [
        {
          sourceId: 'source-1',
          sourceTitle: 'Biology notes',
          page: 1,
          quote: 'Chlorophyll <img src=x onerror=alert(1)> absorbs light.',
          citation: {
            sourceId: 'source-1',
            quote: 'Chlorophyll <img src=x onerror=alert(1)> absorbs light.',
            locator: { kind: 'offset', start: 0, end: 51 },
          },
        },
        {
          sourceId: 'source-1',
          sourceTitle: 'Biology notes',
          page: 1,
          quote:
            'Photosynthesis converts light. Chlorophyll <img src=x onerror=alert(1)> absorbs light.',
          citation: {
            sourceId: 'source-1',
            quote:
              'Photosynthesis converts light. Chlorophyll <img src=x onerror=alert(1)> absorbs light.',
            locator: { kind: 'offset', start: 0, end: 78 },
          },
        },
      ],
      limitations: [
        'Single-source answer: the claim is not independently corroborated.',
      ],
    },
  });

  assert.match(html, /Source evidence map/);
  assert.match(html, /Citation verified/);
  assert.match(html, /Context passage/);
  assert.match(html, /Chlorophyll &lt;img/);
  assert.match(html, /What does &lt;script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x/);
});

test('saved study materials render only citations that belong to known sources', () => {
  const html = render(StudyMaterialsPanel, {
    sources: [{ id: 'source-1', title: 'Biology notes' }],
    sourceContents: {
      'source-1': { text: 'Photosynthesis converts light.', pageOffsets: [] },
    },
    materials: [
      {
        id: 'material-1',
        title: 'Source study kit',
        kind: 'study_kit',
        body: 'LOCAL EXTRACTIVE STUDY KIT',
        generator: 'local_extractive',
        citations: [
          {
            sourceId: 'source-1',
            quote: 'Photosynthesis converts light.',
            locator: { kind: 'offset', start: 0, end: 30 },
          },
          {
            sourceId: 'unknown-source',
            quote: 'Not a real source.',
            locator: { kind: 'offset', start: 0, end: 18 },
          },
        ],
        createdAt: '2026-10-20T10:00:00.000Z',
      },
    ],
  });

  assert.match(html, /Local extractive/);
  assert.match(html, /Biology notes, characters 0-30/);
  assert.match(html, /Photosynthesis converts light/);
  assert.doesNotMatch(html, /Not a real source/);
});

test('stored chat history renders known citations and hides unknown sources', () => {
  const html = render(ChatPanel, {
    sources: [{ id: 'source-1', title: 'Biology notes' }],
    messages: [
      {
        id: 'message-1',
        role: 'assistant',
        content: 'The notes describe photosynthesis.',
        citations: [
          {
            sourceId: 'source-1',
            quote: 'Photosynthesis converts light energy.',
            locator: { kind: 'offset', start: 0, end: 40 },
          },
          {
            sourceId: 'unknown-source',
            quote: 'Fabricated passage',
            locator: { kind: 'offset', start: 0, end: 17 },
          },
        ],
        createdAt: '2026-10-20T10:00:00.000Z',
      },
    ],
  });

  assert.match(html, /Sources cited/);
  assert.match(html, /Biology notes, characters 0-40/);
  assert.match(html, /Photosynthesis converts light energy/);
  assert.doesNotMatch(html, /Fabricated passage/);
});

test('the adaptive loop panel separates measured evidence from uncertainty and escapes content', () => {
  const citation = {
    sourceId: 'source-1',
    quote: 'Chlorophyll absorbs light in the visible spectrum.',
    locator: { kind: 'offset', start: 58, end: 109 },
  };
  const html = render(AdaptiveLoopPanel, {
    adaptive: {
      schemaVersion: 1,
      id: 'adaptive-1',
      goal: 'What does chlorophyll absorb?',
      question: 'What does chlorophyll absorb?',
      status: 'blocked',
      currentAction: 'provide_worked_example',
      summary: 'The recall check did not match twice. A worked example is shown.',
      measured: {
        citationVerified: true,
        keywordOverlap: 2,
        practiceCorrect: false,
        wrongAttempts: 2,
        workedExampleShown: true,
      },
      assumptions: ['A worked example is not mastery evidence.'],
      uncertainties: ['Retention was not measured.'],
      attemptedStrategies: ['initial_query', 'worked_example'],
      steps: [
        {
          action: 'provide_worked_example',
          status: 'succeeded',
          reasonCode: 'verified_source_worked_example',
          at: '2026-10-20T12:00:00.000Z',
        },
      ],
      sourceFacts: [],
      generatedExplanations: [
        {
          text: 'The verified sentence says <script>alert(1)</script>.',
          generator: 'local_extractive_rule',
          citation,
          sourceTitle: 'Biology notes',
          page: 1,
          at: '2026-10-20T12:00:00.000Z',
        },
      ],
      userProvided: [
        {
          kind: 'practice_response',
          text: 'secret-response',
          at: '2026-10-20T12:00:00.000Z',
        },
      ],
      assessmentEvidence: [],
      hypotheses: [],
      experimentalResults: [],
      unresolvedQuestions: [],
      corrections: [],
      startedAt: '2026-10-20T12:00:00.000Z',
      updatedAt: '2026-10-20T12:00:00.000Z',
    },
  });

  assert.match(html, /Adaptive study loop/);
  assert.match(html, /Provide a worked example/);
  assert.match(html, /Needs review/);
  assert.match(html, /Retention was not measured/);
  assert.match(html, /Source-based worked example/);
  assert.match(html, /&lt;script&gt;alert/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /secret-response/);
});

test('the source viewer shows an exact opening preview and a full-text control', () => {
  const text = 'A'.repeat(450);
  const html = render(SourceViewer, {
    source: {
      id: 'source-1',
      title: 'Biology notes',
      sourceType: 'text',
      status: 'ready',
      hasExtractedText: true,
      characterCount: text.length,
      pageCount: 1,
    },
    sourceContents: {
      'source-1': { text, pageOffsets: [{ page: 1, start: 0, end: 450 }] },
    },
  });

  assert.match(html, /Source preview/);
  assert.match(html, /First 400 of 450 characters/);
  assert.match(html, /View full text/);
  assert.match(html, new RegExp(`A{400}`));
  assert.doesNotMatch(html, new RegExp(`A{401}`));
  assert.match(html, /Search inside this source/);
});

test('a ready source without stored text shows an honest alert instead of a preview', () => {
  const html = render(SourceViewer, {
    source: {
      id: 'source-1',
      title: 'Missing text',
      sourceType: 'pdf',
      status: 'ready',
      hasExtractedText: true,
      characterCount: 10,
      pageCount: 1,
    },
    sourceContents: {},
  });

  assert.match(html, /could not be loaded/);
  assert.doesNotMatch(html, /Source preview/);
  assert.doesNotMatch(html, /Search inside this source/);
});

test('a failed source offers a retry file control inside the source list', () => {
  const html = render(SourceList, {
    sources: [
      {
        id: 'source-1',
        title: 'Scanned handout',
        sourceType: 'pdf',
        status: 'failed',
        error: 'No readable text was found.',
        hasExtractedText: false,
        characterCount: 0,
        pageCount: 0,
        createdAt: '2026-10-20T10:00:00.000Z',
      },
    ],
    onRetry: () => {},
  });

  assert.match(html, /Retry/);
  assert.match(html, /accept="\.txt,\.md,\.markdown,\.pdf,\.docx"/);
  assert.match(html, /No readable text was found\./);
});

test('the import panel explains the scope before a file is chosen', () => {
  const html = render(NotebookImportPanel, { onImport: () => {} });

  assert.match(html, /Import a notebook/);
  assert.match(html, /never overwrites an existing one/);
  assert.match(html, /accept="\.json,application\/json"/);
  assert.match(html, /Import notebook/);
});
