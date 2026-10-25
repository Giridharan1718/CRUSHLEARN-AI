# Future-Readiness Audit (2026-10-21)

Deep audit of CrushLearn AI against the product vision: general-purpose AI
tutoring + source-grounded notebooks + universal visual explanations +
adaptive learning + deep research + practical projects + persistent,
user-controlled context.

Method: every classification below is backed by code inspected on this date
(file-plus-line evidence), two parallel code sweeps of the product surface and
the visual engine, dependency/audit scans, and a live browser reproduction of
one newly-found defect. Features were **not** assumed to exist because a doc
says so; three documentation claims were corrected by inspection.

---

## 1. Current-state capability matrix

Legend: WORKING (does what it claims, tested), PARTIAL (real core, bounded
coverage or unwired ends), MOCK (deterministic or canned stand-in), MISSING
(absent), UNVERIFIED (not reproduced in browser this audit).

### A. AI tutoring and conversation context — MOCK (core) / PARTIAL (edges)

> **Updated 2026-10-21 (later the same day).** M1 and M2 have landed. The
> rows below are re-scored in the "M1/M2 delivery" section at the end of this
> audit. Read that section before relying on the "MISSING" verdicts here.

| Capability | Class | Evidence |
|---|---|---|
| General-purpose AI chat | MISSING | Zero `fetch(`/`XMLHttpRequest`/`WebSocket`/`axios` in `src/`; `.env.example:8-10` documents no provider; `ChatPanel.jsx:49-57` honest banner "No assistant answer is generated or stored locally" |
| Chat history display | PARTIAL | `ChatPanel.jsx` renders stored messages with citations; **no message ever written by any UI**: `appendChatMessage` (`notebookRepository.mjs:195`) has **zero callers** |
| Conversation context | MISSING | No message write-path, no session memory in chat |
| Rule-based guidance | WORKING (as labelled) | `guidanceEngine.js:1-4` "not a language model"; canned hints for 3 lessons only (:36-56) |

### B. Notebooks, documents, sources, citations — WORKING (local)

| Capability | Class | Evidence |
|---|---|---|
| Notebook create/delete/list | WORKING | `notebookStore.mjs` + `notebookRepository.mjs:62`; capped `MAX_NOTEBOOKS` (:105-107); browser-verified previously |
| PDF/DOCX ingestion | WORKING | Lazy `pdfjs-dist` + worker (`documentExtraction.mjs:15-25`), bounded `MAX_PDF_PAGES 500`, `MAX_PDF_TEXT_ITEMS 250_000` (:10-11), untrusted-input posture; `mammoth` for DOCX |
| Source-grounded answer (extractive) | WORKING | `sourceAnswers.mjs:1-17` sentence-overlap extraction; browser pass verified citation + no-match state |
| Lexical retrieval | WORKING | BM25 (k1=1.2, b=0.75) chunked spans (`sourceRetrieval.mjs:17-19`); ≤12 results |
| Citation verification | WORKING | `citations.mjs:44+` validates quote ↔ source text before display (retrieval layer calls it, `sourceRetrieval.mjs:5-6`); `MAX_CITATION_QUOTE_LENGTH 1000` |
| Semantic/embedding retrieval | MISSING | Tokenization only (`sourceText.mjs`); no vector store |
| Large-document storage | PARTIAL | localStorage only; 5 MB quota ceiling; no IndexedDB |

### C. Source verification, conflicts, uncertainty — PARTIAL

- Quote verification: **WORKING** (above).
- Conflicting-evidence resolution: **MISSING** — action id `INVESTIGATE_CONFLICTING_INFORMATION` declared (`adaptiveState.mjs:35`) but **no executor** in `adaptiveLoop.mjs` (no matches); orchestrator admits "does not … resolve conflicting evidence" (`notebookOrchestrator.mjs:196`).
- Uncertainty representation: **PARTIAL** — `addAdaptiveUncertainties`, `addAdaptiveUnresolvedQuestion` state families exist (`adaptiveState.mjs:43-49`) and are rendered, but uncertainty is listed, not reasoned about.

