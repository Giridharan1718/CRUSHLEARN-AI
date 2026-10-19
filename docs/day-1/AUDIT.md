# Day 1 — Repository Audit

**Project:** CrushLearn AI
**Audit date:** 2026-10-19
**Baseline commit:** `440cc0a238254a73b1d7a44b15934c1884334fc3`
**Audit type:** Static code inspection + build/dev command evidence
**Source root:** `C:\Users\girid\Downloads\CRUSHLEARN-AI-main\CRUSHLEARN-AI-main`

> **Evidence rule:** This audit distinguishes what is *implemented in code*, what was
> *verified by a command*, and what is *broken or unverified*. The application cannot
> currently boot in development mode, so no UI flow is marked "runtime verified".

---

## 1. Scope and method

### Files inspected

| Area | Files | Lines |
|---|---:|---:|
| `src/pages/` | 12 | 3,018 |
| `src/components/` | 7 | 1,124 |
| `src/utils/` | 11 | 2,656 |
| `src/data/` | 1 | 320 |
| `src/ai/` | 1 | 98 |
| App entry + CSS | 3 | 118 |
| **Total `src/`** | **35** | **7,334** |

Also inspected: `package.json`, `package-lock.json`, `vite.config.js`, `tailwind.config.js`,
`postcss.config.js`, `jsconfig.json`, `.eslintrc.json`, `.gitignore`, `.env.example`,
`index.html`, and all 13 root Markdown documents.

### Commands used as evidence

| Command | Result |
|---|---|
| `npm ls --depth=0` | Exit 0; dependency tree resolves |
| `npm run build` | Exit 0; 2 missing-export warnings |
| `npm run dev -- --port 5174 --strictPort` | **Exit 1**; dependency scan failure |
| `npm test` | Exit 1; no `test` script |
| `npm run lint` | Exit 1; no `lint` script |
| `npm audit --omit=dev` | Exit 1; 3 moderate advisories |
| Test-file scan (`*.test.*`, `*.spec.*`, `__tests__`) | No test files found |

Full command output is recorded in [`BASELINE.md`](./BASELINE.md).

---

## 2. Application structure

### Runtime entry chain

`index.html` → `src/main.jsx` → `src/App.jsx` → `react-router-dom`

`App.jsx` defines:

- Three public routes: `/` (Login), `/register`, `/forgot-password`
- One protected layout route (`/*`) containing Navbar, Sidebar, footer and nine nested routes
- A fallback redirect to `/dashboard`

There is **no** application state container (no Redux/Zustand/Context). Pages read
`localStorage` directly through `AuthService` or inline calls.

### Layer map (as built)

| Layer | Location | Reality |
|---|---|---|
| Route shell | `src/App.jsx` | Implemented |
| Screens | `src/pages/` | 12 screens, 3 fatally broken |
| Reusable UI | `src/components/` | 4 used, 2 orphaned |
| Content data | `src/data/mockCourseData.mjs` | 3 courses / 9 lessons |
| "AI" logic | `src/ai/guidanceEngine.js` | Rule-based text generation |
| Adaptive logic | `src/utils/*.mjs`, `quizAnalytics.js`, `knowledgeGaps.js`, `errorAnalysis.js` | Mostly orphaned |
| Persistence | `localStorage` | 1 user object + per-activity keys |
| Network/backend | — | None |

### Content volume

| Course | Lessons | Quizzes | Simulations | Slides |
|---|---:|---:|---:|---:|
| Web Development Fundamentals (`web-dev-101`) | 4 | 1 (lesson-1) | 3 (lessons 1–3) | 22 |
| Python for Beginners (`python-basics`) | 3 | 1 (lesson-1) | 0 | 14 |
| Advanced React Patterns (`react-advanced`) | 2 | 1 (lesson-1) | 0 | 0 |
| **Total** | **9** | **3** | **3** | **36** |

Python and React lessons without a simulation fall back to a generic "Hello World" task
inside `Lesson.jsx`.

---

## 3. Feature inventory

Status legend:

- **Implemented** — code path exists and is structurally coherent.
- **Implemented, broken** — code exists but a defect prevents correct behavior.
- **Orphaned** — module/component exists but is never imported or routed.
- **Missing** — no implementation found.
- **Unverified** — cannot be exercised because the app does not boot.

