# Propuesta Formal MRC — renderer visual v3

## Goal

Reproduce `docs/references/propuesta-formal-v3-reference.png` as a two-page A4 PDF for new MRC Propuestas Formales, preserving all current dynamic data, contractual text, forms, and print safety.

## Non-goals

- Do not change v1 output or historical renderer behavior.
- Do not change endpoints, calculators, payloads, permissions, validations, or business rules.
- Do not add UI/framework dependencies, external assets, or hardcoded example values.
- Do not commit, push, or deploy.

## Tasks

- [x] Add an isolated v3 renderer using the existing dynamic proposal content and inline SVG icons.
- [x] Activate v3 for new proposal snapshots while preserving v1 and v2 renderer revisions.
- [x] Verify focused tests, A4/two-page PDF output, dynamic content, and visual comparison against the reference.

## Evidence

- Reference inspected before edits: `docs/references/propuesta-formal-v3-reference.png`.
- Current implementation and uncommitted worktree state inspected before edits.
- A4 output generated with 2 pages: `C:/tmp/propuesta-formal-v3-preview.pdf`.
- Dense dynamic fixture generated 2 pages without fit overflow: `C:/tmp/propuesta-formal-v3-dense-preview.pdf`.
- Focused tests passed: 47 total across v1/v2/v3 and services.
- Syntax and diff checks passed.
- Visual comparison was inspected against the reference; no pixel-identity claim is made.
- Visual limitation: the reference contains a photographic header backdrop that is not present as a reusable project asset. The implementation uses the matching red geometric gradient and the existing Tajy logo.
- No commit or deploy was performed.

## Visual fidelity pass

Second visual pass completed after reopening the reference and the pre-pass PDF before edits. Only CSS in `mrc-v3.js` was changed. Typography, vertical spacing, card heights, finance/signature scale, and wrapping were improved; ellipsis was removed from contractual and identifying fields.

- `C:/tmp/propuesta-formal-v3-visual-pass-1.pdf` was rendered as a 2-page A4 PDF and visually inspected against the reference.
- A dense dynamic fixture also rendered 2 pages with fit complete.
- 47 focused tests, syntax checks, diff checks, and LSP checks passed; no LSP diagnostics were reported.
- The photographic header backdrop remains approximated with the existing geometric gradient because no reusable asset exists; pixel identity is not claimed.

## Footer fidelity pass

- The requested crop `docs/references/propuesta-footer-reference.png` was not present, so the full `docs/references/propuesta-formal-v3-reference.png` was inspected for comparison.
- The current pre-change two-page PDF was generated and opened before the footer pass.
- Only the mrc-v3 footer markup/CSS and its focused test were changed.
- The footer now has the Tajy brand on the left with `Protegemos lo que te importa`, plus an inline local SVG handwritten slogan with an underline on the right. No footer page number was added because the header badges already show pagination.
- Footer elements are consistently bottom-anchored on both A4 pages.
- `C:/tmp/propuesta-formal-v3-footer-pass-1.pdf` is a 2-page A4 PDF, and both footer elements are present. No pixel-identity claim is made.
- Focused tests passed: 16 total. Syntax and diff checks passed. LSP reported no diagnostics, although that result may be inconclusive.
- No official slogan asset was found, and no external resource was added.
- No commit or deploy was performed.

## Header photographic asset pass

- The dedicated crop reference `docs/references/propuesta-header-reference.png` was absent; the full `docs/references/propuesta-formal-v3-reference.png` was reopened and inspected before editing.
- No reusable project photographic asset existed. A local 113x86 PNG crop was created from the existing reference at `docs/references/assets/propuesta-header-bg.png` and copied to `frontend/shared/assets/propuesta-header-bg.png`.
- v3 now loads the local PNG as a data URI and layers it on the right side of both header banners while keeping the logo, title, and page badge above it.
- Docker packages the asset at `backend/src/assets/propuesta-header-bg.png` with `.dockerignore` exceptions.
- `C:/tmp/propuesta-formal-v3-header-photo-pass-1.pdf` is exactly a 2-page A4 PDF, and both headers visibly include the photographic red-tinted background. Pixel identity is not claimed; the dedicated crop reference was missing.
- 17 focused tests passed. Syntax and diff checks passed.
- No external URL or dependency was added; no commit or deploy was performed.

## Summary and insured-flow bug pass

- Before editing, the full reference and the current header-photo PDF were reopened and visually inspected.
- Root causes were independent header-meta row grids and flex shrinking of `.insured-card` combined with `overflow: hidden`, which let `.pep-row` extend under the modality section.
- v3 now uses one 4x2 header grid with equal columns and explicit cell placement. The insured card is auto-height, non-shrinking, and overflow-visible so the complete PEP row remains in normal flow before modality.
- `C:/tmp/propuesta-formal-v3-summary-pep-pass-1.pdf` is a 2-page A4 PDF. Visual inspection confirmed aligned summary columns, a complete PEP row, and no overlap.
- 19 focused tests passed. Syntax and diff checks passed. LSP reported no findings, although that result may be inconclusive.
- No commit or deploy was performed.

## Final fine-adjustment pass

- The current page 1/page 2 PDF and the available references were inspected before editing.
- `docs/references/header-logo-reference.png` was absent; `docs/references/pep-row-reference.png` and `docs/references/footer-slogan-reference.png` were present.
- Shared header flex shrink caused page 1 logo clipping: the page 1 header measured 56px versus 84px on page 2. This was fixed with shared non-shrinking header geometry, and both logo rectangles were verified equal and inside their headers.
- The PEP label now uses `flex` with `align-items: center` and `gap`; controls remain in their respective columns.
- The recreated slogan was replaced with transparent local PNG assets, `frontend/shared/assets/footer-slogan.png` and `backend/src/assets/footer-slogan.png`, derived from the supplied reference. The asset is loaded as a v3-only data URI and packaged in Docker.
- Footer box overhead was minimally reduced only to keep page 1 in bounds.
- `C:/tmp/propuesta-formal-v3-fine-pass-2.pdf` is exactly 2-page A4. Both pages were visually inspected; pixel identity is not claimed.
- 21 focused tests passed. Syntax and diff checks passed. LSP reported no findings, although that result is inconclusive.
- No commit or deploy was performed.

## Ecological delivery row pass

- Before editing, git status was reviewed. The exact v3 `digitalPolicyForm`/email template and `.digital-*` CSS were identified.
- Only the v3 ecological row markup, its CSS, and its focused test changed, using new `.proposal-eco-*` scoped classes. Existing/shared `.digital-*` rules and all other sections remained untouched.
- The dynamic email continues to use the existing `text(email)` value. The Sí/No options were preserved without inventing a checked state.
- `C:/tmp/propuesta-formal-v3-eco-pass-1.pdf` was generated as a 2-page A4 PDF and both pages were visually inspected. Only page 2 contains the ecological row; protected sections on pages 1 and 2 remain visually unchanged.
- 22 focused tests passed. Syntax and diff checks passed. LSP reported no findings, although that result is inconclusive.
- No commit or deploy was performed.
