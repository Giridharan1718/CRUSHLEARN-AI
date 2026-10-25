# Configurable mastery checks and progression

This layer answers one question: **is there enough evidence to let the learner
move on?** It composes the existing learning engine instead of replacing it.

- `gapDetection.classifyObjectiveEvidence` still owns the evidence vocabulary
  (not assessed, needs practice, developing, demonstrated, review recommended).
- `gapDetection.analyzeLessonReadiness` still owns prerequisite readiness and
  recommendations.
- `journeyEngine.canCompleteJourney` still owns lesson activity completion:
  guided practice, independent practice and a passing assessment.
- `mastery.evaluateProgression` adds objective criteria, prerequisite criteria,
  delayed-retention policy and an auditable decision on top of those results.
- `LessonJourney` passes the journey-completion result into the mastery layer and
  blocks the completion action when the mastery decision is deferred.

The decision is derived from evidence. Course completion, time spent and streaks
are never inputs. A single correct answer is never sufficient.

## Statuses

An objective has one of four mastery statuses:

| Status | Meaning |
| --- | --- |
| `unassessed` | No usable evidence. This is not a gap or a failure. |
| `developing` | Evidence exists but does not meet all configured criteria. |
| `demonstrated` | Criteria are met, but the delayed retention check is pending. |
| `retained` | Criteria are met and a correct delayed check exists. |

The last two states are deliberately separate. `demonstrated` means the learner
has produced enough recent evidence; it is not a claim of permanent memory.
`retained` means a later check from the configured source also succeeded.

## Authoring criteria

Every authored objective should declare `masteryCriteria` explicitly. Criteria
are merged over the course `masteryPolicy` and safe defaults.

```js
const baseMasteryCriteria = {
  minimumCorrect: 2,
  minimumDistinctItems: 2,
  minimumDistinctSources: 2,
  minimumAccuracy: 0.75,
  accuracyWindow: 5,
  requiredSources: [],
  retention: {
    required: false,
    minimumDelayHours: 24,
    minimumCorrect: 1,
    sources: ['review'],
  },
};

{
  id: 'html-semantics',
  title: 'Pick semantic regions',
  masteryCriteria: {
    ...baseMasteryCriteria,
    // A lesson assessment correct answer is required for this objective.
    requiredSources: ['lesson_assessment'],
  },
}
```

The engine clamps `minimumCorrect` and `minimumDistinctItems` to at least two at
runtime. The authored-content validator rejects weaker settings too.

### Criteria fields

| Field | Purpose |
| --- | --- |
| `minimumCorrect` | Number of correct observations required. Minimum 2. |
| `minimumDistinctItems` | Correct answers must come from this many different question ids. Repeating one question does not help. |
| `minimumDistinctSources` | Correct answers must come from this many evidence sources (for example lesson practice and lesson assessment). |
| `minimumAccuracy` | Required ratio of correct answers inside the recent window. |
| `accuracyWindow` | Number of most recent observations used for accuracy. Older misses can be recovered from with new evidence. |
| `requiredSources` | Sources that must contain at least one correct answer, for example `lesson_assessment`. |
| `retention.required` | Whether a delayed correct check is required for progression. |
| `retention.minimumDelayHours` | Minimum delay after the objective's first timestamped evidence. |
| `retention.minimumCorrect` | Number of correct delayed checks required. |
| `retention.sources` | Sources that count as retention checks. `review` is the default. |

Set `retention.required: true` only when the course genuinely wants to defer
progression until a later review. The authored web course leaves it optional so
the first lesson can finish immediately, while still reporting retention as
pending and upgrading to `retained` after a delayed review.

## Progression decisions

`evaluateProgression({ courseMap, lessonId, evidence, now, activityComplete })`
returns a record with:

- `allowed` and `status` (`allowed` or `deferred`);
- a plain-language `summary`;
- `reasons` explaining the decision;
- one `checks` entry for activity completion, prerequisites and every lesson
  objective;
- `objectives` with each criteria check, evidence counts and retention state;
- `prerequisites` and the existing readiness analysis;
- `remediation` with blocked objective ids, new practice item ids, review
  concept ids and prerequisite lesson links.

The latest decisions are saved under
`crushlearn_mastery_<courseId>` with the reasons and checks. This log is an audit
trail, not a progress source; deleting it does not change evidence or journey
progress.

## Remediation and retakes

When progression is deferred, the mastery panel offers:

- **Open targeted practice**, which opens the existing readiness panel's
  practice flow with questions for the blocked objectives.
- **Review this lesson**, using the journey's existing review action.
- **Review prerequisite lesson** links for missing prerequisite evidence.
- **Retake assessment for mastery** when the assessment score passed but the
  objective evidence did not satisfy the criteria.

The last action is explicit so a passed score is never discarded by accident.
Practice and review evidence from other panels is picked up through the shared
`crushlearn:evidence-updated` event.

## Delayed retention

Review sessions already record evidence with source `review`. When a configured
objective receives a correct review observation at least
`retention.minimumDelayHours` after its first evidence, its status becomes
`retained`. If `retention.required` is true, progression waits for that check.
If it is false, the decision can be allowed while explicitly reporting that
retention is pending.

## Validation and tests

`validateMasteryConfiguration(courseMap)` checks that every objective declares
criteria, thresholds are not weaker than two answers/two questions, sources are
known and required retention has at least one authored review concept.

The tests cover:

- unassessed, developing, demonstrated and retained states;
- one correct answer never being enough;
- repeated attempts on the same question not satisfying distinct items;
- borderline recent accuracy and recovery with new evidence;
- missing prerequisites deferring progression without calling them gaps;
- successful remediation turning a deferred decision into an allowed one;
- required and optional delayed retention;
- decision persistence, corrupt data and bounded history;
- the journey reducer refusing completion and allowing an explicit retake.
