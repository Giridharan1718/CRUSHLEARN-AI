# Day 2 Part 2 — Universal Learning Engine

## Summary

Implements knowledge-gap detection, prerequisite relationships, diagnostic assessments, evidence classification (5 states), and next-activity recommendations. All logic lives in pure ES modules under `src/utils/` and is UI-agnostic. React UI components (Lesson.jsx, Dashboard.jsx, SkillPassport.jsx) consume the engine.

## Files Created

| File | Lines | Purpose |
|---|---|---|
| `src/utils/learningObjectives.mjs` | 342 | Reusable learning objectives + prerequisite graph for 6 subjects |
| `src/utils/diagnosticAssessment.mjs` | 355 | Diagnostic creation, submission, scoring, strength analysis |
| `src/utils/evidenceClassification.mjs` | 276 | 5-state evidence classification (NOT_ASSESSED, NEEDS_PRACTICE, DEVELOPING, DEMONSTRATED, REVIEW_RECOMMENDED) |
| `src/utils/recommendationEngine.mjs` | 235 | Deterministic next-activity recommendation |
| `src/utils/prerequisiteProgress.mjs` | 131 | Progress tracking through prerequisites + exports |
| `src/utils/spacedRepetition.mjs` | 330 | SM-2 spaced repetition scheduler (renamed from `.js`) |

## Files Modified

| File | Change |
|---|---|
| `src/data/mockCourseData.mjs` | PrerequisiteLessonIds + prerequisiteObjectiveIds populated for 8 lessons (Web Dev, Python, JS, React, Data Science) |
| `src/pages/Lesson.jsx` | Diagnostic assessment display + evidence state banner + submit handler |
| `src/pages/Dashboard.jsx` | "Recommended Next Activity" panel wired to recommendation engine |
| `src/pages/SkillPassport.jsx` | Evidence states grid + subject evidence summary |
| `UNIVERSAL_LEARNING_ENGINE.md` | New: comprehensive design/implementation doc |

## Key Decision: 5-State Evidence Classification

| State | Color | Symbol | Definition |
|---|---|---|---|
| NOT_ASSESSED | Grey | 🔘 | No evidence yet |
| NEEDS_PRACTICE | Amber | 🔶 | Weak signal (< 33% correct) |
| DEVELOPING | Blue | 🔵 | Moderate signal (33–66%) |
| DEMONSTRATED | Green | 🟢 | Strong signal (> 66%) |
| REVIEW_RECOMMENDED | Red | 🔴 | Multiple attempts with partial credit |

**Rule:** A single wrong answer does NOT move the state to NEEDS_PRACTICE. Evidence classification is transparent and deterministic—no hidden model.

## Build Verification

```bash
> npm run build
✓ exit 0
dist/index.html + assets/index-COwxdqqr.js (272.51 kB) + assets/index-CDCLu5Zj.css (30.84 kB)
```

## Test Verification

```bash
> node src/utils/test_day2_part2.mjs
✓ exit 0 — all tests passed
```

## Next Steps (Optional)

1. Wire `getObjectiveProgress` into Lesson.jsx for per-objective progress bars
2. Add mock learner state to test evidence classification transitions
3. Add CI script: `npm run test:engine` → `node src/utils/test_day2_part2.mjs`