| # | Capability | Evidence | Status | Notes |
|---|---|---|---|---|
| 1 | Login with any credentials | `pages/Login.jsx`, `utils/auth.js:44-66` | Implemented, unverified | Password is never stored or checked |
| 2 | Demo login | `pages/Login.jsx:25-34` | Implemented, unverified | Seeded user with 2 completed lessons |
| 3 | Registration | `pages/Register.jsx`, `utils/auth.js:10-41` | Implemented, unverified | Duplicate check only against the current stored user |
| 4 | Logout | `utils/auth.js:69-71`, `components/Navbar.jsx:34-37` | Implemented, unverified | Removes the only user record |
| 5 | Route protection | `components/ProtectedRoute.jsx`, `App.jsx` | Implemented, unverified | Checks localStorage presence only |
| 6 | App shell / navigation | `Navbar.jsx`, `Sidebar.jsx`, `App.jsx:50-91` | Implemented, unverified | Sidebar hidden below `md` |
| 7 | Dashboard aggregates | `pages/Dashboard.jsx` | **Broken at render** | `getRecommendationLabel` is not imported (`Dashboard.jsx:228`) |
| 8 | Course catalog | `pages/Course.jsx`, `Dashboard.jsx:246-346` | Implemented, unverified | "Enroll Now" has no handler (`Dashboard.jsx:339`) |
| 9 | Course progress | `pages/Course.jsx:29-33` | Implemented, flawed | Lesson IDs collide across courses (see D05) |
| 10 | Lesson slides | `pages/Lesson.jsx:429-509` | Implemented, unverified | Tracks viewed slides in localStorage |
| 11 | Lesson video | `pages/Lesson.jsx:511-570` | Implemented, unverified | External MP4; "played" = play event fired |
| 12 | Practice simulation | `components/Simulation.jsx` | Implemented, unreachable | Lesson page crashes before rendering it |
| 13 | Simulation validation | `Simulation.jsx:38-57` | Implemented | Exact, case-insensitive and numeric match |
| 14 | Progressive hints | `Simulation.jsx:59-82` | Implemented | 3 escalating hints; no hint-usage analytics |
| 15 | Lesson completion | `Lesson.jsx:246-257` | Implemented, unreachable | Requires slides + video + simulation pass |
| 16 | MCQ quiz component | `components/LessonQuiz.jsx` | **Orphaned** | Never imported |
| 17 | Quiz tab | `Lesson.jsx:417-426` | Broken | Tab renders no quiz content |
| 18 | 80% mastery gate | `Lesson.jsx:222-244` | Broken | `score` is undefined (`Lesson.jsx:227`) and quiz callback is never wired |
| 19 | Skip simulation option | `Lesson.jsx:239-242` | Broken | Handler is never attached to UI |
| 20 | Diagnostic assessment | `utils/diagnosticAssessment.mjs`, `Lesson.jsx:309-394` | Broken | Answers never persisted; lesson lookup is a stub; pass threshold is 200% |
| 21 | Evidence classification | `utils/evidenceClassification.mjs` | Implemented | Pure rules; receives no valid evidence in the UI |
| 22 | Recommendation engine | `utils/recommendationEngine.mjs` | **Orphaned/broken** | Lesson lookup always returns `null` |
| 23 | Spaced repetition | `utils/spacedRepetition.mjs` | **Orphaned** | No scheduler is invoked; ease-factor bug |
| 24 | Quiz analytics | `utils/quizAnalytics.js` | **Orphaned** | `trackQuizAttempt` is never called |
| 25 | Knowledge-gap analysis | `utils/knowledgeGaps.js` | **Orphaned** | No producer of the required data shape |
| 26 | Error analysis | `utils/errorAnalysis.js` | **Orphaned** | No attempt records contain the expected fields |
| 27 | Active recall exercises | `components/ActiveRecall.jsx` | **Orphaned** | Never imported |
| 28 | Knowledge Gaps screen | `pages/KnowledgeGaps.jsx` | **Orphaned/broken** | Not routed; missing import; wrong data shape |
| 29 | Skill Passport | `pages/SkillPassport.jsx` | **Broken at import** | Imports two non-existent exports; `evidenceStates` undefined |
| 30 | Final Skill Check | `pages/FinalSkillCheck.jsx` | Implemented, unverified | Timed, exact-output, one attempt forever |
| 31 | Certificate | `pages/Certificate.jsx` | Implemented, unverified | Client-side gate; always first enrolled course |
| 32 | Profile editing | `pages/Profile.jsx` | Implemented, unverified | Edits persist; preference toggles do not |
| 33 | Delete account | `Profile.jsx:52-57` | Implemented | Logs out only; no cascade |
| 34 | Offline mode | `Navbar.jsx:39-44`, `Lesson.jsx:18-20` | Implemented, unverified | Restriction flag only; no caching |
| 35 | Enrollment | `Dashboard.jsx:339` | **Missing** | Button has no `onClick` |
| 36 | Backend / API | — | **Missing** | No server code, no `fetch`, no `import.meta.env` usage |
| 37 | Real AI tutor | — | **Missing** | No model calls; rule-based strings only |
| 38 | Automated tests | — | **Missing** | No test runner, no test files |
| 39 | Linting | `.eslintrc.json` | **Not runnable** | ESLint not installed; no script |
| 40 | Analytics dashboard | `pages/KnowledgeGaps.jsx` | **Orphaned/broken** | Not reachable |