### D. Universal visual generation + safe interactive rendering — PARTIAL (narrow slice)

- Catalog: **4 authored topics, all `process`** type (visual schema index), assert-tested.
- Schema: only `process` is supported (`visualSchema.mjs:22-24`); 10 future types declared (`FUTURE_VISUAL_TYPES`), **all MISSING** (no content, no renderer; consistent honest fallback `VisualExplanationRenderer.jsx:16-22`).
- Renderers: `ProcessExplorer` (interactive, accessible), `PracticeCheck`, level-switching `VisualTopicView` — WORKING.
- Injection safety: **CLEAN** — zero `dangerouslySetInnerHTML`/`eval`/`new Function`/`insertAdjacentHTML` in `src/`; XSS regression test enforced (`tests/visual/visualRendering.test.mjs:196-208`); notebook params regex-gated (`VisualTopic.jsx:9-22`).
- Lesson integration: **MISSING** — Lesson routes and `LessonJourneyView` never surface the visual engine.
- Lesson "Simulation" activity: **MOCK** — echo-and-compare by design (`Simulation.jsx:90-96` "the user input IS the output").
- `/interactive` experiences (circuit, code-trace): **WORKING** — real deterministic math/execution, tested, browser-verified (2026-10-21).

### E. Learner profile, prerequisites, adaptive explanations — PARTIAL

- Demo profile: **MOCK** — any credentials accepted (`auth.js:44-66`), fabricates `learningStreak: 7` and pre-completed lessons at login.
- Prerequisite knowledge: **WORKING** — authored objective prerequisites with cycle validation (`src/content/schema.mjs:316-335`), evidence-based readiness (`gapDetection.mjs:508` `analyzeLessonReadiness`), prerequisite-backing actions in the adaptive loop (`EXPLAIN_PREREQUISITE`). Coverage: 3 hardcoded courses only.
- Adaptive explanations: **WORKING inside bounds** — observe→select→execute→evaluate→adapt with adapters, max 8 executions, 2 retries, citation-validated worked example (`adaptiveLoop.mjs:1-14`). Scope: one notebook workflow.
- Streak/XP/badges: **MISSING/MOCK** (streak static 7; helpers with zero callers `dashboardHelpers.js:14-18,144-151`).

### F. Flashcards, quizzes, spaced repetition, mastery — WORKING (layered), plus one dead page

- Extractive study kits: summary ≤8 sentences, ≤12 flashcards, ≤8 quiz questions, stored kits (`studyTools.mjs:16-18,230-445`) — WORKING.
- Course quizzes/practice: WORKING with deterministic checks.
- Review scheduling: WORKING interval ladder [1,3,7,14,30,60] days, explicitly *not* SM-2 (`reviewScheduler.mjs:1-50`); queue prioritized by weak evidence.
- Mastery: WORKING with anti-gaming safeguards — ≥2 correct answers, ≥2 distinct question ids, delayed "retained" check; "a single correct answer, a streak alone, time spent or course completion is never sufficient" (`mastery.mjs:14-29`). Scope: course objectives only; **not** connected to notebook evidence or interactive experiences (deliberately deferred).
- `KnowledgeGaps` page: **MISSING** (unrouted, unreachable) with two latent crashes (`KnowledgeGaps.jsx:287` missing import; attempts never written — `trackQuizAttempt` has zero callers). The *real* gap engine (`learning/gapDetection.mjs`) is routed through Review/Lesson readiness and is WORKING.
- **Live defect found & fixed this audit:** `/skill-passport` rendered blank — `ReferenceError: completedLessons is not defined` (`SkillPassport.jsx:325`), reproduced in-browser (`bodyLength: 0`, console error), fixed by deriving the per-course count from the already-imported store helper; page now renders with real counts, suite 323/0, build passing, Lighthouse 100/100/100 restored. Earlier records claiming a passing Skill Passport were wrong.

### G. Research workflows, experiments, data analysis — PARTIAL (prototype)

