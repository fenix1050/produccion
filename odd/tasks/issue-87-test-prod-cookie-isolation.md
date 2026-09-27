# Issue #87 P0 — TEST/PROD Cookie Isolation

## Authorization and boundaries

- User authorized implementation on the dedicated branch `fix/issue-87-test-prod-cookie-isolation` and a separate PR.
- User explicitly authorized updating the existing OpenSpec/API contract: new API cookies must be host-only (no `Domain`); `/auth/me` returns the CSRF token in its JSON body; frontend caches that token in memory with the user from `/auth/me` per archived D4; preserve server-side double-submit validation.
- User subsequently authorized a legacy-cookie transition: use versioned new session/CSRF cookie names; emit explicit expiration headers for legacy `.cotizador.lat` Domain cookies, with `Domain` only on those deletion headers and never on newly issued cookies. The first request after deployment may still carry a legacy cookie; the new backend ignores it, then clears it. Active sessions must reauthenticate; the user accepts this.
- Do not access TEST/PROD, inspect deployed runtime configuration, or read real secrets. Do not deploy.
- Do not start T-04 backup restoration; the user will authorize it separately after specifying a disposable destination and data handling.
- Preserve the existing API/auth behavior outside this contract change. No source writes are authorized outside the paths listed below.

## Current evidence

- Dedicated worktree was clean at `8d6cd7a224d7f2958f207e4f152233199cb37454`, equal to `origin/main`, before the authorized implementation began.
- Before the first change, `COOKIE_DOMAIN` controlled the cookie `Domain` attribute; tracked PROD Compose configuration sets `.cotizador.lat`. TEST runtime configuration is not established from tracked files. Cleanup expires legacy cookie names configured for the current API request at the known `.cotizador.lat` scope; other live names/scopes and browser behavior remain unverified.
- TEST and PROD hosts share the `cotizador.lat` parent domain, so a cookie scoped to `.cotizador.lat` can be sent to both; distinct names alone are not strict isolation.
- Existing `auth-sesion-cookie` and `auth-csrf-double-submit` specs require the shared parent domain and a JavaScript-readable CSRF cookie read with `document.cookie`. The user approved replacing those requirements with host-only cookies and `/auth/me` CSRF-token delivery.
- No live environment, secret, or `.env` values have been accessed.

## Implementation work unit

Implement one cohesive, reviewable T-03 change on this branch and close it with at least one work-unit commit. Keep any necessary test-only contract-sync corrections in separate reviewable commits within the same PR. In Strict TDD order, add backend/frontend regressions first and observe RED; then implement:

- Give new session and CSRF cookies versioned names so legacy cookie values cannot authenticate or collide with them. Issue and clear new cookies host-only (no `Domain`); make both HttpOnly; keep double-submit header-versus-cookie validation.
- Add explicit expiration of legacy session/CSRF cookies scoped to `.cotizador.lat`. The `Domain` attribute is allowed only on these legacy deletion headers, never on new cookie issuance or host-only cookie clearing. Run cleanup when legacy cookies arrive, before accepting/rejecting auth; first request can carry the old cookie but new auth ignores it.
- Return the CSRF cookie value from authenticated `GET /auth/me` alongside `usuario`.
- In `frontend/shared/api.js`, cache `csrfToken` alongside the user when `auth.cargarSesion()` consumes `/auth/me`, use the in-memory token for mutation headers instead of `document.cookie`, and clear both values together. Preserve synchronous `getUsuario()` and archived D4 bootstrap semantics.
- Update the applicable canonical OpenSpec specs and relevant repository documentation/config example to match the approved contract; do not assert unverified TEST/PROD settings.
- Demonstrate RED/GREEN, run the authorized test/format/scope checks, obtain required review/verification, then create one focused work-unit commit and prepare the separate PR. Ask before creating a public child issue if needed for PR linkage. Never merge or deploy.

## Allowed edit surfaces

- `backend/src/utils/cookies.js`
- `backend/src/utils/cookies.test.js`
- `backend/src/controllers/auth.controller.js`
- `backend/src/controllers/auth.controller.test.js`
- `backend/src/middleware/csrf.js`
- `backend/src/middleware/csrf.test.js` (only if the current test layout supports it; otherwise the directly corresponding existing test)
- `backend/src/middleware/auth.js`
- `backend/src/services/auth.service.test.js`
- `frontend/shared/api.js`
- `frontend/shared/api.test.js`
- `frontend/shared/config.example.js` (only if the obsolete CSRF cookie-name client configuration is still present)
- `e2e/smoke.spec.js` (parent-approved after CI exposed stale cookie/CSRF expectations; test-only contract sync)
- `openspec/specs/auth-csrf-double-submit/spec.md`
- `openspec/specs/auth-sesion-cookie/spec.md`
- `docs/ESTADO_PROYECTO.md`
- `odd/tasks/issue-87-test-prod-cookie-isolation.md`

Any additional implementation path must be justified by read-only discovery and approved by the parent before writing.

## Acceptance criteria

- Newly issued versioned cookies omit `Domain`; their clear operations are host-only. Session and CSRF cookies are HttpOnly.
- Legacy cookie names are version-distinct and never accepted. If received, expire the old `.cotizador.lat` cookies using a deletion header with `Domain=.cotizador.lat`; do not emit any new cookie with Domain. First legacy-bearing request is ignored and clears the old values; active sessions reauthenticate.
- Authenticated `/auth/me` returns both the user and the CSRF token corresponding to the CSRF cookie.
- The frontend caches the user and CSRF token together in memory; mutating requests read the cached token, not `document.cookie`; clearing session clears both.
- The CSRF middleware still compares the request header against the CSRF cookie and rejects missing/mismatched tokens.
- Tests and canonical specs prove the repository-controlled contract. Live TEST/PROD configuration remains explicitly unverified.
- No TEST/PROD access, secret reads, deployment, merge, or T-04 restore occurs.

