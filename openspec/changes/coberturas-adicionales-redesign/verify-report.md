```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:42940d527f8a59488c9da2a336b2a3e6c7b1d94ca2d854854674e7f995899d78
verdict: fail
blockers: 2
critical_findings: 2
requirements: 5/6
scenarios: 7/14
test_command: npm test --prefix backend
test_exit_code: 0
test_output_hash: sha256:2245c10e6c33ac885afee7feff3388fb14aa4d5bac588ef3a482a12ee035c939
build_command: node --check frontend/cotizar/render/render-datos.js && node --check frontend/cotizar/actions.js && node --check frontend/cotizar/events.js && node --check frontend/cotizar/constants.js && node --check frontend/cotizar/state.js && node --check frontend/shared/nav-icons.js
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

# Verification Report

**Change**: `coberturas-adicionales-redesign`
**Mode**: post-merge verification against `main` (working tree clean, HEAD `c926a18`)
**Artifact store**: hybrid (Engram + OpenSpec)
**Artifacts read**: spec (`specs/coberturas-adicionales-ui/spec.md` + Engram #444), tasks (`tasks.md` + Engram #446), apply-progress (Engram #447)
**Verdict**: FAIL — 2 CRITICAL, 5 WARNING, 4 SUGGESTION. No code defect found; both CRITICALs are artifact/evidence gaps that block a clean `sdd-archive`.

## Scope of evidence

- Merged commits present on `main`, in order: `f6da9e7` (PR #230), `18e769c` (PR #231), `c926a18` (PR #232).
- Aggregate diff `f6da9e7~1..c926a18`: 13 files, +1203 / -105.
- Backend suite: `npm test --prefix backend` gives 251 pass / 0 fail / 37 suites, `duration_ms 4046`, exit 0.
- The change is frontend-only; the backend suite covers zero of its scenarios. It is a regression guard, not spec evidence.
- This project has no automated frontend test suite. The spec Non-Requirements authorize Playwright/manual verification instead, so manual evidence is admissible here.

## Task completeness

| Phase                     | Tasks | Complete | Notes                                                                                        |
| ------------------------- | ----- | -------- | -------------------------------------------------------------------------------------------- |
| 1 Foundation              | 3     | 3/3      | `COBERTURA_ICONOS`, icon constants, `coberturasAdicionalesEditando` Set all present          |
| 2 Edit-mode state machine | 7     | 7/7      | actions/events/body-builder verified in source                                               |
| 3 Card markup             | 6     | 6/6      | `cardCoberturaAdicional()` plus both renderers rewritten                                     |
| 4 CSS                     | 5     | 5/5      | new block added, old blocks and malformed comment deleted, `> label` scoping, reduced-motion |
| 5 Verification            | 5     | 2/5      | 5.2, 5.3, 5.5 unchecked                                                                      |
| Total                     | 26    | 23/26    | all code tasks done; only verification tasks pending                                         |

## Spec compliance matrix

6 requirements / 14 scenarios in `specs/coberturas-adicionales-ui/spec.md`.

| #    | Requirement / Scenario                                         | Code evidence                                                                                                            | Runtime evidence                                                          | Status                                |
| ---- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------- |
| R1.1 | Unmarked row shows dimmed lock instead of pencil               | `render-datos.js:172-174` inert `__lock` span; `cotizador.css:1816` `.is-locked{opacity:.55}`                            | Task 5.1 (Playwright, 1440/768/480)                                       | PASS                                  |
| R1.2 | Checking fills the radio indicator                             | `render-datos.js:345-351`; `cotizador.css:1852-1864` dot scale 0 to 1                                                    | Task 5.1                                                                  | PASS                                  |
| R2.1 | Selector and Quitar persist in free mode                       | `render-datos.js:295-303` select plus `__quitar`; add button `:327`                                                      | none, task 5.2 unchecked                                                  | UNTESTED                              |
| R2.2 | Row-level lock identical in selector mode                      | `render-datos.js:281` `locked = !l.codigo`, same `campoMontoCobertura()`                                                 | none, task 5.2 unchecked                                                  | UNTESTED                              |
| R3.1 | Amount set and not editing shows formatted value, not the dash | `render-datos.js:168` ternary on `sumaAsegurada` with `fmtGsConPrefijo`                                                  | contradicted: task 5.1 recorded "static shows dash" (pre-revert behavior) | UNTESTED                              |
| R3.2 | Amount empty and not editing shows the dash                    | same line, falsy branch                                                                                                  | Task 5.1                                                                  | PASS                                  |
| R3.3 | Pencil opens editable input with focus, caret at end           | editing branch `:148-163`; `focusMontoCobertura()` uses `focus({preventScroll:true})` plus `setSelectionRange(len,len)`  | Task 5.1 ("reopen shows real value")                                      | PASS                                  |
| R3.4 | Preview and Detalle del plan match the stored value            | `sumaAsegurada` never mutated by edit-mode code; `render-detalle-plan.js` has zero diff in the whole change              | none, tasks 5.3/5.5 unchecked                                             | UNTESTED (risk nil by construction)   |
| R4.1 | Checking an empty-amount coverage auto-opens the input         | `actions.js` `toggleCoberturaAdicionalPorCodigo` adds to the Set when `!linea.sumaAsegurada`, then `focusMontoCobertura` | Task 5.1                                                                  | PASS                                  |
| R4.2 | Coverage that already has an amount does not force edit mode   | same guard, only adds when falsy                                                                                         | Task 5.1 partial                                                          | PASS (see W2, scenario text is stale) |
| R5.1 | Capacity reached in Datos disables with title                  | `render-datos.js:327` `is-locked` plus `disabled title="Ya agregaste el máximo…"` plus `ICON_LOCK`                       | none, task 5.2 unchecked                                                  | UNTESTED                              |
| R5.2 | Capacity reached in Detalle del plan shows identical chrome    | no such button exists; removed in PR #225, single `add-cobertura-linea` call site repo-wide                              | n/a                                                                       | NOT MET (by design)                   |
| R6.1 | Read-only Detalle del plan card unaffected                     | `SUBLIMITE_ICONOS` byte-identical (diff is additions below the map); `render-detalle-plan.js:313` still reads it         | none, task 5.5 unchecked                                                  | UNTESTED (risk nil by construction)   |
| R6.2 | Adicionales cards show the 6 new dedicated icons               | `constants.js:190-198` all 6 codes; `render-datos.js:213` lookup with generic fallback                                   | Task 5.1                                                                  | PASS                                  |

Compliance: 7 PASS, 6 UNTESTED, 1 NOT MET.

## Late product decisions versus shipped code

The five decisions that were re-resolved late in the session, each checked against merged bytes:

| Decision (last resolution)                                                              | Shipped code                                                                                                                             | Match |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Static view shows the real formatted amount; dash only when empty                       | `render-datos.js:168`                                                                                                                    | YES   |
| Edit state has no persistent "Suma asegurada" label; placeholder lives inside the input | `render-datos.js:150-163`, editing branch emits only an `.sr-only` label plus `placeholder="Suma asegurada (Gs.)"`                       | YES   |
| Confirm/close uses the same pencil icon as open                                         | `render-datos.js:178-190`, one `ICON_PENCIL` button, only `data-action` differs                                                          | YES   |
| Add-button lock chrome only in `render-datos.js`                                        | single call site confirmed repo-wide                                                                                                     | YES   |
| `#btn-ver-detalle` and `#tab-detalle-plan` use `aria-disabled`, not native `disabled`   | `actions.js` `syncAvanceButtons` (native `disabled` lines deleted), `render-shell.js:93`, `render-datos.js:558`, guard at `events.js:96` | YES   |

