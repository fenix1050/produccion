# MRC Formal Proposal v3 — Functional Content Correction

## Goal

Correct the approved v3 MRC Formal Proposal content flow without redesigning the visual system, changing business logic, or touching v1/v2 renderers.

## Scope

- Preserve user-authored newlines in `Descripción detallada`.
- Restore the exact three declaration texts supplied for this pass through the controlled proposal-text source.
- Restore the exact five principal coverage entries supplied for this pass as independent entries.
- Guarantee all three dynamic signature columns render with the required labels/data and preserve the approved ecological row.
- Remove clipping paths for legal/content blocks and keep exactly two A4 pages, using only localized legal-density adjustments if required.

## Non-goals

- No header, colors, cards, footer, logo, icon, summary grid, insured-data layout, ecological-row redesign, endpoint, calculator, payload, permission, or business-rule changes.
- No changes to v1 or v2 renderers.
- No global `transform: scale()`, `zoom`, or indiscriminate text normalization.
- No hardcoded example names, matriculas, or insured data.

## Current evidence

- Candidate branch: `test/pf3-mrc-v3-20260921172555`.
- Worktree is clean except pre-existing untracked `docs/references/` and ODD design task files.
- v3 renderer: `backend/src/templates/propuesta/mrc-v3.js`.
- Proposal text snapshots are built in `backend/src/services/document-snapshot.service.js` from published `propuesta_textos` rows.
- Existing renderer collapses description newlines because `.risk-description` uses normal whitespace; its fit box and fixed coverage geometry also use `overflow: hidden`.
- Legal cards use fixed heights and hidden overflow (`.mini-card`, `.mini-card-body`, `.conditions-flow`, `[data-fit-section]`), while page 2 is a fixed-height A4 flex column with `overflow: hidden`; these are the likely causes of declaration/signature clipping and must be verified against a real fixture.
- Signature markup currently renders three columns but uses `null` for the cardholder name and omits the insured document in the signature details.
- Current legal/coverage text is read dynamically from published snapshot text keys; updating the approved content therefore requires a versioned migration, not a renderer-only hardcode.

## Authoritative content literals

Principal coverage entries (five independent entries):

1. Incendio de edificio y contenido, con extensión a rayo, explosión y humo conforme a las condiciones generales.
2. Daños materiales por huracán, vendaval, ciclón, tornado e impacto de vehículos, cuando corresponda.
3. Robo y asalto de contenido, mercaderías, mobiliario, equipos y enseres declarados.
4. Rotura de cristales, vidrios y espejos dentro de los límites contratados.
5. Responsabilidad civil por daños a terceros, hasta la suma asegurada indicada.

Declaration general body:

> Declaro que los datos consignados en esta propuesta son exactos, completos y verificables. La presente declaración constituye la base para el análisis del riesgo solicitado. Conozco que la omisión, reticencia o inexactitud relevante puede afectar la cobertura. Me obligo a comunicar cualquier modificación material del riesgo durante la vigencia. Reconozco que la aseguradora podrá requerir antecedentes y documentos complementarios. Autorizo la verificación de los datos declarados dentro de los límites legales aplicables. La aceptación definitiva queda sujeta a la evaluación técnica y administrativa correspondiente. Declaro que los bienes y actividades indicados se encuentran vinculados al giro comercial informado. Acepto las condiciones generales, particulares, anexos, límites y exclusiones aplicables. Comprendo que la póliza emitida prevalecerá como instrumento contractual definitivo. La presente propuesta no implica aceptación automática del riesgo por parte de la aseguradora.

Funds title: `Declaración Jurada de Origen de Fondos`.

> Declaro bajo fe de juramento que los fondos destinados al pago de la prima provienen de actividades lícitas. Los fondos guardan relación con el giro comercial y la capacidad económica declarados. No provienen de actividades prohibidas ni de operaciones que contravengan la normativa vigente. Me obligo a proporcionar documentación de respaldo cuando sea requerida por la aseguradora. También la proporcionaré cuando sea requerida por una autoridad competente. Comunicaré cualquier cambio relevante en el origen, uso o disponibilidad de los fondos declarados. Declaro que la información anterior fue suministrada libremente y refleja mi situación al momento de firmar. Comprendo que la aseguradora podrá conservar esta declaración durante el plazo previsto por la normativa. Acepto que la verificación de estos datos podrá realizarse antes o después de la emisión de la póliza.

Authorization title: `Autorizaciones del Tomador y/o Representante Legal`.

