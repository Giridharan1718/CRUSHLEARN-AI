# Phase 1 Audit and Implementation Plan — CrushLearn AI (2026-10-21)

This is the Phase 1 deliverable of the research-platform mandate: an audit of
what the repository actually contains, followed by a prioritized implementation
plan for the research workspace, notebook and source management, source-grounded
AI research, and research discovery.

Every claim below is anchored to a file and line. Where a feature is missing,
the audit says so rather than describing the intended behaviour.

---

## 1. Verification snapshot

Run on 2026-10-21 from the repository root.

| Check | Command | Result |
|---|---|---|
| JavaScript tests | `npm test` | **394 passing, 0 failing** (5.3 s) |
| Production build | `npm run build` | **Passing.** 884.44 kB main JS / 240.94 kB gzip. Existing chunk-size warning. |
| Rust gateway tests | `cargo test` (in `gateway/`) | **30 passing, 0 failing** |
| Linting | `npx eslint` | **Cannot run.** `.eslintrc.json` exists but `eslint` and `eslint-plugin-react` are not in `package.json`, not in `node_modules`, and there is no `lint` script. Lint has never run in this repo. |
| CI | — | **None.** No `.github/` directory, no other pipeline config. |
| Dependency audit | `npm audit --production` | 6 moderate, all from `mammoth → argparse → sprintf-js`. Not reachable from the browser bundle (`mammoth` is dynamically imported only on DOCX upload). |

Baseline established. Every later phase is measured against it.

---

## 2. Technology stack (preserved)

| Technology | Version | Purpose | Decision |
|---|---|---|---|
| React | 18.2 | UI | **Keep** |
| React Router | 6.21 | Routing | **Keep** |
| Vite | 5.0 | Build/dev server | **Keep** |
| Tailwind CSS | 3.4 | Styling | **Keep** — semantic token system, see §3 |
| `pdfjs-dist` | 6.4 | Local PDF text extraction | **Keep** |
| `mammoth` | 1.13 | Local DOCX text extraction | **Keep** |
| `node --test` | built-in | Test runner | **Keep** |
| Rust | — | `axum` 0.8 + `reqwest` 0.12 (rustls) + `tokio` + `serde` + `tower-http` | **Keep** — the provider gateway |

No dependency will be added for vector search, embeddings, or a UI framework.
The reasoning is in §8.

---

## 3. What is working, partially working, mocked, missing, or unverified

Status vocabulary: **WORKING** — implemented, reachable from the UI, verified
by tests and/or a browser run. **PARTIAL** — implemented and reachable, but the
capability stops short of what the product needs. **MOCKED** — a hard-coded
stand-in with no real implementation behind it. **MISSING** — not implemented.
**UNVERIFIED** — implemented but never exercised against the real dependency.

### 3.1 Core product surfaces

| Capability | Status | Evidence |
|---|---|---|
| Route shell, protected routes, 16 routes | WORKING | `src/App.jsx:66-120` |
| Notebook list: create, rename, delete | WORKING | `src/components/notebooks/NotebookListView.jsx:129-177`, `src/notebooks/notebookStore.mjs:98-148` |
| Notebook workspace three-pane layout | WORKING | `src/pages/NotebookWorkspace.jsx:646-739` (sources rail / tab body / context rail) |
| Source ingestion: `.txt` `.md` `.markdown` `.pdf` `.docx` + paste | WORKING | `src/notebooks/sourceSchema.mjs:31-37`, `src/notebooks/sourceIngestion.mjs:86-202` |
| PDF extraction with per-page offsets, JS eval disabled | WORKING | `src/notebooks/documentExtraction.mjs:72-143` (`isEvalSupported: false` at `:81`) |
| DOCX extraction | WORKING | `src/notebooks/documentExtraction.mjs:145-173` |
| Lexical retrieval (BM25 k1=1.2 b=0.75) with mandatory citation verification | WORKING | `src/notebooks/sourceRetrieval.mjs:48-193`, verification at `:152-166` |
| Extractive QA | WORKING | `src/notebooks/sourceAnswers.mjs:83-187` |
| Study kit: summary, flashcards, quiz | WORKING | `src/notebooks/studyTools.mjs:230-428` |
| Adaptive learning loop | PARTIAL | `src/intelligence/adaptiveLoop.mjs` — 4 of 11 declared actions are reachable (§3.4) |
| Visual learning (4 authored topics, typed renderer) | PARTIAL | `src/visual/visualCatalog.mjs:13` — `SUPPORTED_VISUAL_TYPES = ['process']` only |
| Knowledge-gap detection | PARTIAL | `src/utils/knowledgeGaps.js:20-91` — quiz-score based, one gap per course, no concept granularity |
| "Learning Coach" guidance card | MOCKED | `src/components/Sidebar.jsx:58-71` — hard-coded card; `src/learning/guidanceEngine.mjs` is mock content for course ids `web-dev-101` / `react-advanced` and implements none of the service contract |
| Authentication | MOCKED | `src/utils/auth.js:44-66` — accepts any email/password; the logged-in user id is the literal `'1'` (`:48`) |

### 3.2 The AI layer (`src/ai/`, `src/intelligence/`, `src/notebooks/`)

| Capability | Status | Evidence |
|---|---|---|
| Service/envelope contract | WORKING | `src/ai/contracts.mjs:165-274` — 15-field service result, `createEnvelope` |
| A/B/C/D trust separation (evidence / interpretation / hypothesis / unavailable) | WORKING | `src/ai/contracts.mjs:63-70` (`TRUST_KINDS`), `src/intelligence/adaptiveState.mjs:291-317` (16 separate state families) |
| Orchestrator dispatch, 8 tasks / 9 workflows | WORKING | `src/ai/orchestrator.mjs:72-114`, `:216-272` |
| Deterministic text explanation engine (13 exported functions, 6 levels, 8 modes) | WORKING | `src/notebooks/textExplanation.mjs` (1776 lines) |
| Citation contract + verifier | WORKING | `src/notebooks/citations.mjs:44-95` |
| Grounded model answers through the Rust gateway | WORKING (locally) / UNVERIFIED (against the live API) | `src/notebooks/groundedChat.mjs:120-263`, `gateway/src/provider.rs` |
| Citation re-verification and extractive fallback on the model path | WORKING | `src/notebooks/groundedChat.mjs:240-247`, `:265-295` |
| Research plan | PARTIAL | `src/ai/researchService.mjs:37-135` — see §3.3 |
| Evidence comparison across sources | PARTIAL | `src/ai/researchService.mjs:137-229` — real citations, no agreement/disagreement inference (stated at `:202-203`) |
| Writing outline | PARTIAL | `src/ai/writingService.mjs:18-123` — real citation plan, no drafting (`drafting.available === false`, `:96`) |
| Model-backed drafting, literature search, DOI lookup, automatic bibliography | MISSING | Listed in `unavailable` at `src/ai/researchService.mjs:110` and `src/ai/writingService.mjs:117` |
| Model tutor dialogue, generated analogies, generated diagrams | MISSING | `src/ai/tutoringService.mjs:56-58` |
| Streaming answers | MISSING | No streaming path exists in `src/notebooks/gatewayClient.mjs` |
| Visual generation for arbitrary topics | MISSING | `src/visual/visualCatalog.mjs:13` — process visuals only, 4 authored topics |

