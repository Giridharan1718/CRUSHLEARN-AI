# Day 1 — Verified Baseline

**Recorded:** 2026-10-19
**Repository:** `CRUSHLEARN-AI-main` (nested project root)
**Branch:** `main`
**Baseline commit:** `440cc0a238254a73b1d7a44b15934c1884334fc3`
**Commit message:** `chore: establish pre-Day-1 baseline`

> This document records what actually happened. It does not claim a passing state where
> a command failed.

---

## 1. Environment

| Item | Value |
|---|---|
| OS | Windows (`win32`) |
| Shell | PowerShell |
| Node.js | `v24.22.0` |
| npm | `11.19.1` |
| Git | `2.55.0.windows.5` |
| Package manager | npm |
| Lockfile | `package-lock.json`, `lockfileVersion: 3` |
| Build tool | Vite `5.4.21` |
| UI runtime | React `18.3.1`, React DOM `18.3.1` |
| Router | React Router DOM `6.30.3` |
| Styling | Tailwind CSS `3.4.19`, PostCSS `8.5.6`, Autoprefixer `10.4.24` |

`package.json` declares ranges (`^18.2.0`, `^6.21.0`, etc.); the versions above are the
actual installed/resolved versions from `npm ls --depth=0`.

---

## 2. Repository state before this Day 1 work

- **Not a Git repository.** `git rev-parse --is-inside-work-tree` returned
  `fatal: not a git repository (or any of the parent directories)`.
- No uncommitted work existed, because no repository existed.
- `.gitignore` already excluded `node_modules`, `dist`, logs, editor folders and `*.local`.
- The outer folder `C:\Users\girid\Downloads\CRUSHLEARN-AI-main` contains a `.vite/`
  directory and this nested project; only the nested project was versioned.

### Checkpoint created

```
git init -b main
git config user.name  "CrushLearn Dev"
git config user.email "dev@crushlearn.local"
git add --all
git commit -m "chore: establish pre-Day-1 baseline"
```

- Files committed: **59**
- Insertions: **15,084**
- `node_modules/` and `dist/` are ignored, as intended.
- Git identity was set **locally** for this repository only.

**Restore command (if later work must be discarded):**

```powershell
git reset --hard 440cc0a238254a73b1d7a44b15934c1884334fc3
```

---

## 3. Dependency state

`npm ls --depth=0` → **exit 0**

```
crushlearn-ai@1.0.0
+-- @types/react-dom@18.3.7
+-- @types/react@18.3.28
+-- @vitejs/plugin-react@4.7.0
+-- autoprefixer@10.4.24
+-- postcss@8.5.6
+-- react-dom@18.3.1
+-- react-router-dom@6.30.3
+-- react@18.3.1
+-- tailwindcss@3.4.19
`-- vite@5.4.21
```

No `npm install` was required; `node_modules/` was already present and resolves cleanly.

---

## 4. Command results

### 4.1 Production build — PASS (with warnings)

```powershell
npm run build
```

**Exit code: 0**

```
vite v5.4.21 building for production...
transforming...
Browserslist: browsers data (caniuse-lite) is 9 months old.
src/pages/SkillPassport.jsx (6:44): "getSkillMastery" is not exported by "src/utils/prerequisiteProgress.mjs", imported by "src/pages/SkillPassport.jsx".
src/pages/SkillPassport.jsx (6:61): "getEvidenceStates" is not exported by "src/utils/prerequisiteProgress.mjs", imported by "src/pages/SkillPassport.jsx".
✓ 60 modules transformed.
dist/index.html                 0.49 kB
dist/assets/index-CDCLu5Zj.css 30.84 kB │ gzip: 5.55 kB
dist/assets/index-COwxdqqr.js 272.51 kB │ gzip: 77.27 kB
✓ built in 1.39s
```

**Interpretation:** the bundle is emitted, but two imports cannot resolve. Rollup treats
them as undefined; this is **not** a green build. Do not use "build exit 0" as evidence
that the app works.

### 4.2 Development server — FAIL

```powershell
npm run dev -- --port 5174 --strictPort
```

**Exit code: 1**

```
VITE v5.4.21  ready in 319 ms
➜  Local:   http://localhost:5174/

