# First milestone: unified notebook learning workflow

Date: 2026-10-20

Status: implemented and verified as a local, deterministic workflow. This is not
an AI tutor and does not claim model-generated understanding.

## Scope

The existing notebook already supported local ingestion, BM25 passage search,
extractive answers and citation checks. This milestone connects those pieces
into one continuous loop:

1. Ask a question about the notebook's sources.
2. Retrieve an exact source passage and verify its citation.
3. Show a source evidence map built from verified quotations.
4. Offer a source-recall practice check.
5. Evaluate the response and choose a deterministic next action.
6. Save the notebook-scoped learning context.
7. Restore it after reload and use it to resolve a short follow-up.

The shipped workflow is deliberately extractive. It is not the full vision of a
general AI tutor, universal visual generator or research agent.

## Architecture

```text
NotebookWorkspace
  ├─ loads/revalidates saved context
  └─ StudyDeskPanel
       └─ notebookOrchestrator.runTurn()
            ├─ resolveQuestionWithContext()      prior-topic follow-ups
            ├─ answerFromNotebookSources()       local extractive answer
            ├─ validateCitation()                exact source verification
            ├─ buildSourceEvidenceVisual()       verified quotation map
            ├─ findVisualExplanationForTopic()   optional curated visual
            ├─ buildPracticeQuestion()           exact-word recall check
            ├─ selectNextAction()                deterministic policy
            └─ applyTurnToContext()              bounded shared context
                 └─ notebookContextStore         versioned localStorage
```

The orchestrator accepts replaceable adapters for question resolution, answer
retrieval, evidence maps, curated visuals, practice construction, next-action
selection and time. A future model-backed component can be inserted at that seam
without changing the UI or context contract. Any selected answer still has to
pass `validateCitation()` against the current source text.

### Files

| File | Responsibility |
| --- | --- |
| `src/intelligence/learningContext.mjs` | Context schema, bounded normalization, follow-up resolution, next-action policy, citation revalidation |
| `src/intelligence/notebookOrchestrator.mjs` | One-turn pipeline, evidence map, practice generation/evaluation, adapter seam |
| `src/intelligence/notebookContextStore.mjs` | Versioned user/notebook-scoped local persistence |
| `src/components/notebooks/SourceEvidenceMap.jsx` | Typed, React-escaped source-evidence visual |
| `src/components/notebooks/StudyDeskPanel.jsx` | Full workflow UI, restore/clear controls, practice feedback and next action |
| `src/pages/NotebookWorkspace.jsx` | Context load, revalidation and persistence callbacks |
| `src/notebooks/notebookRepository.mjs` | Context repository methods and notebook-deletion cleanup |

## Context and trust boundaries

- Context schema version: `1`.
- Context is stored under a key scoped by encoded user ID and notebook ID.
- Context is bounded: 10 turns, 5 evidence items, 10 practice attempts, limited
  question/answer/title/reason lengths.
- Loaded context is untrusted: it is normalized and every offset citation is
  checked against the current source text before display.
- A removed or changed source invalidates the saved answer, evidence, practice and
  source-evidence visual rather than leaving a stale citation on screen. The
  sanitized context is written back so the deleted source's quotation does not
  remain in the local context record.
- Deleting a notebook clears its context. The UI also provides an explicit
  "Clear saved session" action.
- Source titles, quotations, questions and visual text are rendered as React text,
  not injected HTML.
- No network client, AI SDK, API key, backend, telemetry or vector store exists in
  `src/`.
- The curated visual is visibly separated from the source evidence map. The map
  groups exact quotations; it does not invent causal or conceptual relationships.

## Verification

Executed on 2026-10-20:

- `npm test`: **288 passing, 0 failing**.
- `npm run build`: **passing**, 533 modules transformed, existing chunk-size
  warning.
- `npm audit --omit=dev`: **6 moderate, 0 high, 0 critical**. The advisories affect
  React Router, `mammoth`/`argparse`/`sprintf-js`; no automatic major upgrades
  were applied in this milestone.
- Browser-tested full cycle:
  source question → verified extractive answer → source evidence map → practice →
  wrong-answer feedback → correct retry → next-action change → context save →
  reload/restore → pronoun follow-up → explicit clear.
- The follow-up "What does it absorb?" retained the original question and used
  `chlorophyll` from the prior context to retrieve the same verified passage.
- Browser-tested invalidation: after source deletion, the answer and quotations
  disappeared from the Study desk and were removed from the stored context; after
  notebook deletion, its context, source and source-text keys were gone.
- Browser-tested 390 px frame: answer, evidence map, practice, next action and
  saved-session card rendered with no horizontal overflow at a 390 px iframe
  viewport (375 px content width after the frame scrollbar).
