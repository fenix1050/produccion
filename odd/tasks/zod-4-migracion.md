# Zod 3 to 4 migration (security alerts #34 and #35)

## Objective

Close the two high Dependabot alerts (zod can exhaust memory validating oversized constrained collections; fixed in 4.6.6) by moving the backend from zod 3.25.76 to 4.6.6. Supersedes Dependabot PR #495, whose `quality` check failed.

## Constraints

- Branch `fix/zod-4-migracion`, PR, never push to main. Strict TDD. Runner: `node --experimental-test-module-mocks --test` from `backend/` (`npm test`).
- Only the backend uses zod. No behavior change for clients: the Spanish validation messages must stay identical.
- No TEST/PROD access in this task; deploy to TEST needs Kevin's authorization, PROD is manual.

## Tasks

- [x] T1: bump `zod` to `^4.6.6` in `backend/package.json` + lockfile. RED observed: 8 existing tests fail (same as #495).
- [x] T2: replace `invalid_type_error`/`required_error` (ignored silently by zod 4) with `error` in `cotizaciones`, `mrc` and `ramos` schemas; `z.record(valor)` becomes `z.record(z.string(), valor)`. GREEN: backend 729 pass, 0 fail.
- [x] T3: new `cotizaciones.schema.test.js` covering the `plan_id` messages (RED 2 fail against the old code, GREEN 2 pass).
- [x] T4: `npm audit --omit=dev` reports 0 vulnerabilities.
- [ ] T5 (Kevin): merge, TEST deploy authorization, manual PROD deploy (backend only; no frontend or migration change).

## Next step

T5.