- Adaptive loop contains hypothesis → experiment → recorded result and source-facts extraction state (adaptiveState families), executed within bounds — prototype-level WORKING.
- True deep research (web retrieval, multi-source synthesis, data analysis): **MISSING** — no network anywhere; research is confined to the learner's uploaded sources.
- No dataset/experiment planner, no plotting beyond `graphs` (a future, unimplemented type).

### H. Multimodal input/output — PARTIAL

- In: PDF text, DOCX text, pasted text. No image/OCR, no audio, no handwriting.
- Out: TTS read-aloud (Web Speech API, start/stop only) on Study Desk surfaces (`ReadAloudButton.jsx:11-39`; used `StudyDeskPanel.jsx:635,843,900,962`) — WORKING; no voice/rate options.
- Lessons embed external sample videos (`Lesson.jsx:84` → w3schools URL) — **external-media dependency**; placeholder images by `via.placeholder.com`. Both break offline and leak requests if shipped.

### I. Provider flexibility, costs, failure recovery — MISSING (by design)

- No provider, no server, no gateway. `adaptiveLoop.mjs:5-11` documents the intended **adapter seam**: a grounded explanation service can replace only the relevant step. No implementation yet.
- No key management, no cost metering, no model fallback, no retry/backoff (nothing to fail over).

> **Re-scored in §8.4.** A provider gateway now exists (`gateway/`, Rust). Key
> management, cost metering and a session token budget are in place; provider
> flexibility is still narrow (one provider, one model id).

### J. Privacy, permissions, security, export, deletion — PARTIAL

- Privacy posture: strong-by-omission — all data local, zero telemetry, no third-party requests.
- Notebook/source deletion: WORKING with confirms (`NotebookWorkspace.jsx:166-232`).
- "Delete account": **MOCK** — `Profile.jsx:54-59` only removes `crushlearn_user`; all learning stores remain.
- Export/import: **MISSING** — no download/restore path anywhere.
- Security: no XSS sinks (verified); `esbuild`/`vite` dev-server advisories irrelevant in prod; **runtime-relevant advisories** in `react-router-dom@6.30.3`链 (open redirect → XSS, moderate) and `mammoth`→`argparse` (moderate). Full audit: **22 vulns (1 low, 9 moderate, 12 high)**, predominantly dev dependencies (vite, rollup, braces, chokidar, micromatch, nanoid, postcss, browserslist, esbuild).
- No auth means no permission system at all (acceptable only as a single-user local demo).

### K. Accessibility, performance, mobile, offline — PARTIAL

- A11y: Lighthouse 100s across key pages in both themes (dash, workspace, /interactive, code-trace, /visual, /review, skill-passport); native controls; aria-live/current/pressed patterns; visual schema requires `accessibilityDescription`.
- Performance: 774 kB main JS / 209 kB gzip (warning pre-existing); pdf.js chunk 1.26 MB lazy-loaded; heavy data ops are synchronous on the main thread.
- Mobile: layouts responsive (390px frame checked on the workspace); desktop window constraints limited full visual QA.
- Offline/PWA: **MISSING** — no service worker, no manifest (`public/` contains only `robots.txt`).

### L. Evaluation, testing, observability, reliability — PARTIAL

- Automated tests: 43 files / 323 passing tests across notebooks, learning, intelligence, visual, content, ui. Strong on engine modules; **no page-level smoke suite** (proven: the SkillPassport crash shipped while suites stayed green).
- CI: **MISSING** — no project `.github/workflows` (only node_modules artifacts).
- Lint/format: **MISSING** — no eslint/prettier/editorconfig.
- Observability: **MISSING** — deliberate (privacy), but there is no error surface at all; only dev console.
- Guardrails that ARE tested: citation spoofing, bounded validation, XSS escaping, invalid inputs, storage round-trips.

> **Re-scored in §8.** The suite is now 394 JS tests + 30 Rust tests. The
> Rust crate has its own unit tests but **no CI runner**: the CI gap (N3) is
> now wider, not narrower, because there are two test suites to run and one
> of them needs a toolchain.

### M. Knowledge graphs, long-term context, connections — MISSING

