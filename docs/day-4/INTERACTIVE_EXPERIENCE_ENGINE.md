# Interactive Learning Experience Engine (2026-10-21)

This note records the interactive learning engine state after the October 21
experience pass: what exists, how the domain experiences compute their answers,
what is verified, and what is deliberately not built.

## Scope and honesty rules

- Only experiences with complete, verifiable local implementations are listed.
  The registry in `src/pages/InteractiveLearning.jsx` is the source of truth;
  anything not in it is reported as "not built yet", never simulated.
- Every graded answer is produced by deterministic local helpers, tested in
  `tests/learning/codeTrace.test.mjs` and `tests/learning/circuitMath.test.mjs`.
  No AI provider, no invented mastery, no points that reflect completion only.
- Completion milestones measure distinct, evidence-based outcomes (a correct
  prediction, a correct computation, a found bug, a correct fix, a correct
  reasoning check) — five in each experience.

## Experiences

### 1. `simple-circuit` — Electricity in a simple circuit (Science)

Built earlier in this milestone series. Deterministic Ohm's-law and power math
in `src/learning/circuitMath.mjs`; interactive circuit explorer with parameter
controls, prediction, guided calculation with tolerance-based feedback, a
practical application and an understanding check, rendered by
`src/components/learning/CircuitExperience.jsx`.

### 2. `code-trace` — Tracing and debugging a small program (Programming)

New in this pass.

- `src/learning/codeTrace.mjs` executes an authored six-line program with a
  restricted statement machine (no `eval`, no dynamic code):
  - correct variant: `total = total + reading;` accumulates `[4, 7, 2, 9]`
    → prints **22**;
  - buggy variant: `total = reading;` overwrites the total → prints **9**.
  Both traces have 12 steps; each step is an isolated snapshot of
  `{ total, reading, lineIndex, note }` computed by real execution.
- `src/components/learning/CodeTraceExperience.jsx` renders six sections:
  opening question, interactive code trace (line highlight, `aria-current`
  step marking, live variable readout, Previous / Next / Run to end / Reset),
  prediction challenge, guided debugging (choose the defect line, choose the
  replacement, progressive hints), practical application (one extra sensor
  reading → expected output 27), and an understanding check quiz.
- Progress persists in `localStorage` under
  `crushlearn_interactive_experience_code_trace_v1` (best-effort), and a
  Reset control clears all answers. Storage access is guarded for SSR.

## General-purpose strategy

- `/interactive` lists every built experience as a card.
- A topic lookup reuses the curated visual catalog matcher
  (`findVisualExplanationForTopic`): a curated match navigates to that visual
  explanation (verified with "how a compiler turns code into a program" →
  `/visual/compiler-pipeline`); an unknown topic receives an explicit honest
  message instead of a fabricated lesson; a blank submission is flagged.
- `/interactive/:experienceId` with an unknown id renders the honest
  "That experience is not built yet" state with links back to the available
  lists — no placeholder experience is rendered.

## Verification (2026-10-21, Chrome, localhost:5173)

- `npm test`: **323 passing, 0 failing** (12 new tests this pass: 7 engine/SSR
  in `codeTrace.test.mjs`, 5 page-level in `interactiveLearning.test.mjs`).
- `npm run build`: passing. 547 modules transformed; main JS 774.31 kB /
  209.23 kB gzip; the >500 kB chunk warning is pre-existing.
- Browser walkthrough (dark and light):
  - Home: both experience cards link correctly; topic lookup forms work.
  - Trace: step 3 showed `total = 0 · reading = 4` with iteration note;
    Run to end printed **9** (buggy variant); disabled states correct at both
    ends of the trace.
  - Grading: prediction 22 → correct; Line 4 → correct; line 5 → honest
    rejection; `total = total + 1;` → honest rejection with explanation;
    replacement `total = total + reading;` → correct; extension `27` →
    correct; quiz → correct; all five milestones reached (**5 of 5**).
  - Hints: progressive hint reveal with `aria-expanded` toggling.
  - Persistence: reload restored 5/5 milestones, all selections and step 12
    of 12; Reset returned to 0/5, step 1, no pressed choices.
  - Topic lookup: curated topic navigated to the compiler visual; unknown
    topic got the honest unavailable message; blank submission got the
    describe-a-topic message.
  - Unknown route: honest fallback, links to `/interactive` and `/visual`,
    no fabricated experience content.
  - Console: zero errors (only the pre-existing React Router future-flag
    warnings).
  - Lighthouse: **100 accessibility / 100 best practices / 100 SEO** on
    `/interactive` and `/interactive/code-trace`, in dark and in light.
- Test data cleaned afterwards (`crushlearn_interactive_experience_code_trace_v1`
  removed from the browser's localStorage; theme left as the tester changed it).

## Contrast fix found during verification

The code panel uses `bg-surface-dark`, which stays near-black in both themes.
The first implementation let panel text inherit the theme's `ink` token, which
made the code nearly invisible in light mode (measured `rgb(15, 23, 42)` text
on `rgb(15, 23, 42)` background). Fixed with constant palette classes
(`text-slate-200` code, `text-slate-400` line numbers) that keep ≥ 7:1
contrast on both `rgb(15, 23, 42)` and `rgb(2, 6, 12)` panels in either theme.

Related pre-existing issue (outside today's scope, not fixed):
`LessonJourneyView.jsx` uses `text-line-subtle` on `bg-surface-dark` code
blocks; in dark theme that token is `rgb(30, 41, 59)` — low contrast on the
dark panel. Same for any always-dark panel that reuses theme-flipping ink or
line tokens for text.

## Not built (deliberately)

- No general interpreter or runtime for arbitrary learner code — only the
  authored snippet and its known buggy variant are imported and executed.
- No AI-generated dynamic experiences, explanations, or adaptive hints.
- No third domain renderer yet (history timelines, business scenarios,
  language drills remain "not built").
- No storage or propagation of interactive experience results into course
  mastery; milestones are local only and labelled as such.