**UNVERIFIED — the single largest gap in the product's central claim:** no live
call to the Anthropic API has ever run. The request shape, headers,
`output_config` schema, refusal handling and fallback retry were written from
the API documentation and checked against a local mock of `POST /v1/messages`
that records the request it receives. The guard rails were checked over real
HTTP. The provider itself is unproven. This is recorded in `README.md:225-229`,
`gateway/README.md:279-283` and `docs/day-5/FUTURE_READINESS_AUDIT.md:382-400`.

### 3.3 The research plan is a scaffold, not a plan

`src/ai/researchService.mjs:37-135`, honestly labelled `PARTIAL`, but three
specific facts matter for the plan:

1. **`evidenceTable.rows` is always `[]`** (`:84-88`). The column list exists
   (`['Claim','Source','Location','Exact quotation','Status']`) and the note
   says *"Rows are filled only from verified source passages. Empty rows are not
   evidence."* — but nothing ever fills a row. The Phase 5 evidence table
   therefore has no implementation behind it.
2. **The search plan text is static.** All four steps (`:57-82`) are fixed
   strings. They do not vary with the research question, the available
   sources, or the subject.
3. **`sourceRows` (`:21-35`), the helper that would produce per-source
   relevance, is defined and never called.** Dead code.

The `questions` array (`:50-55`) is likewise four fixed templates with the
question interpolated. No model is involved. `externalSearch.performed` is
hard-coded `false` (`:96-100`).

This service is a good, honest skeleton. Phase 5 fills it in rather than
replacing it.

### 3.4 The adaptive loop reaches 4 of 11 declared actions

`src/intelligence/adaptiveState.mjs:27-39` declares 11 actions. The loop's
branch cascade in `src/intelligence/adaptiveLoop.mjs` only ever emits
`retrieve_source_evidence`, `verify_understanding`, `provide_worked_example`
and `summarize_or_save`. Never used: `answer_directly`,
`explain_prerequisite`, `generate_diagram`, `ask_diagnostic_question`,
`generate_practice_problem`, `investigate_conflicting_information`,
`offer_experiment`.

There is **no scoring or ranking function over the actions** — the choice is a
hard-coded cascade. Extending it means adding to the enum *and* adding a
branch, with no ranking hook in between.

The last two of those unused actions map directly onto Phase 4:
`investigate_conflicting_information` is the disagreement detector, and
`ask_diagnostic_question` is the knowledge-gap probe.

### 3.5 The storage layer

`localStorage` only. No IndexedDB, no server store, no database.
`grep -rn "indexedDB" src` returns nothing. Six separately-keyed collections:

| Collection | Key prefix | Owner |
|---|---|---|
| Notebook list | `crushlearn_notebooks_<user>` | `src/notebooks/notebookStore.mjs:16` |
| Source metadata | `crushlearn_notebook_sources_<user>::<notebook>` | `src/notebooks/notebookDataStores.mjs:16` |
| Source text | `crushlearn_notebook_source_texts_<user>::<notebook>` | `:17` |
| Chat history | `crushlearn_notebook_chat_<user>::<notebook>` | `:18` |
| Study materials | `crushlearn_notebook_materials_<user>::<notebook>` | `:19` |
| Learning context | `crushlearn_notebook_learning_context_<user>::<notebook>` | `src/intelligence/notebookContextStore.mjs:12` |

All envelopes are versioned with `NOTEBOOK_SCHEMA_VERSION = 1`. **A version
mismatch causes silent data loss** — the collection returns `[]` and there is
no migration path (`src/notebooks/notebookStore.mjs:48-55`,
`src/notebooks/notebookDataStores.mjs:167-175`).

---

## 4. Security findings

Ordered by severity.

### 4.1 No XSS sinks — clean

`grep -rn "dangerouslySetInnerHTML|innerHTML|eval(|new Function|document.write" src/ gateway/src/`
returns only one authored course string that mentions `innerHTML` as course
content (`src/content/courses/webDevelopment.mjs:413`) and two false-positive
`evaluate` matches. There is no HTML injection sink in the app.

Upload handling is correct by construction: `src/notebooks/documentExtraction.mjs`
reads bytes only, PDF JavaScript evaluation is disabled
(`isEvalSupported: false`, `:81`), and text is never evaluated. The module
header states this and the code honours it.

### 4.2 The provider key is structurally protected — good

The key lives only in the Rust process's environment, is never written to
disk, never returned by an endpoint and never logged. It is never a
`VITE_`-prefixed variable, because Vite inlines every `VITE_*` value into the
client bundle. The browser sends only already-verified source passages to the
gateway, and re-verifies every returned citation a second time. This is the
single strongest part of the codebase and must be preserved by every later
phase.

### 4.3 The gateway is loopback-bound with an origin allow-list — adequate for a local demo, not for a host

`GATEWAY_ALLOWED_ORIGINS` defaults to the two Vite dev origins
(`gateway/README.md:89`). The gateway refuses a disallowed `Origin` with
`origin_not_allowed`. For a local demo that is sufficient. For a hosted
service it is not, and the same is true of the auth model below.

### 4.4 Authentication is a demo, and one line of it is a real bug

`src/utils/auth.js:44-66` — `login` accepts any email with any password, and
`register` (`:10-41`) stores the password nowhere. Two consequences:

- **`src/utils/auth.js:48` hard-codes the user id to the string `'1'`.** Every
  user who logs in through the login form is the *same* user as far as the
  notebook store is concerned. `getNotebooksStorageKey(userId)` keys every
  notebook on that id, so two people using the same browser share one set of
  notebooks, sources, chat history and study materials. `register` uses
  `Date.now().toString()` (`:23`) instead, so registered and logged-in users
  live in separate silos.
- There is no logout-time cleanup of notebook data, and `notebookStore.clear`
  (`src/notebooks/notebookStore.mjs:157-159`) has zero callers.

Not a vulnerability to be exploited in a single-user demo, but it must be
stated plainly and fixed before the product is described as multi-user.

### 4.5 Citation invalidation is enforced in exactly one direction

`src/notebooks/citations.mjs:89-94` returns `{ok, verified, ...}` where `ok`
means "no rule was violated" and `verified` means "the quote was found at those
offsets in the source text". These are not the same thing:

- A `page`-locator citation can **never** be `verified` — the `verified = true`
  assignment at `:82` sits inside the `kind === 'offset'` branch (`:70`). A
  page citation returns `{ok: true, verified: false, errors: []}`.
- With `requireSourceText: false` and no text present, a well-formed offset
  citation also returns `{ok: true, verified: false, errors: []}`.

Most call sites check only `ok` — but they all pass `requireSourceText: true`,
which makes `ok` imply `verified` in those paths. The single site that checks
`verified` is `src/notebooks/groundedChat.mjs:73`. This is currently correct
but fragile: a future call site that checks only `ok` would accept an
unverified citation. The invariant should be enforced in the function rather
than in each caller.

### 4.6 Deleted notebooks leave orphaned records behind

`src/notebooks/notebookRepository.mjs:62-72` clears the source, source-text,
chat, materials and context collections on delete, but **not** the explanation
records in `crushlearn_explanation_records_v1`. `explanationRecord.mjs:137-144`
has a `clear(userId, notebookId)` method, and nothing in the deletion path
calls it — the only callers of the module are in
`src/components/notebooks/ExplanationPanel.jsx:15,92`.

### 4.7 Moderate dependency advisory