---

## 4. Authentication and progress storage

### Authentication
- Storage key: `crushlearn_user`.
- Any non-empty email + password is accepted (`auth.js:44-66`).
- No hashing, sessions, tokens, expiry, roles, or server verification.
- `isAuthenticated()` is a presence check only.
- `App.jsx:23` computes authentication once per App render; child pages read storage
  independently, so UI state can become stale after login/logout/profile edits.

### Progress
- `completedLessons` is a **flat array of lesson IDs**.
- All three courses reuse `lesson-1`, `lesson-2`, etc.
- Therefore completion and progress bleed across courses (D05).
- Lesson media/simulation progress uses separate keys:
  - `lesson_<lessonId>_progress`
  - `simulation_<taskId>`
- These keys are also course-agnostic.

### Persistence keys observed

| Key | Producer | Consumer |
|---|---|---|
| `crushlearn_user` | `auth.js` | Almost every screen |
| `lesson_<lessonId>_progress` | `Lesson.jsx` | `Lesson.jsx` |
| `simulation_<taskId>` | `Simulation.jsx` | `Simulation.jsx`, `Lesson.jsx` |
| `diagnostic_answers_<courseId>_<lessonId>` | helper only (never called) | `Lesson.jsx`, `diagnosticAssessment.mjs` |
| `final_skill_check_start_time` | `FinalSkillCheck.jsx` | `FinalSkillCheck.jsx` |
| `final_skill_check_submitted` | `FinalSkillCheck.jsx` | `FinalSkillCheck.jsx` |
| `final_skill_check_result` | `FinalSkillCheck.jsx` | `FinalSkillCheck.jsx`, `Certificate`, `SkillPassport` |
| `certificate_locked` | `FinalSkillCheck.jsx` | Never read |
| `offline_mode` | `Navbar.jsx` | `Navbar`, `Lesson`, `FinalSkillCheck` |
| `quiz_attempt_<courseId>_<lessonId>` | helper only (never called) | `quizAnalytics.js` |
| `question_engagement_<courseId>_<lessonId>` | helper only (never called) | `quizAnalytics.js` |
| `crushlearn_courses` | never written | `KnowledgeGaps.jsx` |

---

## 5. "AI" and learning logic

The platform has **no AI service**. It has four independent logic families:

1. **Guidance engine** (`ai/guidanceEngine.js`)
   - Used by Dashboard and Skill Passport.
   - Hardcoded recommendation branches based on total completed lessons.
   - Hints keyed only by `lesson-1`, `lesson-2`, `lesson-3` (same hints for every course).
   - `assessSkills()` grants skills based on *enrollment*, not mastery.

2. **Objective graph** (`utils/learningObjectives.mjs`)
   - Six subjects: programming, mathematics, science, languages, business, design.
   - Prerequisite edges and topological path generation are implemented and coherent.
   - Not connected to courses, lessons, diagnostic, or UI.

3. **Assessment pipeline** (`diagnosticAssessment.mjs`, `evidenceClassification.mjs`,
   `prerequisiteProgress.mjs`, `recommendationEngine.mjs`, `spacedRepetition.mjs`)
   - Evidence states and transition documentation are clear.
   - Actual lesson lookup is a stub returning `null`.
   - Diagnostic answers are never saved by the UI.
   - Reached state is not persisted; no evidence ledger exists.

4. **Analytics pipeline** (`quizAnalytics.js`, `knowledgeGaps.js`, `errorAnalysis.js`)
   - Functions are plausible but no caller produces their input data.
   - UI screens are missing or orphaned.
   - `getUserQuizPerformance()` parses `lesson-1` and treats the first token as a course ID.

**Conclusion:** the adaptive-learning layer is a design prototype, not a functioning
feature. It cannot support the Day 1 goal of "one reusable learning engine" without a
data model and integration work.

---

## 6. Tests, dependencies, security, accessibility

