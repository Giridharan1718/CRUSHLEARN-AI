# CrushLearn AI

A local-first learning demo built with React, Vite and Tailwind CSS. It combines
authored courses, mastery checks, active recall, source notebooks and curated
visual explanations.

> **Status: working local demo, not a hosted AI tutor.**
> AI chat and AI-generated explanations require a real server-side provider
> gateway and are unavailable without one. Embeddings, cloud storage and real
> authentication are not implemented. The app does not pretend otherwise.

## Quick start

```bash
npm install
npm run dev
```

Open the printed local URL, click **Try Demo Account**, and explore. Demo
authentication and all learner data are stored in this browser.

```bash
npm test        # Node test suite
npm run build   # Production build
npm run preview # Preview the production build
```

## What is implemented

### Learning platform

- Course catalogue, lesson viewer and progress tracking.
- Mastery checks, active recall, review scheduling and a skill passport.
- Responsive desktop and mobile navigation.
- Demo authentication with browser-local data.

### Notebooks and sources

- Notebook create, rename and delete.
- Pasted text, `.txt`, `.md`, `.markdown`, PDF and DOCX ingestion.
- PDF and DOCX parsing runs locally in the browser; uploaded files are treated
  as data only.
- Extracted text and page offsets are stored separately from notebook metadata.
- Page metadata is retained for PDF citations when available.
- PDFs with no selectable text fail honestly; OCR is not implemented.
- Per-notebook source limits, file-size limits and character limits.
- Source status and extraction errors are visible.

### Local source intelligence

- Lexical passage search across ready sources (BM25-style scoring).
- Extractive question answering: the Study desk selects the most relevant exact
  source sentence and labels it as a quotation, not an AI answer.
- Unmatched questions return an explicit “no source passage matched” state; the
  app does not answer from outside knowledge.
- Every result must pass the citation verifier before it is displayed.
- Offset citations are checked against the stored source text.
- Source results show the source title and page when page metadata is available.
- Extractive summary, recall cards and fill-in-the-blank quiz built from exact
  source spans.
- Study kits are labelled **local extractive**, not AI-generated.
- Study kits can be saved, with citations, to the notebook's study-materials
  store.
- A source evidence map groups the answer quotation and supporting quotations,
  shows their verified locations and states its reading limits. It is a map of
  exact evidence, not a generated concept explanation.
- A source-recall practice check and a deterministic next-step recommendation
  continue the cycle after the answer. Practice is explicitly labelled as
  source recall, not mastery evidence.
- A versioned, notebook-scoped learning context saves the current question,
  verified answer, evidence, visual, practice and next action on this device.
  Saved citations are revalidated against the current source text before a
  session is restored, and the session can be cleared explicitly.
- A bounded adaptive study loop chooses source retrieval, recall verification,
  evidence review, a verified source-based worked example, or a stop. It keeps
  source facts, rule-based explanations, learner input, assessment evidence,
  hypotheses, experimental results and unresolved questions in separate
  categories, and reports measured results separately from assumptions.
- Short pronoun and elliptical follow-ups can reuse the previous topic terms
  while preserving the learner's original question in the saved context.
- Read-aloud buttons use the browser's speech synthesis API where supported.

### Visual learning

- Curated, typed process explanations for four authored topics.
- Deterministic topic analysis and prerequisites.
- Level variants, step exploration, practice and limitation notes.
- A matching curated visual can be opened from the notebook Study desk. The UI
  states that the visual is authored and is not derived from the uploaded source.
  It is kept separate from the source evidence map.
- Returning to the notebook restores the Study desk tab and question.
- Unsupported or unknown topics show an honest unavailable state.
- Visual data is validated and rendered as React elements; arbitrary HTML is not
  rendered.

### AI gateway (optional, Rust)

The app can answer a question with a real language model, but only through a
server-side gateway that holds the provider key. The gateway is a small Rust
service in [`gateway/`](gateway/README.md). It is **optional**: when it is not
running, or when it has no provider key, the app falls back to its local
extractive answers and says so in the chat panel.

```bash
export ANTHROPIC_API_KEY="sk-ant-..."   # server-side only
npm run dev:gateway                      # terminal 1
npm run dev                              # terminal 2
```

The key never reaches the browser. It is read from the gateway process's
environment and is never a `VITE_`-prefixed variable, because Vite inlines
every `VITE_*` value into the client bundle.