6 moderate advisories, all `mammoth → argparse → sprintf-js`. `mammoth` is
dynamically imported and only reached on DOCX upload
(`src/notebooks/documentExtraction.mjs:146`), so the vulnerable path is not in
the initial bundle. Low practical risk; worth tracking.

---

## 5. Broken workflows and genuine defects

Verified by reading the code, not inferred.

The **Status** column records the P0 delivery (2026-10-21). `Fixed` means the
defect is corrected and covered by a test. `Open` means it is still live.

| # | Defect | Location | Effect | Status |
|---|---|---|---|---|
| 1 | **No-op ternary discards the generator label** | `src/intelligence/learningContext.mjs:97-98` | `record.generator === 'local_extractive' ? 'local_extractive' : 'local_extractive'` — both branches are identical, so every saved context record is forced to `local_extractive`. A model-backed (`ai_grounded`) answer saved into the learning context is silently relabelled as local extraction. **This is the most serious defect found: it is exactly the kind of silent mislabeling the product's honesty rules forbid.** | **Fixed** (P0.1) |
| 2 | Search limit clamping is inverted for non-positive limits | `src/notebooks/sourceRetrieval.mjs:190` | `Math.max(1, Math.min(Number(limit) \|\| 0, MAX_SEARCH_RESULTS))` — `limit: 0` yields **1** result, not 0. A caller asking for no results gets one. | **Fixed** (P0.2) |
| 3 | `getSourceText` depends on `this` | `src/notebooks/notebookRepository.mjs:154-157` | The only repository method that breaks if destructured. All siblings use closure variables. | Open (P1) |
| 4 | No retry or re-ingest path for a failed source | `src/notebooks/sourceIngestion.mjs` | `queued` and `processing` are dead constants (`src/notebooks/sourceSchema.mjs:25-26`); only `ready` and `failed` are ever written. A failed PDF can only be deleted and re-added. | Open (P1) |
| 5 | `update` cannot distinguish "not provided" from "clear" | `src/notebooks/notebookStore.mjs:130-133` | `input?.title ?? existing.title` — `title: null` falls back to the existing title. | Open (P1) |
| 6 | `addSource` error message is misleading | `src/notebooks/notebookRepository.mjs:80,91` | Calling `addSource(u, n)` throws `'Invalid source record.'` when the real problem is the missing argument. | Open (P1) |
| 7 | `MAX_SERVICE_CALLS` is inert | `src/ai/contracts.mjs:73`, `src/ai/orchestrator.mjs:353,423` | The cap is 5, but `executeWorkflow` always returns exactly one service result. The multi-service machinery (`combine`, `sumServiceMetrics`, `statusFromResults`) is written and unused. **It is the designed extension point.** | **Fixed** (P0.7 — `DIRECT_EXPLANATION` now runs two services) |
| 8 | `isWorkflowAvailable` has zero consumers | `src/ai/orchestrator.mjs:446-455` | The gate exists but the UI never calls it, and it does not check identity the way `checkAccess` does. | Open (P2) |
| 9 | `WORKFLOW_IDS.UNDERSTANDING_CHECK` is a dead id | `src/ai/contracts.mjs:40` | Declared but never returned by `chooseWorkflow`; `assess` maps to `PRACTICE_CHECK`. | Open (P3) |
| 10 | `visualLearningService.mjs` is dead code | `src/ai/visualLearningService.mjs` | No consumers. The live visual recommendation map is a separate copy in `src/notebooks/textExplanation.mjs:943-953` with **different wording for the same 9 subjects**. | **Fixed** (P0.7) |
| 11 | `SOURCE_SCHEMA_VERSION` is orphaned | `src/notebooks/sourceSchema.mjs:9` | The source collection is versioned by `NOTEBOOK_SCHEMA_VERSION` instead. | Open (P1) |
| 12 | `'ai_assisted'` generator is never produced | `src/notebooks/notebookDataStores.mjs:28` | Declared in `MATERIAL_GENERATORS`, produced by nothing. It is the natural slot for model-backed materials. | Open (P3) |
| 13 | `validateMessageCitations` has no production caller | `src/notebooks/citations.mjs:97-117` | Only tests call it. | Open (P3) |
| 14 | `notebookStore.clear` has zero callers | `src/notebooks/notebookStore.mjs:157-159` | No "delete all my data" path exists. | Open (P2) |

---

## 6. Duplicated components and logic

| Helper | Copies | Locations |
|---|---|---|
| `sourceTextMap` | **5** | `src/ai/contracts.mjs:86` (exported), `src/notebooks/groundedChat.mjs:39`, `src/notebooks/sourceAnswers.mjs:24`, `src/intelligence/adaptiveLoop.mjs:70`, `src/intelligence/notebookOrchestrator.mjs:37` |
| `readySources` | 2 | `src/ai/contracts.mjs:80`, `src/notebooks/groundedChat.mjs:48` |
| `verifyCitations` | 2 | `src/ai/verificationService.mjs:22`, `src/notebooks/groundedChat.mjs:61` — with **different** source-id filtering (all sources vs. ready sources) |
| `keyPart` | **3** (byte-identical) | `src/notebooks/notebookStore.mjs:18`, `src/notebooks/notebookDataStores.mjs:30`, `src/intelligence/notebookContextStore.mjs:16` |
| `assertStorage` | 3 | `src/notebooks/notebookStore.mjs:29`, `src/notebooks/notebookDataStores.mjs:64`, `src/intelligence/notebookContextStore.mjs:30` |
| `getContent` | 3 (byte-identical) | `src/notebooks/sourceRetrieval.mjs:21`, `src/notebooks/sourceAnswers.mjs:19`, `src/notebooks/studyTools.mjs:20` |
| Citation-verifier shapes | 4 different signatures | `verificationService.mjs:22`, `groundedChat.mjs:61`, `adaptiveLoop.mjs:88` (predicate), `notebookOrchestrator.mjs:46` (full result) |
| `'local_extractive'` literal | 21 sites | 3 competing constants + inline literals + `MATERIAL_GENERATORS` |
| `'ready'` status literal | 7 sites | should use `SOURCE_STATUSES.READY` |
| `'offset'` locator literal | 5 sites | should use `CITATION_LOCATOR_KINDS.OFFSET` |
| Visual recommendation map | 2 | `src/ai/visualLearningService.mjs:18-55` (dead), `src/notebooks/textExplanation.mjs:943-953` (live) |
| Practice-question builder | 3 | `textExplanation.mjs:1522`, `notebookOrchestrator.mjs:100`, `studyTools.mjs:344` — with two different answer checkers |
| Text-understanding re-run | 3× per guided turn | `tutoringService.mjs:20,33` → `assessmentService.mjs:31` → `explainSelection` runs twice over the same text |

Approximately 20 orphaned exports across the notebook subsystem (full list in
§3 of the source audit; the load-bearing ones are rows 11-14 in §5).

**Why this matters more than it looks:** the 5 copies of `sourceTextMap` are
not equivalent. Only the `src/ai/contracts.mjs` copy filters to ready sources.
The other four can map text for a source that is not `status: 'ready'` — that
is, a source that failed extraction and has no text. Consolidating them is a
correctness fix, not only tidiness.

---

## 7. Architectural limitations