- Audible speech synthesis and physical-device behavior remain unverified.

## Capability audit after the milestone

Statuses describe this repository today, not the intended final product.

| Capability | Status | Evidence / boundary |
| --- | --- | --- |
| Authored course catalogue and lesson rendering | `WORKING` | Course data, structured lesson renderer and content tests pass. |
| Lesson progress persistence | `WORKING` | Browser-local progress keys and completion helpers are tested. |
| Active recall and review scheduling | `WORKING` | Scheduling, due queues, review sessions and persistence are tested. |
| Mastery checks and adaptive remediation | `PARTIAL` | Evidence rules and journeys exist for authored content, but coverage is not universal and notebook practice is not connected. |
| Skill Passport | `MOCK` | Skills are derived from enrolled courses rather than demonstrated performance. |
| Certificate verification / PDF download | `MOCK` | Certificate state is local; the download control only reports that it is a demo. |
| Authentication and account deletion | `MOCK` | Any non-empty demo credentials log in as user `1`; deletion only logs out and leaves local data. |
| Offline mode | `MOCK` | A local flag and warning; there is no service worker or offline asset cache. |
| Local PDF/DOCX/text/Markdown ingestion | `WORKING` | Real extraction tests pass; scanned PDFs without selectable text fail honestly. |
| OCR, URL ingestion, images, audio, video, spreadsheets | `MISSING` | No parser or ingestion path. |
| BM25 passage search | `WORKING` | Exact-span retrieval and citation verification are tested. |
| Offset citation verification | `WORKING` | Quote and offsets are checked against stored text. Page-only citations are shape-validated only. |
| Extractive source answers | `WORKING` | Exact source sentence with a verified citation; no outside knowledge. |
| Extractive study kits | `WORKING` | Summary, cards and quiz are citation-bearing; labeled local extractive. |
| Unified notebook context, evidence map, practice, next action, restore | `WORKING` | New implementation and executable tests; notebook-scoped only. |
| Notebook practice feeding course mastery or review schedule | `MISSING` | Practice is explicitly labeled source recall, not mastery evidence. |
| Curated visual explanations | `WORKING` | Four validated authored process topics. |
| Universal/arbitrary-topic visual generation | `MISSING` | No concept map, timeline, chart or model-generated visual engine. |
| AI tutoring / grounded chat / model explanations | `MISSING` | No provider or server gateway; no AI-generated citations. |
| External research and web-grounded answers | `MISSING` | No web retrieval or citation pipeline. |
| Backend, real authorization, quotas, observability | `MISSING` | Browser-only local demo. |
| Data export and complete account deletion | `MISSING` | No export; account deletion is logout only. |
| Accessibility | `PARTIAL` | Semantic sections, labels, status roles, escaped content and SSR tests; no formal accessibility audit. |
| Mobile layout | `WORKING` (390 px frame) / `UNVERIFIED` (physical device) | Responsive check passed in an iframe; no physical-device test. |
| Performance and load behavior | `UNVERIFIED` | Production build passes, but the largest JS chunk is about 687 kB and no benchmark/load test exists. |
| Provider failure/retry behavior | `UNVERIFIED` | No provider integration exists yet. |

## Missing-capability report

The product still cannot:

- generate a new explanation, analogy, worked example or concept map from a
  source;
- hold a grounded tutoring conversation with model reasoning;
- verify model-generated claims or citations;
- ingest a URL, image, scanned page, lecture recording or video;
- turn notebook practice into course mastery, recall scheduling or a skill claim;
- export or securely delete account data;
- run on a backend with real identity, quotas or operational monitoring.

Those are product gaps, not hidden behaviors. The UI states the local/extractive
boundary in the Study desk and visual surfaces.

## Dependencies and costs

- This milestone added **no runtime dependencies** and no paid service.
- Existing stack remains React 18, React Router 6, Vite 5, Tailwind 3, local
  `pdfjs-dist` and `mammoth`.
- Local storage is browser `localStorage`; existing limits include 100 sources per
  notebook, 5 MB per file, 500,000 extracted characters, 500 PDF pages, 50
  notebooks, 200 chat messages and 50 study materials.
- `localStorage` quota and the lack of IndexedDB remain practical limits.
- Any future model provider has provider-dependent token/compute cost and requires
  a server-side gateway, secret management, quotas and failure handling. No price
  or availability is claimed here.

## Next implementation task

**Build the secure server-side grounded-explanation adapter behind the existing
orchestrator seam.** It should accept only retrieved, verified source spans,
return a structured answer with citation IDs, refuse or downgrade when evidence is
missing, and never let model text bypass `validateCitation()`. Ship it with
provider-failure, prompt-injection, timeout and citation-mismatch tests before
exposing it as an AI tutoring feature.
