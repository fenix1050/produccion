#!/usr/bin/env bash
# Redeploy manual del frontend estático a TEST (test-web.cotizador.lat).
# No hay CD automático para frontend-test (ver CLAUDE.md, sección "Infraestructura de
# despliegue") — este script reemplaza los pasos sueltos de scp+cp+curl por un único
# comando rsync con backup automático y verificación de hash al final.
#
# Uso:
#   TEST_SSH_HOST=usuario@vps ./scripts/deploy-frontend-test.sh
#
# Variables de entorno:
#   TEST_SSH_HOST           obligatoria — usuario@host de la VPS
#   TEST_FRONTEND_ROOT      opcional — default /opt/cotizador/frontend-test
#   TEST_FRONTEND_PUBLIC_URL opcional — default https://test-web.cotizador.lat
set -euo pipefail

: "${TEST_SSH_HOST:?Definí TEST_SSH_HOST=usuario@host antes de correr este script}"
TEST_FRONTEND_ROOT="${TEST_FRONTEND_ROOT:-/opt/cotizador/frontend-test}"
TEST_FRONTEND_PUBLIC_URL="${TEST_FRONTEND_PUBLIC_URL:-https://test-web.cotizador.lat}"

REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$REPO_ROOT"

BACKUP_DIR=".bak-$(date +%Y%m%d%H%M%S)"

echo "==> Sincronizando frontend/ -> ${TEST_SSH_HOST}:${TEST_FRONTEND_ROOT}"
echo "    (excluye shared/config.js — es por-entorno, no pertenece al repo)"
rsync -avz --delete \
  --backup --backup-dir="$BACKUP_DIR" \
  --exclude 'shared/config.js' \
  frontend/ "${TEST_SSH_HOST}:${TEST_FRONTEND_ROOT}/"

echo "==> Verificando integridad contra lo servido públicamente"
# Verifica un archivo representativo del cambio más reciente; para una verificación
# exhaustiva de todo el árbol, comparar manualmente con checksums por archivo.
CHANGED_FILE="${1:-frontend/propuestas/propuestas.js}"
RELATIVE_PATH="${CHANGED_FILE#frontend/}"
LOCAL_HASH=$(sha256sum "$CHANGED_FILE" | awk '{print $1}')
PUBLIC_HASH=$(curl -fsS --max-time 10 "${TEST_FRONTEND_PUBLIC_URL%/}/${RELATIVE_PATH}" | sha256sum | awk '{print $1}')

if [[ "$LOCAL_HASH" != "$PUBLIC_HASH" ]]; then
  echo "FAIL: el hash servido (${PUBLIC_HASH}) no coincide con el local (${LOCAL_HASH})" >&2
  echo "El backup del despliegue anterior quedó en ${TEST_SSH_HOST}:${TEST_FRONTEND_ROOT}/${BACKUP_DIR}" >&2
  exit 1
fi

echo "PASS: TEST sirve el mismo contenido que el repo local (sha256=${LOCAL_HASH})"
echo "Backup del contenido reemplazado: ${TEST_SSH_HOST}:${TEST_FRONTEND_ROOT}/${BACKUP_DIR}"