1. **Retrieval is lexical only.** BM25 over a hand-rolled tokenizer
   (`src/notebooks/sourceText.mjs:31-46`, 150 stop words, no stemming, no
   n-grams, no embeddings, no semantic search). A question phrased differently
   from the source finds nothing. The app answers honestly when this happens
   (`src/notebooks/sourceAnswers.mjs:108-120`), but the capability ceiling is
   real.
2. **No per-source filter anywhere.** `searchNotebookSources` takes
   `sources` and always searches all of them; there is no `sourceId` filter
   (`src/notebooks/sourceRetrieval.mjs:48-53`). Search-within-one-document is
   not a new algorithm — it is the same function with a one-element source
   array. The building blocks (`chunkSourceText`, `splitTextIntoSentences`,
   `findPageNumber`, `tokenize`) are already exported.
3. **The notebook record is a strict whitelist.** `normalizeNotebookRecord`
   (`src/notebooks/notebookSchema.mjs:78-84`) constructs a fresh object
   literal, so any unrecognised key is dropped on read. There is **no**
   `subject`, `course`, `assignment`, `project`, `tags`, `folder`, `order` or
   `archived` field. `NotebookListView.jsx:124-125` tells the user *"Create a
   notebook for a course, project or topic"* — but that is guidance text with
   no structural backing.
4. **No archive, no trash.** `grep -rn "archive" src` returns one unrelated
   course-content string. Deletion is hard and immediate
   (`src/notebooks/notebookRepository.mjs:62-72`).
5. **No export or import of notebook content.** The only `Blob` in the
   notebook UI exports *explanation metadata* as JSON
   (`src/components/notebooks/ExplanationPanel.jsx:244-249`), deliberately
   excluding source quotations. `explanationRecord.mjs` has **no import
   path** at all. `docs/day-3/NOTEBOOK_FOUNDATION.md:248` confirms: *"The
   notebook UI is local-only and has no import or export."*
6. **One provider path in the entire codebase.** `src/ai/retrievalService.mjs:138`
   → `src/notebooks/groundedChat.mjs:120` → `src/notebooks/gatewayClient.mjs:137`
   → Rust gateway → Anthropic. It is reachable only for the
   `source_grounded_qa` workflow, and only in the **async** orchestrator
   (`src/ai/orchestrator.mjs:403-404`). Every other workflow is 100%
   deterministic. The gateway's schema is a single question/answer shape
   (`gateway/src/provider.rs:15-42`).
7. **`src/ai/` and `src/intelligence/` are parallel universes.** The `src/ai/`
   layer is the contract-based orchestrator. The `src/intelligence/` layer
   (adaptive loop, learning context, notebook orchestrator) predates it,
   implements no service contract, and is what the Study desk actually uses.
   The two are bridged by exactly one call: `runAdaptiveLearning`
   (`src/ai/adaptiveLearningService.mjs:34`) wrapping `runAdaptiveLoop`. The
   Study desk UI drives the `src/intelligence/` path; the Chat tab drives the
   `src/ai/` path. Two engines, one product.
8. **Storage is `localStorage`.** A 500 000-character source plus its text
   record will approach the ~5 MB per-origin quota. `NotebookWorkspace.jsx:320-328`
   catches the resulting `QuotaExceededError` and reports *"Browser storage may
   be full."* IndexedDB is the right answer for real document work.
9. **The `guidanceEngine.js` / `src/ai/` split.** `src/ai/guidanceEngine.js`
   shares no code with the contract system and is mock content for the older
   course pages. It is the one file in `src/ai/` that is not part of the
   architecture.

---

## 8. Prioritized implementation plan

### Principles that constrain the plan

1. **Preserve the grounding invariant.** Retrieval stays in the browser. The
   gateway never sees the source library. Every citation is verified against
   the stored source text before it is shown — twice on the model path. No
   phase may weaken this.
2. **Never fabricate.** No invented quotation, page number, source title, DOI
   or reference. When evidence is insufficient, say so. The Phase-4
   A/B/C/D separation already exists in `TRUST_KINDS`
   (`src/ai/contracts.mjs:63-70`) and is the vehicle.
3. **Add no dependency that needs a new key or a server.** No vector database,
   no embedding API, no UI framework, no state library. Reranking will be done
   with the provider that is already configured, and retrieval stays transparent
   BM25 plus a model rerank.
4. **Label the origin of every generated artifact.** The product's credibility
   is that a model answer, a local extraction and a rule-based inference are
   never confused. Defect #1 in §5 shows what happens when that slips.
5. **Do not rewrite.** Extend the existing modules at their existing seams.

### Dependency graph

```
P0  Foundation        (bug fixes + helper consolidation)
     │
     ├──► P1  Data model        (organization, archive, search-within, export, dependency graph)
     │        │
     │        ├──► P2  Research workspace   (Phase 2 UI)
     │        │
     │        └──► P4  Research discovery  (Phase 5)  ── depends on P3
     │
     └──► P3  Grounded research engine (Phase 4)  ── depends on P1 (source selection) 
              │                                          and P2 (evidence UI)
              │
              └──► P4  Research discovery (Phase 5)
```

P1 precedes P2 because the workspace's left sidebar must group notebooks by
subject / course / assignment / project, and that grouping must be stored
before there is a sidebar to render it in. P3 precedes P4 because discovery
must be able to compare sources and detect disagreement before it can identify
a research gap.

---

### P0 — Foundation (blocking everything)

**Why first:** three of the fourteen defects corrupt the product's core
promise, and the helper duplication is the direct cause of one of them.

| Task | Files | Acceptance criteria |
|---|---|---|
| P0.1 Fix the generator no-op ternary | `src/intelligence/learningContext.mjs:97-98` | `normalizeContextCitation` preserves the incoming generator from the allowed set (`local_extractive`, `ai_grounded`, `rule_based_interpretation`), falling back to `local_extractive` only for an unknown value. A test asserts an `ai_grounded` context survives a save/load round trip with its label intact. |
| P0.2 Fix the search limit clamp | `src/notebooks/sourceRetrieval.mjs:190` | `limit <= 0` returns zero results; `limit > MAX_SEARCH_RESULTS` returns 12; the default is unchanged. Test covers `0`, `-5`, `1`, `12`, `50`. |
| P0.3 Clear explanation records on notebook delete | `src/notebooks/notebookRepository.mjs:62-72` | After `deleteNotebook`, `explanationRecord.list(userId, notebookId)` is empty. Test asserts the key is gone from storage. |
| P0.4 Consolidate the shared helpers | new `src/notebooks/sourceAccess.mjs` | One exported `readySources`, one `sourceTextMap` (ready-filtered, matching the `src/ai/contracts.mjs` semantics), one `getContent`, one `verifyCitations`, one `keyPart`, one `assertStorage`. Every duplicate is deleted, not re-exported. `grep` shows one definition of each. |
| P0.5 Centralise the string constants | `src/notebooks/sourceSchema.mjs`, `src/notebooks/citations.mjs` | `SOURCE_STATUSES.READY`, `CITATION_LOCATOR_KINDS.OFFSET` and a single `GENERATORS` constant replace the 21 `'local_extractive'`, 7 `'ready'` and 5 `'offset'` literals. |
| P0.6 Enforce `verified` inside `validateCitation` | `src/notebooks/citations.mjs:89-94` | A citation that is not `verified` is not `ok` when `requireSourceText` is set. Existing call sites keep working; a test asserts a page-locator citation and a text-less offset citation both fail under `requireSourceText: true`. |
| P0.7 Remove the dead branches | `src/ai/visualLearningService.mjs`, `src/ai/guidanceEngine.js` | Either the dead code is deleted or it is wired in and given the service contract. No file in `src/ai/` is both unimported and a mock. |