Both bugs recorded in apply-progress are fixed in the merged bytes: no malformed comment remains in `cotizador.css`, and the oval-circle inheritance is neutralised by `.coberturas-adicionales .cobertura-adicional-card__check { min-height: 20px }` at `cotizador.css:1836`.

## Issues

### CRITICAL

C1 — Requirement 5 in `spec.md` mandates behavior the code intentionally does not implement.
`spec.md:89-103` requires the lock chrome "consistently in both `render-datos.js` (Datos step) and `render-detalle-plan.js` (Detalle del plan step)" and carries a dedicated scenario "Capacity reached in Detalle del plan". That button was removed in PR #225; `tasks.md:50` states the opposite (`render-datos.js` only, no task for `render-detalle-plan.js`, per D9). Code follows tasks.md, so the spec is the stale artifact. `sdd-archive` merges delta specs into `openspec/specs/`, so archiving as-is would enshrine a permanently unmet requirement in the authoritative spec set. Requirement 5 and its second scenario must be rewritten to a single call site before archive.

C2 — Three Phase 5 verification tasks are unchecked; free-selector mode has zero runtime evidence.
`tasks.md` 5.2, 5.3 and 5.5 are unchecked. Task 5.2 is the only evidence source for Requirement 2 in full (both scenarios) plus R5.1. That entire render mode (`renderCoberturasAdicionales`, roles with `puede_agregar_cobertura_libre`) was rewritten and never exercised live because no credentials for such a role were available. The change was merged with the gap open. The remedy is evidence, not code: obtain a `puede_agregar_cobertura_libre` login and run 5.2/5.3/5.5, or have Kevin spot-check.

