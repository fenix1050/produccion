# Align PROD MRC proposal texts with the TEST reference

## Objective

PROD must publish the same MRC legal texts that TEST publishes (reference model: Propuesta N.º 23 in TEST, confirmed by Kevin on 2026-11-05). Migration 084 publishes, as the next version, the TEST content for the keys whose published content differs.

## Evidence (read-only, authorized by Kevin)

- Compared `md5(contenido)` of the published `mrc` rows in TEST and PROD (PROD output pasted by Kevin).
- Differ (4): `declaraciones_generales` (TEST v1 / PROD v2), `declaracion_jurada_origen_fondos` (v2 / v2), `condiciones_mrc` (v2 / v2), `autorizaciones_tomador_poliza_digital` (v2 / v2).
- Equal (2): `coberturas_principales` (v3), `clausula_adicional_cobranzas` (v1).
- Cause: migrations 077/078 were applied in PROD but their texts never reached TEST; the same version number holds different content in each database.
- Texts are data, not code: the PDF reads the published version when a Propuesta is issued. Already issued Propuestas keep their PDF.

## Constraints

- Branch `fix/propuesta-textos-mrc-alinear-prod`, PR, never push to main. Strict TDD (RED, GREEN). Runner: `node --experimental-test-module-mocks --test` from `backend/`.
- Existing text versions are immutable: only insert a new version and move the publication pointer.
- Idempotent: skip a key whose published content already equals the target. Never a bare `UPDATE` of `contenido`.
- TEST access only with Kevin's authorization per step; no PROD access (Kevin runs the runbook).

## Tasks

- [x] T1: RED tests for migration 084 (structure, idempotence guard, the four keys, content hashes equal to TEST).
- [x] T2: generate `backend/migrations/084_pf3_mrc_textos_alinear_con_test.sql` from the TEST content; GREEN.
- [x] T3: execution check on a throwaway PostgreSQL (PROD-like seed, run twice).
- [ ] T4: PR, ESTADO_PROYECTO section, Engram.
- [ ] T5 (Kevin, manual): apply in PROD following `docs/RUNBOOK_DEPLOY_PROD.md` stage 2, then issue a new Propuesta and compare with Propuesta 23.

## Next step

T4: PR; then Kevin applies the migration in PROD (T5).
