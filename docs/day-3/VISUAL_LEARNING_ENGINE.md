# Universal Visual Learning Engine — vertical slice

Date: 2026-10-20

## Status

The first complete visual-learning workflow is implemented:

1. A learner enters a topic.
2. A deterministic topic analyser identifies a likely domain, explanation goal and best first representation.
3. If the topic exists in the verified local catalog, the learner opens a complete explanation.
4. The learner reads a level-aware introduction, explores a step-by-step process, walks through an example, answers a practice question, and applies the idea.
5. If the topic is not in the catalog, the app shows the analysis and an honest unavailable state. It does not invent steps, examples, citations or feedback.

Only **step-by-step process diagrams** are implemented. This is a vertical slice, not a complete universal engine.

### Notebook integration

A notebook Study desk question can offer a matching curated visual. The link is
built only when the question matches one of the four authored topics. The visual
page:

- states that the explanation is authored and not generated from, or evidence
  for, the uploaded source;
- validates the `fromNotebook` id before rendering a back link;
- returns to the notebook Study desk with the original question in the URL so the
  extractive answer is restored on load.

This is catalog matching and context preservation, not source-grounded visual
generation.

## Audit summary

### Working

- React 18, Vite 5, React Router 6 and Tailwind CSS.
- Existing protected routes, course platform, lessons, mastery/recall, notebooks and profile screens.
- localStorage-backed demo authentication and course progress.
- The previous notebook baseline was 207 passing tests; this visual slice added
  33 tests at the time. The current full suite is 269 passing tests after later
  notebook work.
- Production build passed before and after the slice.
- No runtime API keys, backend, database or vector store.

### Partial

- Progress persistence exists for courses, journeys, mastery and reviews, but visual-learning progress is not persisted.
- Notebook sources support local extraction, lexical retrieval, extractive answers and study tools. A Study desk question can link to a matching curated visual, but there is still no AI chat, source-grounded visual generation or arbitrary-topic visual generation.
- Responsive design patterns exist, but there was no visualization-specific renderer.

### Mock or static

- Authentication is a browser-local demo, not server authentication.
- The sidebar guidance card is rule-based copy from local progress.
- Offline mode is a demo toggle.

### Missing

- Real AI provider or model call.
- Source-grounded AI retrieval and citation-backed visual generation.
- Graph, timeline, concept-map, comparison, simulation, 3D and code-trace renderers.
- A general visual-generation provider and persistence for visual-learning sessions.

### Reusable parts extended

- React/Vite/Tailwind conventions and page layout.
- Existing routes and navigation.
- Existing test style using Node's test runner, Vite SSR module loading and React server rendering.
- Existing honesty convention: clearly label unavailable AI and generation features instead of mocking them.

## Architecture

```text
Topic input
   |
   v
src/visual/topicAnalysis.mjs       deterministic keyword/goal analysis
   |
   v
src/visual/domainStrategies.mjs    ten domain strategies + general fallback
   |
   v
src/visual/visualCatalog.mjs       narrow topic matching + catalog lookup
   |
   v
src/content/visual/*.mjs           authored, plain-data explanations
   |
   v
src/visual/visualSchema.mjs        typed validation + practice evaluation
   |
   v
src/components/visual/*            renderer registry, process explorer, controls
   |
   v
src/pages/VisualLearning.jsx       /visual
src/pages/VisualTopic.jsx          /visual/:topicId
```

### Topic analysis

`analyzeTopic` is a transparent keyword heuristic, not an AI classifier. It:

- rejects empty, very short and over-300-character topics;
- scores domain keywords with word boundaries (so `software` is not classified as history because of `war`);
- returns a likely domain, matched keywords, confidence and explanation goal;
- uses the general strategy when no domain keyword matches;
- reads recommended representation order from the selected domain strategy;
- does not claim certainty or invent a domain.

The analyser recognises process, comparison, timeline and relationship goals. Representation selection is stricter than "find any renderer": the first recommended representation must be supported. For example, a calculus question recommends graphs first, so this build reports that its graph renderer is unavailable instead of substituting an unrelated process diagram.

### Domain strategies

Ten initial strategies are defined:

1. Mathematics
2. Programming and software
3. Science and physics
4. AI and machine learning
5. Business and economics
6. History and geography
7. Languages and communication
8. Design and creative subjects
9. Research and technical documentation
10. General knowledge and everyday systems

Each strategy declares recommended visual types, example formats, useful interactions, validation requirements and common explanation pitfalls. The list is a starting point; the general strategy remains the fallback for unknown domains.

### Content and schema

Content lives in `src/content/visual/` as plain JavaScript objects. The renderer reads only known fields. Unknown fields, including arbitrary HTML, are ignored rather than executed or injected.

The schema validates:

- schema version, id, topic, title, domain and learning objective;
- one of the supported visual types;
- compatibility with the domain strategy;
- aliases and duration;
- beginner/intermediate/advanced introduction text;
- 3–10 process steps with unique ids, summaries, all three level variants and optional annotations;
- limitations, accessibility description, worked example and application;
- practice question, 2–6 unique options, valid correct index, explanation and optional hint;
- provenance and optional source references;
- explicit source references when provenance is `source_grounded`.

The current explanations are marked `authored`, not source-grounded. Source-grounded content is structurally supported but no retrieval or generation pipeline exists.

### Rendering and interaction

`ProcessExplorer` renders a semantic ordered list of connected process steps:

