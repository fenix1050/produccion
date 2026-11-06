#!/usr/bin/env bash
# Backend deploy to PROD (api.cotizador.lat), stage 3 of docs/RUNBOOK_DEPLOY_PROD.md.
# Run by a person ON the production VPS, one command. Claude never runs this script.
#
# Usage:
#   deploy-backend-prod.sh <40-hex SHA>                    read-only preflight / plan
#   deploy-backend-prod.sh <40-hex SHA> --approve-deploy   build, replace, health check
#   deploy-backend-prod.sh --rollback                      plan of the rollback
#   deploy-backend-prod.sh --rollback --approve-deploy     restore previous-image-tag.txt
#
# It only replaces the `backend` service (--no-deps): never the DB, Caddy, cloudflared or the
# frontend. The build comes from a separate git worktree (~/build-$SHA); the working tree of
# /opt/cotizador/app is never moved. If the new container is not healthy within ~60s the
# previous image is restored automatically.
#
# Exit codes: 0 ok | 64 usage/invalid input | 1 failure before/without replacing |
#             2 new image unhealthy, rollback healthy | 3 ROLLBACK ALSO UNHEALTHY (act now)
#
# APP_DIR / BACKEND_CONTAINER / HEALTH_ATTEMPTS / HEALTH_INTERVAL exist for tests; defaults are PROD.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/cotizador/app}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-cotizador-tajy-backend}"
HEALTH_ATTEMPTS="${HEALTH_ATTEMPTS:-20}"
HEALTH_INTERVAL="${HEALTH_INTERVAL:-3}"
BACKUP_DIR="${HOME}/deploy-backups/backend-prod"
POINTER="${BACKUP_DIR}/previous-image-tag.txt"

usage() {
  printf 'Usage: %s <40-hex SHA> [--approve-deploy] | --rollback [--approve-deploy]\n' "$0" >&2
  exit 64
}

fail() { # fail <code> <message...>
  local code=$1
  shift
  printf 'FAIL %s\n' "$*" >&2
  exit "$code"
}