The grounding rules hold on the model path too:

- Retrieval stays in the browser. The client searches the local sources and
  verifies each passage with the citation verifier **before** sending it, so
  the gateway only ever sees passages that already exist in a source.
- The gateway returns an answer plus offset citations. The client verifies
  every one of those citations a **second** time against the stored source
  text before it is shown.
- If a citation fails, the model answer is discarded and the local extractive
  answer is shown instead. A model answer that cannot be verified never
  reaches the screen.
- The gateway enforces a per-request citation budget, a per-session token
  budget, and reports a cost meter with every response.
- The chat panel labels each answer's origin, so a model answer is never
  mistaken for a local quotation.

## What is not implemented

- No streaming tutor. Answers arrive complete, not token by token.
- No model-backed adaptive tutor. The adaptive loop is deterministic. Prerequisite
  explanations, arbitrary diagrams, diagnostic question generation, conflict
  investigation and experiments are reserved actions that are not implemented.
- No OCR for scanned PDFs.
- No web URL ingestion.
- No vector database, embeddings or semantic retrieval.
- No IndexedDB/server document storage; browser storage limits apply.
- No account-level document protection; auth is a local demo.
- No audio overviews, TTS file generation or podcast-style summaries.
- No coding sandbox, Python execution or simulations.
- No concept maps, timelines, charts or arbitrary-topic visual generation yet.
  The source evidence map groups quotations; it does not explain relationships
  that are absent from the source text.

## Tech stack

| Technology | Purpose |
| --- | --- |
| React 18 | UI |
| React Router 6 | Client-side routing |
| Vite 5 | Dev server and build |
| Tailwind CSS 3 | Styling |
| `pdfjs-dist` | Local PDF text extraction |
| `mammoth` | Local DOCX text extraction |

PDF and DOCX parsers are dynamically imported, so their code is loaded only when
a matching file is uploaded.

## Project structure

```text
src/
  components/
    notebooks/      Notebook, source, chat, explanation and study-desk UI
    visual/         Typed visual renderers
  notebooks/        Storage, ingestion, retrieval, citations, study tools, text explanation and grounded chat
  ai/               Learning capability services and the task orchestrator
  intelligence/     Learning context, notebook orchestration, adaptive loop and persistence
  visual/           Visual schema and topic analysis
  content/          Authored courses and visual explanations
  pages/            Route-level pages
  learning/         Mastery, recall and practice logic
gateway/            Rust AI gateway: holds the provider key, answers grounded questions
tests/
  notebooks/        Notebook, ingestion, retrieval, chat, study-tool and rendering tests
  intelligence/     Context, orchestration, adaptive-loop and complete-workflow tests
  visual/           Visual schema and rendering tests
  learning/         Learning-engine tests
docs/
  day-3/            Implementation notes and boundaries
  day-4/            Unified workflow and adaptive-loop implementation notes
  day-5/            Future-readiness audit
```

## Authenticity rules

This project deliberately separates three kinds of content:

1. **Authored content** — courses and visual explanations written in the repo.
2. **Local extractive content** — summaries, cards and quizzes that quote source
   text and carry verified source spans.
3. **Model-generated content** — chat answers produced by a real provider
   through the server-side gateway. These are labelled as model answers, and
   every citation they carry is verified against the stored source text before
   it is shown. Without a configured gateway there is no third kind: the app
   falls back to the second kind and says so.

The rule-based dashboard guidance is not a language model. Rule-based guidance
is labelled as such.

## Verification

At the time of writing:

- `npm test`: **394 passing, 0 failing**.
- `npm run build`: passing (884.44 kB main JS / 240.94 kB gzip, existing chunk-size warning).
- `cargo test` (the gateway): **30 passing, 0 failing**. The tests need no
  provider key.
- Gateway end-to-end, against a local mock of `POST /v1/messages` that records
  the request it receives (2026-10-21): the real client modules
  (`groundedChat.mjs` → `gatewayClient.mjs` → the running Rust gateway) sent a
  question the sources covered, the gateway called the provider with the
  expected headers, body, `output_config` and numbered source passages, and
  the answer came back with a verified offset citation and a cost meter
  (`$0.0064`). A question the sources did not cover returned an honest
  unanswered turn and the provider was never called. A source containing an
  emoji produced UTF-16 offsets the gateway accepted.
