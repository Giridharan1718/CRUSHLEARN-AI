# Improvement Plan (2026-10-25)

This plan covers the next improvement pass for CrushLearn AI. It is intentionally
honest about what is already complete and what still needs work.

## 1. Performance

- Code-split route pages (done).
- Split the PDF worker and large PDF library into a separate on-demand chunk.
- Lazy-load heavy notebook components (`NotebookWorkspace`, `ResearchToolsPanel`,
  `SourceViewer`) only when their route/panel is opened.
- Add a size budget to CI and fail builds that exceed it.
- Measure and improve initial load on a slow 3G profile.

Acceptance criteria:
- Main entry JavaScript is under 250 kB gzipped.
- No route imports a heavy library unless that route is opened.
- Lighthouse performance is measured on the dashboard and notebook workspace.

## 2. Accessibility

- Run Lighthouse on every route, not only the notebook workspace.
- Fix any remaining `label-content-name-mismatch`, contrast, focus, or
  keyboard-navigation findings.
- Ensure closed disclosure content is not focusable.
- Add automated accessibility checks to the test suite.

Acceptance criteria:
- Lighthouse accessibility is 1.0 on dashboard, notebooks, settings, visual,
  review, and profile pages.
- Every interactive element is keyboard reachable and has a visible focus ring.

## 3. Features

- Connect a real AI provider and exercise provider claims, conflict review, and
  `ai_assisted` material persistence end to end.
- Compile and test the Rust gateway with `cargo test`.
- Add web-source ingestion verification against a live gateway.
- Add import/export round-trip verification in the browser.

Acceptance criteria:
- Provider-backed operations are tested with a configured provider.
- Gateway tests pass in CI.
- Web sources store real retrieval metadata and fail honestly when unavailable.

## 4. Code quality

- Remove or isolate the externalized `node:crypto` usage in
  `src/utils/accountStore.mjs`.
- Reduce the largest remaining chunks with dynamic imports.
- Add tests for lazy-loaded route rendering and accessibility regressions.
- Keep the test suite fast and deterministic.

Acceptance criteria:
- `npm test` and `npm run build` pass in CI.
- No new high-severity lint or security warnings are introduced.

## 5. Verification

After each change:
- Run `npm test`.
- Run `npm run build`.
- Run Lighthouse on affected pages.
- Update `docs/day-5/PHASE1_AUDIT_AND_PLAN.md` with the delivery record.