**Definition of done:** `npm test` ≥ 394 passing (strictly more, since P0
adds tests), `npm run build` clean, and the §5 defect table is empty.

---

### P0 — delivery record (2026-10-21)

All seven P0 tasks are implemented and verified. `npm test` reports **419
passing, 0 failing**; `npm run build` completes clean. The 25 new tests come
from three files: `tests/notebooks/foundationFixes.test.mjs` (9),
`tests/notebooks/citationVerification.test.mjs` (7),
`tests/notebooks/visualLearningService.test.mjs` (3) and
`tests/learning/guidanceEngine.test.mjs` (5).

| Task | What was actually done | Where |
|---|---|---|
| P0.1 | New `src/notebooks/generators.mjs` defines the generator vocabulary. `normalizeContextCitation` now calls `normalizeGenerator(record.generator, GENERATORS.LOCAL_EXTRACTIVE)`, so an `ai_grounded` answer keeps its label through a save/load round trip. | `src/notebooks/generators.mjs`, `src/intelligence/learningContext.mjs` |
| P0.2 | The `Math.max(1, ...)` clamp is replaced with an explicit clamp that maps a non-positive or negative limit to zero results and caps a large limit at `MAX_SEARCH_RESULTS`. | `src/notebooks/sourceRetrieval.mjs:183-191` |
| P0.3 | `deleteNotebook` now calls `explanationRecords.clear(userId, notebookId)`. The records live under their own storage key and were previously left behind. | `src/notebooks/notebookRepository.mjs` |
| P0.4 | New `src/notebooks/sourceAccess.mjs` holds one `readySources`, one `sourceTextMap`, one `getContent` and one `getSourceText`. The private copies in `contracts.mjs`, `groundedChat.mjs`, `sourceRetrieval.mjs`, `studyTools.mjs`, `sourceAnswers.mjs`, `adaptiveLoop.mjs` and `notebookOrchestrator.mjs` are deleted, not re-exported. | `src/notebooks/sourceAccess.mjs` + 7 call sites |
| P0.5 | `SOURCE_STATUSES.READY`, `CITATION_LOCATOR_KINDS.OFFSET` and `GENERATORS.*` now replace every literal. `grep` finds one definition of each. `MATERIAL_GENERATORS` was added to `generators.mjs` for the narrower vocabulary a saved material can carry, and `normalizeMaterialGenerator` replaces the inline set in `notebookDataStores.mjs`. | `src/notebooks/generators.mjs`, `src/notebooks/sourceSchema.mjs`, `src/notebooks/citations.mjs` |
| P0.6 | `validateCitation` now rejects a citation it could not verify when `requireSourceText` is set. A page locator names a page, not a passage, so it can never be verified; an offset locator whose source text was not loaded can never be verified either. The four call sites that read `ok` where they meant `verified` (`adaptiveLoop`, `learningContext`, `StudyMaterialsPanel`, `groundedChat`) now read `verified`. | `src/notebooks/citations.mjs:44-130` + 4 call sites |
| P0.7 | `visualLearningService.mjs` was wired into the `DIRECT_EXPLANATION` workflow and now reads the one shared visual map (`VISUAL_REPRESENTATIONS` in `textExplanation.mjs`) instead of holding a second copy. `guidanceEngine.js` moved out of `src/ai/` to `src/learning/guidanceEngine.mjs` because it implements none of the service contract, and its `getHints` was fixed to be course-scoped. | `src/ai/visualLearningService.mjs`, `src/ai/orchestrator.mjs`, `src/learning/guidanceEngine.mjs` |

**Two corrections to the audit as written.** The plan listed
`src/ai/guidanceEngine.js` as dead. It was not: `Dashboard.jsx`,
`Lesson.jsx` and `SkillPassport.jsx` all import it. The real defect was
different and worse than "unimported" — `getHints(lessonId)` was keyed by
lesson id alone, and `lesson-1` exists in all three authored courses, so a
learner studying Python was shown the HTML hints written for the web
development course. The fix keys the hints by course and lesson, and a test
pins it. The audit also described `visualLearningService.mjs` as duplicated
rather than dead-and-unreachable; it is now reachable from the orchestrator.

---

### P1 — Notebook and source management (Phase 3, data half)

**Why this order:** the workspace UI (P2) and the research engine (P3) both
need to select, group and delete sources. That capability has to exist and be
correct before it can be surfaced.

| Task | Detail | Acceptance criteria |
|---|---|---|
| P1.1 Notebook organization | Add `kind` (`subject` \| `course` \| `assignment` \| `project`), `tags[]`, and `archivedAt` to the notebook record. Bump `NOTEBOOK_SCHEMA_VERSION` to 2 with a **migration** that maps v1 records to v2 with `kind: 'subject'`, `tags: []`, `archivedAt: null` — no silent data loss this time. | A v1 notebook stored today loads after the change with its title, description and sources intact. Test writes a v1 payload, reads it through the new store, asserts the migration. |
| P1.2 Archive and restore | `archiveNotebook` / `restoreNotebook` in the repository; archived notebooks are hidden from the default list and reachable from a filter. | Archiving preserves every source, chat message and material. Archived notebooks do not appear in the default list, do appear under "Archived", and can be restored. |
| P1.3 Source search-within | Add a `sourceId` option to `searchNotebookSources`; build a `SourceViewer` that shows the passage in context with its page. | Searching inside one source returns only that source's passages, each with a correct page number when page offsets exist. A citation from that search validates. |
| P1.4 Source preview | Show the first N characters of a ready source, its page count and character count, with a "view full text" affordance. | The preview text is byte-identical to the stored source text. |
| P1.5 Source dependency map | Before deleting a source, list every saved material, chat message and learning-context record that cites it. | Deleting a source that is cited by a study material surfaces a list of the dependent items first. Deleting a source with no dependents asks the ordinary confirmation. |
| P1.6 Export | Export a notebook as Markdown (sources with headings, chat, materials, citations) and as JSON (full fidelity, re-importable). | The Markdown export contains every source title, every chat turn and every material, with citation labels. The JSON export round-trips: export → import → identical notebook. |
| P1.7 Import | JSON import into a new notebook, with validation and an honest report of what was rejected. | Importing a malformed file produces a readable error and imports nothing. Importing a valid file produces a notebook whose sources can be searched and cited. |
| P1.8 Web sources | Add a `web` source type. Fetching must happen **server-side** — add `POST /api/fetch` to the Rust gateway, which fetches a URL, extracts readable text, and returns it with the retrieved URL and timestamp. The browser ingests the result as a source. | A URL that cannot be reached produces a failed source with the real reason, never a fabricated success. A source created from a URL records the URL and retrieval date. Block private/link-local IP ranges and non-http(s) schemes. |
| P1.9 Re-ingest | A failed source can be retried without deleting and re-adding it. `queued` and `processing` stop being dead constants. | A failed PDF that later becomes readable reaches `ready`; a still-failing one stays `failed` with its error. |
| P1.10 Storage headroom | Move source text to IndexedDB behind the same repository interface, keeping `localStorage` for metadata. | The repository interface is unchanged; a 400 000-character source is stored and retrievable. A storage failure surfaces a clear message, not a generic one. |

