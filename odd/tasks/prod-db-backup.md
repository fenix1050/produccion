# prod-db-backup — Backup automático de la DB de PROD

## Objetivo

Que la base de producción (Supabase self-hosted en la VPS, contenedor `cotizador-supabase-db`) tenga backups diarios automáticos, verificados, con rotación local y copia cifrada fuera de la VPS (Google Drive vía `rclone crypt`).

## Problema

- `.github/workflows/supabase-backup.yml` falla desde 2026-09-20: el secreto `SUPABASE_DB_URL` apunta a un proyecto Supabase cloud que ya no existe (`ENOTFOUND tenant/user ... not found`, run 36308187184).
- Último artifact válido: 2026-09-13 (base cloud vieja), vence ~2026-10-13.
- La VPS nueva no tiene ningún backup automático de PROD (confirmado por Kevin, 2026-09-30).
- Relacionado: Issue #87 T-04 (verificación de restauración) — depende de que exista un backup real y actual.

## Alcance autorizado

- Escribir scripts, tests y runbook en el repo, en la rama `feat/prod-db-backup`, y abrir un PR (nunca push directo a `main`).
- Claude NO accede a PROD. Kevin ejecuta manualmente en la VPS todo lo que toque producción.
- Fuera de alcance: prueba de restauración (Issue #87 T-04), tocar TEST.
- Alertas externas: fuera de alcance en el PR original; entran desde 2026-10-01 con la rama `feat/backup-healthcheck` (T-07 a T-11), autorizado por Kevin.

## Restricciones

- El dump contiene datos reales de asegurados: permisos 600, sin logs con datos, copia externa siempre cifrada.
- Variables específicas de la VPS obligatorias, sin defaults ocultos (convención de `scripts/`).
- Convenciones de `scripts/*.sh`: bash, `set -euo pipefail`, comentarios en español.
- TDD: habilitado — fuente: instrucciones globales del usuario (`Strict TDD Mode: enabled`); runner: `npm test --workspace=backend` (`node --test`). Tests del script en `backend/src/ops/`.

## Checklist

- [x] T-00 Dump manual inicial de PROD por Kevin (2026-09-30 10:21, `prod-20260930-102141.dump`, 294 KB, 598 TOC entries, 41 tablas con datos; 257 cotizaciones en vivo)
- [x] T-01 RED: tests del script con `docker`/`rclone` falsos en PATH (dump ok, dump vacío/corto falla, sin variables falla, rotación, lock, upload)
- [x] T-02 GREEN: `scripts/backup-prod-db.sh` (dump a `.partial` → verificación → rename, sha256, rotación local, subida `rclone` cifrada, rotación remota, flock)
- [x] T-03 Runbook `docs/RUNBOOK_BACKUP_PROD.md`: instalación en la VPS, configuración de `rclone crypt` + Drive, cron, cómo restaurar, guardar la clave de cifrado fuera de la VPS
- [x] T-04 Kevin instala y corre el script en la VPS (manual) y confirma la subida a Drive (2026-09-30: corrida local `--skip-upload` ok; corrida con subida ok, dump de 300801 bytes idéntico en `gdrive-crypt:`; cron diario 03:30 pendiente de confirmar)
- [x] T-04b Confirmar la primera corrida automática del cron (2026-10-01 03:30 America/Asuncion): confirmado por Kevin — log con `backup completo` (03:30:01 a 03:31:50, 300801 bytes, 591 TOC), `prod-20261001-033001.dump` + `.sha256` local, y dump + sha256 del mismo tamaño en `gdrive-crypt:`
- [x] T-05 Desactivar/reemplazar `supabase-backup.yml` (PR #453: sin cron, `if: false`)
- [x] T-06 Registrar en `docs/ESTADO_PROYECTO.md` (sección 104) y abrir PR (#453, #455 mergeados 2026-09-30)

### Alertas ante fallo (healthcheck externo, Kevin eligió healthchecks.io 2026-10-01)

- [x] T-07 RED: tests de ping con `curl` falso en PATH (`/start`, éxito, `/fail` ante error, sin `HEALTHCHECK_URL` advierte, falla del ping no rompe el backup, `--skip-upload` no hace ping)
- [x] T-08 GREEN: `scripts/backup-prod-db.sh` con `HEALTHCHECK_URL` opcional (advierte en el log si falta; nunca silencioso)
- [x] T-09 Runbook: configurar el check en healthchecks.io (periodo 1 día, gracia, mail) e instalar la URL en el crontab de la VPS; actualizar límites conocidos
- [x] T-10 Actualizar `docs/ESTADO_PROYECTO.md` sección 104 y `CLAUDE.md` (ya no "sin alertas"); abrir PR
- [ ] T-11 Kevin crea el check, edita el crontab con la URL y confirma la primera notificación de éxito y la de falla simulada

## Criterios de aceptación

- El script falla (exit ≠ 0) ante dump vacío, truncado o sin TOC válido, y no deja archivos parciales con nombre final.
- Corrida repetida no pisa ni acumula sin límite: rotación local y remota por antigüedad.
- Dos ejecuciones simultáneas no se pisan (lock).
- Sin `RCLONE_REMOTE` el script exige `--skip-upload` explícito; nunca omite la copia externa en silencio.

## Progreso

- 2026-09-30: rama creada desde `origin/main` (4c5c159), upstream desconectado. Tarea registrada.
- 2026-09-30: T-01..T-03 hechos. RED: 11 tests, 4 pass (negativos triviales) / 6 fail / 1 skip sin script. GREEN: 10 pass / 0 fail / 1 skip (lock, sin flock en Windows). Suite backend completa 475 tests, 474 pass, 0 fail, 1 skip. prettier y `bash -n` ok. Lock no verificado en Windows: probar en Linux/VPS.

- 2026-09-30: en la VPS se instaló `rclone` 1.60.1 (apt), se configuraron `gdrive` (cuenta Google dedicada) y `gdrive-crypt` (crypt sobre `gdrive:prod-db`; claves guardadas por Kevin fuera de la VPS). Se detectó y corrigió el reloj de la VPS (NTP inactivo, ~9m46s de desfase; `set-ntp true`, ahora sincronizado). Flock verificado implícitamente (el script corrió en la VPS).

- 2026-10-01: cron confirmado (T-04b). PRs #453 y #455 mergeados. Rama `feat/backup-healthcheck` creada desde `origin/main` (a87c8de). Mirror Engram sigue fallando (varias sesiones activas del proyecto).

- 2026-10-01: T-07..T-10 hechos (sin commit aún). RED: 18 tests, 11 pass / 6 fail / 1 skip. GREEN: 17 pass / 0 fail / 1 skip (lock, sin flock en Windows). Pings con `curl` falso; la URL nunca aparece en stdout/stderr.

## Próximo paso

T-07/T-08 (writer delegado), luego T-09/T-10 y que Kevin complete T-11. Pendiente aparte: prueba de restauración (Issue #87 T-04, opción A elegida, falta que Codex entregue el plan).
