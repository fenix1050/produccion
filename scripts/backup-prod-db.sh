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
set -euo pipefail

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
fail() {
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

# Lock: una sola corrida a la vez (el fd 9 se libera al terminar el proceso).
exec 9>"$BACKUP_DIR/.backup.lock"
flock -n 9 || fail "otra ejecución del backup está en curso (lock ocupado)"

NAME="prod-$(date +%Y%m%d-%H%M%S).dump"
FINAL="$BACKUP_DIR/$NAME"
PARTIAL="$FINAL.partial"
trap 'rm -f "$PARTIAL"' EXIT

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
