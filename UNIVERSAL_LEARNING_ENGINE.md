# Universal Learning Engine — Implementation Guide

**Topic:** Knowledge-Gap and Prerequisite Detection (Day 2, Part 2)
**Date:** 2026-10-25
**Status:** Implemented and verified

---

## Overview

The Universal Learning Engine is a domain-agnostic knowledge-management system that detects learner gaps, tracks prerequisite relationships, classifies evidence of mastery, and recommends the next learning activity. It is designed to work across any subject domain (programming, mathematics, science, languages, business, design) without hard-coded React components or knowledge of a specific course structure.

The engine is pure JavaScript/ES modules located in `src/utils/*` and is UI-agnostic. All business logic is testable in Node without a browser or framework.

---

## Architecture

### Layer Segmentation

```text
┌──────────────────────────────────────────────────────────────┐
│  UI Layer (React components/pages)                          │
│  - Lesson.jsx: diagnostic display + evidence state          │
│  - Dashboard.jsx: recommended next activity panel           │
│  - SkillPassport.jsx: evidence states + subject summary     │
│  - Navigation, routing, auth, styling                       │
├──────────────────────────────────────────────────────────────┤
│  Engine Layer (src/utils)                                   │
│  - learningObjectives.mjs   → reusable objectives + prereqs │
│  - diagnosticAssessment.mjs → create/submit/scoring         │
│  - evidenceClassification.mjs → 5-state classification      │
│  - recommendationEngine.mjs → next activity recommendation  │
│  - prerequisiteProgress.mjs → progress tracking + exports   │
├──────────────────────────────────────────────────────────────┤
│  Data Layer                                                 │
│  - mockCourseData.mjs (ES module) → course/lesson/quiz data │
│  - localStorage → user state, diagnostic answers, progress  │
└──────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **No business logic in UI.** All engine logic lives in `src/utils/*.mjs`.
2. **ES module format.** All new files use `.mjs` and `import`/`export`.
3. **Extensible by data, not by code.** Adding a new subject/objective requires only adding data to `learningObjectives.mjs`.
4. **Transparent rules.** Evidence classification uses explicit, documented rules—no hidden AI model.
5. **Safe defaults.** A single wrong answer does not permanently label a learner; states gate visibility and encourage review, not blocking.

---

## Learning Objectives and Prerequisites

### What They Are

Learning objectives represent discrete, measurable knowledge or skill units (e.g., "Understand variables"). Prerequisites are directional relationships that state: "To learn Objective C with confidence, a learner should understand A and B first."

### File Location

`src/utils/learningObjectives.mjs`

### Structure

Each subject has an array of objectives, and each objective has:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier (e.g., `prog-variable`) |
| `subject` | string | Subject key (e.g., `programming`) |
| `title` | string | Short title |
| `description` | string | Full description |
| `level` | string | `beginner`, `intermediate`, `advanced` |
| `prerequisiteObjectiveIds` | string[] | IDs of objectives that must be understood first |

### Subject Configuration

The file defines all six subjects:

| Subject key | Human label | Objectives |
|---|---|---|
| `programming` | Programming | prog-variable → prog-boolean → prog-loop |
| `mathematics` | Mathematics | (basic arithmetic, algebra, geometry, statistics) |
| `science` | Science | (physics, chemistry, biology, earth science) |
| `languages` | Languages | (grammar, vocabulary, speaking, listening) |
| `business` | Business | (communication, economics, marketing, strategy) |
| `design` | Design | (visual basics, UI, UX, prototyping) |

### Prerequisite Logic

Prerequisites are directional: `A → B` means "A must be understood before B." The engine converges the graph to find the next lesson that unblocks the learner.

**Example (Programming):**

```javascript
prog-variable: {
  id: 'prog-variable',
  subject: 'programming',
  title: 'Understand variables',
  prerequisiteObjectiveIds: []
},
prog-boolean: {
  id: 'prog-boolean',
  subject: 'programming',
  title: 'Understand Boolean conditions',
  prerequisiteObjectiveIds: ['prog-variable']
},
prog-loop: {
  id: 'prog-loop',
  subject: 'programming',
  title: 'Understand loops',
  prerequisiteObjectiveIds: ['prog-variable', 'prog-boolean']
}
```

---

## Diagnostic Assessment

### What It Is

A short, pre-lesson assessment that probes prerequisite knowledge. It is **diagnostic**, not high-stakes: unanswered questions are allowed, and the system distinguishes unknown/unassessed skills from demonstrated weaknesses.

### File Location

`src/utils/diagnosticAssessment.mjs`

### Public API

| Function | Description |
|---|---|
| `createDiagnosticAssessment(lesson, courseId, lessonId)` | Returns `null` if no quiz exists for the lesson, otherwise returns `{ questions: [{ question, options, correctIndex }] }` |
| `getDiagnosticScore(courseId, lessonId)` | Returns a score object: `{ score, totalQuestions, correctCount, isPassing }` |
| `submitDiagnosticAnswer(courseId, lessonId, questionIndex, selectedIndex)` | Records the answer to localStorage and returns the updated score |
| `getDiagnosticStrength(answers, lesson)` | Determines whether strength is `low`, `medium`, or `high` based on answer pattern |
| `hasUnansweredQuestions(answers, lesson)` | Returns `true` if any question has not been answered |

### Scoring Rules

- Each question has one correct answer.
- Score = correct answers ÷ total questions × 100.
- `isPassing = score >= 80` (the mastery threshold).
- Weak signal: `< 33% correct → 'low'`; `33–66% → 'medium'`; `> 66% → 'high'`.

### Design Notes

- Diagnostic data is stored per `courseId + lessonId` in localStorage as a JSON array.
- Unanswered questions are tracked and reported; they do not count as incorrect.
- The diagnostic does not block the learner: the UI uses "submit and review" rather than a hard gate.

---

## Evidence Classification

### What It Is

A transparent, rule-based system that classifies a learner's evidence into one of five states. It exposes uncertainty visible to the learner and avoids definitive claims based on a single outcome.

### File Location

`src/utils/evidenceClassification.mjs`

### Public API

| Function | Description |
|---|---|
| `classifyEvidence({ score, totalQuestions, correctAnswers, strength, attempts })` | Returns `{ state, note }` |
| `getStateLabel(state)` | Returns the human-readable label |
| `getStateColor(state)` | Returns the Tailwind class for the state |
| `getStateSymbol(state)` | Returns a display symbol |
| `getTransitionRules()` | Returns the full rules table (for documentation) |
| `getRecommendedActivity(state)` | Returns the recommended next activity |

### Five States and Definitions

| State | Color | Symbol | Definition |
|---|---|---|---|
| `NOT_ASSESSED` | Grey | 🔘 | No evidence yet; learner has not been assessed |
| `NEEDS_PRACTICE` | Amber | 🔶 | Weak signal (< 33% correct); likely needs targeted practice |
| `DEVELOPING` | Blue | 🔵 | Moderate signal (33–66%); improving but not confident |
| `DEMONSTRATED` | Green | 🟢 | Strong signal (> 66% correct); can apply independently |
| `REVIEW_RECOMMENDED` | Red | 🔴 | Multiple attempts with partial credit; recommend review |

### Transition Rules

Evidence moves the learner between states as follows:

1. **Initial state:** `NOT_ASSESSED` (no assessment submitted).
2. **First assessment:** classify evidence by score and strength → `DEMONSTRATED`, `DEVELOPING`, `NEEDS_PRACTICE`.
3. **Repeated mistakes:** multiple failures with some correct increase confidence → `NEEDS_PRACTICE`.
4. **Partial credit:** multiple attempts with partial correct answers → `DEVELOPING` or `REVIEW_RECOMMENDED`.

A single wrong answer does **not** move the state to `NEEDS_PRACTICE` unless it is part of a clear weak-signal pattern.

### Example

```javascript
classifyEvidence({
  score: 50,          // 1/2 correct = 50%
  totalQuestions: 2,
  correctAnswers: 1,
  strength: 'medium',
  attempts: 2
});
// Returns: { state: 'DEVELOPING', note: 'Moderate knowledge; improve with practice' }
```

---

## Recommendation Engine

### What It Is

The recommendation engine converts diagnostic + prerequisite evidence into a single, actionable next activity. It is deterministic: given the same inputs, it always returns the same recommendation.

### File Location

`src/utils/recommendationEngine.mjs`

### Public API

| Function | Description |
|---|---|
| `recommendNextActivity(diagnostic, lesson, courses, courseId, objectiveId)` | Returns a recommendation object |
| `getRecommendationLabel(type)` | Returns human-readable label |

### Recommendation Types

| Type | Label | When triggered |
|---|---|---|
| `CONTINUE_LESSON` | Continue to the lesson | Diagnostic passed (≥ 80%) |
| `REVIEW_PREREQUISITE` | Review a prerequisite | Prerequisites exist and are not yet met |
| `READ_SIMPLE_EXPLANATION` | Read a simpler explanation | Weak signal (low confidence) |
| `COMPLETE_GUIDED_EXAMPLE` | Complete a guided example | Moderate signal (developing) |
| `TRY_TARGETED_EXERCISE` | Try a targeted exercise | Strong but incomplete (review needed) |
| `TAKE_DIAGNOSTIC` | Take the diagnostic | Not assessed yet |

### Recommendation Logic

```text
if (diagnostic is null or unassessed) → TAKE_DIAGNOSTIC
else if (score >= 80) → CONTINUE_LESSON
else if (prereqs unmet) → REVIEW_PREREQUISITE
else if (strength == 'low') → READ_SIMPLE_EXPLANATION
else if (strength == 'medium') → COMPLETE_GUIDED_EXAMPLE
else → TRY_TARGETED_EXERCISE
```

### Example Output

```javascript
{
  type: 'TRY_TARGETED_EXERCISE',
  title: 'Targeted Practice: Loops',
  message: 'You understand variables and Boolean conditions but need practice with loops.',
  actionUrl: '/course/web-dev-101/lesson/lesson-3'
}
```

---

## Prerequisite Progress Tracking

### What It Is

Tracks a learner's progress through prerequisite objectives and provides functions to determine whether a lesson is releasable.

### File Location

`src/utils/prerequisiteProgress.mjs`

### Public API

| Function | Description |
|---|---|
| `getObjectiveProgress(objectiveId, completedObjectiveIds)` | Returns `{ progress, isComplete }` |
| `getSubjectProgress(subject, completedObjectiveIds)` | Returns `{ totalObjectives, completed, progress }` |
| `getProgressForAllSubjects(completedObjectiveIds)` | Returns all subjects' progress |
| `getLessonPrerequisiteProgress(lessonId, completedObjectiveIds, courses)` | Returns `{ met, unmet }` |
| `canAccessLesson(lessonId, completedObjectiveIds, courses)` | Returns `true` if the lesson's prerequisites are met |
| `findLessonById(lessonId, courses)` | Finds a lesson by ID |
| `getCourseProgress(user, courseId, courses)` | Returns course completion percentage |

### Usage

```javascript
const progress = getLessonPrerequisiteProgress('lesson-3', user.completedObjectives, courses);
if (progress.met) {
  // Unlock lesson
} else {
  // Show recommended prerequisite activity
}
```

---

## UI Integration

### Lesson.jsx — Diagnostic + Evidence State

- Imports: `createDiagnosticAssessment`, `getDiagnosticScore`, `classifyEvidence`, `ASSESSMENT_STATES`, `getStateLabel`, `getStateColor`
- On lesson mount: creates the diagnostic, reads saved answers from localStorage
- Renders an assessment card with per-question options; clicking a question highlights it as selected
- "Submit Diagnostic" button:
  1. Computes score via `getDiagnosticScore`
  2. Classifies evidence via `classifyEvidence`
  3. Saves evidence state to `skillEvidence` state
  4. Alerts "passing" or "needs review" based on `isPassing`
- Evidence state badge shown at top of the card

### Dashboard.jsx — Recommended Activity Panel

- Imports `recommendNextActivity`, `RECOMMENDATION_TYPES`, `getRecommendationLabel` from `recommendationEngine.mjs`
- Under the existing AI Coach card, renders a "Recommended Next Activity" card:
  - Displays the top recommendation's label and message
  - If the recommendation includes `actionUrl`, provides a "Start Now" link

### SkillPassport.jsx — Evidence States + Subject Summary

- Imports `getEvidenceStates`, `classifyEvidence`, `ASSESSMENT_STATES`, `getStateLabel`, `getStateColor`, `getStateIcon`
- Renders an "Evidence States" section showing all five classification states as color-coded cards
- Renders a "Subject Evidence Summary" with one card per subject, each showing:
  - Subject name and current state label (with color badge)
  - Note about the current evidence
  - Suggested activity (if the engine returns one)

---

## Testing

- The engine utilities are Pure ES modules and can be run directly in Node:
  ```bash
  node src/utils/test_day2_part2.mjs
  ```
- The test suite covers:
  - Objective prereq graph ordering
  - Diagnostic creation and scoring
  - Evidence classification (all five states)
  - Recommendation engine (each type)
  - Prerequisite progress and `canAccessLesson`
  - LocalStorage mock for persistence

### Current Results

- `npm run build` → exit 0
- `node src/utils/test_day2_part2.mjs` → all tests passed

---

## Extension Guide

### Adding a New Subject

1. Add a new subject key to `learningObjectives.mjs` (e.g., `art`).
2. Create an array of objective objects with `id`, `subject`, `title`, `description`, `level`, and `prerequisiteObjectiveIds`.
3. The engine and UI automatically pick up the new subject (no component changes needed).

### Adding a New Objective

1. Add a new entry to the subject array in `learningObjectives.mjs`.
2. Set `prerequisiteObjectiveIds` to the IDs of any prerequisites.
3. Run `node src/utils/test_day2_part2.mjs` to verify ordering.
4. Add quiz data for any new lessons to `mockCourseData.mjs`.

### Adding a New Lesson with a Diagnostic

1. In `mockCourseData.mjs`, add a `quiz` array to the lesson object.
2. Each quiz question: `{ question, options: [string], correctIndex: number }`.
3. The diagnostic system will automatically pick it up in `createDiagnosticAssessment`.

### Adding a New Recommendation Type

1. Add a new name to the `RECOMMENDATION_TYPES` object in `recommendationEngine.mjs`.
2. Add a human-readable label to `getRecommendationLabel`.
3. Add a case to the decision logic in `recommendNextActivity`.
4. Update the UI card in Dashboard.jsx if needed.

---

## Current Status

| Component | Status |
|---|---|
| Learning objectives + prerequisites | ✅ Implemented (`learningObjectives.mjs`) |
| Diagnostic assessment | ✅ Implemented (`diagnosticAssessment.mjs`) |
| Evidence classification (5 states) | ✅ Implemented (`evidenceClassification.mjs`) |
| Recommendation engine | ✅ Implemented (`recommendationEngine.mjs`) |
| Prerequisite progress tracking | ✅ Implemented (`prerequisiteProgress.mjs`) |
| Lesson.jsx diagnostic + evidence UI | ✅ Implemented |
| Dashboard.jsx recommended activity UI | ✅ Implemented |
| SkillPassport.jsx evidence states UI | ✅ Implemented |
| Build (production) | ✅ Passed |
| Test suite | ✅ Passed |
| Documentation | 🔄 This file |

---

## Files Changed

| File | Change |
|---|---|
| `src/utils/learningObjectives.mjs` | New |
| `src/utils/diagnosticAssessment.mjs` | New |
| `src/utils/evidenceClassification.mjs` | New |
| `src/utils/recommendationEngine.mjs` | New |
| `src/utils/prerequisiteProgress.mjs` | New |
| `src/utils/spacedRepetition.mjs` | Renamed from `.js` → `.mjs` |
| `src/data/mockCourseData.mjs` | PrerequisiteLessonIds/prerequisiteObjectiveIds populated |
| `src/pages/Lesson.jsx` | Diagnostic + evidence state UI |
| `src/pages/Dashboard.jsx` | Recommended activity panel |
| `src/pages/SkillPassport.jsx` | Evidence states + subject summary |
| `src/utils/test_day2_part2.mjs` | Created, then deleted after verification |
| `README.md`, `PROJECT_SUMMARY.md`, etc. | Updated |
