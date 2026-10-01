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
(crontab -l 2>/dev/null; echo '30 3 * * * PROD_DB_CONTAINER=cotizador-supabase-db BACKUP_DIR=/home/soporte/backups/prod-db RCLONE_REMOTE=gdrive-crypt: HEALTHCHECK_URL=https://hc-ping.com/<uuid> /home/soporte/backup-prod-db.sh >> /home/soporte/backups/backup.log 2>&1') | crontab -
crontab -l
```

`<uuid>` es el de tu check (ver "Alertas"). Si la tarea ya existe sin `HEALTHCHECK_URL`, editarla con `crontab -e` en vez de duplicarla.

El script se protege solo con su propio lock; no hace falta envolverlo en `flock`. Rotar `backup.log` con logrotate (p. ej. semanal, 8 copias). El log no contiene datos del dump.

## Alertas (healthchecks.io)

Sistema de "dead-man's switch": el script avisa a healthchecks.io al empezar, al terminar bien y ante cualquier falla. Si llega un aviso de falla, o no llega ningún aviso de éxito dentro del plazo, healthchecks.io manda un mail. Un cron que no corre (VPS caída, crontab roto) también se detecta, porque lo que dispara la alerta es la ausencia del ping.

Configuración (una sola vez, del lado de healthchecks.io; nada de esto vive en el repo):

1. Crear una cuenta gratuita en healthchecks.io.
2. Crear un check llamado `prod-db-backup` con schedule `30 3 * * *`, zona horaria `America/Asuncion` (o, alternativamente, periodo de 1 día) y **grace time de 2 horas**.
3. Configurar la notificación por **email**.
4. Copiar la ping URL (`https://hc-ping.com/<uuid>`) y agregarla **solo en el crontab de la VPS** como `HEALTHCHECK_URL=...` en la línea del cron (ver ejemplo arriba). La URL contiene un token secreto: no pegarla en chats, tickets ni en el repo. El script nunca la escribe en el log.

Requisito: `curl` instalado en la VPS (`command -v curl`; si falta, `sudo apt install curl`). Sin `curl` el script lo advierte en el log y sigue sin alertar.

### Cargar la URL en la VPS sin ensuciarla

Pegar la URL en la terminal SSH puede colar caracteres invisibles. El 2026-10-01 llegó con 2 caracteres de más y `curl` la rechazó (`Malformed input to a URL function`); el backup terminó bien y el script avisó con `WARN: no se pudo enviar el ping de healthcheck`. Para evitarlo, cargarla en una variable limpiándola, sin que quede en el historial de la terminal:

```bash
read -rs -p "URL de ping: " u; HEALTHCHECK_URL=$(printf '%s' "$u" | tr -d '[:space:][:cntrl:]'); unset u; export HEALTHCHECK_URL; echo; echo "largo: ${#HEALTHCHECK_URL}"
curl -sS -m 10 -o /dev/null -w 'HTTP %{http_code}\n' "$HEALTHCHECK_URL"
```

Esperado: `largo: 56` (para una URL `https://hc-ping.com/<uuid>`) y `HTTP 200`. Ese `curl` ya cuenta como un ping de éxito. Con la variable cargada, la línea del cron se escribe sin volver a pegar el token; el `grep -v` reemplaza la línea anterior del backup y conserva cualquier otra tarea:

```bash
crontab -l > ~/crontab.bak
(crontab -l | grep -v 'backup-prod-db.sh'; echo "30 3 * * * HEALTHCHECK_URL=$HEALTHCHECK_URL PROD_DB_CONTAINER=cotizador-supabase-db BACKUP_DIR=/home/soporte/backups/prod-db RCLONE_REMOTE=gdrive-crypt: /home/soporte/backup-prod-db.sh >> /home/soporte/backups/backup.log 2>&1") | crontab -
crontab -l | sed 's#hc-ping.com/[^ ]*#hc-ping.com/***#'
rm -f ~/crontab.bak
unset HEALTHCHECK_URL
```

`~/crontab.bak` contiene el token en texto plano: borrarlo al terminar. El `sed` solo sirve para verificar la línea mostrando el token tapado.

Comportamiento: con subida habilitada, `/start` al comenzar, ping de éxito como último paso y `/fail` (con un mensaje corto, sin datos del dump) ante cualquier salida distinta de 0. Con `--skip-upload` no se hace ningún ping y el log lo indica. Sin `HEALTHCHECK_URL` el log dice `WARN: sin HEALTHCHECK_URL, no hay alerta ante fallo`.

Probar el éxito: con `HEALTHCHECK_URL` cargada como arriba, correr el script una vez a mano **con** subida (`PROD_DB_CONTAINER=... BACKUP_DIR=... RCLONE_REMOTE=gdrive-crypt: ~/backup-prod-db.sh`); el log debe terminar en `backup completo` sin ningún `WARN`, y el check del dashboard debe pasar a verde.

Probar la falla de forma segura: correr a mano una vez con un `PROD_DB_CONTAINER` inexistente (p. ej. `PROD_DB_CONTAINER=no-existe`), de modo que `pg_dump` falle. Debe llegar un ping `/fail` y el mail. **No** dejar ese valor en el cron: es solo para esa corrida manual.

Exposición a terceros: healthchecks.io solo recibe pings (marcas de tiempo y el mensaje corto de falla); nunca datos del dump ni datos de conexión.

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

Destino decidido para esa prueba (Kevin, 2026-09-30): un contenedor descartable **dentro de la VPS**, con la copia local, para no crear una copia nueva de datos reales ni mover la clave de `crypt`. Condiciones: contenedor `t04-pg` (nunca con prefijo `cotizador-`), `--network none`, sin puertos publicados, `--cpus 0.5 --memory 512m`, dump montado de solo lectura como un único archivo, imagen `supabase/postgres:17.6.1.136` y rol `supabase_admin`. Antes de usar datos reales, ensayar el procedimiento con una base sintética. La imagen ya crea schemas como `auth` y `storage`, que el dump vuelve a crear, así que `pg_restore --exit-on-error` puede cortar con "already exists" (riesgo previsto, no verificado). Al terminar, borrar el contenedor y el volumen y comprobar con `docker ps -a` y `docker volume ls` que no quedó nada.

La recuperación desde Drive se verifica aparte: bajar el archivo de `gdrive-crypt:` con una configuración temporal de `rclone` armada con las claves del gestor de contraseñas (no con las de la VPS) y comparar el `sha256`.

Para bajar un backup de Drive: `rclone copy gdrive-crypt:<archivo> .` (requiere la configuración crypt y sus claves).

## Límites conocidos

- Respalda solo la base `postgres`, no los roles globales (`pg_dumpall --globals-only` queda fuera).
- **Alertas**: una falla o una corrida que no ocurre avisa por mail vía healthchecks.io (sección "Alertas"). Depende de que `HEALTHCHECK_URL` esté en el crontab; si falta, el script lo advierte en el log pero el backup corre igual sin alerta. Un ping fallido (red caída, `curl` ausente) no rompe el backup, pero esa corrida no avisa.
- El cifrado de `crypt` protege ante acceso a la cuenta de Drive, no ante acceso a la VPS: `rclone.conf` guarda las claves de forma reversible.
- Un backup en la misma VPS no protege ante pérdida de la VPS; por eso existe la copia cifrada en Drive.
- La restauración nunca fue probada de punta a punta (pendiente Issue #87 T-04).
