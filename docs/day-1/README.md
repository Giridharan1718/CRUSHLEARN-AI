# Day 1 — Audit, Baseline and Learning-System Design

**Project:** CrushLearn AI
**Date:** 2026-10-19
**Baseline commit:** `440cc0a238254a73b1d7a44b15934c1884334fc3`
**Source changes:** None. Day 1 added documentation only.

This folder contains the evidence-based Day 1 deliverables. The application is **not**
fixed by this work. It is audited, checkpointed, and designed for a deliberate Day 2
implementation.

---

## Deliverables

| Document | What it answers |
|---|---|
| [`AUDIT.md`](./AUDIT.md) | What exists, what is broken, what is mock, and file-level evidence |
| [`BASELINE.md`](./BASELINE.md) | Exact environment, commands, failures, tests/lint/audit results, Git checkpoint |
| [`LEARNING_JOURNEY.md`](./LEARNING_JOURNEY.md) | The reusable nine-stage learner experience and rules |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Layer boundaries, domain model, engine interfaces, API, migration plan |
| [`schema.sql`](./schema.sql) | Draft PostgreSQL schema (design only; **not executed**) |

---

## Day 1 completion checklist

| Task | Status | Evidence |
|---|---|---|
| Repository audit with file-level evidence | **Done** | `AUDIT.md` §1–§8; 35 source files, 7,334 lines inspected |
| Working features identified | **Done** | `AUDIT.md` §3 — no UI flow is runtime-verified because the app cannot boot |
| Mock and incomplete functionality identified | **Done** | `AUDIT.md` §3, §5, §7 |
| Build and test baseline recorded | **Done** | `BASELINE.md` §4 |
| Existing changes protected | **Done** | Git initialized; commit `440cc0a`; 59 files |
| Universal learning journey specified | **Done** | `LEARNING_JOURNEY.md` |
| Reusable data model proposed | **Done** | `ARCHITECTURE.md` §5; `schema.sql` |
| Architecture and priorities documented | **Done** | `ARCHITECTURE.md` §3, §15; defect register in `AUDIT.md` §8 |

**Day 1 is complete as a design and baseline exercise.** It does not mean the product is
working.

---

## Verified starting state (summary)

| Check | Result |
|---|---|
| `npm ls --depth=0` | Pass, exit 0 |
| `npm run build` | Exit 0, but **2 missing-export warnings** |
| `npm run dev` | **Fail, exit 1** — dependency scan cannot resolve `getSkillMastery` / `getEvidenceStates` |
| `npm test` | Not available — no script |
| `npm run lint` | Not available — no script, ESLint not installed |
| Test files | None |
| `npm audit --omit=dev` | 3 moderate advisories (React Router chain) |
| UI end-to-end verification | **Not possible** until P0 defects are fixed |

The full output is in [`BASELINE.md`](./BASELINE.md). Do not cite the build as green:
Rollup emitted the bundle while two imports were unresolved.

---

## The five findings that matter most

1. **The app cannot start.** `SkillPassport.jsx` imports two exports that do not exist.
   The production build hides this because Rollup tolerates missing exports; Vite's
   dependency scan does not.
2. **The learning flow is not wired.** The quiz component is orphaned, the diagnostic
   answers are never saved, the mastery gate references an undefined variable, and the
   recommendation engine always returns "Lesson not found".
3. **Progress is corrupted across courses.** All courses reuse `lesson-1`, `lesson-2`,
   etc., and `completedLessons` is a single flat array. Course isolation does not exist.
4. **The adaptive modules are prototypes, not features.** Spaced repetition, quiz
   analytics, knowledge gaps, error analysis and active recall are never invoked by the
   UI. Their bugs are therefore hidden rather than harmless.
5. **The documentation describes a different product.** The 13 root Markdown files
   (14,028 words) claim live features, working analytics and a backend that do not exist.

---

## Design decisions adopted

| ID | Decision | Rationale |
|---|---|---|
| ADR-001 | One learning engine; subject differences live in activity types and evaluators | Avoids seven separate apps and duplicated mastery logic |
| ADR-002 | Domain logic is pure and framework-free | Makes scoring, mastery, prerequisites and scheduling testable without a browser |
| ADR-003 | Evidence events are append-only; current state is a projection | Mastery must be explainable and reproducible |
| ADR-004 | Course-scoped UUIDs; no global `lesson-1` keys | Fixes cross-course completion bleed at the model level |
| ADR-005 | No backend, database or AI provider in Day 1 | The existing app must first be stabilized and its learning rules proven locally |
| ADR-006 | Deterministic adaptation, AI only for explanation | Progression must be testable and not dependent on model output |
| ADR-007 | Mastery and certificates are server-authoritative after Phase 2 | localStorage can be edited by the learner |

---

## What was deliberately not done

- No source files were modified.
- No P0 defect was fixed. Fixing them is Day 2 work and needs its own commit and test.
- No backend, PostgreSQL instance, authentication provider or AI API was added.
- No existing documentation was rewritten; the new folder records measured reality
  without destroying the original claims (which remain useful evidence of drift).
- `schema.sql` was **not executed**. It is a reviewed design draft, not a verified
  migration.

---

## Day 2 entry criteria

Before adding features:

1. Fix P0 defects D01–D04 in a separate commit (imports, `score`, `evidenceStates`).
2. Make `npm run dev` boot and add a smoke test for login → dashboard → course → lesson.
3. Make `npm run build` warning-free.
4. Add a test runner and lint script, or deliberately remove the non-executable ESLint
   config.
5. Resolve or explicitly accept the React Router advisory.
6. Build **one lesson** through Diagnose → Explain → Demonstrate → Practise → Feedback →
   Mastery → Apply using the proposed engine and a local repository.
7. Prove reuse on a **second, non-programming** lesson before scaling content.

The detailed sequence is in [`ARCHITECTURE.md` §15](./ARCHITECTURE.md#15-day-2-implementation-sequence).

---

## Checkpoint and recovery

The original tree is preserved at:

```text
440cc0a238254a73b1d7a44b15934c1884334fc3  chore: establish pre-Day-1 baseline
```

To inspect it without changing the working tree:

```powershell
git show --stat 440cc0a
git diff 440cc0a -- .
```

To discard later work entirely:

```powershell
git reset --hard 440cc0a238254a73b1d7a44b15934c1884334fc3
```

`node_modules/` and `dist/` are Git-ignored. The baseline commit contains 59 tracked
files, including all 35 source files and 13 existing documents.