- Gateway guard rails, checked over HTTP: a disallowed `Origin` is refused
  (`origin_not_allowed`); an empty question, an empty span list, a span whose
  offsets disagree with its text, and a request over the span limit are each
  refused with their own code; a request with no provider key is refused with
  `provider_not_configured` rather than faked.
- **Not verified:** a live call to the Anthropic API. No provider key is
  configured on this machine, so the provider call itself has never run
  against the real service. The request shape, headers, structured-output
  schema, refusal handling and fallback retry were written from the API
  documentation and checked against the local mock described above.
- Lighthouse audits (Chrome, dark and light): accessibility, best practices and
  SEO score **100** on the dashboard, notebook workspace, interactive circuit,
  visual learning, review and skill-passport pages (see
  `docs/day-4/UI_DESIGN_SYSTEM.md` for the dated results). Also **100 /
  100 / 100** on the new interactive home and code-trace experience pages in
  both themes (see `docs/day-4/INTERACTIVE_EXPERIENCE_ENGINE.md`).
- Browser-tested interactive learning engine (2026-10-21): the `/interactive`
  registry lists both built experiences; the code-trace experience stepped the
  authored program (12 steps, `total = 0 · reading = 4` at iteration 1, final
  output **9** for the buggy variant); predicting 22, finding line 4, choosing
  `total = total + reading;`, applying `27` for the extended array and the
  accumulation quiz each graded correctly to **5 of 5 milestones**; progress,
  choices and step position restored after reload; Reset cleared everything;
  the topic lookup opened the curated compiler visual and answered unknown
  topics with an explicit "not built yet" message; `/interactive/unknown-id`
  showed the honest unavailable state; dark/light contrast on the code panel
  was measured in both themes after a fix; zero console errors. Test data
  (experience progress) was deleted afterwards.
- Browser-tested UI pass (2026-10-21): dark/light theme toggle round-trip with
  persistence and pre-paint boot script; single `.dark` class flips all
  semantic tokens; notebook create → add pasted source → Ask sources →
  workspace context counts; Save as note with toast; circuit slider math
  (9 V / 6 Ω → 1.50 A; 9 V / 3 Ω → 3.00 A); zero console errors. Test data was
  deleted afterwards.
- Browser-tested: PDF upload with two pages, DOCX upload, passage search,
  extractive source answer with a verified page citation, explicit no-match state,
  study-kit generation, card reveal, quiz answer checking, saving a study kit to
  Study materials and re-checking its citations after reload.
- Browser-tested unified notebook cycle: source question → verified quote →
  source evidence map → source-recall practice → deterministic next action →
  saved context → reload/restore → pronoun follow-up → explicit session clear.
  A wrong practice answer was shown feedback and changed the recommendation; a
  correct retry advanced it.
- Browser-tested adaptive loop: verified answer → "Verify understanding" panel →
  wrong answer → evidence-review action → second wrong answer → closed check
  with a verified source-based worked example → reload/restore → explicit clear →
  correct retry → "Loop complete" with measured correct result. The temporary
  notebook was deleted and its local keys were removed.
- Browser-tested invalidation: deleting the source removed its quotation from both
  the Study desk and the persisted learning-context record; deleting the notebook
  removed its context, source and source-text keys.
- Browser-tested notebook-to-visual flow: a matching curated visual opens from
  the Study desk, clearly states that it is not source-grounded, and its back
  link restores the Study desk question.
- Read-aloud: the browser reported an active speech-synthesis utterance and the
  control changed to “Stop reading”. Actual audible output was not independently
  confirmed.
- Responsive check: the notebook Study desk, including the answer, evidence map,
  practice, next action and saved-session card, was rendered in a 390 px-wide
  frame with no horizontal overflow. The desktop window's own scrollbar reduced
  the content width to 375 px.

These results describe the local demo; they do not make it production-ready.

## Production work still required

- Real authentication, authorization and quotas. The gateway is loopback-bound
  with an origin allow-list, which is enough for a local demo and not enough
  for a hosted service.
- IndexedDB or server storage for larger documents.
- OCR and protected cloud document storage.
- Retrieval quality work. Retrieval is lexical today, so a question phrased
  differently from the source may find no passage.
- Concept maps, timelines, charts and other validated visual types.
- Study scheduling, mastery integration and accessibility expansion.

## License

Educational and demonstration use.