- Single-notebook context store and adaptive context exist (`learningContext.mjs`, `notebookContextStore.mjs`).
- No cross-notebook retrieval, no concept graph, no long-term learner memory across notebooks. Course-level maps (`courseLearningMaps.mjs`) connect objectives but not notebook knowledge.

### N. Maintainability, extensibility, integration — PARTIAL

- Small, sane dependency set (react, react-dom, react-router-dom, pdfjs-dist, mammoth); clear module seams (citation contract, adapter seam, typed schemas, memoryStorage test helper).
- Frictions: nested repo root mismatch, no lint, no CI, no page smoke tests, 56 KB `adaptiveLoop.mjs` heading toward monolith, localStorage schema versioning ad hoc.

---

## 2. Missing-capability report (condensed)

For each: problem → why it matters → dependencies → architecture → complexity
→ risks → acceptance criteria.

### IMMEDIATE NECESSITIES

**N1. Artificial intelligence chat layer (provider-backed, citation-enforced)**
- Problem: the headline promise (ChatGPT-style tutor + NotebookLM grounding) cannot exist without a model; today only extractive Q&A runs.
- Why: every other feature is a support surface for conversations that don't exist.
- Dependencies: a server/serverless gateway holding the provider key (never `VITE_` — `.env.example:8-10` states this correctly); provider SDK server-side only.
- Architecture: `POST /api/chat` → server builds prompt from **retrieval-verified** spans (reuse `searchNotebookSources` + `validateCitation` client-of-server or server-side), streams answer, returns citations; client validates every citation against stored text via existing `validateCitation` before rendering; non-verifiable → rejected with honest fallback to the extractive answer.
- Complexity: **Medium-High**. Risks: cost, latency, hallucinated citations (mitigated by validation-or-reject), key leakage if shortcuts taken.
- Acceptance: a wrong/questionable quote can never reach the screen; message history writes through `appendChatMessage`; offline/consumer-without-key falls back to extractive mode; cost meter visible.
- **Status (2026-10-21): M1 and M2 both shipped — see §8.** The acceptance list
  is met, except streaming: answers arrive complete, not token by token.

**N2. Real data export + real account wipe**
- Problem: "Delete account" lies; export doesn't exist; users can lose 5 MB of work on any device switch.
- Why: user-controlled context is a vision pillar; also cheap.
- Architecture: JSON export via Blob of all `crushlearn_*` keys (with schema-version envelope); wipe = remove all `crushlearn_*` keys after optional export; import = validated restore.
- Complexity: **Low**. Risks: import must not corrupt stores (normalize + validate before write).
- Acceptance: export/import round-trip; wipe leaves zero `crushlearn_*` keys (tested via memoryStorage pattern).

**N3. Page-level smoke tests + CI**
- Problem: 323 engine tests green while two shipped pages were blank/broken — no end-to-end net.
- Why: prevents the exact defect class found today.
- Architecture: SSR route render tests for every routed page (Vite SSR pattern that already exists ×5 test files) + GitHub Actions running `npm test` + `npm run build` on PR.
- Complexity: **Low**. Risks: none meaningful.
- Acceptance: each route SSR-renders with expected heading; CI green badge; the two defects found today would fail CI.

**N4. Fail-security on dependency advisories**
- Problem: 22 audits (12 high), 2 runtime-relevant (`react-router-dom` open-redirect chain, `mammoth`/`argparse` DoS).
- Complexity: **Low** (bounded version upgrades within same major: react-router-dom 6.30.x→≥6.31.x path via `npm audit fix` non-force review, mammoth→ patched). Risks: upgrade regression already guarded by 323 tests.
- Acceptance: zero known runtime advisories; dev-chain counts documented.

**N5. Retirement of the orphaned KnowledgeGaps page**
- Problem: unrouted page with two latent crashes and dead analytics (`quizAnalytics` writes nothing); the real gap engine lives elsewhere.
- Complexity: **Low**. Acceptance: remove page + `quizAnalytics.js`+`knowledgeGaps.js` suites or route it rebuilt on `learning/gapDetection.mjs` — decide in implementation, don't leave the hybrid.

