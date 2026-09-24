#!/usr/bin/env bash
# Rollback de backend-test a la imagen que tenía ANTES del último
# ./scripts/deploy-backend-test.sh — la lee de
# ~/deploy-backups/backend-test/previous-image-tag.txt en la VPS, que el preflight de ese
# deploy dejó como evidencia. Por diseño no puede apuntar nunca a producción (mismo guard
# require_test_target que deploy-backend-test.sh).
#
# Uso:
#   TEST_SSH_HOST=usuario@vps \
#   PF3_TEST_COMPOSE_FILE=/opt/cotizador/backend-test/docker-compose.yml \
#   PF3_TEST_COMPOSE_PROJECT=cotizador-backend-test \
#   PF3_TEST_BACKEND_SERVICE=backend-test \
#   PF3_TEST_HEALTH_URL=https://test-api.cotizador.lat/health \
#     ./scripts/rollback-backend-test.sh --approve-test-rollback
#
# Variables de entorno: mismas que deploy-backend-test.sh (ver ese script).
set -euo pipefail

if (($# != 1)) || [[ $1 != --approve-test-rollback ]]; then
  printf 'Uso: %s --approve-test-rollback\n' "$0" >&2
  exit 64
fi

require_local_env() {
  local name=$1
  if [[ -z ${!name:-} ]]; then
    printf 'FAIL status=rollback reason=missing_required_value name=%s\n' "$name" >&2
    exit 64
  fi
}
for name in TEST_SSH_HOST PF3_TEST_COMPOSE_FILE \
  PF3_TEST_COMPOSE_PROJECT PF3_TEST_BACKEND_SERVICE PF3_TEST_HEALTH_URL; do
  require_local_env "$name"
done
if [[ ! $PF3_TEST_COMPOSE_PROJECT =~ [Tt][Ee][Ss][Tt] ]] || [[ ! $PF3_TEST_BACKEND_SERVICE =~ [Tt][Ee][Ss][Tt] ]]; then
  printf 'FAIL status=rollback reason=non_test_target\n' >&2
  exit 64
fi

REMOTE_HOME=$(ssh "$TEST_SSH_HOST" 'printf "%s" "$HOME"')
REMOTE_MANIFEST_DIR="${REMOTE_HOME}/deploy-backups/backend-test"

# Ver mismo comentario en deploy-backend-test.sh — indirección + base64 para poder correr
# esto con un usuario remoto sin grupo docker que necesita `sudo -n /ruta/al/wrapper`.
DOCKER_CMD="${DOCKER_CMD:-docker}"
DOCKER_CMD_B64=$(printf '%s' "$DOCKER_CMD" | base64 | tr -d '\n')

echo "==> Restaurando ${PF3_TEST_BACKEND_SERVICE} en la VPS a la imagen previa al último deploy"
# shellcheck disable=SC2087
ssh "$TEST_SSH_HOST" bash -s -- "$PF3_TEST_COMPOSE_FILE" \
  "$PF3_TEST_COMPOSE_PROJECT" "$PF3_TEST_BACKEND_SERVICE" "$PF3_TEST_HEALTH_URL" \
  "$REMOTE_MANIFEST_DIR" "$DOCKER_CMD_B64" <<'REMOTE_ROLLBACK'
set -euo pipefail
compose_file=$1 compose_project=$2 backend_service=$3
health_url=$4 manifest_dir=$5
read -ra docker <<<"$(printf '%s' "$6" | base64 -d)"

previous_file="${manifest_dir}/previous-image-tag.txt"
[[ -r $previous_file ]] || {
  printf 'FAIL status=rollback reason=missing_previous_image_evidence\n' >&2
  exit 66
}
previous_image=$(tr -d '\r\n' <"$previous_file")
[[ -n $previous_image ]]
"${docker[@]}" image inspect "$previous_image" >/dev/null 2>&1 || {
  printf 'FAIL status=rollback reason=previous_image_not_present_locally image=%s\n' "$previous_image" >&2
  exit 67
}

override_dir=$(mktemp -d)
trap 'rm -rf -- "$override_dir"' EXIT
override="${override_dir}/compose-rollback.override.yml"
printf 'services:\n  %s:\n    image: %s\n' "$backend_service" "$previous_image" >"$override"

compose=("${docker[@]}" compose --project-name "$compose_project" --file "$compose_file")
export BACKEND_IMAGE="$previous_image"
"${compose[@]}" --file "$override" up --detach --no-deps --no-build --force-recreate "$backend_service"

container_id=$("${compose[@]}" --file "$override" ps -q "$backend_service")
[[ -n $container_id ]]
[[ $("${docker[@]}" inspect --format '{{.Config.Image}}' "$container_id") == "$previous_image" ]]
[[ $("${docker[@]}" inspect --format '{{ if .State.Health }}{{ .State.Health.Status }}{{ else }}missing{{ end }}' "$container_id") == healthy ]]

env_dump=$("${docker[@]}" inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container_id")
grep -Fx 'NODE_ENV=test' <<<"$env_dump" >/dev/null
curl --fail --silent --show-error --max-time 10 "$health_url" >/dev/null

printf 'PASS status=rollback restored_image=%s\n' "$previous_image"
REMOTE_ROLLBACK
