# Adaptive intelligence loop milestone

Date: 2026-10-20

Status: implemented and verified as a local, deterministic feedback loop. It is
not a language-model tutor and does not claim that a learner has mastered a
topic.

## Scope

This milestone adds one complete Observe → Select → Execute → Evaluate → Adapt →
Update context workflow to the existing notebook Study desk:

1. Observe a source question and the notebook's saved context.
2. Select source-evidence retrieval.
3. Retrieve an exact source sentence and verify its citation.
4. Evaluate whether the sentence is query-relevant.
5. Select a recall check when one can be built.
6. Evaluate the learner's response.
7. Adapt after a miss: offer the verified passage first, then a verified
   source-based worked example after a second miss.
8. Stop with an unresolved question instead of repeating an ineffective action.
9. Update the shared notebook context with categorized evidence and measured
   outcomes.

The loop does not force every interaction through every stage. A question with
no ready sources stops before retrieval. A question with no verified, relevant
passage stops without an answer. A saved correct attempt resumes at
"summary/save" and performs no additional action.

## Architecture

```text
StudyDeskPanel
  └─ runAdaptiveLoop()
       ├─ adaptiveLoop.mjs
       │    ├─ permission check
       │    ├─ bounded action runner (timeout, retries, cancellation)
       │    ├─ default retrieveSourceEvidence adapter
       │    │    └─ notebookOrchestrator.runTurn()
       │    │         ├─ source retrieval
       │    │         ├─ citation verification
       │    │         ├─ source evidence visual
       │    │         ├─ curated visual lookup
       │    │         └─ practice construction
       │    ├─ retrieval evaluation (citation + query overlap)
       │    ├─ default evaluateRecall adapter
       │    ├─ default buildWorkedExample adapter
       │    ├─ default validateVisual adapter
       │    └─ adaptiveState.mjs
       │         ├─ categorized records
       │         ├─ bounded normalization
       │         ├─ corrections
       │         └─ stale-citation revalidation
       └─ learningContext.mjs
            └─ updateContextWithAdaptive()
                 └─ notebookContextStore (versioned localStorage)
```

Orchestration is deliberately separate from the specialized operations:

- Source retrieval and citation checks remain in `src/notebooks/`.
- Visual validation remains in `src/visual/`.
- Practice evaluation remains in `notebookOrchestrator.mjs`.
- Learning-context persistence remains in `notebookContextStore.mjs`.
- `adaptiveLoop.mjs` decides which operation to run and when to stop.
- `adaptiveState.mjs` records what happened, without turning assumptions into
  measured evidence.

## Action contract

| Action | Status in this milestone | Selection rule |
| --- | --- | --- |
| `retrieve_source_evidence` | Implemented | Default action for a source question; also selected after one recall miss so the learner can review the verified passage. |
| `verify_understanding` | Implemented | Selected when the orchestrator can build a citation-verified recall check. |
| `provide_worked_example` | Implemented, local rule | Selected after a second miss; uses the verified practice quotation and missing word. |
| `summarize_or_save` | Implemented | Selected after a correct check, an answer without practice, a blocked retrieval or a repeated-miss stop. |
| `answer_directly` | Reserved | Only when a verified source answer already exists and no evidence step is needed. |
| `explain_prerequisite` | Reserved | A future grounded-explanation adapter; no model is configured. |
| `generate_diagram` | Reserved | A future validated-visual adapter; only the source evidence map is generated today. |
| `ask_diagnostic_question` | Reserved | A future diagnostic policy; the current check is source recall. |
| `generate_practice_problem` | Reserved | The current practice check is built deterministically from a source sentence. |
| `investigate_conflicting_information` | Reserved | No conflict detector or multi-source adjudication is implemented. |
| `offer_experiment` | Reserved | No simulation or experiment runner is implemented. |

The UI only presents an action as implemented when the loop has actually
executed it. Reserved actions are not advertised as available capabilities.

## Categorized adaptive state

`adaptiveState.mjs` keeps these categories separate:

| Category | What it holds | Trust rule |
| --- | --- | --- |
| `sourceFacts` | Exact source quotations with offset citations | Citation revalidated against current source text on load. |
| `generatedExplanations` | Rule-based worked examples | Generator is labelled `local_extractive_rule`; a missing or stale citation removes the explanation. |
| `userProvided` | Learner practice responses | Treated as learner input, never as source evidence. |
| `assessmentEvidence` | Correct/incorrect recall attempts and timestamps | Measured result; never inferred from a hypothesis. |
| `hypotheses` | Possible explanations for a miss | Explicitly labelled `hypothesis`; not displayed as fact. |
| `experimentalResults` | Action strategy and measured outcome | Records that an action was attempted and what the loop observed. |
| `unresolvedQuestions` | Questions the loop could not answer | Preserved when the loop stops. |
| `corrections` | User- or system-supplied corrections | Kept as a separate correction record; does not rewrite a source quotation. |

Additional fields record the selected action, status, bounded step list,
attempted strategies, measured values, assumptions and uncertainties.

Saved adaptive state is revalidated with the rest of the learning context. If a
source is removed or its text changes, saved source facts and generated
explanations that no longer verify are dropped. Assessment records remain, but
their stale citation reference is removed. The context records an uncertainty
naming the stale quotation rather than silently presenting it again.

## Bounded execution

Defaults in `adaptiveLoop.mjs`:

- Maximum action attempts per action: **2**.
- Maximum action executions across the loop: **8**.
- Per-action timeout: **8,000 ms**.
- Overall loop budget: **20,000 ms**.
- Maximum adaptive steps retained: **10**.
- Maximum attempts retained: **10**.
- Optional `AbortSignal` checked before permission, before each action and while
  an action is pending.

