# Proposal: Isolated E2E Smoke-Test Pilot

## Intent

Establish a reproducible browser smoke test for the highest-value authenticated quotation boundaries without risking production Supabase credentials, network access, or customer data. The pilot proves real cookie/CSRF transport, representative MRC and Incendio paths, and Carta Oferta PDF generation.

## Proposal Question Round

No open product questions remain. The resolved assumptions are: this is a narrow confidence pilot, database fidelity is deferred, and all pricing, document content, permissions, and ramo behavior remain unchanged.

## Scope

### In Scope

- Commit a Playwright runner and CI Chromium provisioning under strict TDD.
- Log in through the browser using real session and CSRF cookies.
- Complete one MRC UI quote and validate its non-empty `%PDF-` Carta Oferta.
- In the same authenticated browser context, execute Incendio API preview, create, and PDF validation.
- Assert a mutating request without `X-CSRF-Token` fails with 403.
- Provide deterministic test-only users, catalogs, rates, quotes, and repository responses.
- Fail closed before startup if Supabase credentials are present, external database access is possible, or a repository call escapes the test adapter.

### Out of Scope

- Local Supabase, PostgREST/RPC, migration, or database integration testing.
- Production data, credentials, network calls, business-rule changes, or schema changes.
- Auto and any paused/future ramo work; additional UI journeys or PDF content redesign.

## Capabilities

### New Capabilities

- `isolated-e2e-smoke`: Deterministic browser verification of authenticated MRC/Incendio quotation and PDF boundaries with fail-closed data isolation.

### Modified Capabilities

None.

## Approach

Run the real Express and static frontend surfaces against an explicit test-only in-memory adapter. Drive one Playwright browser context through login, MRC UI, Incendio API, CSRF rejection, and real Puppeteer PDF rendering. CI installs the pinned browser runtime and cannot fall back to normal Supabase composition.

## Affected Areas

| Area                        | Impact   | Description                                    |
| --------------------------- | -------- | ---------------------------------------------- |
| `e2e/**`, Playwright config | New      | Runner, fixtures, smoke flow, isolation guards |
| `backend/src/**`            | Modified | Minimal explicit test-only composition seam    |
| `backend/package.json`      | Modified | Reproducible test commands/dependencies        |
| `.github/workflows/ci.yml`  | Modified | Browser provisioning and smoke execution       |

## Risks

| Risk                      | Likelihood | Mitigation                                                                   |
| ------------------------- | ---------- | ---------------------------------------------------------------------------- |
| Supabase escape           | Med        | Pre-start environment guard, blocked external access, unhandled-call failure |
| Browser/PDF CI flakiness  | Med        | Pinned Chromium, deterministic fixtures, bounded diagnostics/timeouts        |
| False database confidence | Med        | Name and document the pilot as excluding Supabase integration                |

## Rollback Plan

Remove the runner, test adapter/seam, package scripts, and CI step. No production schema, data, or business behavior requires reversal.

## Dependencies

- Playwright Chromium and the existing Puppeteer PDF runtime.

## Success Criteria

- [ ] The isolated smoke flow passes locally and in CI with no Supabase credentials or network access.
- [ ] Login cookies, MRC UI quote/PDF, Incendio preview/create/PDF, and missing-CSRF 403 are asserted.
- [ ] Any isolation breach or unhandled repository call stops the suite before production access.