## Route and review workload

- Route: delegated direct. The 4-file mapping and multi-file write triggers used one scoped worker for core implementation; CI's stale smoke assertions prompted a read-only `gentle-ai-explore` scout and a separate one-file E2E worker. Independent verification ran the isolated E2E and full fast suite after the unassessable ASSESS.
- Forecast: the final PR diff is 542 changed lines (406 additions + 136 deletions against `main`), including tests, canonical specs/docs, E2E contract sync, and this ODD task record; generated files excluded. The added E2E sync is required by CI and does not create an independently mergeable feature slice.
- Delivery strategy: user accepted one cohesive T-03 PR with `size:exception` at 520 lines (~120 over 400). CI then exposed stale E2E expectations; the required one-file test-only sync adds 21 changed lines, plus one task-record line, for a final 542 lines (~142 over 400). It remains the same auth/cookie contract with no safe functional split; disclose the final count and rationale in the PR. Do not split or merge/deploy.
- Work-unit commits: `fcab6275957aa678e9d9eb0974a8adc9982adfb7` — `fix(auth): isolate TEST and PROD session cookies`; `7db37a15742cff85ca4b7009e1ce561d952a082a` — `test(e2e): align cookie smoke with HttpOnly contract`.
- Native reviews: core high-risk committed-range candidate approved/acknowledged; lineage `review-623cf43a916e21cb`, target `sha256:939c778f8e9271b8a7088141add7252d62c994275bd1d0af745414e322704f83`. E2E-only candidate approved/closed at low risk (`non_executable_only`); lineage `review-f326818b10279453`.

## Verification record

- Strict TDD is active (`openspec/config.yaml`); backend runner: `npm test --prefix backend`; root runner: `npm test`.
- RED (initial contract): `npm test --prefix backend` failed at assertion level in `src/utils/cookies.test.js`: CSRF `httpOnly` observed `false !== true`; host-only assertion observed `.example.invalid` instead of `undefined`.
- GREEN (initial focused): `node --test backend/src/utils/cookies.test.js backend/src/middleware/csrf.test.js` — 13/13 passed.
- RED (legacy transition): regression for the versioned `_v2` CSRF cookie failed with `Token CSRF inválido o ausente` before implementation.
- GREEN (final): independent verification passed backend 464/464 and root backend 464/464 + frontend 122/122 with process-only loopback placeholders and a nonexistent dotenv path.
- `PUPPETEER_SKIP_DOWNLOAD=true npm ci` installed 467 lockfile-pinned packages; audit 0 vulnerabilities. Package manifests and locks remain unchanged.
- After the E2E correction, `DOTENV_CONFIG_PATH=<nonexistent path> npm run verify:e2e` passed (1/1) in the loopback/mocked harness; `npm run verify:fast` passed backend 464/464, frontend 122/122, 81 migrations without collisions, and Prettier for `e2e/smoke.spec.js`. `git diff --check` passed. No real secrets, `.env`, deployed services, or TEST/PROD settings were accessed.
- Initial working-tree ASSESS was unassessable while this task document was untracked. Committed-range ASSESS for core commit reported high risk; native review approved and was acknowledged for `fcab627`. E2E working-tree and committed-range ASSESS calls failed schema-incompatible/unassessable; the separate independent verifier and writer both passed isolated E2E 1/1, and native review closed the E2E-only commit at low risk (`review-f326818b10279453`). PR #449 is open; its first CI `quality` failure was the stale smoke assertion. The E2E fix is committed as `7db37a1`, passes writer and independent verification, and has a closed low-risk native review. Any post-update CI result is tracked on PR #449. No merge or deploy.

## Progress

- [x] Read-only mapping and architecture conflict identified; dedicated branch is clean and current.
- [x] User authorized the host-only cookie + `/auth/me` handoff + in-memory frontend cache contract.
- [x] Implemented host-only HttpOnly v2 cookies, `/auth/me` CSRF handoff, frontend memory cache, legacy `.cotizador.lat` expiry, specs/docs, and migration regressions.
- [x] Independent verifier confirmed the core contract and identified the legacy-domain transition gap; user authorized versioned names, legacy deletion-only Domain headers, ignored first old-cookie request, and forced reauthentication.
- [x] After migration, root tests passed (backend 464/464 + frontend 122/122); four formatting-only corrections were applied.
- [x] Final independent verifier passed backend/root suites, full changed-path Prettier, diff, manifest integrity, and the approved migration contract; live behavior remains unverified.
- [x] User accepted one T-03 PR with `size:exception` at 520 lines; the required E2E contract sync raises the projected final diff to 542 lines (~142 over 400), with the same no-safe-split rationale to disclose.
- [x] Stage the exact 15 paths, create work-unit commit `fcab627`, assess the committed range, and obtain approved/acknowledged native review.
- [x] Pushed the dedicated branch and opened PR #449 linked to approved issue #448; the read-back confirmed it is OPEN with `type:bug` and the accepted size-exception rationale. Required CI `quality` initially failed on stale E2E cookie/CSRF expectations. The one-file test-only fix is work-unit commit `7db37a1`, approved/closed at low risk and passing isolated E2E 1/1 plus `verify:fast`; post-update CI is tracked on PR #449. No merge or deploy.