### Tests
- No test runner in `package.json`.
- No `*.test.*`, `*.spec.*`, or `__tests__` files outside `node_modules`.
- No CI configuration.

### Dependencies
- Package manager: **npm** (lockfile v3).
- Installed top level: React 18.3.1, React DOM 18.3.1, React Router DOM 6.30.3,
  Vite 5.4.21, Tailwind 3.4.19, PostCSS 8.5.6, Autoprefixer 10.4.24,
  `@vitejs/plugin-react` 4.7.0.
- `npm audit --omit=dev`: **3 moderate** advisories in the
  `react-router` / `@remix-run/router` chain (GHSA-2j2x-hqr9-3h42), fix available.
- `jsconfig.json` defines `@/*` aliases, but no source file uses them.

### Security
| Finding | Severity | Detail |
|---|---|---|
| Fake authentication | High (for production) | Any credentials accepted; no server |
| Identity in localStorage | High | User object can be edited by the learner |
| Client-issued certificates | High | `final_skill_check_result` is writable |
| No answer validation server-side | High | Quiz/simulation answers live in the bundle |
| No CSP / security headers | Medium | Static Vite app |
| External media dependencies | Low | Placeholder image/video hosts |
| Dependency advisories | Moderate | React Router open-redirect advisory |
| Secrets in repo | None found | Only `.env.example` with placeholders |

This is acceptable for a demo; it is not acceptable for real learner records.

### Accessibility (preliminary, not tool-audited)
- 7 source lines containing accessibility attributes across 35 files:
  - `alt` on course thumbnails and slides
  - `aria-pressed` / `aria-label` on the offline toggle
  - one `htmlFor` in `ActiveRecall`
- Many form labels are not associated with inputs (`htmlFor`/`id` missing).
- Icon-only buttons rely on emoji with no accessible name.
- No focus management, skip link, live-region announcements, or reduced-motion handling.
- State is often communicated with color plus text; contrast was not measured.
- No keyboard trap issues observed statically, but tab order is Unverified.

---

## 7. Documentation drift

There are 13 Markdown documents (14,028 words). They describe three different products.

| Document | Claim | Actual |
|---|---|---|
| `README.md` | "Live", "All features working", "No errors" | Dev server exits 1; 3 screens fatally broken |
| `README.md` | Routes: 6 | 12 routes |
| `README.md` | Source files: 20 | 35 |
| `PROJECT_SUMMARY.md` | Phases 1–2 complete (analytics, recall, gaps, repetition, certificates, sync, enrollment) | Utilities orphaned; no server sync; enrollment is a dead button |
| `PROJECT_SUMMARY.md` | `mockCourseData.js` | Actual file is `mockCourseData.mjs` |
| `AUTHENTICATION.md` | Registration starts with empty courses | Starts with `web-dev-101` and `python-basics` |
| `LESSON_MEDIA_GUIDE` / `SIMULATION_ENGINE_GUIDE` | Full lesson/simulation flow | Flow exists but Lesson page crashes |
| `REQUIREMENTS.md` / `DESIGN.md` | Swipe reels, Concept-Crush map, 45% hint meter, multilingual, AWS/Bedrock | No implementation found |
| `VERIFICATION.md` | Setup verified | Build passes only with warnings; dev fails |

**Root cause:** documentation was written for intended states, not measured states.

---

## 8. Defect register (prioritized)

### P0 — blocks all runtime verification

| ID | Location | Defect | Impact |
|---|---|---|---|
| D01 | `src/pages/SkillPassport.jsx:6` | Imports `getSkillMastery`, `getEvidenceStates` from a module that exports neither | Vite dev dependency scan aborts; app never starts |
| D02 | `src/pages/Dashboard.jsx:228` | Calls `getRecommendationLabel` without importing it | Dashboard throws `ReferenceError` |
| D03 | `src/pages/Lesson.jsx:227` | References undeclared `score` | Every lesson throws `ReferenceError` |
| D04 | `src/pages/SkillPassport.jsx:159` | Iterates undeclared `evidenceStates` | Skill Passport would throw after D01 is fixed |

### P1 — core learning behavior is wrong or unreachable