### HIGH-VALUE FUTURE WORK (explicitly not started)

**F1. Embedding/semantic retrieval** — beyond BM25; needs an embeddings model (local `transformers.js` GPU-free or hosted); complexity Medium; must keep the citation contract; acceptance: better recall on paraphrased questions, quoted-only display preserved.

**F2. Cross-notebook memory + knowledge graph** — problem: knowledge is trapped per notebook. Architecture: durable store (IndexedDB) → concept index with node ids emerging from objective/skill vocabulary + mention relations with citations; complexity High; risks: junk graphs; acceptance: "show related concepts across notebooks, each edge carries a verified quote".

**F3. Universal visual types** — timeline/comparison/graphs/concept map renderers per declared `FUTURE_VISUAL_TYPES`; each needs authored content + typed schema + tests; complexity Medium per type; do case studies (one at a time), starting with `timeline` (highest teaching utility, lowest rendering risk).

**F4. Adaptive explanations across surfaces** — extend the adapter seam so chat/lesson/review all use the same learner context + prerequisites (`learningContext.mjs` is already the shared shape); complexity Medium.

**F5. Multimodal input (OCR/image math), output (diagrams of model answers)** — complexity High; needs provider multimodal tiers; acceptance: extracted statement image → text with source locator.

**F6. True research module** — web sources with provenance, conflicting-evidence comparison — complexity High; gated behind provider + safety policies; the declared `INVESTIGATE_CONFLICTING_INFORMATION` action gives the surface shape to fill.

**F7. Practical projects / experiments** — real sandboxed code execution (Safe VM, not `eval`) with deterministic graders; complexity High; risks huge (security); strictly later.

### Explicit NON-builds for now (anti-vision)

- Gamified XP/badges/streaks as shown numbers — current streak is fabricated; either compute it from real activity history or remove the display.
- Any "AI" feature without the citation-verification gate.
- Concept maps generated from nothing / without source anchors.
- Social/collaborative features, multi-tenant auth systems, credit/billing.
- 3D viewer, voice selection, video generation.
- Rewriting existing verified engines (BM25, review ladder, mastery safeguards) without a proven problem.

---

## 3. Immediate risks

1. **Shipped blank page (fixed this audit but proves the class):** `/skill-passport` crashed for every logged-in user; suites were green. Page-level smoke tests must land (N3).
2. **Fabricated learner data at login:** fresh accounts get `learningStreak: 7` and 2 pre-completed lessons (`auth.js:51-53`) — contradicts the authenticity promise; either derive from real stores or show zeros.
3. **Runtime dependency advisories** — open-redirect chain (`react-router-dom@6.30.3`) and `mammoth`/`argparse` DoS.
4. **localStorage 5 MB ceiling** for source text: large PDF corpora hit quota limits; caps mitigate but data loss on overflow is possible; no export exists (N2).
5. **No CI** — regressions reachable at any commit.
6. **Dead button/controls**: non-enrolled course "Enroll" has no handler (`Dashboard.jsx:372-374`); Profile notification toggles are decorative.
7. **External media dependencies** in lesson content (sample videos, placeholder images) — break offline; replace with local assets or remove.

---

## 4. Future architecture recommendations

- **One shared context spine:** `learningContext.mjs` should become the single normalized store that chat, lessons, review, and interactive experiences read/write; everything persists through repository APIs only (never raw localStorage writes from components).
- **Retrieval behind the citation contract:** semantic search must present through `searchNotebookSources` so every downstream path (chat, adaptive, study kits) keeps verified spans.
- **Provider gateway as a single serverless function:** chat + embeddings + (later) multimodal all route through one `/api` boundary; contract = prompt (with verified spans) in, message + validated citations out; client-side `validateCitation` is the final gate, never skipped.
- **Page bundle diet:** split routes with dynamic imports (biggest: course content); target < 400 kB main JS.
- **Durability:** move repository to IndexedDB for multi-MB documents, keep localStorage for session state; export/import envelopes versioned.
- **Type the seams:** schemas already version themselves (`visualSchema`, `sourceSchema`); apply the same envelope to the whole export format.

