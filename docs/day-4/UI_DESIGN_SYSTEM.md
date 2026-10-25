# UI Design System and Workspace Layout (2026-10-21)

This note records the current design-system state of CrushLearn AI after the
October 21 UI pass: what changed, how themes work, and what remains.

## Theme system

- Tailwind semantic tokens (`surface`, `ink`, `line`, `accent`, `info`,
  `success`, `warning`, `danger`, `primary` shades) are defined as
  `rgb(var(--token) / <alpha-value>)` in `tailwind.config.js`, and the RGB
  triplets live in `src/index.css` under `:root` (light) and `.dark` (dark).
- One `.dark` class on `<html>` flips every component that uses the tokens.
- `src/utils/theme.js` resolves `light` / `dark` / `system`, persists the
  learner's choice under the `crushlearn_theme` key, and keeps `system` live
  while the app runs.
- `index.html` applies the stored theme synchronously before first paint, so
  there is no flash of the wrong theme.
- `src/components/ThemeToggle.jsx` (Navbar) exposes an accessible two-state
  toggle; `system` is the default until the learner picks a side.
- Raw palette classes (`bg-gray-*`, `text-amber-*`, `bg-primary-600
  text-white`, and similar) across `src/` were swept to semantic tokens so dark
  mode and light mode stay consistent everywhere.

## Notebook workspace layout

`src/pages/NotebookWorkspace.jsx` now renders a three-part responsive grid:

- Left rail (always visible): sources list with status, actions, and a
  collapsible "Add a source" panel.
- Center: tabbed workspace (Study desk, Chat history, Study materials). Legacy
  links that point at `?tab=sources` resolve to the Study desk because sources
  moved to the permanent rail.
- Right rail (≥1280px): `NotebookContextPanel` with facts only — sources ready,
  saved kits, saved notes, verified learning-context status, stored evidence
  and visualization counts, and the adaptive-loop status when present.
  Below 1280px the same panel collapses into a `<details>` drawer.
- Nothing in the panel invents progress: every count is derived from data that
  is already stored in the learner's browser.

## Saved notes and toasts

- Chat history messages offer "Save as note" when a save handler is provided.
  Notes are stored in the existing notebook study-materials collection with
  `kind: 'note'`, remember their citations, and are deduplicated per message.
- `src/components/ui/Toast.jsx` adds a dependency-free, event-driven toast
  host (`showToast`) used for notebook creation, source add/delete, study-kit
  and note saves, context saves/clears, and notebook deletion. Destructive
  flows keep explicit `window.confirm` dialogs.
- Toasts are `role="status"` / `aria-live="polite"`, capped at three, and are
  dismissible.

## Verification results (2026-10-21, dev server, Windows)

- `npm test`: **311 passing, 0 failing** (adds theme-controller tests, notebook
  context-panel SSR tests, and the previous suites).
- `npm run build`: passing; chunk-size warning remains pre-existing.
- Lighthouse (Chrome, dark and light themes):
  - `/dashboard`: **100 accessibility / 100 best practices / 100 SEO** in both
    themes (after contrast fixes to status chips and text shade ladder).
  - `/notebooks/:id` workspace: **100 / 100 / 100**.
  - `/interactive` circuit: **100 / 100 / 100** with meta description and
    `public/robots.txt` added.
  - `/review`, `/visual`, `/skill-passport`: **100** (a `<main>` landmark was
    added to Skill Passport).
- Functional browser checks performed: theme toggle round-trip, persistence
  after reload, notebook create → add pasted source → Ask sources → context
  panel counts update, Save as note → materials badge and counts, slider math
  on the circuit experience (9 V / 6 Ω → 1.50 A; 9 V / 3 Ω → 3.00 A), and
  zero console errors.
- The browser window available to automation was 1000px wide; the ≥1280px
  three-column rendering is covered by tests for the component and the layout
  uses standard Tailwind `xl` breakpoints, but a visual confirmation at 1280px+
  and a 390px phone device still need a physical check.

## Known limitations

- Real AI chat (streaming, follow-ups, learning controls) remains
  unimplemented and requires an approved provider/backend.
- Circuit/practice results are still not connected to course mastery or the
  review scheduler (deliberately deferred; needs labelled evidence + opt-out).
- Bundle size (~744 kB main JS) is unchanged; no code-splitting tuning yet.
- Six moderate `npm audit` advisories remain (transitive React Router /
  Mammoth).
- Physical-device testing (390px, screen readers) has not been performed.