The local default adapters are synchronous, so a timeout cannot interrupt a
blocking synchronous call. The timeout/retry path is exercised with asynchronous
adapter tests. The loop never retries an ineffective source query unchanged; it
tries one relaxed query only when the token set actually differs. Invalid visual
data is dropped rather than regenerated indefinitely.

Permission checks require a user ID and notebook ID by default. The loop also
accepts a `checkAccess` adapter for a future repository-backed ownership check.
Context normalization is scoped to the supplied user and notebook, so a context
from another notebook is not adopted.

Logs contain only action names, attempt numbers, outcomes and durations. They do
not contain the question, practice response, source quotation or adapter error
message.

## UI behavior

`StudyDeskPanel` now runs question and practice interactions through the adaptive
loop. `AdaptiveLoopPanel` shows:

- The selected action and loop status.
- The turn summary.
- Measured facts, each labelled as a measurement or keyword signal.
- Uncertainties and assumptions in separate sections.
- The verified source-based worked example after a second miss, with its source
  location.
- Bounded steps and separate record counts in a disclosure section.
- A statement that the loop uses local deterministic rules, not an AI model.

Practice feedback changes with the measured outcome:

- Correct: confirms the match, shows the source explanation and citation.
- First miss: asks the learner to review the verified passage; does not claim a
  knowledge gap.
- Second miss: closes the check without mastery, shows the verified worked
  example and reports the remaining uncertainty.
- Repeated miss on a restored context: stops rather than repeating the prompt.

## Files changed

| File | Change |
| --- | --- |
| `src/intelligence/adaptiveState.mjs` | New categorized state, bounded normalization, corrections, stale-citation revalidation. |
| `src/intelligence/adaptiveLoop.mjs` | New bounded orchestrator, default adapters, action policy, timeouts, retries, cancellation and redacted logs. |
| `src/intelligence/learningContext.mjs` | Stores `adaptive` in schema version 1, updates it, revalidates it and resets it on a new question turn. |
| `src/components/notebooks/AdaptiveLoopPanel.jsx` | New accessible status/evidence panel. |
| `src/components/notebooks/StudyDeskPanel.jsx` | Routes question/practice interactions through the loop; adds adaptive feedback and practice closure. |
| `tests/intelligence/adaptiveLoop.test.mjs` | New success, miss/retry, second-miss, irrelevant-source, failure, timeout, invalid-visual, permission/cancellation, persistence and revalidation coverage. |
| `tests/notebooks/notebookRendering.test.mjs` | New SSR panel rendering and escaping coverage. |
| `README.md` | Capability, verification and limitation updates. |

## Verification

Executed on 2026-10-20:

- `npm test`: **303 passing, 0 failing**.
- `npm run build`: **passing**, 536 modules transformed, 730.89 kB main JS
  (198.99 kB gzip), existing chunk-size warning.
- New adaptive tests cover:
  - successful verified answer with stored citation;
  - first incorrect answer; no worked-example reveal; evidence-review action;
  - correct retry; completed loop; no additional action on resume;
  - second incorrect answer; verified worked example; closed check;
  - third incorrect answer; no repeated worked example; bound stop;
  - irrelevant source sentence rejected despite valid citation shape;
  - failed retrieval with one retry and redacted logs;
  - action-limit stop when an adapter keeps failing;
  - hanging adapter bounded by timeout;
  - invalid visual data dropped while the verified answer continues;
  - missing permission and pre-aborted signal preventing retrieval;
  - persistence, correction records and stale-citation removal.
- Browser-tested in the notebook Study desk:
  source question → verified extractive answer → adaptive "Verify understanding"
  panel → wrong answer → "Retrieve source evidence" waiting state → second wrong
  answer → closed check with verified worked example → reload/restore → explicit
  clear → correct retry → "Loop complete" with measured correct result.
- Browser-tested cleanup: deleting the temporary notebook removed its notebook,
  source, source-text, chat, material and adaptive-context keys.
- The existing source-deletion revalidation behavior remains: deleting a source
  removes saved source quotations from the learning context.

## Limitations

- The loop is deterministic and extractive. It cannot explain a concept beyond
  the source text.
- The only generated explanation is a rule-based worked example assembled from a
  verified practice quotation. It is not a model-generated explanation.
- Keyword overlap is a relevance heuristic, not semantic entailment. A sentence
  can share a term and still fail to answer the question's intent.
- Practice checks are exact-word source recall. Results are not connected to the
  course mastery engine or the review scheduler.
- The default permission adapter checks that IDs are present, not that the
  current session owns the notebook. A repository-backed ownership adapter is
  still needed for real authorization.
- Timeouts cannot interrupt a blocking synchronous adapter. They are effective
  for asynchronous adapters and are exposed as a contract for future providers.
- Only the source evidence map and four curated visuals are available. There is
  no arbitrary-topic diagram generation.
- No real AI provider, model-based explanation, model-derived citation,
  backend or credential path exists.
- Browser verification covered the main happy/wrong/correct paths and reload. It
  did not cover every adapter failure path in the browser; those are covered by
  Node tests.

## Next recommended task

Connect the measured notebook recall results to the existing mastery and review
scheduler as a clearly labelled, optional evidence source. That would let a
verified notebook recall result influence future review without pretending that
one exact-word check proves mastery. It should be implemented behind an explicit
evidence adapter with a separate persistence key and tests for stale evidence,
cross-notebook isolation and user-controlled opt-out.