---

## 5. Prioritized roadmap

| # | Item | User value | Reliability | Learning effectiveness | Cost | Risk | Dependency |
|---|---|---|---|---|---|---|---|
| 1 | SkillPassport crash fix | shipped (defect fix) | high | — | done | none | — |
| 2 | Smoke tests + CI | — | very high | — | very low | none | — |
| 3 | Dependency fixes (N4) | — | high | — | low | low | — |
| 4 | Export/wipe (N2) | high (data control) | high | — | low | low | IndexedDB optional |
| 5 | Grounded chat MVP (N1, local extractive + persistence first) | very high | high (verified pipeline) | high | medium | low-medium | none |
| 6 | Provider gateway (N1 full) | very high | medium | very high | medium-high | medium (cost, quality) | hosting budget |
| 7 | Semantic retrieval (F1) | high | medium | high | medium | medium | gateway embeddings |
| 8 | IndexedDB durability | high | medium | — | medium | low | — |
| 9 | First new visual type (timeline) + lesson integration | high | high | high | medium | low | none |
| 10 | Cross-notebook knowledge (F2) | high later | low initially | high | high | high | 8→ durable store |
| 11 | Multimodal input/output (F5), research module (F6), real projects (F7) | high later | — | high | very high | high | 6+budget |

Ranking rule used: user × reliability × learning effectiveness, divided by cost × risk, with privacy impact as a gate (nothing may export learner data anywhere without explicit action).

---

## 6. First milestone and acceptance tests

**Milestone M1 — "The conversation loop that cannot lie" (local, no provider)**

Scope: wire the notebook chat tab into the *existing verified* pipeline and the *existing but unwired* writer, producing persistent, source-grounded conversations honestly labelled as extractive.

1. ChatPanel gains an ask-box; submitting runs `answerQuestion` (sourceAnswers + `searchNotebookSources`).
2. Each turn is persisted via `appendChatMessage` (user question + assistant citation-verified extraction), labelled "Extractive source answer — not AI-generated".
3. Save-as-note continues to work on new messages; history restores across reloads; citation-only display enforced by `validateCitation`.
4. Unmatched or empty-retrieval cases render the existing honest no-match state and are also persisted as assistant turns saying so.

Acceptance tests (all runnable via `node --test` + the SSR pattern + one browser pass):
- Unit: turn persistence round-trip via memoryStorage; citation validation gates a fabricated quote (rejects answer display).
- SSR: chat panel renders turn list + ask-box; grounding label present.
- Browser: ask → verified answer with citation chip → reload → history intact → Save-as-note toast → no console errors, dark + light.

Complexity: Low-Medium, zero new dependencies, zero privacy impact. It completes the notebook loop's missing front-end and creates the exact message/citation shape that the provider gateway (M2) must fill.

**Single highest-value next implementation task:** implement M1 above — the grounded conversation loop end-to-end, reusing `appendChatMessage` + `validateCitation` + the extractive answer pipeline. It converts three verified-but-disconnected pieces into the product's core loop, with no new dependencies or costs.

> **Done (2026-10-21).** M1 shipped, and the provider gateway (M2) shipped with it.
> See §8 for what was built, the three boundary defects the live run found, and
> what is still unproven. The next single highest-value task has changed —
> see §8.6.

---

## 7. Dependencies, costs, uncertainties

- **M1:** none (code only).
- **M2 gateway:** serverless hosting (zero-to-small), provider token allowances — order of $0.5–$15/month personal-scale with a cheap chat model; embeddings ~$0.02/M tokens; latency varies by provider/region.
- **Uncertainties:** extractive quality on noisy scanned PDFs (already bounded, needs real-world corpus feedback); embedding model choice (local vs hosted) pending cost policy; provider grounding quality without fine-tuning; localStorage→IndexedDB migration timing vs user count (currently single demo user, so low urgency).
- **Cost ceilings to enforce before any provider lands:** per-request citation budget, per-session token budget, visible meter.

