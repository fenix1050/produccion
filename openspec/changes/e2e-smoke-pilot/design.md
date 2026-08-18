# Design: Isolated E2E Smoke-Test Pilot

## Technical Approach

Add one Playwright smoke test around the real Express middleware/routes, frontend modules, calculators, and Puppeteer renderer. From the repository root, `npm run test:e2e:smoke --workspace=backend` executes `node --experimental-test-module-mocks ../e2e/support/test-system.js`; that flag-enabled launcher installs Node module mocks for every repository **before** dynamically importing `createApp()`. This follows the existing backend `node:test` contract while leaving `backend/src/**`, production composition, and business logic unchanged.

## Architecture Decisions

| Option                                 | Tradeoff                                                     | Decision and rationale                                                                                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local Supabase                         | Database fidelity; large setup and credential risk           | Reject for this pilot; the spec explicitly excludes PostgREST/migrations.                                                                                                                                              |
| Service refactor for DI                | Typed seam; broad production blast radius                    | Reject; unnecessary to prove these boundaries.                                                                                                                                                                         |
| Pre-import repository-module injection | Experimental Node flag; smallest zero-production-change seam | Choose. The backend-owned `test:e2e:smoke` script always launches `e2e/support/test-system.js` with `--experimental-test-module-mocks`; the launcher calls `mock.module()` and only then imports `backend/src/app.js`. |
| Stub PDF bytes                         | Fast but misses the document boundary                        | Reject; retain `pdf.service.js` and Puppeteer unchanged and assert returned bytes.                                                                                                                                     |

The injection entry point requires `E2E_SMOKE=1`, rejects production/database environment, and lives only under `e2e/`. Normal `backend/src/server.js` never imports it and calls parameterless `createApp()`, so test injection is not reachable through normal runtime configuration or HTTP.

## Data Flow

```text
Playwright page -> static frontend -> Express auth/CSRF/routes -> real services/calculators
                                                        -> mocked repository modules
                                                        -> in-memory fixture state
                                                        -> real Puppeteer -> PDF bytes
```

## File Changes

| File                                        | Action | Description                                                                                                                                                                                                                                   |
| ------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/smoke.spec.js`                         | Create | Login, MRC UI, CSRF negative, Incendio API, and PDF assertions.                                                                                                                                                                               |
| `e2e/fixtures/data.js`                      | Create | Frozen user, ramo, plan, rate, coverage, payment, and request fixtures.                                                                                                                                                                       |
| `e2e/support/fixture-adapter.js`            | Create | Stateful in-memory repository exports; deterministic IDs and fail-on-unhandled calls.                                                                                                                                                         |
| `e2e/support/isolation.js`                  | Create | Environment and loopback-only network guards.                                                                                                                                                                                                 |
| `e2e/support/test-system.js`                | Create | Flag-enabled executable launcher: guard isolation, inject repositories, serve API/frontend, spawn Playwright, propagate its exit code, and own teardown.                                                                                      |
| `e2e/support/*.test.js`                     | Create | RED tests for isolation, adapter escape, lifecycle, and cleanup.                                                                                                                                                                              |
| `playwright.config.js`                      | Create | One Chromium project, serial execution, bounded timeouts, traces/screenshots on failure.                                                                                                                                                      |
| `backend/package.json`, `package-lock.json` | Modify | The backend workspace owns pinned `@playwright/test` as a dev dependency and the `test:e2e:smoke`, `e2e:install:chromium`, and `e2e:install:chromium:ci` scripts; the workspace root lockfile records them. Root `package.json` is unchanged. |
| `.github/workflows/ci.yml`                  | Modify | Provision/cache Chromium and run the smoke command.                                                                                                                                                                                           |

## Interfaces / Contracts

`createFixtureAdapter(fixtures)` returns named-export maps for `usuarios`, `ramos`, `coberturas`, `cotizaciones`, `tasas`, `roles`, and `tipos-cambio`. Supported calls return deep copies. `crearCotizacionAtomica(payload)` stores the complete PDF-facing quote graph and returns a monotonic fixture ID; any unspecified method throws `E2E_ISOLATION_BREACH`.

`assertIsolatedEnvironment(env)` rejects `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, any `SUPABASE_*`, `DATABASE_URL`, `PG*`, or `NODE_ENV=production`. The installed socket/HTTP/fetch guard permits only `127.0.0.1`, `::1`, and `localhost`; Playwright routing separately aborts non-local browser requests.

## Testing Strategy

Strict TDD starts with failing support tests and the failing smoke scenario. The flag-enabled `test-system.js` parent installs mocks, starts guarded API and frontend servers on `127.0.0.1:3100` and `:5100`, and waits for both health checks without reusing existing servers. It then spawns `process.execPath` with the backend workspace's resolved `@playwright/test/cli` and exact arguments `test --config <repo>/playwright.config.js <repo>/e2e/smoke.spec.js`, inheriting stdio and passing only loopback base URLs. The Playwright child drives the browser while the mocked Express server remains in the parent; the parent forwards the child exit code and always tears down both processes. The serial flow:

1. Browser-login with fixture credentials; assert session and CSRF cookies.
2. Navigate to `/cotizar/`, complete MRC via resilient text/role selectors plus current ordered inputs, await live preview, emit, capture `pdf-oferta`, and assert status 200, `application/pdf`, size greater than 1 KB, and `%PDF-` prefix.
3. From the same browser context, POST without CSRF and assert 403; then send valid Incendio preview/create requests with the cookie token header and assert its PDF identically.
4. Exercise invalid MRC/Incendio fixtures and assert no create/PDF call follows failure.

Teardown closes pages/context, both HTTP servers, `closeBrowser()`, resets fixture state, removes traces/downloads except retained failure diagnostics, and verifies no listeners or quotes remain. All commands run from the repository root. Local setup is `npm run e2e:install:chromium --workspace=backend`; local smoke is `npm run test:e2e:smoke --workspace=backend`. CI caches Playwright and Puppeteer browser directories keyed by OS and `package-lock.json`, runs `npm run e2e:install:chromium:ci --workspace=backend` (expanding to `playwright install --with-deps chromium`), then runs the same smoke command. On failure it prints Node, Playwright, Puppeteer, executable paths, ports, and retained trace paths.

## Threat Matrix

| Boundary                 | Applicability | Reason                               |
| ------------------------ | ------------- | ------------------------------------ |
| Documentation-like paths | N/A           | No file classification or execution. |
| Git repository selection | N/A           | No Git invocation.                   |
| Commit state             | N/A           | No commit automation.                |
| Push state               | N/A           | No push automation.                  |
| PR commands              | N/A           | No PR automation.                    |

Process integration is covered by RED tests for rejected credentials, non-loopback sockets, unhandled adapter calls, startup failure, and teardown after test failure.

## Migration / Rollout, Non-Goals, and Rollback

No migration or feature flag. Non-goals: Supabase/PostgREST fidelity, migrations, production data, business-rule changes, PDF redesign/content snapshots, Auto, and additional journeys. Rollback removes `e2e/`, Playwright config/dependency/scripts, and the CI steps; production code and data need no reversal.

## Open Questions

None.