> Autorizo la conservación de esta declaración, sus anexos y comunicaciones asociadas en soportes físicos o digitales. Acepto que la entrega de documentos por medios electrónicos se realice al correo indicado en esta propuesta. Reconozco como válidas las comunicaciones remitidas a los datos de contacto declarados y actualizados. Autorizo el envío de la póliza, endosos, avisos de pago, renovaciones y demás documentos vinculados. Acepto que la aseguradora mantenga un registro de las comunicaciones enviadas y recibidas. Me comprometo a informar de inmediato cualquier cambio de correo electrónico, domicilio o teléfono. Esta autorización no reemplaza las formalidades adicionales exigibles por ley o por el contrato. Autorizo el tratamiento de los datos necesarios para administrar esta solicitud y la relación contractual. Reconozco que la copia electrónica de los documentos se mantendrá disponible conforme a los canales habilitados. Acepto que los avisos de vencimiento se emitan con carácter informativo y no sustituyen la obligación de pago. La revocación de esta autorización deberá comunicarse por los canales formales definidos por la aseguradora.

## Planned implementation

1. Add a versioned migration for the supplied official MRC declaration and principal-coverage text, preserving append-only text versions and the existing publication contract.
2. Add focused renderer tests for newline preservation, exact content blocks, independent coverage entries, and all dynamic signatures.
3. Make only localized CSS/flow changes required to prevent content clipping and retain two A4 pages; keep the existing fit gate and ecological row intact.
4. Run focused tests, syntax/diff checks, and a real/dense two-page PDF verification with the four-line description and long legal content.

## Acceptance checks

- `Descripción detallada` preserves each existing `\n` without mutating stored data or inserting synthetic breaks.
- The three supplied declaration titles/body texts are complete and not clipped.
- The five supplied principal coverages remain separate entries.
- Agent, cardholder, and insured signature columns are always present; dynamic names/matricula/documents are escaped and fallback only when absent.
- Existing ecological row remains below signatures with dynamic email and SI/NO semantics.
- No legal/content element is hidden by `overflow`, ellipsis, or line clamp.
- PDF remains exactly two A4 pages with header/summary/cards/footer unchanged.
- v1/v2 focused tests remain green.

## Verification

- Implementation is complete, but remains uncommitted and undeployed.
- Changed implementation: `backend/src/templates/propuesta/mrc-v3.js`.
- Changed tests: `backend/src/templates/propuesta/mrc-v3.test.js`, `backend/migrations/077_pf3_mrc_content_correction.test.js`.
- Changed migration: `backend/migrations/077_pf3_mrc_content_correction.sql`.
- Renderer-focused MRC v3 test runner: 13/13 passed.
- Migration-focused test runner: 3/3 passed.
- Combined regression service/template runner: 57/57 passed.
- Combined migration + renderer + regression command: 61/61 passed.
- `git diff --check`: passed.
- Dense local Puppeteer PDF: `/tmp/mrc-v3-dense.pdf`; 2 pages; A4 594.96 × 841.92 pt; both `.proposal-page` elements had `scrollHeight == clientHeight`; no fit overflow.
- Next step: human review and approval before any TEST deployment.

## Verification plan note

Re-run the focused v3 test runner and `git diff --check` after validating the semantic coverage summary, content-driven card sizing, escaped values, and geometry-based risk/page overflow guard.

## Follow-up verification — compact coverage summary

- Rendered each coverage as one escaped inline summary span while preserving the two-column grid, content-driven card, and visual overflow guard.
- Focused renderer test: 17/17 passed.
- `git diff --check`: passed.

## Follow-up correction — condiciones_mrc paragraph structure

- Root cause: `condiciones_mrc.contenido` was never touched by migration 077 (only the other four keys were). The currently published value is a single unstructured blob without blank-line paragraph breaks, so `conditionsFlow` falls back to `legalFlow` with everything collapsed into one giant paragraph — reproduced in `C:\tmp\mrc-579-real-data-fixed.pdf`.
- Kevin supplied the authoritative corrected text (sub-limits intro, murallas/granizo, Franquicias, Exclusiones) via chat; restored the same blank-line block structure migration 071 (version 1) originally used, fixing three clear copy/paste artifacts from his PDF source (`protecció` → `protección`, `que excluido` → `queda excluido`, `garantia` → `garantía`).
- Added `backend/migrations/078_pf3_mrc_condiciones_correction.sql` (+ `.test.js`, 3/3 passed) publishing `condiciones_mrc` version 2 with the restored structure, following the same immutable-version/idempotent-republish pattern as migration 077.
- Found and fixed a related v3-only CSS gap: `.legal-subheading` (used for the "Franquicias:"/"Exclusiones:" inline sub-headings) had no `display: block` rule in `mrc-v3.js`'s stylesheet (present in v1's base CSS but never carried over to v3), so headings ran together with their body text with no line break. Added `.conditions-flow .legal-subheading { display: block; margin-bottom: .4mm; }` in `backend/src/templates/propuesta/mrc-v3.js`.
- Verified with a standalone render script (dense fixture, real corrected text) → `C:\tmp\mrc-579-condiciones-fix.pdf`; page 2 shows "Condiciones" as separated paragraphs with bold "Franquicias:"/"Exclusiones:" headings on their own line, 2 pages, no clipping/overflow.
- Renderer-focused MRC v3 test runner: 17/17 passed. Full `src/templates/propuesta/*.test.js` regression (v1+v2+v3): 40/40 passed. Migration 077+078 tests: 6/6 passed. `git diff --check`: passed.
- Not committed yet — pending Kevin's visual approval of the regenerated PDF.

