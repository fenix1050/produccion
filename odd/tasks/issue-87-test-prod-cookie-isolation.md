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

Implement one cohesive, reviewable T-03 change on this branch and close it with one work-unit commit. In Strict TDD order, add backend/frontend regressions first and observe RED; then implement:

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

- Route: delegated direct. The 4-file mapping and multi-file write triggers used one scoped `gentle-ai-worker`; an independent `gentle-ai-verify` ran after the initial unassessable ASSESS and again after the authorized legacy migration.
- Forecast: approximately 530 authored changed lines including tests, canonical specs/docs, and this 90-line ODD task record; generated files excluded. This cohesive auth/cookie contract has no identified safe independently mergeable slice.
- Delivery strategy: user explicitly accepted `size:exception` for one cohesive T-03 PR, approximately 530 authored changed lines (~130 over the 400-line threshold). Rationale for the PR description: this is one authentication contract with no safe functional split; a chain adds coordination without reducing review risk. Do not split or merge/deploy.
- Work-unit commit: `fcab6275957aa678e9d9eb0974a8adc9982adfb7` — `fix(auth): isolate TEST and PROD session cookies`.
- Native review: high-risk committed-range candidate approved and acknowledged; lineage `review-623cf43a916e21cb`, target `sha256:939c778f8e9271b8a7088141add7252d62c994275bd1d0af745414e322704f83`.

## Verification record

- Strict TDD is active (`openspec/config.yaml`); backend runner: `npm test --prefix backend`; root runner: `npm test`.
- RED (initial contract): `npm test --prefix backend` failed at assertion level in `src/utils/cookies.test.js`: CSRF `httpOnly` observed `false !== true`; host-only assertion observed `.example.invalid` instead of `undefined`.
- GREEN (initial focused): `node --test backend/src/utils/cookies.test.js backend/src/middleware/csrf.test.js` — 13/13 passed.
- RED (legacy transition): regression for the versioned `_v2` CSRF cookie failed with `Token CSRF inválido o ausente` before implementation.
- GREEN (final): independent verification passed backend 464/464 and root backend 464/464 + frontend 122/122 with process-only loopback placeholders and a nonexistent dotenv path.
- `PUPPETEER_SKIP_DOWNLOAD=true npm ci` installed 467 lockfile-pinned packages; audit 0 vulnerabilities. Package manifests and locks remain unchanged.
- Final `git diff --check`, manifest integrity check, and full changed-path Prettier check passed. No real secrets, `.env`, deployed services, or TEST/PROD runtime settings were accessed; those remain unverified.
- Initial working-tree ASSESS was unassessable while this authorized task document was untracked. After commit, committed-range ASSESS reported high risk; native review approved and was acknowledged for commit `fcab627`. The commit hook reran the root suite (backend 464/464 + frontend 122/122) with process-only loopback placeholders and a nonexistent dotenv path. No deploy, push, or PR yet.

## Progress

- [x] Read-only mapping and architecture conflict identified; dedicated branch is clean and current.
- [x] User authorized the host-only cookie + `/auth/me` handoff + in-memory frontend cache contract.
- [x] Implemented host-only HttpOnly v2 cookies, `/auth/me` CSRF handoff, frontend memory cache, legacy `.cotizador.lat` expiry, specs/docs, and migration regressions.
- [x] Independent verifier confirmed the core contract and identified the legacy-domain transition gap; user authorized versioned names, legacy deletion-only Domain headers, ignored first old-cookie request, and forced reauthentication.
- [x] After migration, root tests passed (backend 464/464 + frontend 122/122); four formatting-only corrections were applied.
- [x] Final independent verifier passed backend/root suites, full changed-path Prettier, diff, manifest integrity, and the approved migration contract; live behavior remains unverified.
- [x] User accepted one T-03 PR with explicit `size:exception` for the cohesive ~530-line change; include the ~130-line overage and no-safe-split rationale in the PR description.
- [x] Stage the exact 15 paths, create work-unit commit `fcab627`, assess the committed range, and obtain approved/acknowledged native review.
- [ ] Obtain any required child-issue authorization, then prepare the one T-03 PR with the accepted size-exception rationale. No merge or deploy.