### WARNING

W1 — Task 5.1 recorded live assertion contradicts the shipped behavior of Requirement 3. Task 5.1 is checked with the assertion "static shows the dash; reopen shows real value", which is the superseded always-hidden rule. The final code shows the real value in the static view. The requirement that changed most (R3, revised twice by Kevin) therefore has no runtime evidence matching its final form. Kevin's five rounds of visual feedback are informal evidence that he saw the final rendering, but no artifact records an assertion for it.

W2 — `spec.md:87` (R4, scenario 2) still cites the superseded rule: "the static — view is shown per the visibility rule above", which directly contradicts the rewritten Requirement 3 five lines earlier. The code is correct; the spec sentence is stale.

W3 — `tasks.md:48` (task 3.4) is checked but describes the opposite of what shipped: "Static field state always renders — placeholder, never the stored value". The merged code renders the stored value when present.

W4 — The Engram spec artifact (#444) is out of sync with the OpenSpec file. It still titles Requirement 3 "Static View Never Shows the Stored Amount (critical, resolved by Kevin)" and describes 12 scenarios; the file now has 14 and the opposite rule. In hybrid mode both copies must agree, or a later phase reading only Engram will act on the reverted rule.

W5 — The Engram tasks artifact (#446) records a pre-merge world: "Unit 3 … NOT pushed, PR NOT opened" and "PR #231 open", while all three PRs are merged. The same staleness exists in the `tasks.md` work-unit table at line 25.

### SUGGESTION

S1 — `ICON_CHECK_SMALL` (`frontend/shared/nav-icons.js:60`) is dead code. It was added by task 1.2 for the confirm-edit button; that button now reuses `ICON_PENCIL`, and the constant has no remaining reference anywhere under `frontend/`.

S2 — Three code comments still describe the superseded always-hidden rule and will mislead the next reader: `state.js:44-46`, the header comment of `habilitarEdicionMontoCobertura` in `actions.js`, and the keydown comment at `events.js:141`. Only `render-datos.js:137-146` documents the final rule correctly.

S3 — `cotizador.css:1796-1799` says the new block "Reemplaza los bloques viejos … (borrados en el cutover de Unit 3, junto con este comentario)". The blocks were deleted but the comment survived, so it now describes a state that no longer exists.

S4 — Requirement 3 at `spec.md:47` embeds change-session narrative ("re-resolved by Kevin, 2026-08-10, second round …"). Useful now, but it reads as noise once merged into the durable `openspec/specs/` domain; consider trimming to the rule itself at archive time.

## Design coherence

`design.md` exists and is referenced by section number throughout the shipped comments (2.2/2.3/2.4, D3, D4, D6, D8, D9). Spot checks all hold: no `focusout` close path (D3), edit Set cleared on `selectRamo`/`selectPlan`/prefill (D4), auto-open without focus steal in `preagregarCoberturasPrincipalesFijasMrc` (D6), `> label` scoping (D8), single add-button call site (D9). No design deviation found.

## Test and build evidence

| Command                     | Exit | Result                                                 |
| --------------------------- | ---- | ------------------------------------------------------ |
| `npm test --prefix backend` | 0    | 251 pass, 0 fail, 37 suites, 4046 ms                   |
| Frontend test suite         | n/a  | none exists in this project, per spec Non-Requirements |
| Coverage                    | n/a  | no coverage tool configured for this suite             |

`npm run format:check` was deliberately not used as a signal: per apply-progress, `core.autocrlf=true` on this machine makes Prettier flag the entire repo locally while the actual blobs are LF and CI-clean.

## Strict TDD

Strict TDD Mode is enabled globally, but this change ships zero test files: it is frontend-only, the project has no frontend runner, and the spec Non-Requirements explicitly waive automated tests in favour of Playwright verification. There is therefore no TDD Cycle Evidence table in apply-progress and none is expected; RED/GREEN/TRIANGULATE/SAFETY-NET are not applicable. Assertion Quality Audit: no test files created or modified by this change, so there are no assertions to audit. Test layer distribution for the change: Unit 0, Integration 0, E2E 0 (manual Playwright runs only, not committed).

## Final verdict

FAIL — blocked for archive by C1 (spec requires an intentionally absent button) and C2 (three unchecked verification tasks, free-selector mode never run live). Implementation quality itself is clean: every code task is done, every late product decision matches the shipped bytes, both recorded bugs are fixed, and 251/251 backend tests pass. Remediation is artifact editing plus one live verification pass; no production code change is indicated.