| ID | Location | Defect | Impact |
|---|---|---|---|
| D05 | `src/data/mockCourseData.mjs`, `auth.js`, `dashboardHelpers.js` | Lesson IDs are not course-scoped; `completedLessons` is flat | Completing one course's `lesson-1` completes it in all courses |
| D06 | `src/pages/Lesson.jsx:417-426` | Quiz tab has no content; `LessonQuiz.jsx` is never imported | Quiz cannot be taken |
| D07 | `src/pages/Lesson.jsx:371-391`, `diagnosticAssessment.mjs` | Diagnostic selections are never persisted; `isPassing` requires 200%; lesson lookup stub | Diagnostic always reports failure / empty |
| D08 | `src/pages/FinalSkillCheck.jsx:60-61` | Submission is permanent; no reset | Failed learners can never retake |
| D09 | `src/pages/Dashboard.jsx:339` | Enroll button has no handler | Enrollment is impossible |
| D10 | `src/pages/Lesson.jsx:246-257` | Completion writes storage but does not refresh in-memory user | Sidebar/dashboard remain stale |
| D11 | `src/pages/SkillPassport.jsx:16` | `assessSkills(enrolledCourses)` awards skills for enrollment | "Skills Acquired" is misleading |
| D12 | `src/pages/KnowledgeGaps.jsx` | Not routed; missing `getLearningEffectiveness` import; wrong data shape | Page unusable |
| D13 | `src/utils/recommendationEngine.mjs:198-202` | `findLessonById` always returns `null` | Recommendation always "Lesson not found" |
| D14 | `src/utils/quizAnalytics.js:18-50` | No caller records attempts | All analytics have zero data |
| D15 | `src/pages/Lesson.jsx:222-224` | React hooks declared after conditional returns | Rules-of-Hooks violation; possible render crash |

### P2 — correctness and maintainability

| ID | Location | Defect |
|---|---|---|
| D16 | `src/utils/spacedRepetition.mjs:43-45` | `item.easeFactor || 2.5 + (...)` never updates an existing ease factor |
| D17 | `src/utils/diagnosticAssessment.mjs:155-170` | `completeDiagnostic` writes an object where an array is expected |
| D18 | `src/utils/quizAnalytics.js:155-168` | Splits `lesson-1` and uses `"lesson"` as a course ID |
| D19 | `src/utils/prerequisiteProgress.mjs:73-102` | Compares objective IDs with lesson IDs; lesson lookup is cross-course |
| D20 | `src/utils/learningObjectives.mjs` | Objective graph is not referenced by any course |
| D21 | `src/ai/guidanceEngine.js:33-53` | Hints are keyed only by lesson number, not course |
| D22 | `src/components/LessonQuiz.jsx:11-23` | Hooks after early return; retry flow absent |
| D23 | `src/components/ActiveRecall.jsx:100-113` | Completion callback uses stale score state |
| D24 | `src/pages/Profile.jsx:229-254` | Preference toggles are not persisted |
| D25 | `index.html:5` | `/vite.svg` does not exist in `public/` |
| D26 | `.eslintrc.json` | ESLint and React plugins are not installed; no lint script |
| D27 | `package.json` | No `test` script, no test dependencies |
| D28 | `README.md` and other docs | Status claims contradict verified commands |

---

## 9. What exists vs. what is needed for the Day 1 goal

| Day 1 requirement | Existing support | Gap |
|---|---|---|
| Diagnose | Diagnostic module + question bank shape | Persist answers; real lesson/objective lookup; correct threshold |
| Explain | Lesson `content`, slides, analogies | Structured concept blocks; 20% budget metadata |
| Demonstrate | Slides / video | Worked-example activity type; subject-neutral demos |
| Practise | Simulation + orphaned quiz/recall components | Unified activity model and router |
| Analyse errors | `errorAnalysis.js` | Attempt-level response records |
| Adapt | `recommendationEngine`, `evidenceClassification` | Real evidence ledger and deterministic policy |
| Review | `spacedRepetition.mjs` | Scheduler invocation + due queue |
| Verify mastery | Quiz gate (broken) | Hint-free independent assessment + rules |
| Apply | Final Skill Check (one global task) | Per-course transfer tasks + rubrics |

**Bottom line:** the UI gestures at the right loop, but the evidence pipeline that would
make it reusable and trustworthy does not exist yet.

---

## 10. Audit conclusion

- The repository is a **demo front end**, not a learning platform. Only the static
  content, local storage, and basic screen layout are real.
- It **cannot currently run** in development mode. `npm run build` succeeds only because
  Rollup tolerates the missing exports; that is not a working baseline.
- The adaptive-learning files are a **useful design vocabulary** (states, objectives,
  SM-2, error categories) that should be preserved and re-factored behind a real domain
  layer, not extended file-by-file in their current disconnected form.
- The Day 1 architecture proposal in [`ARCHITECTURE.md`](./ARCHITECTURE.md) treats these
  files as source material, not as working components.
- No source files were modified during this audit. The original tree is preserved at
  commit `440cc0a`.
