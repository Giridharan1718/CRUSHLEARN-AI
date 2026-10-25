# Active recall and spaced review

This feature adds free-recall review on top of the existing lesson, practice,
diagnostic and evidence systems. It is deliberately small and deterministic:
there is no AI grading, no backend and no claim that one successful recall
proves permanent memory.

## Authoring review concepts

Course authors add `reviewConcepts` to a course learning map:

```js
{
  id: 'html-visible-body',
  title: 'Visible content lives in <body>',
  objectiveId: 'html-document-structure',
  lessonId: 'lesson-1',
  sourceItemIds: [
    'diag-html-structure-1',
    'gp-1',
    'adaptive-html-structure-2',
  ],
  acceptedAnswers: ['<body>', 'body'],
}
```

The source ids point at existing validated questions. The first usable source
supplies the prompt, answer and explanation. Choices are never shown in review;
the learner types the answer from memory. Concepts without a usable source are
skipped, never scheduled and reported by validation.

Source items can come from diagnostics, practice, reassessment, lesson
assessment or adaptive exercises. Legacy lesson quizzes have no objective ids
and are not eligible for objective-linked review.

## Scheduling algorithm

The scheduler is an interval ladder, not SM-2:

| Result | Effect |
| --- | --- |
| New concept | Due immediately |
| Correct | Advance one ladder rung |
| Correct + easy | Advance one extra rung |
| Correct + hard | Advance one rung, then halve the interval |
| Incorrect | Reset to stage 0 and return after the short retry interval |

The default ladder is **1, 3, 7, 14, 30, 60 days**, with a 1-day incorrect
interval and a 180-day maximum. All values are configurable through
`resolveReviewPolicy` / the `policy` option passed to `buildNextReview`.

Dates are calculated from the supplied `now` value, making scheduling
deterministic in tests.

## Priority

Due reviews are ordered by:

1. weak evidence (confirmed repeated difficulty, review recommended, or a
   missed last recall),
2. how overdue the review is,
3. due date and title.

Upcoming reviews are ordered by due date. This means a weak or overdue concept
is surfaced before a well-evidenced concept that happens to be due at the same
time.

## Evidence integration

A completed recall is written to the existing course evidence store with source
`review`. The answer itself is the evidence value. The review record stores the
outcome and optional self-assessment (`easy` / `hard`), while the interval is
stored in a separate course-scoped review store.

Review evidence goes through the same classification rules as diagnostics and
practice. One correct recall is developing evidence, not mastery. The UI repeats
this message rather than claiming permanent retention.

## Storage and invalid data

Review schedules use `crushlearn_review_<courseId>` with a versioned envelope.
On load:

- corrupt JSON returns no schedule,
- a foreign course id or unsupported schema version is ignored,
- malformed individual records are dropped while valid records survive,
- saved records whose concepts no longer exist are not scheduled; the dashboard
  reports how many were ignored.

## Files

- `src/learning/activeRecall.mjs` — content generation, recall checking,
  authoring validation.
- `src/learning/reviewScheduler.mjs` — interval ladder, priority queue and
  schedule normalization.
- `src/learning/reviewStore.mjs` — course-scoped persistence.
- `src/data/courseLearningMaps.mjs` — authored review concepts and question
  catalog.
- `src/pages/ReviewDashboard.jsx` — due/upcoming dashboard.
- `src/pages/ReviewSession.jsx` — recall session and evidence recording.
- `src/components/learning/ReviewDashboardView.jsx` — dashboard presentation.
- `src/components/learning/ReviewSessionView.jsx` — recall presentation.

## Tests

The suite covers activity generation, missing sources, shared sources, exact
and variant answers, scheduling, rescheduling, due dates, incorrect and correct
answers, self-assessment adjustments, policy overrides, priority ordering,
orphaned records, persistence and invalid saved data.

```bash
npm test
```
