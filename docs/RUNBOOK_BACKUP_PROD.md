# Runbook — Backup automático de la DB de PROD

Script: `scripts/backup-prod-db.sh`. Se instala y se ejecuta **solo en la VPS, por Kevin**. Claude nunca corre esto contra PROD.

Reemplaza al workflow `.github/workflows/supabase-backup.yml`, que respaldaba el proyecto Supabase cloud (ya inexistente) y falla desde 2026-09-20. Ver `docs/ESTADO_PROYECTO.md` sección 104.

## Qué hace

1. `pg_dump -F c` de la base `postgres` vía `docker exec` (solo usa el CLI de docker; no requiere `psql` en el host) a un archivo `.partial`.
2. Verifica: tamaño mínimo (`MIN_DUMP_BYTES`) y `pg_restore --list` con al menos `MIN_TOC_ENTRIES` entradas.
3. Renombra a `prod-YYYYMMDD-HHMMSS.dump` (permisos 600) y escribe `.sha256`.
4. Rota localmente los `prod-*.dump*` con más de `RETENTION_DAYS` días.
5. Copia dump y sha256 a Google Drive cifrado (`rclone copy`) y rota el remoto (`rclone delete --min-age`).

Si algo falla: sale con código != 0, mensaje en stderr y borra el `.partial`. Un lock (`flock`) impide dos corridas simultáneas.

## Prerrequisitos en la VPS

- Usuario `soporte` con acceso a docker, `flock` y `sha256sum` (coreutils/util-linux).
- `rclone` instalado (`sudo apt install rclone`; queda en `/usr/bin`, que el cron encuentra sin configurar `PATH`).
- **Reloj sincronizado**: `timedatectl status` debe mostrar `System clock synchronized: yes`. El 2026-09-30 el NTP estaba inactivo y el reloj tenía ~10 minutos de desfase, lo que puede romper la renovación de tokens OAuth de Drive. Se corrige con `sudo timedatectl set-ntp true`.
- El script copiado a la VPS. El repo no está clonado ahí, así que se copia desde la PC de Kevin y hay que repetirlo cuando cambie:

```powershell
scp "C:\Visual Studio\Produccion\scripts\backup-prod-db.sh" soporte@192.168.0.90:~/backup-prod-db.sh
```

En la VPS: `chmod 700 ~/backup-prod-db.sh`.

## Variables

| Variable                | Obligatoria            | Default                   |
| ----------------------- | ---------------------- | ------------------------- |
| `PROD_DB_CONTAINER`     | sí                     | —                         |
| `BACKUP_DIR`            | sí                     | —                         |
| `RCLONE_REMOTE`         | sí (o `--skip-upload`) | —                         |
| `RETENTION_DAYS`        | no                     | 14                        |
| `REMOTE_RETENTION_DAYS` | no                     | 30                        |
| `MIN_DUMP_BYTES`        | no                     | 10240                     |
| `MIN_TOC_ENTRIES`       | no                     | 100                       |
| `DB_USER` / `DB_NAME`   | no                     | supabase_admin / postgres |

El contenedor de PROD es `cotizador-supabase-db` (confirmado con `docker ps --format '{{.Names}}'` el 2026-09-30; no confundir con `cotizador-test-db`, que es TEST).

## Configurar rclone (Drive + crypt), una sola vez

Usar una **cuenta de Google dedicada** a estos backups, con verificación en dos pasos y un correo de recuperación que no dependa de la VPS. El token de `rclone` queda en la VPS (`~/.config/rclone/rclone.conf`) y da acceso a todo el Drive de esa cuenta; por eso no se usa una cuenta personal ni la de trabajo.

La VPS no tiene navegador accesible por SSH, así que la autorización se hace con un túnel desde la PC:

1. En la PC: `ssh -L 53682:127.0.0.1:53682 soporte@192.168.0.90` y dejar la sesión abierta.
2. En esa sesión, `rclone config`:
   - `n` → nombre `gdrive`, tipo `drive`, `client_id` y `client_secret` vacíos, scope `1`, `service_account_file` vacío, advanced config `n`, **auto config `y`**.
   - `rclone` imprime una URL `http://127.0.0.1:53682/auth?state=...`: abrirla en el navegador de la PC, iniciar sesión con la cuenta dedicada y aceptar. Team drive `n`, confirmar.
   - `n` otra vez → nombre `gdrive-crypt`, tipo `crypt`, remote `gdrive:prod-db`, nombres de archivo `1` (standard), nombres de carpeta `1` (true), password y salt generados (`g`, 1024 bits).