---

## Audit corrections to prior records

1. `/skill-passport` is (now was) a runtime crash — earlier "Lighthouse 100 on skill-passport" claims in verification notes are retracted; after the one-line fix it measures 100/100/100 again (re-verified today).
2. "Chat history is read-only, no writer" — refined: a writer API exists (`appendChatMessage`) but has zero callers; effectively still unwritten.
3. "6 moderate npm audit advisories" — actual today: 22 (12 high), mostly dev-chain; runtime-relevant: react-router-dom + mammoth.

### Verification snapshot after the in-audit defect fix

- `npm test`: **323 passing, 0 failing**.
- `npm run build`: passing.
- Browser: `/skill-passport` renders per-course real counts; console clean; Lighthouse 100/100/100.

---

## 8. M1/M2 delivery (2026-10-21, later the same day)

The audit's §6 named M1 as the single highest-value next task and §5 listed
the provider gateway (M2) at rank 6. Both have now landed. This section
records what shipped, what it re-scores in §1, and what is still unproven.

### 8.1 M1 — the conversation loop that cannot lie

Shipped. The three pieces §1.A called "verified but disconnected" are now
connected.

| What | Where | Note |
|---|---|---|
| Ask-box in the chat panel | `src/components/notebooks/ChatPanel.jsx` | New `onAsk` + `gatewayStatus` props, question state, submit handler, disabled state when there is no ready source. |
| Turn persistence | `src/pages/NotebookWorkspace.jsx` (`handleAsk`) | Both turns written through `appendChatMessage` — the writer §1.A called out as having zero callers now has callers. |
| Grounded answer layer | `src/notebooks/groundedChat.mjs` | The 4-step flow: retrieve → verify → ask → **re-verify** → fall back. |
| Gateway client | `src/notebooks/gatewayClient.mjs` | Health probe and chat call, with a timeout and a truthful "the gateway is not running" message. |
| Provider seam preserved | `src/intelligence/notebookOrchestrator.mjs:364` | `const retrieve = adapters.answerQuestion \|\| answerFromNotebookSources;` — the orchestrator still works with no gateway. |

M1's own acceptance list is met: the ask-box renders, turns persist, an
unmatched question renders the honest no-match state and is persisted as an
assistant turn saying so, and the label distinguishes a local quotation from
a model answer.

### 8.2 M2 — the provider gateway (Rust)

Shipped as a new crate at `gateway/`. It is the first server-side component
in the project, and it is **optional**: the app runs and answers without it.

| What | Where | Note |
|---|---|---|
| The service | `gateway/src/` (6 modules) | `axum` + `reqwest` (rustls). No C compiler needed for the crate itself; the Windows toolchain note is in `gateway/README.md`. |
| The key handling | `gateway/src/config.rs` | Read from the process environment only. Never `VITE_`-prefixed, never logged, never returned by an endpoint. `/api/health` reports `provider_configured` as a boolean, not the key. |
| The provider call | `gateway/src/provider.rs` | Raw HTTP against `POST /v1/messages` (Rust has no official Anthropic SDK). `output_config.effort` set explicitly, `output_config.format` a JSON Schema, `fallbacks: "default"` with the fallback beta, and one retry without the beta if the provider answers 400. |
| The budgets | `gateway/src/budget.rs`, `config.rs` | Per-request span limit (12), per-request citation limit (6), per-session token budget (200 000), and a cost meter on every response. |
| The contract | `gateway/src/protocol.rs` | camelCase on the wire, matching the browser exactly. Citations serialize to `{sourceId, quote, locator:{kind:"offset",…}}` — the shape `validateCitation` expects. |

**The grounding invariant holds on the model path.** The client verifies
before sending *and* after receiving. A model answer whose citation does not
match the stored source text is discarded and the extractive answer is shown
instead — asserted by test in `tests/notebooks/groundedChat.test.mjs`.

### 8.3 Three defects the live run found that the unit tests did not

The unit tests passed before the gateway was ever run against a real HTTP
request. Running it found three bugs that only appear at the boundary:

1. **Wire-format mismatch.** The browser sends `sourceId`/`sourceTitle`; the
   Rust `SourceSpan` expected `source_id`/`source_title`. Every real request
   failed with `spans[0]: missing field 'source_id'`. Fixed with
   `#[serde(rename = "sourceId")]`, and a test now pins the client field names.
2. **Roles did not alternate.** The Messages API requires
   `messages: roles must alternate between "user" and "assistant"`. The
   builder emitted the history turns and then the question as a second
   consecutive `user` message — a 400 on every request that carried history.
   Fixed by `normalize_turns`, which merges consecutive same-role turns and
   drops a leading assistant turn. Four tests cover it.
3. **Offsets were counted in the wrong unit.** The browser's `String.length`
   and `String.slice` count **UTF-16 code units**; the Rust check counted
   Unicode scalars. A source containing an emoji produced a range one unit
   longer than the text and was rejected as `invalid_span`. Fixed by counting
   `char::len_utf16`. Verified end-to-end with an emoji in the source text.

The lesson generalizes: the tests that would have caught all three are
boundary tests, not unit tests. N3 (page-level smoke tests) is the same class
of gap at the UI layer.

### 8.4 Re-scoring §1

| Capability | Before | After | Evidence |
|---|---|---|---|
| General-purpose AI chat | MISSING | **WORKING (optional)** | `gateway/` + `src/notebooks/groundedChat.mjs`; a model answer is produced, labelled, and citation-verified. Without a configured provider the app still answers, from the local extractive path. |
| Chat history display | PARTIAL (no writer) | **WORKING** | `NotebookWorkspace.jsx` `handleAsk` writes both turns via `appendChatMessage`. |
| Conversation context | MISSING | **PARTIAL** | History is sent to the provider (`MAX_HISTORY_TURNS 6`), so a follow-up has context. The provider gateway re-normalizes the roles before sending. There is no long-term memory across notebooks (F2, still MISSING). |
| Provider flexibility / costs / failure recovery (§1.I) | MISSING (by design) | **PARTIAL** | One provider, one model id, no model fallback of our own (the provider's own `fallbacks: "default"` is used). Cost metering and a session token budget now exist. No retry/backoff of our own beyond the single fallback-beta retry. |
| Ground truth about what is AI | MOCK | **WORKING** | Three kinds of content, labelled separately: authored, local extractive, model-generated. The label lives inside the message content because `normalizeChatMessage` has no `generator` field. |

§1.C (conflicting evidence) and §1.F (mastery) are **unchanged** by this
work. Nothing here touches the conflict-resolution gap, the fabricated
streak, or the dead `KnowledgeGaps` page.

### 8.5 What is still unproven

- **No live provider call has been made.** No `ANTHROPIC_API_KEY` is
  configured on this machine, so the provider call itself has never run
  against the real Anthropic API. The request shape, headers, structured-output
  schema, refusal handling and fallback retry were written from the API
  documentation and checked against a **local mock** of `POST /v1/messages`
  that records the request it receives. The first run against the real API may
  still find drift.
- **The model path has not been seen in a browser.** The end-to-end check
  drove the real client modules against the running gateway over HTTP, which
  covers the whole chain except React rendering.
- **Retrieval is still lexical (BM25).** A question phrased unlike the source
  finds no passage, and the app then answers from the extractive path or says
  the sources do not cover it. F1 is now the limiting factor for answer
  quality, and the model cannot compensate for it.
- **The cost meter is an estimate** from a per-model price table, not a
  billing query.

### 8.6 Re-ranked next task

The §5 roadmap's rank 2 (smoke tests + CI) is now the highest-value item,
for a specific reason: the three defects in §8.3 were all found by *running*
the thing, not by testing it, and the same gap is still open at the UI layer
where a shipped page once rendered blank while the suites stayed green. N3
plus the Rust tests in CI would close it.

Everything else keeps its §5 position: N4 (dependency advisories), N2
(export/wipe), then F1 (semantic retrieval) — which is now the binding
constraint on answer quality rather than a nice-to-have.
