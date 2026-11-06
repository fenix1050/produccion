# deploy-prod-scripts

## Objective

Replace the manual PROD deploy stages 3 (backend) and 4 (frontend) of `docs/RUNBOOK_DEPLOY_PROD.md` with two scripts
that Kevin runs himself on the production VPS, one command each. DB backup (stage 1) and migrations (stage 2) stay manual.

## Constraints

- Claude never runs these scripts against any server. No ssh, no real docker, no TEST/PROD access. Tests use stubs only.
- Bash, `set -euo pipefail`, no eval, all variables quoted, SHA validated by an anchored 40-hex regex before any use.
- Read-only preflight by default; changes only with `--approve-deploy`.
- Never touch the DB, Caddy, cloudflared; never overwrite `shared/config.js`; never move `/opt/cotizador/app` working tree.
- Strict TDD (runner: `node --test`, cwd `backend/`, source: project config): RED observed before each implementation.
- Authored-lines heuristic (~400 per task) is advisory only.
- Scripts/tests/ODD in English; RUNBOOK and ESTADO in Spanish. No AI attribution.

## Tasks

- [x] T1 Write this task file.
- [x] T2 RED+GREEN: `scripts/deploy-backend-prod.sh` + `backend/src/ops/deploy-backend-prod.test.js`.
- [x] T3 RED+GREEN: `scripts/deploy-frontend-prod.sh` + `backend/src/ops/deploy-frontend-prod.test.js`.
- [x] T4 Update `docs/RUNBOOK_DEPLOY_PROD.md` (scripts section at top, manual commands kept as fallback).
- [x] T5 Add numbered entry to `docs/ESTADO_PROYECTO.md`.
- [x] T6 Run new + existing ops tests and `bash -n` on both scripts.

## Safer-behavior decisions

- "Already deployed" check runs before the worktree/build (nothing is created if it would be refused).
- `--rollback` also requires `--approve-deploy` to act; alone it only prints the plan.
- Env overrides (APP_DIR, FRONTEND_DIR, BACKEND_CONTAINER) exist only for tests; defaults are the PROD paths.

## Progress / evidence

See T6 results in the final report. Scripts were tested only with stubs, never against a real server.

## Next step

Kevin reviews, then runs `deploy-backend-prod.sh <SHA>` (preflight) on the VPS before using `--approve-deploy`.