## Follow-up correction — header banner photo replacement

- Kevin flagged that the header banner photo changed from what he expected. Tested a literal swap of `docs/references/Banner.png` (the full pre-composed 2172×724 banner with baked-in logo/title/page badge) into the `--v3-header-photo` slot: broke visually — that slot is CSS-stretched to exactly `44% 100%` of the header box, so the whole composed image (including its own baked logo/title) got squeezed into that strip, duplicating the HTML-rendered logo/title with a large blank margin. Confirmed with `C:\tmp\mrc-579-raw-banner-page1-1.png`; reverted.
- **Incident**: while testing, overwrote the working (uncommitted, never staged) `frontend/shared/assets/propuesta-header-bg.png` without stashing first. Recovered it by extracting the embedded image from `C:\tmp\mrc-579-real-data-fixed.pdf` (Codex's last-approved PDF) via `pdfimages`, since it had never been `git add`ed and had no other backup. Restored and confirmed with 17/17 v3 tests before continuing.
- Kevin then supplied the actual intended source photo directly in chat (full-quality, 2000×667, shield watermark, "Tu negocio siempre protegido" chalkboard, no baked logo/text) and asked to keep the current header layout/composition but source it from that photo instead.
- Saved that photo as the new `docs/references/Banner.png` (previous reference file replaced; `docs/references/` is untracked/local-only, no git history lost) and derived `frontend/shared/assets/propuesta-header-bg.png` from it via a Puppeteer-canvas resize to 1000px width (no ImageMagick/sharp available locally) — avoids embedding the full 2.2MB source in every generated PDF.
- Verified with `C:\tmp\mrc-579-new-photo-page1-1.png`: shelf background, shield watermark, model, chalkboard all visible in the header's right-hand strip, no duplicate logo/title, no clipping.
- Full `src/templates/propuesta/*.test.js` regression: 40/40 passed. `git diff --check`: passed.
- Not committed yet — pending Kevin's visual approval of the new banner photo.

## Follow-up clarification — logo/title actually a verification-script gap, not a template bug

- Kevin then flagged the logo and title text as wrong (showing "ASEGURADORA / Tajy / Viví seguro, viví mejor." fallback stack and asked for the real Tajy cursive wordmark with no tagline, matching `C:\Users\...\images\21.png`.
- Root cause: my standalone verification script never passed `tajyLogoDataUri` to `buildMrcPropuestaV3Html`, so every PDF I generated in this session fell back to `.tajy-logo-fallback` (CSS text stack) instead of the real logo image — this is a gap in my ad-hoc render script, **not** a template/CSS defect. `renderPropuestaMrcPdf` (the real production path) always resolves and passes `getTajyLogoDataUri()`.
- Fixed the script to call `getTajyLogoDataUri()` and pass it through; regenerated the PDF — the real cursive "Tajy" wordmark + "ASEGURADORA" now renders exactly as Kevin's reference image, no code change needed in `mrc-v3.js`.
- No template/CSS change made for this item. `C:\tmp\mrc-579-real-logo-header-1.png` shows the corrected header for both pages.

## Follow-up correction — header photo hard edge

- Kevin noted the boundary where the header photo starts was too abrupt (hard edge, low contrast against the title text) and wanted a smoother red-to-photo blend, referencing a softer banner example.
- Added a fourth background layer to `.proposal-header` in `backend/src/templates/propuesta/mrc-v3.js`: `linear-gradient(90deg, var(--v3-red) 0 50%, rgba(202, 15, 41, .55) 60%, rgba(202, 15, 41, 0) 76%)`, composited between the existing diagonal highlight and the header photo layer (updated `background-position`/`background-size` lists to match the new layer count). This fades solid red into the photo gradually between the 50%–76% width marks instead of a hard cut at 56%, while keeping the model/shield/shelf clearly visible past ~76%.
- Verified with `C:\tmp\mrc-579-fade-header-1.png`. Renderer-focused MRC v3 test: 17/17 passed. Full `src/templates/propuesta/*.test.js` regression: 40/40 passed. `git diff --check`: passed.
- Not committed yet — pending Kevin's visual approval.