3. Probar el circuito con un archivo de mentira, un comando por vez:

```bash
echo "prueba $(date)" > /tmp/prueba-backup.txt
rclone copy /tmp/prueba-backup.txt gdrive-crypt:
rclone ls gdrive-crypt:
rclone ls gdrive:prod-db
rclone deletefile gdrive-crypt:prueba-backup.txt
rm -f /tmp/prueba-backup.txt
```

`gdrive-crypt:` debe mostrar el nombre normal y `gdrive:prod-db` un nombre ilegible: eso prueba que el cifrado funciona.

> **ADVERTENCIA:** `rclone` muestra el password y el salt **una sola vez**. Guardarlos **fuera de la VPS** (gestor de contraseñas). Sin ellos los backups en Drive son irrecuperables, incluso para el dueño de la cuenta. Guardar también una copia de `rclone.conf` fuera de la VPS.

## Primera corrida manual

Pegar los comandos **de a uno**: pegar varias líneas juntas en la terminal SSH mezcla la salida.

```bash
# 1) Solo local
PROD_DB_CONTAINER=cotizador-supabase-db BACKUP_DIR=$HOME/backups/prod-db ~/backup-prod-db.sh --skip-upload

# 2) Con subida
PROD_DB_CONTAINER=cotizador-supabase-db BACKUP_DIR=$HOME/backups/prod-db RCLONE_REMOTE=gdrive-crypt: ~/backup-prod-db.sh
```

`gdrive-crypt:` ya apunta a la carpeta `prod-db` de Drive, que es **exclusiva** de estos backups: la rotación remota borra todo lo que tenga más de `REMOTE_RETENTION_DAYS` días en esa carpeta.

## Cron (diario 03:30, hora de Paraguay)

El cron usa la zona horaria del sistema (`America/Asuncion`). Agregar la tarea sin pisar otras existentes:

```bash
(crontab -l 2>/dev/null; echo '30 3 * * * PROD_DB_CONTAINER=cotizador-supabase-db BACKUP_DIR=/home/soporte/backups/prod-db RCLONE_REMOTE=gdrive-crypt: /home/soporte/backup-prod-db.sh >> /home/soporte/backups/backup.log 2>&1') | crontab -
crontab -l
```

El script se protege solo con su propio lock; no hace falta envolverlo en `flock`. Rotar `backup.log` con logrotate (p. ej. semanal, 8 copias). El log no contiene datos del dump.

## Verificar

```bash
tail -12 ~/backups/backup.log
ls -l $HOME/backups/prod-db
cd $HOME/backups/prod-db && sha256sum -c prod-YYYYMMDD-HHMMSS.dump.sha256
docker exec -i cotizador-supabase-db pg_restore --list < prod-YYYYMMDD-HHMMSS.dump | head
rclone ls gdrive-crypt:
```

En Drive tiene que haber un `.dump` y su `.sha256` por cada día, con el mismo tamaño que los locales.

## Restaurar (esquema)

Solo hacia una base **descartable**, nunca sobre PROD: crear una base vacía en un contenedor temporal y correr `pg_restore` con el dump. La prueba formal de restauración es Issue #87 T-04; no improvisar otros comandos.

Para bajar un backup de Drive: `rclone copy gdrive-crypt:<archivo> .` (requiere la configuración crypt y sus claves).

## Límites conocidos

- Respalda solo la base `postgres`, no los roles globales (`pg_dumpall --globals-only` queda fuera).
- **No hay alertas ante fallo**: solo la salida del log. Es el mismo modo de falla del workflow anterior, que dejó de funcionar sin que nadie lo notara. Revisar `backup.log` periódicamente hasta agregar un aviso externo.
- El cifrado de `crypt` protege ante acceso a la cuenta de Drive, no ante acceso a la VPS: `rclone.conf` guarda las claves de forma reversible.
- Un backup en la misma VPS no protege ante pérdida de la VPS; por eso existe la copia cifrada en Drive.
- La restauración nunca fue probada de punta a punta (pendiente Issue #87 T-04).