**Definition of done:** every Phase 3 requirement above is reachable from the
UI and covered by a test; a notebook can be exported and re-imported without
loss; deleting a source shows what depends on it.

#### P1 delivery record (2026-10-21)

**P1.1 — notebook organization, with a v1 → v2 migration. Done.**

`src/notebooks/notebookSchema.mjs` now carries `NOTEBOOK_KINDS`
(`subject` | `course` | `assignment` | `project`), `tags[]` and
`archivedAt`, and `NOTEBOOK_SCHEMA_VERSION` is 2.

The version bump was the dangerous part, and it was dangerous in **two**
places, not one. The obvious one is the notebook metadata store. The
subtle one is that the notebook-scoped collections — sources, extracted
source text, chat history and study materials — are versioned by the
*same* `NOTEBOOK_SCHEMA_VERSION` constant
(`src/notebooks/notebookDataStores.mjs:8`). Bumping the constant without a
migration path on both sides would have silently emptied every existing
learner's notebooks *and* every source, chat turn and material inside
them, on the very first read after the update.

Both now migrate instead of discarding:

- `migrateNotebookPayload` (schema) maps a v1 payload to v2, defaulting
  `kind: 'subject'`, `tags: []`, `archivedAt: null`, and leaves a current
  payload untouched.
- `migrateCollectionPayload` (schema) stamps a v1 collection payload with
  the current version. The item shape did not change, so nothing else in
  the collection needed rewriting.
- The store rewrites the migrated payload back to storage once, so the
  migration does not re-run on every read and the stored copy matches
  what the app now understands.
- A payload from a *newer* schema than this build understands is refused,
  not guessed at. Reading a future shape would be worse than refusing to
  read it.

`updateNotebook` now also carries `kind` and `tags`, and preserves the
existing values on a partial update.

**P1.2 — archive and restore. Done.**

`archiveNotebook` / `restoreNotebook` on the repository, backed by
`setArchived` on the store. Archiving is a flag, never a deletion: the
notebook, its sources, its chat history and its study materials all stay
in storage. `listNotebooks(userId, { includeArchived, kind, tag })` filters;
`listArchivedNotebooks(userId)` returns the archived set.

The repository refuses to archive another user's notebook by throwing
`NotebookNotFoundError` — the same behaviour `updateNotebook` already had —
rather than returning a silent no-op that a caller could mistake for
success.

**Reachable from the UI.** The notebook list gains a kind selector and a
tag field on creation, shows the kind and tags on each card, and has an
Archive/Restore action plus a "Show archived" toggle. The workspace header
shows the kind, the tags and an "Archived" badge, and offers Archive and
Restore alongside Delete.

**Tests:** `tests/notebooks/notebookOrganization.test.mjs` (11 tests) and
three new cases in `tests/notebooks/notebookRendering.test.mjs`. The
migration test writes a v1 payload — notebooks, sources, source text and
chat history — downgrades every stored key to schema v1, then reads it
back through a fresh repository and asserts the notebook, its source, its
extracted text and its chat turn all survived.

**One test expectation was wrong, not the code.** The test asserted that
archiving another user's notebook returns `undefined`; the repository
throws `NotebookNotFoundError`, consistent with `updateNotebook`. The
test was corrected to expect the throw.

`npm test` → 501 passing, 0 failing. `npm run build` → clean.

#### P1.3 delivery record (2026-10-25)

**P1.3 — source search-within. Done.**

`searchNotebookSources` accepts a `sourceId` scope. The scope is resolved
before retrieval runs, so a source that is not in the notebook fails with
`That source is not in this notebook.` instead of silently searching every
source. `SourceViewer` in the workspace exposes the scoped search, opens the
matched passage in the source's own text, and labels it with the source title
and page. `buildPassageContext` returns the exact stored slice plus the
`before`/`after` context, so the highlight matches the citation offsets.

Two correctness fixes came out of the P1.3 test run:

- **Chunks no longer cross page boundaries.** A chunk that spans pages can
  only carry one page number, so a passage on the next page was attributed to
  the previous page. `buildNotebookChunks` now splits each source into
  page-bounded sections first; a search result's page is therefore the page
  the passage actually sits on.
- **The empty-result branch returns `errors` as an array.** It previously
  returned a bare string from the `chunks.length === 0` path, which broke the
  shared result shape (`errors.join` in callers and tests).

**Tests:** `tests/notebooks/sourceRetrieval.test.mjs` now covers scoped
search, page reporting, scoped citations, missing sources and no-text sources.
The fixture's page offsets were corrected so page 1 actually ends at the page
boundary used by the test, and the economics fixture includes an `energy`
sentence so the scoped-search test has a real match to find.

`npm test` → **531 passing, 0 failing**. `npm run build` → clean (existing
chunk-size warning only).

#### P1.4-P1.7 and P1.9 delivery record (2026-10-25)

**P1.4 - source preview. Done.**

`getSourcePreview` (`src/notebooks/sourceAccess.mjs`) returns the exact opening
slice of the stored text (400 characters by default), the total length and a
`hasMore` flag. `SourceViewer` shows that slice unchanged, the source title, its
character count and page count, and a "View full text" control when the source
is longer. A ready source whose stored text is missing shows an honest "could
not be loaded" alert instead of a blank or reconstructed preview. The preview is
`String.prototype.slice`, not a summary or a normalised copy.

Tests: `tests/notebooks/sourcePreview.test.mjs`; rendering cases in
`tests/notebooks/notebookRendering.test.mjs`.

**P1.5 - source dependency map. Done.**

`src/notebooks/sourceDependencies.mjs` scans study materials, chat messages and
the learning context recursively, cycle-safely, and counts citation-shaped
objects per source id. `repository.listSourceDependents` exposes the result.
Deleting a cited source now names each dependent record (label, excerpt and
citation count) and warns that the citations will no longer point at stored
text. A source with no dependents keeps the ordinary confirmation.

Tests: `tests/notebooks/sourceDependencies.test.mjs` and the dependency case in
`tests/notebooks/repository.test.mjs`.

**P1.6 - export. Done.**

`src/notebooks/notebookTransfer.mjs` builds the JSON payload and the Markdown
rendering; `repository.exportNotebook` returns the filename, MIME type and
content. JSON preserves source ids, text, page offsets, chat turns, materials,
timestamps and the learning context. Markdown contains every source title and
full source text, every chat turn, every material and citation labels. The
workspace header has an Export menu for both formats. Filenames are derived from
the title and export date and are safe for a download.

Tests: `tests/notebooks/notebookTransfer.test.mjs`; the round-trip case in
`tests/notebooks/repository.test.mjs`.

**P1.7 - import. Done.**

Import validates the whole payload before the first write. It accepts ready
sources with stored text and failed sources with their error, and rejects
queued/processing sources, malformed records, duplicate ids, oversized
collections, invalid notebook timestamps, reserved object-key source ids and
citations to sources that are not part of the same export. It preserves source,
chat and material ids (citations depend on them), source text and offsets, and
the notebook's original creation/update timestamps; the user and notebook scope
are remapped to the importing account and the new notebook. If any storage write
fails, the partially created notebook is removed. The import panel reports every
validation error and clears the file only after a successful import.

Tests: malformed, dangling-citation, invalid-date and round-trip cases in
`tests/notebooks/repository.test.mjs`; transfer tests in
`tests/notebooks/notebookTransfer.test.mjs`.