# ---- argument parsing (SHA validated by an anchored regex before any use) ----
MODE=deploy
APPROVE=0
SHA=''
if (($# == 0)); then usage; fi
if [[ $1 == --rollback ]]; then
  MODE=rollback
  shift
else
  if [[ ! $1 =~ ^[0-9a-f]{40}$ ]]; then
    printf 'FAIL reason=invalid_sha (expected exactly 40 lowercase hex chars)\n' >&2
    exit 64
  fi
  SHA=$1
  shift
fi
if (($# > 1)); then usage; fi
if (($# == 1)); then
  [[ $1 == --approve-deploy ]] || usage
  APPROVE=1
fi

TARGET_IMAGE="cotizador-backend:${SHA}"
WORKTREE="${HOME}/build-${SHA}"

# ---- helpers ----
current_image() {
  docker inspect --format '{{.Config.Image}}' "$BACKEND_CONTAINER" 2>/dev/null
}

image_on_host() { # image_on_host <repo:tag>
  local listing
  listing=$(docker images --format '{{.Repository}}:{{.Tag}}')
  grep -Fxq -- "$1" <<<"$listing"
}

compose_up() { # compose_up <image>
  (cd "$APP_DIR" && sudo BACKEND_IMAGE="$1" docker compose up -d --no-deps --no-build --force-recreate backend)
}

wait_healthy() {
  local i out
  for ((i = 1; i <= HEALTH_ATTEMPTS; i++)); do
    out=$(docker exec "$BACKEND_CONTAINER" node -e "fetch('http://127.0.0.1:3000/health').then(r=>console.log('health',r.status)).catch(()=>console.log('health',0))" 2>/dev/null || true)
    if [[ $out == 'health 200' ]]; then
      return 0
    fi
    sleep "$HEALTH_INTERVAL"
  done
  return 1
}

# Restore <image> and verify health. Never returns silently: prints the outcome loudly.
restore_image() { # restore_image <image>
  local image=$1
  printf '==> ROLLBACK: restoring %s\n' "$image"
  if compose_up "$image" && wait_healthy; then
    printf 'ROLLED_BACK ok: %s is healthy again\n' "$image"
    return 0
  fi
  printf '!!! ROLLBACK_UNHEALTHY: %s did NOT become healthy. Backend may be DOWN. Check: docker logs %s\n' \
    "$image" "$BACKEND_CONTAINER" >&2
  return 1
}

read_pointer() {
  [[ -r $POINTER ]] || fail 1 "reason=pointer_missing file=${POINTER}"
  local value
  value=$(head -n 1 "$POINTER")
  if [[ ! $value =~ ^[A-Za-z0-9._/:@-]+$ ]]; then
    fail 1 "reason=pointer_invalid file=${POINTER}"
  fi
  printf '%s' "$value"
}

# ---- common read-only checks ----
[[ -d $APP_DIR ]] || fail 1 "reason=app_dir_missing path=${APP_DIR}"
CURRENT=$(current_image) || fail 1 "reason=container_missing name=${BACKEND_CONTAINER}"

# ---- rollback mode ----
if [[ $MODE == rollback ]]; then
  PREVIOUS=$(read_pointer)
  printf 'Current image : %s\nRollback to   : %s (from %s)\n' "$CURRENT" "$PREVIOUS" "$POINTER"
  if ((APPROVE == 0)); then
    printf 'PREFLIGHT only: nothing changed. Re-run with --approve-deploy to roll back.\n'
    exit 0
  fi
  if [[ $PREVIOUS == "$CURRENT" ]]; then
    fail 1 "reason=nothing_to_roll_back image=${CURRENT}"
  fi
  image_on_host "$PREVIOUS" || fail 1 "reason=previous_image_missing image=${PREVIOUS}"
  if restore_image "$PREVIOUS"; then
    exit 0
  fi
  exit 3
fi

# ---- deploy mode: preflight ----
printf 'Current image : %s\nTarget image  : %s\nWorktree      : %s\nRollback ptr  : %s\n' \
  "$CURRENT" "$TARGET_IMAGE" "$WORKTREE" "$POINTER"
if [[ $CURRENT == "$TARGET_IMAGE" ]]; then
  fail 1 "reason=already_deployed image=${TARGET_IMAGE}"
fi
if [[ -e $WORKTREE ]]; then
  fail 1 "reason=worktree_exists path=${WORKTREE} (remove it or reuse it manually)"
fi
if ((APPROVE == 0)); then
  printf 'PREFLIGHT only: nothing changed. Plan with --approve-deploy:\n'
  printf '  1. git fetch origin + git worktree add --detach %s %s (from %s)\n' "$WORKTREE" "$SHA" "$APP_DIR"
  printf '  2. docker build -f backend/Dockerfile -t %s .\n' "$TARGET_IMAGE"
  printf '  3. save %s to %s and check it still exists locally\n' "$CURRENT" "$POINTER"
  printf '  4. compose up --no-deps --no-build --force-recreate backend with %s\n' "$TARGET_IMAGE"
  printf '  5. health check up to ~%ss; automatic rollback to %s if it fails\n' "$((HEALTH_ATTEMPTS * HEALTH_INTERVAL))" "$CURRENT"
  exit 0
fi

# ---- deploy mode: approved run, stop on first failure ----
printf '==> 1/6 worktree @ %s\n' "$SHA"
git -C "$APP_DIR" fetch origin
git -C "$APP_DIR" worktree add --detach "$WORKTREE" "$SHA"
git -C "$WORKTREE" log -1 --format='%H %s'

printf '==> 2/6 docker build %s\n' "$TARGET_IMAGE"
(cd "$WORKTREE" && docker build -f backend/Dockerfile -t "$TARGET_IMAGE" .)

printf '==> 3/6 rollback pointer\n'
mkdir -p "$BACKUP_DIR"
printf '%s\n' "$CURRENT" >"$POINTER"
image_on_host "$CURRENT" || fail 1 "reason=previous_image_missing image=${CURRENT} (nothing was replaced)"

printf '==> 4/6 replacing backend only\n'
if ! compose_up "$TARGET_IMAGE"; then
  printf 'compose up failed; attempting rollback\n' >&2
  restore_image "$CURRENT" || exit 3
  fail 2 "reason=compose_failed rolled_back_to=${CURRENT}"
fi

printf '==> 5/6 health check\n'
if ! wait_healthy; then
  printf 'New image never reached health 200\n' >&2
  restore_image "$CURRENT" || exit 3
  fail 2 "reason=unhealthy rolled_back_to=${CURRENT} (worktree kept at ${WORKTREE})"
fi

printf '==> 6/6 cleanup\n'
git -C "$APP_DIR" worktree remove --force "$WORKTREE"

printf 'PASS image=%s\nRollback pointer: %s (contains %s)\n' "$TARGET_IMAGE" "$POINTER" "$CURRENT"
printf 'Rollback: %s --rollback --approve-deploy\n' "$0"
