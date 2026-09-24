#!/usr/bin/env bash
# Redeploy de backend-test (test-api.cotizador.lat) en un solo comando: arma el contexto
# de build de backend/, lo manda por ssh a la VPS, corre ahí el preflight de solo lectura,
# construye la imagen candidata y recrea SOLO el servicio de backend-test.
#
# Generaliza el patrón usado a mano en sesiones anteriores (ver
# backend/tmp/*-test-stage/remote/{preflight,deploy}-test-backend.sh) — esos sets eran
# ad hoc por cambio puntual (SHA256 y comentarios hardcodeados). Este script no fija ningún
# hash de antemano: calcula el contexto y la imagen candidata en cada corrida.
#
# Nunca toca el compose base ni otro servicio (usa un override de imagen temporal, igual que
# las versiones ad hoc), y por diseño no puede apuntar a producción: el guard
# require_test_target exige que PF3_TEST_COMPOSE_PROJECT y PF3_TEST_BACKEND_SERVICE
# contengan "test".
#
# Uso:
#   TEST_SSH_HOST=usuario@vps \
#   PF3_TEST_COMPOSE_FILE=/opt/cotizador/backend-test/docker-compose.yml \
#   PF3_TEST_COMPOSE_PROJECT=cotizador-backend-test \
#   PF3_TEST_BACKEND_SERVICE=backend-test \
#   PF3_TEST_HEALTH_URL=https://test-api.cotizador.lat/health \
#     ./scripts/deploy-backend-test.sh --approve-deploy
#
# Usar --preflight-only en vez de --approve-deploy para solo validar conectividad y el
# estado actual del contenedor (no construye ni reemplaza nada).
#
# Variables de entorno (todas obligatorias — no tienen default porque viven solo en la VPS,
# nunca en el repo; pedirlas a Kevin si no se conocen, no adivinarlas):
#   TEST_SSH_HOST             usuario@host de la VPS
#   PF3_TEST_COMPOSE_FILE     ruta remota del docker-compose.yml de backend-test
#                             (confirmado 2026-09-22: /opt/cotizador/backend-test/docker-compose.yml
#                             — un solo archivo, no hay override de runtime separado)
#   PF3_TEST_COMPOSE_PROJECT  nombre del proyecto compose de TEST (debe contener "test")
#   PF3_TEST_BACKEND_SERVICE  nombre del servicio backend de TEST (debe contener "test")
#   PF3_TEST_HEALTH_URL       URL pública de health check de TEST
set -euo pipefail