**P1.9 - re-ingest. Done.**

A failed source in `SourceList` now offers Retry and accepts a replacement file.
The source moves through `queued` and `processing` (so those statuses are no
longer dead constants), then is replaced in place with either the ready text or
the real extraction error. Its id and creation time are preserved so existing
citations stay attached. If extraction or storage throws after the status
changed, the catch path records the real failure instead of leaving the source
stuck in `processing`; a source that disappeared is reported as missing.

Tests: the retry case in `tests/notebooks/repository.test.mjs`; the Retry
control rendering case in `tests/notebooks/notebookRendering.test.mjs`.

**Not completed in this pass, with reasons and next steps.**

- **P1.8 web sources.** This must be a server-side fetch. Doing it in the
  browser would be blocked by CORS for most sites and would expose the learner's
  network position. The Rust gateway needs a `POST /api/fetch` that (1) allows
  only `http`/`https`, (2) resolves the host and rejects loopback, private,
  link-local, multicast and unspecified addresses on every redirect hop,
  (3) caps redirects, time and response size, (4) checks the content type, and
  (5) extracts readable text. Then add the `web` source type and record the URL
  and retrieval time. This is the next P1 task.
- **P1.10 storage headroom.** The repository and its stores are synchronous
  `localStorage` APIs. IndexedDB is asynchronous, so moving source text behind
  it requires either an async repository (and every caller changed) or a
  preloaded in-memory cache with a synchronous facade. Neither is a drop-in
  change. The safe sequence is: add an async storage adapter with an in-memory
  cache, move source text first while keeping metadata in `localStorage`,
  migrate existing text on first read, surface quota failures with the real
  error, and test a 400,000-character source. No partial migration should be
  shipped, because a half-migrated notebook would lose citations.

**Verification.** `npm test` -> **553 passing, 0 failing**. `npm run build` ->
passing, with only the pre-existing Browserslist, externalized `node:crypto`
and chunk-size warnings. A manual browser check of the new preview, export,
import and retry controls is still recommended before release.

---

### P2 — Research workspace (Phase 2)

The three-pane layout already exists at
`src/pages/NotebookWorkspace.jsx:646-739`. Phase 2 is about giving it the
NotebookLM-class information architecture the mandate describes, without
cluttering the centre.

| Task | Detail | Acceptance criteria |
|---|---|---|
| P2.1 Left sidebar | Navigation, notebooks (grouped by `kind` from P1.1), recent conversations, saved materials. | The sidebar lists notebooks grouped by kind, the 5 most recent chat threads with their notebook, and the most recently saved materials. Every item is a link, keyboard-reachable, with a visible focus ring. |
| P2.2 Contextual panel | Sources, notes, concepts, related materials, replacing the current status panel. | The panel shows the four groups. "Concepts" are extracted deterministically from source text and labelled rule-based. A source can be opened, searched and cited from the panel. |
| P2.3 Keep the centre clear | Advanced research tools (comparison, evidence tables, gap analysis) are revealed on demand, not always visible. | The default centre column shows the conversation and nothing else. Advanced tools open in a disclosure that is keyboard operable and reports its expanded state. |
| P2.4 States | Search, loading, empty, error and success for every panel and for the ask flow. | Each state is reachable and each names what went wrong and what to do next. No state renders a blank region. |
| P2.5 Responsive | Tablet and mobile layouts; the three panes collapse to a single scrolling column with a pane switcher. | At 390 px the workspace has no horizontal overflow and every control is reachable. At 768 px the sidebar collapses to a drawer. |
| P2.6 Accessibility | Keyboard navigation, focus management, contrast, and screen-reader labels on the new regions. | Every interactive element is reachable and operable by keyboard. Focus moves into an opened panel and returns on close. Text meets 4.5:1 in both themes. |
| P2.7 Reveal advanced tools | A "Research tools" group: compare sources, evidence table, follow-up questions, what the sources cannot establish. | Each tool states whether it is available, and why not when it is not. |

**Definition of done:** the workspace meets the Phase 2 requirement list
end to end, verified in a browser in both themes and at 390 px, with a
Lighthouse accessibility score of 100 as the previous pages hold.

---

### P3 — Source-grounded AI research (Phase 4)

The gateway already answers one question shape. This phase extends the
provider contract to the research operations the mandate lists, keeping the
two-step citation verification intact.

| Task | Detail | Acceptance criteria |
|---|---|---|
| P3.1 Multi-source answer | Extend the gateway schema from one answer to a set of *claims*, each citing a span index. | A question whose answer spans two sources returns claims citing both, each verified against its own source before display. |
| P3.2 Comparison | Compare arguments, methods, assumptions and conclusions across sources. | The comparison lists each source's position on each dimension with a citation, and states explicitly that agreement or disagreement is **not** inferred automatically where the model does not assert it. |
| P3.3 Disagreement detection | Activate the `investigate_conflicting_information` action in the adaptive loop and add a gateway operation for it. | Two sources that make opposing claims are surfaced as a disagreement with both quotations, each verified. Sources that merely differ in wording are not reported as a conflict. |
| P3.4 Unsupported claims | Identify claims in the answer that the retrieved evidence does not support. | Every claim is classified as supported, partially supported, or unsupported, and an unsupported claim is shown with the evidence that fails to cover it — not hidden. |
| P3.5 Follow-up questions | Generate follow-up questions, grounded in the sources and the unanswered parts. | Follow-up questions are generated from the retrieval state, and the app states that a question the sources do not cover will not be answerable. |
| P3.6 What the sources cannot establish | An explicit `unavailable` section per answer. | Every answer carries a list of what the available sources could not establish, derived from the retrieval, not invented. |
| P3.7 Reranking | Rerank the BM25 top-N with the provider, keeping the citation verification on the final selection. | Reranking changes the ordering of results, and every reranked passage still validates against the source text. Without a provider the order is unchanged and the app says so. |
| P3.8 A/B/C/D separation in the UI | Render the four trust categories distinctly: notebook evidence, external information, model interpretation, unverified hypothesis. | Each rendered block is visibly tagged with its category and its source. A model interpretation is never rendered in the same style as a source quotation. |
| P3.9 Inspectable evidence | A citation opens the passage in its source, with the page and the surrounding context. | Clicking a citation shows the quoted passage highlighted in the source text, and the highlight matches the citation offsets exactly. |
| P3.10 Model-backed materials | Use the unused `ai_assisted` generator slot (`src/notebooks/notebookDataStores.mjs:28`) for model-written materials, so the origin is stored, not inferred. | A saved model-written material is labelled `ai_assisted` and its citations are re-verified on load. |

**Definition of done:** every Phase 4 capability is reachable, every citation
on every path — local, model, reranked — is verified before display, and the
four trust categories are visibly separated.

---

### P4 — Research discovery (Phase 5)

The prompt for this phase was truncated at *"Research-gap"*; the visible
requirements are listed below and the remainder is to be confirmed.

