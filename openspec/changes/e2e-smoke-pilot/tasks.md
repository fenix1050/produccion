# Tasks: Isolated E2E Smoke-Test Pilot

## Review Workload Forecast

| Field                   | Value                                                          |
| ----------------------- | -------------------------------------------------------------- |
| Estimated changed lines | 1,050–1,350                                                    |
| 400-line budget risk    | High                                                           |
| Chained PRs recommended | Yes                                                            |
| Suggested split         | 1 guards → 2 adapter → 3 launcher → 4 MRC/CSRF → 5 Incendio/CI |
| Delivery strategy       | ask-on-risk                                                    |
| Chain strategy          | pending                                                        |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal             | Likely PR | Focused test command                                                               | Runtime harness                | Rollback boundary         |
| ---- | ---------------- | --------- | ---------------------------------------------------------------------------------- | ------------------------------ | ------------------------- |
| 1    | Loopback guards  | PR 1      | `node --experimental-test-module-mocks --test e2e/support/isolation.test.js`       | N/A—unit-only                  | `e2e/support/isolation.*` |
| 2    | Fixtures/adapter | PR 2      | `node --experimental-test-module-mocks --test e2e/support/fixture-adapter.test.js` | N/A—no server                  | fixtures and adapter      |
| 3    | Mocked launcher  | PR 3      | `node --experimental-test-module-mocks --test e2e/support/test-system.test.js`     | `:3100/:5100` failure teardown | launcher/config           |
| 4    | MRC/CSRF smoke   | PR 4      | `npm run test:e2e:smoke --workspace=backend`                                       | Chromium MRC and 403           | MRC smoke cases           |
| 5    | Incendio/CI      | PR 5      | `npm run test:e2e:smoke --workspace=backend`                                       | Chromium Incendio lifecycle    | Incendio, scripts, CI     |

## Phase 1: RED Isolation Contracts

- [x] 1.1 RED: Add `e2e/support/isolation.test.js`; reject `SUPABASE_*`, `DATABASE_URL`, `PG*`, and production mode.
- [x] 1.2 RED: Prove HTTP, socket, and fetch guards reject each non-loopback target before connection.
- [x] 1.3 RED: Add `e2e/support/fixture-adapter.test.js`; require deep copies and `E2E_ISOLATION_BREACH` for unhandled named repository calls.
- [x] 1.4 RED: Add `e2e/support/test-system.test.js`; prove failed startup/child teardown closes listeners/browser and resets fixtures.

## Phase 2: GREEN Isolated Harness

- [x] 2.1 GREEN: Create `e2e/support/isolation.js` with guards that pass 1.1–1.2.
- [x] 2.2 GREEN: Create frozen MRC/Incendio fixtures in `e2e/fixtures/data.js` and a named-module, monotonic-quote adapter in `e2e/support/fixture-adapter.js`.
- [x] 2.3 GREEN: Create `e2e/support/test-system.js`; require `E2E_SMOKE=1`, mock repositories before `backend/src/app.js`, and own loopback servers/teardown.
- [x] 2.4 REFACTOR: Simplify support helpers without weakening errors; leave `backend/src/**`, rules, schemas, and credentials untouched.

## Phase 3: RED/ GREEN Browser Contracts

- [x] 3.1 RED: Create `e2e/smoke.spec.js` for browser login/CSRF, MRC UI/PDF, invalid MRC no offer, and non-empty `application/pdf` `%PDF-` bytes.
- [x] 3.2 RED: Reuse that context for missing-CSRF `403`, Incendio preview/create/PDF, and invalid preview with no create/PDF.
- [x] 3.3 GREEN: Complete only test fixtures, launcher mapping, and resilient selectors for real Express/frontend/Puppeteer assertions.
- [x] 3.4 REFACTOR: Bound serial waits, retain failure traces/screenshots only, and close context, servers, browser, and fixture state after each outcome.

## Phase 4: Reproducibility and Verification

- [x] 4.1a Unit 4 prerequisite: add `playwright.config.js`, pin `@playwright/test`, and add the `test:e2e:smoke` runner.
- [ ] 4.1b Unit 5: add `e2e:install:chromium` / `e2e:install:chromium:ci` scripts and any remaining browser setup.
- [ ] 4.2 Update `.github/workflows/ci.yml` to cache browsers, install CI Chromium, run smoke, and print runtime/path/port/trace diagnostics on failure.
- [ ] 4.3 Run `npm test --prefix backend` and local Chromium smoke; confirm no external request, persisted data, session, or success artifact remains.