Error: Failed to scan for dependencies from entries:
  C:/Users/girid/Downloads/CRUSHLEARN-AI-main/CRUSHLEARN-AI-main/index.html

X [ERROR] No matching export in "src/utils/prerequisiteProgress.mjs"
  for import "getSkillMastery"
    src/pages/SkillPassport.jsx:6:44

X [ERROR] No matching export in "src/utils/prerequisiteProgress.mjs"
  for import "getEvidenceStates"
    src/pages/SkillPassport.jsx:6:61
```

**Interpretation:** the app cannot be started. This is the primary P0 blocker (D01 in the
audit). The port was released after the failed run; no lingering dev server remains.

### 4.3 Tests — NOT AVAILABLE

```powershell
npm test
```

**Exit code: 1**

```
npm error Missing script: "test"
```

No test runner is declared and no test files exist outside `node_modules`.

### 4.4 Linting — NOT AVAILABLE

```powershell
npm run lint
```

**Exit code: 1**

```
npm error Missing script: "lint"
```

`.eslintrc.json` exists, but ESLint and `eslint-plugin-react` are not installed and
`node_modules/.bin/eslint*` is absent. The configuration is currently non-executable.

### 4.5 Dependency audit — 3 MODERATE

```powershell
npm audit --omit=dev
```

**Exit code: 1**

```
@remix-run/router 1.3.0 - 1.23.2
Severity: moderate
React Router's same-origin redirect with path starting // causes open redirect
via protocol-relative URL reinterpretation
(GHSA-2j2x-hqr9-3h42)
fix available via `npm audit fix`

3 moderate severity vulnerabilities
```

The vulnerable chain is `react-router-dom` → `react-router` → `@remix-run/router`.
No fix was applied during Day 1; the baseline is recorded as-is.

---

## 5. What is verified vs. unverified

| Claim | Status |
|---|---|
| Dependencies resolve | **Verified** (`npm ls` exit 0) |
| Production bundle emits | **Verified** (`npm run build` exit 0) |
| Build is warning-free | **False** (2 missing-export warnings) |
| App can start in dev | **False** (exit 1) |
| Automated tests pass | **Not applicable** (no tests) |
| Lint passes | **Not applicable** (not runnable) |
| Any UI flow works end-to-end | **Unverified** (app cannot boot) |
| Dependency tree is advisory-free | **False** (3 moderate) |

---

## 6. Baseline acceptance criteria for Day 2

Day 2 work begins from `440cc0a`. Before new features are built, the following should be
true and re-recorded:

1. `npm run dev` starts and serves the app without a dependency-scan error.
2. `npm run build` completes with **zero missing-export warnings**.
3. A manual smoke test passes: login → dashboard → course → lesson → simulation →
   mark complete → skill passport.
4. `npm run lint` exists and passes (or the config is removed and replaced deliberately).
5. A test runner exists with at least domain-rule tests for scoring, mastery gating and
   progress isolation.
6. `npm audit` findings are reviewed; the React Router advisory is either fixed or
   explicitly accepted with a reason.

These are **not** claimed as done in this Day 1 baseline.

---

## 7. Reproduction notes

- The audit and baseline are tied to commit `440cc0a`; later source changes invalidate
  the exact line references.
- `dist/` was regenerated by `npm run build`; it is Git-ignored and not part of the
  committed baseline.
- `npm audit` output is time- and registry-dependent; re-run it rather than trusting this
  snapshot.
- Node 24 is newer than Vite 5's documented minimum but the build ran successfully. If
  dependency-scan behavior changes, test on the project's declared Node target before
  blaming the code.