| Task | Detail | Acceptance criteria |
|---|---|---|
| P4.1 Topic exploration | Deterministic topic analysis plus a grounded model exploration of a supplied topic. | Exploration lists the aspects of the topic the supplied sources cover, and says which aspects the sources do not cover. |
| P4.2 Research-question generation | Replace the four fixed templates (`src/ai/researchService.mjs:50-55`) with questions derived from the actual sources and topic. | The generated questions reference terms that occur in the sources, and each names the source it came from. |
| P4.3 Literature-search planning | Make the four static steps (`:57-82`) depend on the question, the sources and the gaps. | The plan differs for two different questions in the same notebook, and every step states what the learner must do and what it cannot do for them. |
| P4.4 Source relevance assessment | Wire the dead `sourceRows` helper (`:21-35`) into the plan. | Every ready source is assessed for relevance to the question with a citation, and irrelevant sources are reported as such. |
| P4.5 Evidence table | Populate `evidenceTable.rows` (`:84-88`) from verified passages. | Every row carries a claim, a source, a location, an exact quotation and a status. A row with no verified quotation is not emitted. |
| P4.6 Comparison of findings | Reuse P3.2 across sources for findings rather than positions. | The comparison shows where findings agree and differ, with citations, and does not infer agreement that the model did not assert. |
| P4.7 Research-gap identification | Identify what the supplied sources do not establish. | Gaps are derived from the retrieval and the evidence table, cite what prompted them, and are labelled as the app's assessment rather than as a finding of the literature. |

**Definition of done:** every visible Phase 5 requirement is reachable and
none of the research outputs is a static string.

---

## 9. What this plan deliberately does not do

- **No vector database and no embedding API.** Reranking the BM25 candidate
  set with the provider that is already configured gives most of the benefit at
  no new key, no new dependency and no new privacy surface. Embeddings become
  worth it when the corpus is large enough that lexical candidate generation
  misses passages — a decision to revisit with data, not up front.
- **No rewrite of `src/ai/` or `src/intelligence/`.** P0.7 removes the dead
  file; the rest is extended at existing seams. `executeWorkflow` +
  `workflowData` (`src/ai/orchestrator.mjs:216-214`) is the extension point,
  and the unused multi-service machinery is already there.
- **No new UI framework.** The Tailwind token system in `tailwind.config.js`
  and the card/panel conventions in `src/components/notebooks/` are the
  house style. New workspace components follow them.
- **No hosted-service features.** Real authentication, quotas and multi-tenant
  isolation are a separate, larger piece of work; this plan keeps the product
  local-first and says so.

---

## 10. The single highest-value next task

**P2.4 - make every workspace panel state explicit: loading, empty, error and
success. Then P2.6 accessibility and P2.1/P2.2 information architecture.**

The P0.1 generator ternary is fixed: `normalizeAnswer` in
`src/intelligence/learningContext.mjs` now normalizes `record.generator` instead
of comparing two identical string literals. The remaining risk is not a one-line
label bug. The workspace is now the product's main surface, and a blank panel can
still hide whether a request is loading, empty, failed, or filtered out. P2.4
makes that state visible and names the next action before P3 adds more research
operations on top of it.

P1.8 (web sources) is the next data task once the workspace states are honest;
it needs the gateway endpoint described in the P1 delivery record. P1.10
(IndexedDB) should follow the storage-adapter plan there, not be rushed into the
current synchronous repository.

---

## 11. P1.8, P1.10 and P2-P4 delivery records (2026-10-25)

### P1.8 - web sources. Done, with the stated honesty limits.

`gateway/src` implements `POST /api/fetch` with SSRF protections (scheme,
private-address and localhost checks, redirect and DNS checks, size and content-type
caps) and readable-text extraction. The frontend `SourceIngestionPanel` adds a web
source only through that gateway; when the gateway is unreachable it stores a
failed source with the real reason instead of using a browser fetch. Retrieval date
and canonical URL are normalised and rejected when invalid. Web source provenance is
required on import.

Tests: `tests/ai/webFetch.test.mjs` covers URL validation, gateway success,
gateway failure, provenance normalisation and client-side non-fetching. The Rust
source was audited by inspection only: no `cargo`/`rustc` toolchain is installed in
this environment, so the gateway was not compiled or run.

### P1.10 - IndexedDB storage. Done.

Notebook metadata, source text, chat history and study materials are stored in
IndexedDB behind a synchronous storage facade with a preloaded cache, hydration and
migration from the earlier `localStorage` layout, and write-ahead durability. Quota
and read failures are surfaced with their real error instead of being swallowed.
Existing notebooks are migrated on first read; no half-migrated notebook is left
behind.

Tests: `tests/notebooks/notebookStorage.test.mjs` covers migration, hydration,
write-ahead durability, quota failure reporting and large-source handling.

### P2 - research workspace. Done.

The sidebar (`src/components/Sidebar.jsx`) groups notebooks by `kind`, shows the five
most recent conversation threads with their notebook, and recent materials. Advanced
research tools stay collapsed by default. At 768 px the sidebar becomes a drawer with
focus movement, Escape handling, focus restoration and a dark-safe overlay; at 390 px
the workspace has no horizontal overflow and all controls remain reachable. Primary
navigation links are shown at `xl`, the Final Skill Check at `2xl`, and the navbar
uses a wider container to avoid wrapping. Light-theme `--ink-subtle` is `96 112 134`
and accent/primary buttons use `text-ink-inverse`; WCAG AA contrast is covered in
both themes. A Lighthouse audit of the notebook workspace scores 1.0 for
accessibility, best practices and SEO with no `label-content-name-mismatch`
failures.

Tests: `tests/notebooks/researchUi.test.mjs` and `tests/ui/theme.test.mjs`
cover the sidebar, responsive classes, focus rings, theme tokens and contrast. Manual
browser verification covered both themes and the 390 px / 768 px layouts.

### P3 and P4 - source-grounded research. Done.

`src/ai/researchService.mjs` implements multi-source answers, comparison of
positions and findings, adaptive conflict investigation, lexical claim
classification, follow-up questions, retrieval gaps, topic exploration,
literature-search planning, source relevance, evidence tables, reranking and
provider claim/conflict mapping. The UI (`src/components/notebooks/ResearchToolsPanel.jsx`)
renders the four trust categories separately (notebook evidence, external
information, model interpretation, unverified hypothesis), shows provider state
honestly, and keeps advanced tools collapsed. Provider claims and conflicts are
mapped through `span_indexes` and re-verified before display; provider conflicts
require two different sources and same-source pairs are dropped. Provider conflict
review is reachable from the research answer. `runGroundedResearch` always returns
`partial` plans because external literature search is not performed.

Saved materials use `MATERIAL_GENERATORS.LOCAL_EXTRACTIVE` for local briefs and
`AI_ASSISTED` for model-assisted briefs; citations are re-verified on load. Conflict
gaps are aggregated into a single `gap-conflict-resolution` entry so they are not
duplicated alongside the dedicated conflict list.

Tests: `tests/ai/researchService.test.mjs` covers provider claims, provider
conflicts, reranking without a provider, citation verification and conflict
detection. The full suite passes.

### Verification (2026-10-25)

- `npm test`: 591 passing, 0 failing.
- `npm run build`: passing, with only the pre-existing Browserslist, externalized
  `node:crypto` and chunk-size warnings.
- Lighthouse: accessibility, best practices and SEO each 1.0, with no failures.
- Manual browser verification: notebook creation, two conflicting pasted sources,
  exact-offset citation highlighting, local research results, IndexedDB persistence
  after reload, 390 px no-overflow panes and 768 px sidebar/drawer behaviour. AI
  provider features could not be exercised because no provider is configured; the
  app reports the gateway as unavailable and falls back honestly.
