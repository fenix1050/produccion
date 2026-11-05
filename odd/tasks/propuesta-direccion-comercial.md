# Propuesta Formal: capture both insured addresses (particular and comercial)

## Objective

The Propuesta Formal PDF shows two location boxes, "Dirección comercial" and "Dirección particular", but the form only captures one insured address (plus a tomador address when it differs). With tomador = asegurado both boxes show the same address, and "comercial" never existed in the form. Kevin approved (2026-11-05): the form captures both addresses of the asegurado, the comercial one is optional, and the PDF hides the comercial box when it is empty.

## Approved decisions

- New optional draft field `partes.asegurado.direccion_comercial` (max 500, like `direccion`), in step "partes" next to the existing "Dirección" (relabelled "Dirección particular").
- PDF v4 only: "Dirección particular" = asegurado address; "Dirección comercial" = asegurado `direccion_comercial`; the comercial box is not rendered when empty.
- If the tomador is a different person, v4 keeps showing the tomador address in a third box "Dirección del tomador" so no data is lost.
- Issued Propuestas keep their immutable PDF/snapshot; drafts without the field keep working (field optional). No migration.
- v1/v2/v3 renderers untouched.

## Constraints

- Branch `feat/propuesta-direccion-comercial`, PR, never push to main. Strict TDD (RED, GREEN). Runners: `node --experimental-test-module-mocks --test` from `backend/`, `node --test` from `frontend/`.
- TEST access only with Kevin's authorization per step; no PROD access.

## Tasks

- [x] T1: schema `direccion_comercial` (RED/GREEN in `propuestas.schema.test.js`).
- [x] T2: form field + persistence + label (RED/GREEN in `frontend/propuestas/propuestas.test.js`).
- [x] T3: v4 template locations (RED/GREEN in `mrc-v4.test.js`).
- [x] T4: suites green (backend 126 templates, 220 related; frontend 20), real render of three cases (no comercial, with comercial, tomador distinto), ESTADO section 126.
- [ ] T5 (Kevin): TEST deploy authorization, then PROD manual deploy (backend + frontend).

## Next step

T4.
