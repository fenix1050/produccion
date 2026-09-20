# Formal proposal required markers and numeric formatting

- [x] Show a visible `*` marker next to every conditionally required proposal field, while leaving optional fields unmarked.
- [x] Format RUC/document fields as `1.234.567-8` and income as Guaraní thousands-separated text during editing without changing payload contracts.
- [x] Add focused regression coverage and verify frontend checks.

## Evidence

- Browser smoke with mocked proposal API passed: required markers rendered, optional income had no marker, initial values were `1.234.567-8` and `10.000.000`, live formatting preserved cursor behavior, and autosave payload kept income numeric.
- Screenshot: `C:/tmp/propuestas-format-smoke.png`.
- `npm test` in `frontend`: 109 passed, 0 failed.
- Proposal focused tests: 10 passed, 0 failed.
- Prettier check and `git diff --check`: passed.

## Scope

- `frontend/propuestas/propuestas.js`
- `frontend/propuestas/propuestas.css`
- `frontend/propuestas/propuestas.test.js`

## Non-goals

- No API, backend, database, or document-generation changes.
- No changes to unrelated concurrent work.
