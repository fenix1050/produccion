#!/usr/bin/env bash
# Backup diario de la DB de PROD (Supabase self-hosted en la VPS): pg_dump vía docker,
# verificación del dump, rotación local y copia cifrada a Google Drive con rclone (crypt).
#
# Se corre EN la VPS (cron, usuario soporte). Claude nunca lo ejecuta contra PROD.
# Ver docs/RUNBOOK_BACKUP_PROD.md.
#
# Uso:
#   PROD_DB_CONTAINER=cotizador-supabase-db \
#   BACKUP_DIR=$HOME/backups/prod-db \
#   RCLONE_REMOTE=gdrive-crypt:prod-db \
#     ./scripts/backup-prod-db.sh
#
#   Agregar --skip-upload para hacer solo el backup local (sin RCLONE_REMOTE).
#
# Variables obligatorias (sin default: viven solo en la VPS):
#   PROD_DB_CONTAINER   nombre del contenedor de Postgres de PROD
#   BACKUP_DIR          carpeta local de backups
#   RCLONE_REMOTE       destino rclone (obligatorio salvo --skip-upload)
# Opcionales:
#   RETENTION_DAYS (14), REMOTE_RETENTION_DAYS (30), MIN_DUMP_BYTES (10240),
#   MIN_TOC_ENTRIES (100), DB_USER (supabase_admin), DB_NAME (postgres)
#   HEALTHCHECK_URL     URL base de ping de un check de healthchecks.io
#                       (https://hc-ping.com/<uuid>; lleva un token secreto: solo en el crontab
#                       de la VPS). Con subida: ping /start al empezar, ping de éxito al final y
#                       /fail ante cualquier salida != 0. Si falta, se avisa en el log. Con
#                       --skip-upload no se hace ningún ping. Un ping fallido no afecta al backup.
set -euo pipefail

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
fail() {
  LAST_FAIL="$*"
  printf '%s FAIL: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2
  exit 1
}

SKIP_UPLOAD=0
for arg in "$@"; do
  case $arg in
    --skip-upload) SKIP_UPLOAD=1 ;;
    *) printf 'Uso: %s [--skip-upload]\n' "$0" >&2; exit 64 ;;
  esac
done

for name in PROD_DB_CONTAINER BACKUP_DIR; do
  [[ -n ${!name:-} ]] || { printf 'FAIL: falta la variable obligatoria %s\n' "$name" >&2; exit 64; }
done
if ((SKIP_UPLOAD == 0)) && [[ -z ${RCLONE_REMOTE:-} ]]; then
  printf 'FAIL: falta RCLONE_REMOTE; definirla o pasar --skip-upload explícitamente\n' >&2
  exit 64
fi

RETENTION_DAYS=${RETENTION_DAYS:-14}
REMOTE_RETENTION_DAYS=${REMOTE_RETENTION_DAYS:-30}
MIN_DUMP_BYTES=${MIN_DUMP_BYTES:-10240}
MIN_TOC_ENTRIES=${MIN_TOC_ENTRIES:-100}
DB_USER=${DB_USER:-supabase_admin}
DB_NAME=${DB_NAME:-postgres}

umask 077
mkdir -p "$BACKUP_DIR"

# Healthcheck (dead-man's switch). Un ping que falla NUNCA cambia el resultado del backup,
# y la URL (lleva un token secreto) jamás se escribe en logs ni mensajes.
HC_ACTIVE=0
LAST_FAIL=""
PARTIAL=""

hc_ping() {
  local suffix=$1 body=${2:-}
  ((HC_ACTIVE == 1)) || return 0
  if ! command -v curl >/dev/null 2>&1; then
    log "WARN: no se pudo enviar el ping de healthcheck"
    return 0
  fi
  local rc=0
  if [[ -n $body ]]; then
    curl -fsS -m 10 --retry 3 --data-raw "$body" "$HEALTHCHECK_URL$suffix" >/dev/null 2>&1 || rc=$?
  else
    curl -fsS -m 10 --retry 3 "$HEALTHCHECK_URL$suffix" >/dev/null 2>&1 || rc=$?
  fi
  if ((rc != 0)); then
    log "WARN: no se pudo enviar el ping de healthcheck"
  fi
  return 0
}

# Único trap de salida: borra el .partial y, ante cualquier salida != 0, avisa /fail.
on_exit() {
  local rc=$?
  trap - EXIT
  if [[ -n $PARTIAL ]]; then rm -f "$PARTIAL"; fi
  if ((rc != 0)); then
    hc_ping /fail "${LAST_FAIL:-exit code $rc}"
  fi
  exit "$rc"
}
trap on_exit EXIT

if ((SKIP_UPLOAD == 1)); then
  log "healthcheck omitido por --skip-upload"
elif [[ -z ${HEALTHCHECK_URL:-} ]]; then
  log "WARN: sin HEALTHCHECK_URL, no hay alerta ante fallo"
else
  HC_ACTIVE=1
  hc_ping /start
fi

# Lock: una sola corrida a la vez (el fd 9 se libera al terminar el proceso).
exec 9>"$BACKUP_DIR/.backup.lock"
flock -n 9 || fail "otra ejecución del backup está en curso (lock ocupado)"

NAME="prod-$(date +%Y%m%d-%H%M%S).dump"
FINAL="$BACKUP_DIR/$NAME"
PARTIAL="$FINAL.partial"

log "pg_dump de $DB_NAME desde el contenedor $PROD_DB_CONTAINER"
docker exec "$PROD_DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -F c >"$PARTIAL" ||
  fail "pg_dump terminó con error"

SIZE=$(wc -c <"$PARTIAL" | tr -d ' ')
((SIZE >= MIN_DUMP_BYTES)) || fail "dump demasiado chico ($SIZE bytes, mínimo $MIN_DUMP_BYTES)"
log "dump generado: $SIZE bytes"

TOC=$(docker exec -i "$PROD_DB_CONTAINER" pg_restore --list <"$PARTIAL" | awk '!/^;/' | wc -l | tr -d ' ') ||
  fail "pg_restore --list falló: dump inválido"
((TOC >= MIN_TOC_ENTRIES)) || fail "TOC con pocas entradas ($TOC, mínimo $MIN_TOC_ENTRIES)"
log "verificación ok: $TOC entradas en el TOC"

mv "$PARTIAL" "$FINAL"
(cd "$BACKUP_DIR" && sha256sum "$NAME" >"$NAME.sha256")
log "backup final: $FINAL"

log "rotación local: borrando prod-*.dump* con más de $RETENTION_DAYS días"
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'prod-*.dump' -o -name 'prod-*.dump.sha256' \) \
  -mtime "+$RETENTION_DAYS" -delete

if ((SKIP_UPLOAD == 1)); then
  log "--skip-upload: no se sube a la copia externa"
  exit 0
fi

log "subiendo a $RCLONE_REMOTE"
rclone copy "$FINAL" "$RCLONE_REMOTE" || fail "rclone copy del dump falló"
rclone copy "$FINAL.sha256" "$RCLONE_REMOTE" || fail "rclone copy del sha256 falló"
log "rotación remota: borrando con más de ${REMOTE_RETENTION_DAYS} días"
rclone delete --min-age "${REMOTE_RETENTION_DAYS}d" "$RCLONE_REMOTE" || fail "rclone delete falló"
log "backup completo"
hc_ping ""
