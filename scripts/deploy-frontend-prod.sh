#!/usr/bin/env bash
# Frontend deploy to PROD (cotizador.lat), stage 4 of docs/RUNBOOK_DEPLOY_PROD.md.
# Run by a person ON the production VPS, one command. Claude never runs this script.
#
# Usage:
#   deploy-frontend-prod.sh <40-hex SHA>                   read-only preflight / plan
#   deploy-frontend-prod.sh <40-hex SHA> --approve-deploy  back up, copy, verify
#
# shared/config.js is per-environment and is NEVER copied or overwritten: it is excluded from
# the copy and its mtime + sha256 are verified unchanged afterwards. Files that exist only in
# PROD ("Only in <frontend-prod>") are reported as a warning and never deleted.
# The source is a git worktree at ~/build-$SHA: reused if it already exists at that exact
# commit (e.g. left by deploy-backend-prod.sh after a failure), otherwise created and removed
# on success. The working tree of /opt/cotizador/app is never moved.
#
# Exit codes: 0 ok | 64 usage/invalid input | 1 failure
#
# APP_DIR / FRONTEND_DIR exist for tests; defaults are PROD.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/cotizador/app}"
FRONTEND_DIR="${FRONTEND_DIR:-/opt/cotizador/frontend-prod}"
CONFIG_REL="shared/config.js"

usage() {
  printf 'Usage: %s <40-hex SHA> [--approve-deploy]\n' "$0" >&2
  exit 64
}

fail() {
  printf 'FAIL %s\n' "$*" >&2
  exit 1
}

# ---- argument parsing (SHA validated by an anchored regex before any use) ----
if (($# == 0)) || (($# > 2)); then usage; fi
if [[ ! $1 =~ ^[0-9a-f]{40}$ ]]; then
  printf 'FAIL reason=invalid_sha (expected exactly 40 lowercase hex chars)\n' >&2
  exit 64
fi
SHA=$1
APPROVE=0
if (($# == 2)); then
  [[ $2 == --approve-deploy ]] || usage
  APPROVE=1
fi

WORKTREE="${HOME}/build-${SHA}"
CONFIG_FILE="${FRONTEND_DIR}/${CONFIG_REL}"

# ---- read-only checks (also the whole preflight) ----
[[ -d $FRONTEND_DIR ]] || fail "reason=frontend_dir_missing path=${FRONTEND_DIR}"
[[ -f $CONFIG_FILE ]] || fail "reason=config_js_missing path=${CONFIG_FILE} (nothing was changed)"
[[ -d $APP_DIR ]] || fail "reason=app_dir_missing path=${APP_DIR}"

if [[ -e $WORKTREE ]]; then
  WT_STATE='exists (will be reused if it is at the same commit, and kept)'
else
  WT_STATE='absent (will be created and removed on success)'
fi
printf 'Frontend dir : %s\nconfig.js    : %s (kept untouched)\nWorktree     : %s [%s]\n' \
  "$FRONTEND_DIR" "$CONFIG_FILE" "$WORKTREE" "$WT_STATE"

if ((APPROVE == 0)); then
  printf 'PREFLIGHT only: nothing changed. Plan with --approve-deploy:\n'
  printf '  1. ensure worktree %s at %s\n' "$WORKTREE" "$SHA"
  printf '  2. back up %s to ~/deploy-backups/frontend-prod-<timestamp> (cp -a)\n' "$FRONTEND_DIR"
  printf '  3. tar copy excluding %s, then verify its mtime + sha256 are unchanged\n' "$CONFIG_REL"
  printf '  4. diff -rq against the worktree: differences fail, extra files in PROD only warn\n'
  exit 0
fi

# ---- approved run ----
CREATED=0
printf '==> 1/5 worktree @ %s\n' "$SHA"
if [[ -e $WORKTREE ]]; then
  head_sha=$(git -C "$WORKTREE" rev-parse HEAD)
  [[ $head_sha == "$SHA" ]] || fail "reason=worktree_sha_mismatch path=${WORKTREE} head=${head_sha}"
else
  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" worktree add --detach "$WORKTREE" "$SHA"
  CREATED=1
fi
SRC="${WORKTREE}/frontend"
[[ -d $SRC ]] || fail "reason=worktree_frontend_missing path=${SRC}"

printf '==> 2/5 backup\n'
BEFORE_MTIME=$(stat -c %y "$CONFIG_FILE")
BEFORE_SUM=$(sha256sum "$CONFIG_FILE" | awk '{print $1}')
BACKUP="${HOME}/deploy-backups/frontend-prod-$(date +%Y%m%d-%H%M%S)"
mkdir -p "${HOME}/deploy-backups"
cp -a "$FRONTEND_DIR" "$BACKUP"
[[ -f "${BACKUP}/${CONFIG_REL}" ]] || fail "reason=backup_incomplete path=${BACKUP} (nothing was copied)"
printf '    backup: %s\n' "$BACKUP"

printf '==> 3/5 copy (excluding %s)\n' "$CONFIG_REL"
tar_rc=0
tar --exclude="$CONFIG_REL" -cf - -C "$SRC" . |
  tar --no-same-permissions -m -xf - -C "$FRONTEND_DIR" || tar_rc=$?
printf '    tar_exit=%s (the diff below is what decides)\n' "$tar_rc"

printf '==> 4/5 config.js unchanged?\n'
AFTER_MTIME=$(stat -c %y "$CONFIG_FILE" 2>/dev/null || echo missing)
AFTER_SUM=$(sha256sum "$CONFIG_FILE" 2>/dev/null | awk '{print $1}' || true)
if [[ $AFTER_MTIME != "$BEFORE_MTIME" || $AFTER_SUM != "$BEFORE_SUM" ]]; then
  printf '!!! FAIL reason=config_js_changed path=%s\n' "$CONFIG_FILE" >&2
  printf '!!! Restore it from the backup: %s/%s\n' "$BACKUP" "$CONFIG_REL" >&2
  exit 1
fi
printf '    ok (mtime and sha256 identical)\n'

printf '==> 5/5 diff against the worktree\n'
diff_rc=0
diff_out=$(diff -rq "$SRC" "$FRONTEND_DIR" -x config.js 2>&1) || diff_rc=$?
if ((diff_rc > 1)); then
  fail "reason=diff_error rc=${diff_rc} backup=${BACKUP}"
fi
bad=0
warned=0
while IFS= read -r line; do
  [[ -n $line ]] || continue
  if [[ $line == "Only in ${FRONTEND_DIR}"* ]]; then
    printf 'WARNING (kept, not deleted): %s\n' "$line"
    warned=$((warned + 1))
  else
    printf 'DIFF: %s\n' "$line" >&2
    bad=$((bad + 1))
  fi
done <<<"$diff_out"
if ((bad > 0)); then
  fail "reason=diff_mismatch differences=${bad} backup=${BACKUP} (worktree kept at ${WORKTREE})"
fi

if ((CREATED == 1)); then
  git -C "$APP_DIR" worktree remove --force "$WORKTREE"
fi
printf 'PASS frontend identical to %s (warnings: %s)\nBackup: %s\n' "$SHA" "$warned" "$BACKUP"
printf 'Rollback: restore the backup over %s without touching %s\n' "$FRONTEND_DIR" "$CONFIG_REL"