- native buttons with visible numbering and arrow connectors;
- `aria-current="step"` on the selected step;
- a separate `aria-live="polite"` detail panel;
- previous/next/start-over controls;
- progress ("Explored 2 of 6 steps");
- responsive one-column layout below the large breakpoint and two columns above it;
- text wrapping for long labels;
- no animation claim: this is a step-through process diagram, not an animated simulation.

The level controls update the introduction and every step's detail while preserving the selected step. Simpler/deeper buttons move between beginner, intermediate and advanced. "More visual" and "Practical example" are anchor links to the relevant sections.

The practice check is a real deterministic answer check. It reports correctness, shows the correct option and explanation, supports retry, and states that feedback does not update course mastery. It is not persisted.

### Current topics

| Topic | Domain | Steps | Practice |
|---|---|---:|---|
| Electricity in a simple circuit | Science | 5 | Field propagation vs charge drift |
| From source code to a running program | Programming | 6 | Which stage resolves names |
| How a startup turns a problem into revenue | Business | 6 | Revenue vs gross profit |
| Moving heat out of a refrigerator | General | 5 | Where rejected heat goes |

These are curated demonstrations. They do not prove that arbitrary topics are supported.

## Security and safety

- No API keys or provider credentials are present.
- No AI provider, backend or network generation call is made.
- No new dependencies were added.
- All visual content is constrained to typed data. React escapes text; HTML-like strings are rendered as text.
- The schema rejects unsupported visual types and arbitrary structural failures.
- The renderer has explicit unsupported and missing states.
- The analyzer returns no explanation for unknown topics. Topic matching requires a content-specific alias/overlap rather than generic filler words.
- No citations are fabricated. Existing explanations explicitly state that they are authored and not source-derived.
- Practice answers are evaluated locally; this is not presented as mastery evidence.

## What is not implemented

- AI generation for arbitrary topics.
- AI provider interface implementation (only the data/validation boundary needed by a provider exists conceptually; no provider is wired).
- Concept maps, timelines, comparison views, charts, code traces, simulations, 3D and annotated examples.
- Source-grounded visual explanations and retrieval.
- Persistence of visual-learning level, explored steps or practice results.
- Export/import.
- Server persistence, authentication or authorization.
- Performance benchmarking for large diagrams.

## Files changed

Engine and content:

- `src/visual/domainStrategies.mjs`
- `src/visual/topicAnalysis.mjs`
- `src/visual/visualSchema.mjs`
- `src/visual/visualCatalog.mjs`
- `src/content/visual/index.mjs`
- `src/content/visual/electricityCircuit.mjs`
- `src/content/visual/compilerPipeline.mjs`
- `src/content/visual/startupRevenue.mjs`
- `src/content/visual/refrigeratorCooling.mjs`

UI and routing:

- `src/components/visual/ProcessExplorer.jsx`
- `src/components/visual/PracticeCheck.jsx`
- `src/components/visual/VisualExplanationRenderer.jsx`
- `src/components/visual/VisualLearningHomeView.jsx`
- `src/components/visual/VisualTopicView.jsx`
- `src/pages/VisualLearning.jsx`
- `src/pages/VisualTopic.jsx`
- `src/App.jsx`
- `src/components/Sidebar.jsx`
- `src/components/Navbar.jsx`

Tests:

- `tests/visual/topicAnalysis.test.mjs`
- `tests/visual/visualCatalog.test.mjs`
- `tests/visual/visualSchema.test.mjs`
- `tests/visual/visualRendering.test.mjs`

This document:

- `docs/day-3/VISUAL_LEARNING_ENGINE.md`

## Verification

### Automated

- Current `npm test`: **269 tests, 269 pass, 0 fail**.
- Current `npm run build`: passed, **529 modules transformed**, main JavaScript
  bundle **655.40 kB** minified (`179.57 kB` gzip), existing chunk-size warning.
- Build warnings: stale Browserslist data and the existing large-chunk warning.

### Browser checks

Verified in the running Vite app:

- `/visual` renders the catalog and honest scope notice.
- Submitting `Explain calculus visually` shows Mathematics, relationship goal, graphs-first recommendation, unavailable-renderer message and no generated explanation.
- Opening the electricity card resolves `/visual/electricity-circuit`.
- Step navigation changed the selected step and progress from 1 to 2, and "Start over" returned to step 1.
- Switching to Advanced updated the introduction and the selected step details without losing the selected step.
- Selecting the wrong practice option, checking, and resetting produced the expected feedback and cleared the form.
- `/visual/not-a-topic` shows the not-found state and does not invent content.
- A 367 px-wide iframe check showed no horizontal overflow, a one-column process layout, and a 279 px step button.
- A notebook Study desk question about electricity offered the curated
  electricity visual; the visual page showed the not-source-grounded notice and
  returned to the restored Study desk question.
- A 390 px-wide iframe check of the notebook Study desk, Study materials and
  visual topic page showed no horizontal overflow.
- Console contained only the existing React Router future-flag warnings; no application errors.

The screenshot tool could not capture the page because the desktop window was not visible to the tool. Layout was therefore checked through DOM measurements rather than a visual screenshot.

## Next smallest task

Add a **concept-map renderer** as the second visual type:

- introduce a second typed schema branch with nodes, labelled edges and level-aware node descriptions;
- add one verified AI/ML topic, such as "What is a neural network?", that legitimately calls for a concept map;
- keep the registry, unsupported-type fallback and validation gate;
- add rendering, keyboard, long-label and malformed-content tests.

Do not add an AI provider until there is a real provider boundary, request/response validation and a way to keep credentials off the client.
