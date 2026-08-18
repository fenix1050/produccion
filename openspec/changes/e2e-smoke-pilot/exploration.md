## Exploration: e2e-smoke-pilot

### Current State

The application starts the Express API with `npm run dev --prefix backend` on port 3000 and serves the static `frontend/` root separately (the established local command uses port 5000). The backend requires `FRONTEND_URL` and `JWT_SECRET`; its normal `.env` also supplies the real Supabase service credentials, so starting it unchanged is not safe for this pilot.

Login is browser-cookie based: `POST /api/auth/login` sets `tajy_session` (httpOnly) and `tajy_csrf` cookies. The shared frontend wrapper always uses `credentials: 'include'` and adds `X-CSRF-Token` to mutating requests. All quotation routes are session-protected; CSRF applies globally before routing. MRC and Incendio both use preview (`POST /cotizaciones/calcular`), persistence (`POST /cotizaciones`), and Carta Oferta download (`GET /cotizaciones/:id/pdf-oferta`). PDF generation invokes Puppeteer with real per-ramo builders and Legal output.

The existing backend suite is isolated through Node module mocks and passed 251 tests with `npm test --prefix backend`; it covers calculators, cookie/CSRF middleware, auth controller, and MRC/Incendio template builders. Frontend has three Node/jsdom tests. There is no committed Playwright configuration, browser test, or E2E CI job. The manual-run skill installs Playwright in a scratch directory, so it is not CI reproducible today.

### Affected Areas

- `backend/src/app.js` — real API composition, explicit CORS, cookie parsing, rate limiting, and global CSRF enforcement.
- `backend/src/routes/index.js` and `backend/src/routes/cotizaciones.routes.js` — authenticated quotation and PDF endpoints that the smoke flow must exercise.
- `backend/src/services/cotizacion.service.js` and `backend/src/services/cotizacion-persistence.service.js` — preview, persistence, ownership, and repository interactions that currently reach Supabase in a normal process.
- `backend/src/services/pdf.service.js` and `backend/src/templates/oferta/{index,mrc,incendio}.js` — Puppeteer boundary and the two supported Carta Oferta builders.
- `backend/src/middleware/{auth,csrf}.js` and `backend/src/utils/cookies.js` — session-cookie and double-submit CSRF contract.
- `frontend/login/login.js`, `frontend/shared/api.js`, and `frontend/cotizar/` — browser login, cookie forwarding, CSRF header injection, and quotation UI.
- `backend/package.json` and `.github/workflows/ci.yml` — current test command and the future browser/runtime provisioning boundary.

### Approaches

1. **Local Supabase E2E environment** — Start the application against a dedicated local Supabase stack, run migrations and deterministic seed data, then drive login, both quotations, and PDFs in a browser.
   - Pros: Highest fidelity for PostgREST/RPC behavior and database migrations; validates real persistence wiring.
   - Cons: No local Supabase configuration or seed harness is currently committed; adds Docker/service startup, migration/fixture ownership, credentials handling, and substantially slower CI. It is unnecessary to prove cookie/CSRF transport or the PDF boundary and increases accidental-data-risk if environment isolation is misconfigured.
   - Effort: High.

2. **Isolated test-double API plus browser smoke** — Add a test-only in-memory repository adapter/fixture server, start the real Express app in-process with fixed agent, catalog, plans, quote records, and RPC results, and drive it from a committed browser test.
   - Pros: No Supabase URL, service key, production reads, or production writes; deterministic fixtures; exercises actual HTTP cookies, CSRF middleware, auth guard, frontend fetch wrapper, real calculators, and Puppeteer PDF rendering. It fits the current Node test convention and can run in CI once a browser is provisioned.
   - Cons: Requires an explicit test seam because repositories are statically imported; it cannot catch Supabase/PostgREST or migration regressions; browser binaries add CI time and cache management.
   - Effort: Medium.

3. **HTTP contract tests without a browser** — Extend Node tests to call `createApp()` with mocked repositories and assert cookies, CSRF, quotation responses, and PDF bytes.
   - Pros: Fastest and fully isolated; reuses the existing module-mock pattern.
   - Cons: Does not prove the frontend cookie jar, `credentials: 'include'`, or automatic CSRF header behavior; it is not sufficient for the requested end-to-end pilot.
   - Effort: Low.

### Recommendation

Use Approach 2 for the first slice. Keep a real local Supabase environment as a later, separately scoped integration layer rather than making it a prerequisite.

The smallest viable pilot is one committed browser test with deterministic in-memory fixtures and no external network/database access: log in through the real login page; confirm the protected UI session; submit an MRC quote through the UI and save it; request its Carta Oferta and assert a non-empty `%PDF-` response; then use the same authenticated browser context to call the real Incendio preview/create/PDF endpoints with fixed fixture inputs and assert its PDF response. Add one negative request without `X-CSRF-Token` to prove the global 403 boundary. This covers the requested security transport, both active ramo calculation paths, and both PDF builders while avoiding a second, fragile Incendio UI script in the initial slice.

Use a committed browser runner rather than the current scratch-only Playwright workflow. Playwright is the most maintainable choice for cookie/context assertions and CI diagnostics, but it must be added as a development dependency and provision Chromium explicitly in CI. The test fixture server MUST fail closed if any Supabase environment variable is present or any repository call escapes the fixture adapter.

### Risks

- The current production composition has no declared dependency-injection seam, so a careless test setup could import the real Supabase client or start with `backend/.env`; an isolation guard is mandatory before browser startup.
- PDF rendering depends on Chromium and has measurable startup cost; CI needs an explicit browser-install/cache policy and bounded timeouts, while the existing Docker image's system Chromium setup does not automatically configure GitHub Actions.
- The in-memory adapter validates application behavior but not Supabase RPC/PostgREST semantics; keep database integration validation out of this pilot and specify it later if needed.
- Real login requires a bcrypt-backed fixture user and session lookup; fixed test credentials and test-only data must never be production credentials or customer data.

### Ready for Proposal

Yes — propose an isolated, fixture-backed browser smoke pilot only. The proposal should explicitly require: no Supabase network access or credentials, no business-rule changes, no Auto/Hogar/TRO/Transporte/Vida-AP scope, deterministic MRC and Incendio fixtures, real cookie/CSRF/PDF boundaries, a committed CI browser runner, and a test-only adapter that fails on unmocked repository access.