if (($# != 1)) || { [[ $1 != --approve-deploy ]] && [[ $1 != --preflight-only ]]; }; then
  printf 'Uso: %s --approve-deploy | --preflight-only\n' "$0" >&2
  printf '  --preflight-only  solo valida conectividad y estado actual, no construye ni reemplaza nada\n' >&2
  exit 64
fi
MODE=$1

require_local_env() {
  local name=$1
  if [[ -z ${!name:-} ]]; then
    printf 'FAIL status=deploy reason=missing_required_value name=%s\n' "$name" >&2
    exit 64
  fi
}
for name in TEST_SSH_HOST PF3_TEST_COMPOSE_FILE \
  PF3_TEST_COMPOSE_PROJECT PF3_TEST_BACKEND_SERVICE PF3_TEST_HEALTH_URL; do
  require_local_env "$name"
done
if [[ ! $PF3_TEST_COMPOSE_PROJECT =~ [Tt][Ee][Ss][Tt] ]] || [[ ! $PF3_TEST_BACKEND_SERVICE =~ [Tt][Ee][Ss][Tt] ]]; then
  printf 'FAIL status=deploy reason=non_test_target\n' >&2
  exit 64
fi

REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$REPO_ROOT"

# DOCKER_CMD: indirection para poder correr este mismo script con un usuario remoto sin
# grupo docker (ej. una clave de deploy acotada solo a TEST) que necesita `sudo -n
# /ruta/al/wrapper` en vez de `docker` a secas. Default = comportamiento de siempre para
# Kevin/soporte (que sí está en el grupo docker) — no cambia nada si no se setea la
# variable. Va en base64 al pasarlo por ssh: `ssh host bash -s -- arg1 arg2 ...` NO
# preserva las comillas entre argumentos (ssh los concatena con espacios y el shell
# remoto los vuelve a tokenizar) — un DOCKER_CMD con espacios ("sudo -n /ruta...") le
# llegaría partido en varias palabras sueltas al script remoto.
DOCKER_CMD="${DOCKER_CMD:-docker}"
DOCKER_CMD_B64=$(printf '%s' "$DOCKER_CMD" | base64 | tr -d '\n')

GIT_SHA=$(git rev-parse --short=12 HEAD)
DIRTY_PATHS=(backend package.json package-lock.json frontend/login/assets/logo-rojo-con-negro.svg \
  frontend/shared/assets/propuesta-header-bg.png frontend/shared/assets/footer-slogan.png)
if [[ -n $(git status --porcelain -- "${DIRTY_PATHS[@]}") ]]; then
  echo "AVISO: hay cambios sin commitear en archivos que entran al build (backend/, package.json/package-lock.json o los assets de frontend/ que copia el Dockerfile) — git archive solo empaqueta lo committeado, así que NO van a estar en la imagen que se despliega." >&2
fi

TIMESTAMP=$(date +%Y%m%d%H%M%S)
REMOTE_HOME=$(ssh "$TEST_SSH_HOST" 'printf "%s" "$HOME"')
STAGE_DIR_NAME="backend-test-deploy-${TIMESTAMP}-${GIT_SHA}"
REMOTE_STAGE_DIR="${REMOTE_HOME}/deploy-backups/backend-test/${STAGE_DIR_NAME}"
REMOTE_MANIFEST_DIR="${REMOTE_HOME}/deploy-backups/backend-test"
CANDIDATE_IMAGE="cotizador-backend-test:${GIT_SHA}-${TIMESTAMP}"
ssh "$TEST_SSH_HOST" "mkdir -p -- '${REMOTE_MANIFEST_DIR}'"

echo "==> Preflight de solo lectura en la VPS (captura la imagen previa para rollback)"
# shellcheck disable=SC2087
ssh "$TEST_SSH_HOST" bash -s -- "$PF3_TEST_COMPOSE_FILE" "$PF3_TEST_COMPOSE_PROJECT" \
  "$PF3_TEST_BACKEND_SERVICE" "$PF3_TEST_HEALTH_URL" "$REMOTE_MANIFEST_DIR" "$DOCKER_CMD_B64" <<'REMOTE_PREFLIGHT'
set -euo pipefail
compose_file=$1 compose_project=$2 backend_service=$3 health_url=$4 manifest_dir=$5
read -ra docker <<<"$(printf '%s' "$6" | base64 -d)"

container_id=$("${docker[@]}" ps \
  --filter "label=com.docker.compose.project=${compose_project}" \
  --filter "label=com.docker.compose.service=${backend_service}" \
  --format '{{.ID}}' | head -n 1)
[[ -n $container_id ]]

env_dump=$("${docker[@]}" inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container_id")
grep -Fx 'NODE_ENV=test' <<<"$env_dump" >/dev/null || {
  printf 'FAIL status=preflight reason=node_env_not_test\n' >&2
  exit 65
}

previous_image=$("${docker[@]}" inspect --format '{{.Config.Image}}' "$container_id")
health=$("${docker[@]}" inspect --format '{{ if .State.Health }}{{ .State.Health.Status }}{{ else }}missing{{ end }}' "$container_id")
curl --fail --silent --show-error --max-time 10 "$health_url" >/dev/null

printf '%s\n' "$previous_image" >"${manifest_dir}/previous-image-tag.txt"
printf 'PASS status=preflight previous_image=%s health=%s node_env=test\n' "$previous_image" "$health"
REMOTE_PREFLIGHT

if [[ $MODE == --preflight-only ]]; then
  echo "==> Modo --preflight-only: no se construye ni se reemplaza nada. Listo."
  exit 0
fi

echo "==> Armando contexto de build @ ${GIT_SHA}"
CONTEXT_ARCHIVE=$(mktemp -t backend-context-XXXXXX.tar.gz)
trap 'rm -f -- "$CONTEXT_ARCHIVE"' EXIT
# backend/Dockerfile usa el repo completo como build context: el lockfile vive en la raíz
# (npm workspaces) y copia 3 assets puntuales de frontend/ (ver .dockerignore, que ya
# whitelistea exactamente estos mismos paths). Empaquetar solo "backend" rompe el build
# ("COPY failed: ... package.json: file does not exist") porque esos archivos no existen
# dentro del contexto.
git archive --format=tar.gz --output="$CONTEXT_ARCHIVE" HEAD -- \
  package.json package-lock.json backend \
  frontend/login/assets/logo-rojo-con-negro.svg \
  frontend/shared/assets/propuesta-header-bg.png \
  frontend/shared/assets/footer-slogan.png
CONTEXT_SHA256=$(sha256sum "$CONTEXT_ARCHIVE" | awk '{print $1}')
echo "    contexto: ${CONTEXT_ARCHIVE} (sha256=${CONTEXT_SHA256})"

echo "==> Copiando contexto a ${TEST_SSH_HOST}:${REMOTE_STAGE_DIR}"
ssh "$TEST_SSH_HOST" "mkdir -p -- '${REMOTE_STAGE_DIR}'"
scp -q "$CONTEXT_ARCHIVE" "${TEST_SSH_HOST}:${REMOTE_STAGE_DIR}/docker-context.tar.gz"

echo "==> Build + recreate de ${PF3_TEST_BACKEND_SERVICE} en la VPS (imagen ${CANDIDATE_IMAGE})"
# shellcheck disable=SC2087
ssh "$TEST_SSH_HOST" bash -s -- "$PF3_TEST_COMPOSE_FILE" \
  "$PF3_TEST_COMPOSE_PROJECT" "$PF3_TEST_BACKEND_SERVICE" "$PF3_TEST_HEALTH_URL" \
  "$REMOTE_STAGE_DIR" "$CANDIDATE_IMAGE" "$DOCKER_CMD_B64" <<'REMOTE_DEPLOY'
set -euo pipefail
compose_file=$1 compose_project=$2 backend_service=$3
health_url=$4 stage_dir=$5 candidate_image=$6
read -ra docker <<<"$(printf '%s' "$7" | base64 -d)"

if "${docker[@]}" image inspect "$candidate_image" >/dev/null 2>&1; then
  printf 'FAIL status=deploy reason=candidate_already_exists image=%s\n' "$candidate_image" >&2
  exit 73
fi

context_dir=$(mktemp -d)
trap 'rm -rf -- "$context_dir"' EXIT
tar -xzf "${stage_dir}/docker-context.tar.gz" -C "$context_dir"
[[ -r "${context_dir}/backend/Dockerfile" ]]

"${docker[@]}" build --file "${context_dir}/backend/Dockerfile" --tag "$candidate_image" "$context_dir"

override="${context_dir}/compose-candidate.override.yml"
printf 'services:\n  %s:\n    image: %s\n' "$backend_service" "$candidate_image" >"$override"

compose=("${docker[@]}" compose --project-name "$compose_project" --file "$compose_file")
export BACKEND_IMAGE="$candidate_image"
"${compose[@]}" --file "$override" up --detach --no-deps --no-build --force-recreate "$backend_service"

container_id=$("${compose[@]}" --file "$override" ps -q "$backend_service")
[[ -n $container_id ]]
[[ $("${docker[@]}" inspect --format '{{.Config.Image}}' "$container_id") == "$candidate_image" ]]
[[ $("${docker[@]}" inspect --format '{{ if .State.Health }}{{ .State.Health.Status }}{{ else }}missing{{ end }}' "$container_id") == healthy ]]

env_dump=$("${docker[@]}" inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container_id")
grep -Fx 'NODE_ENV=test' <<<"$env_dump" >/dev/null
curl --fail --silent --show-error --max-time 10 "$health_url" >/dev/null

printf 'PASS status=deploy image=%s\n' "$candidate_image"
REMOTE_DEPLOY

echo "==> Listo. Imagen previa (para rollback) queda en ${TEST_SSH_HOST}:${REMOTE_MANIFEST_DIR}/previous-image-tag.txt"
echo "    Si algo falla en vivo: ./scripts/rollback-backend-test.sh --approve-test-rollback"
