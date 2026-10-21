# Runbook — desplegar a PROD (migraciones, backend y frontend)

Procedimiento manual, ejecutado por primera vez entre el 2026-10-19 y el 2026-10-21 (`docs/ESTADO_PROYECTO.md`, sección
114). Se corre **solo en la VPS, por una persona, un comando por vez**. Claude no accede a PROD. Mergear a `main` no
despliega nada: este runbook es lo único que promueve código a PROD.

Convenciones: `$SHA` es el commit completo (40 caracteres) que ya se probó en TEST. Los comandos con `sudo` piden la
contraseña. Los que usan `git fetch` piden la passphrase de la clave de GitHub. No pegar claves ni valores del `.env`
en chats ni en el repo.

## Antes de empezar

- El `$SHA` ya está desplegado y verificado en TEST (`scripts/deploy-backend-test.sh`, `scripts/deploy-frontend-test.sh`).
- Si hay migraciones nuevas, están revisadas y probadas en TEST.
- Backend y frontend se despliegan **juntos**: el frontend nuevo puede depender de endpoints nuevos. Cambiar el backend
  invalida las sesiones activas; hacerlo en un momento tranquilo si ya hay tráfico real.
- Si las migraciones usan Storage (`INSERT INTO storage.buckets`), Storage tiene que estar instalado primero
  (`docs/RUNBOOK_STORAGE_PROD.md`).

## Etapa 1 — respaldo de la DB

```
PROD_DB_CONTAINER=cotizador-supabase-db BACKUP_DIR=$HOME/backups/prod-db ~/backup-prod-db.sh --skip-upload; ls -t $HOME/backups/prod-db | head -2
```

Debe mostrar `verificación ok` y el archivo `prod-AAAAMMDD-HHMMSS.dump`. Anotar el nombre: es el punto de retorno de la
DB. Tomarlo **justo antes** de aplicar migraciones.

## Etapa 2 — migraciones (solo si hay nuevas)

2.1. Averiguar cuáles faltan. No hay tabla de control de migraciones: se comprueban por huellas (una columna, tabla,
función o dato que cada migración crea) consultando una **restauración** del dump, nunca PROD.

2.2. Ensayo sobre una restauración del dump, en un contenedor aislado (sin red ni puertos). Reemplazar el nombre del dump:

```
export DUMP=$HOME/backups/prod-db/prod-AAAAMMDD-HHMMSS.dump; export POSTGRES_PASSWORD="$(openssl rand -hex 32)"; docker run -d --name ens-pg --network none --cpus 0.5 --memory 512m --env POSTGRES_PASSWORD -v "$DUMP":/ens/backup.dump:ro supabase/postgres:17.6.1.136; unset POSTGRES_PASSWORD
```

```
until docker exec ens-pg pg_isready -U supabase_admin -d postgres; do sleep 2; done; docker exec ens-pg createdb -U supabase_admin -O supabase_admin -T template0 ensayo && docker exec ens-pg pg_restore -U supabase_admin -d ensayo --exit-on-error --clean --if-exists --no-owner --no-privileges /ens/backup.dump > /tmp/ens-restore.log 2>&1; echo pg_restore_exit=$?
```

Debe dar `pg_restore_exit=0`. No mostrar `/tmp/ens-restore.log`: puede traer datos.

2.3. Llevar los `.sql` nuevos a la VPS. Desde PowerShell en la PC (ajustar el rango de nombres):

```
$f = Get-ChildItem "C:\Visual Studio\Produccion\backend\migrations" -Filter *.sql | Where-Object { $_.Name -ge '066' -and $_.Name -lt '083' } | ForEach-Object FullName; ssh soporte@192.168.0.90 "mkdir -p ~/migraciones-ensayo"; scp $f soporte@192.168.0.90:~/migraciones-ensayo/
```

Verificar en la VPS que llegó la cantidad esperada: `ls ~/migraciones-ensayo | wc -l`.

2.4. Aplicarlas en orden sobre el ensayo. Cada archivo corre en su propia transacción y el bucle se frena en el primer
error (`tr -d '\r'` saca los fines de línea de Windows):

```
cd ~/migraciones-ensayo && for f in 0*.sql; do tr -d '\r' < $f | docker exec -i ens-pg psql -U supabase_admin -d ensayo -v ON_ERROR_STOP=1 -q -1 > /tmp/ens-$f.log 2>&1 && echo "OK $f" || { echo "FALLO $f"; tail -5 /tmp/ens-$f.log; break; }; done
```

Todas deben dar `OK`. Verificar con una consulta que cuente lo que las migraciones crean (tablas, funciones, buckets).
Si algo falla: **no seguir a PROD**; corregir la migración en el repo, probarla en TEST y repetir desde 2.2.

2.5. Aplicarlas en PROD: el mismo bucle, con el contenedor y la base reales:

```
cd ~/migraciones-ensayo && for f in 0*.sql; do tr -d '\r' < $f | docker exec -i cotizador-supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -1 > /tmp/prod-$f.log 2>&1 && echo "OK $f" || { echo "FALLO $f"; tail -5 /tmp/prod-$f.log; break; }; done
```

Repetir la consulta de verificación de 2.4, esta vez contra `cotizador-supabase-db`. Desde acá y hasta el final de la
etapa 4, el backend viejo corre sobre la DB nueva: seguir sin demora.

## Etapa 3 — backend

El proyecto de PROD vive en `/opt/cotizador/app` (compose `app`, servicio `backend`, contenedor `cotizador-tajy-backend`).
**No mover el árbol de trabajo de ese clon**: su `docker-compose.yml` y su `Caddyfile` son los que están en uso y pueden
diferir de los de `main`. Se construye desde un worktree aparte.

3.1. Traer el código y crear el worktree en el SHA probado:

```
cd /opt/cotizador/app && git fetch origin && git worktree add --detach ~/build-$SHA $SHA && git -C ~/build-$SHA log -1 --format='%H %s'
```

3.2. Antes de cambiar nada, revisar que el código no exija variables de entorno nuevas. El backend lee `JWT_SECRET`,
`PORT`, `COOKIE_*`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` y `NODE_ENV` (2026-10-21); si el diff del backend suma
alguna, agregarla al entorno del contenedor antes de recrearlo.

3.3. Construir la imagen (contexto = raíz del repo, el lockfile está ahí):

```
cd ~/build-$SHA && docker build -f backend/Dockerfile -t cotizador-backend:$SHA . 2>&1 | tail -5
```

3.4. Guardar el puntero de rollback con la imagen **actual** (leerla con
`docker inspect cotizador-tajy-backend --format '{{.Config.Image}}'`) y confirmar que sigue en el host:

```
mkdir -p ~/deploy-backups/backend-prod && echo cotizador-backend:TAG_ACTUAL > ~/deploy-backups/backend-prod/previous-image-tag.txt && cat ~/deploy-backups/backend-prod/previous-image-tag.txt && docker images --format '{{.Repository}}:{{.Tag}}' | grep -c TAG_ACTUAL
```

3.5. Reemplazar solo el backend (`--no-deps` deja Caddy y cloudflared; `--no-build` evita reconstruir):

```
cd /opt/cotizador/app && sudo BACKEND_IMAGE=cotizador-backend:$SHA docker compose up -d --no-deps --no-build --force-recreate backend && sleep 15 && docker ps --format '{{.Names}} | {{.Image}} | {{.Status}}' | grep tajy-backend && docker exec cotizador-tajy-backend node -e "fetch('http://127.0.0.1:3000/health').then(r=>console.log('health',r.status))"
```

Debe quedar la imagen nueva, `Up … (healthy)` y `health 200`.

## Etapa 4 — frontend

El frontend de PROD está en `/opt/cotizador/frontend-prod` (Caddy lo monta como `/srv/frontend-prod`). `shared/config.js` es
**por entorno** y no está en el repo: nunca copiarlo ni pisarlo.

4.1. Respaldo y comprobación de que `config.js` existe:

```
cp -a /opt/cotizador/frontend-prod ~/deploy-backups/frontend-prod-$(date +%Y%m%d-%H%M%S) && ls -ld /opt/cotizador/frontend-prod && ls -l /opt/cotizador/frontend-prod/shared/config.js
```

4.2. Copiar excluyendo `config.js` y comprobar que no cambió (misma fecha que en 4.1):

```
tar --exclude='shared/config.js' -cf - -C ~/build-$SHA/frontend . | tar --no-same-permissions -m -xf - -C /opt/cotizador/frontend-prod; echo tar_exit=$?; ls -l /opt/cotizador/frontend-prod/shared/config.js
```

4.3. Comprobar que el contenido quedó idéntico al commit (sin diferencias imprime solo `diff_listo`):

```
diff -rq ~/build-$SHA/frontend /opt/cotizador/frontend-prod -x config.js | head -20; echo diff_listo
```

Esta copia no borra archivos que dejaron de existir en el repo: aparecerían como `Only in /opt/cotizador/frontend-prod`.
Revisarlos y borrarlos a mano si corresponde.

## Etapa 5 — verificación

1. Desde el navegador en `https://cotizador.lat` (hay que volver a loguearse): iniciar sesión, cotizar, generar la
   Carta Oferta en PDF y, si el cambio toca Propuesta Formal, emitirla.
2. Errores del backend desde el deploy (el comando recorta cada línea para no arrastrar datos):

```
docker logs --since 2h cotizador-tajy-backend 2>&1 | grep -iE 'error|fatal|unhandled' | cut -c1-200
```

Los errores de validación esperados (falta de token antes de loguearse, reglas de negocio como el mínimo de coberturas de
MRC) no son fallas; una excepción no controlada o un error de Storage o de la DB sí.

## Limpieza

Borra solo lo que creó este procedimiento (los respaldos y la imagen anterior quedan, esta última para el rollback):

```
docker rm -fv ens-pg && rm -f /tmp/ens-*.log /tmp/prod-0*.log && git -C /opt/cotizador/app worktree remove --force ~/build-$SHA && rm -rf ~/migraciones-ensayo; git -C /opt/cotizador/app worktree list
```

## Rollback

- **Backend** (la imagen anterior sigue en el host):

```
cd /opt/cotizador/app && sudo BACKEND_IMAGE=$(cat ~/deploy-backups/backend-prod/previous-image-tag.txt) docker compose up -d --no-deps --no-build --force-recreate backend
```

- **Frontend:** restaurar la copia de la etapa 4.1 sobre `/opt/cotizador/frontend-prod` (sin tocar `shared/config.js`, que
  no cambió).
- **DB:** las migraciones no se deshacen una por una. Si hay que volver, se restaura el dump de la etapa 1 siguiendo
  `docs/RUNBOOK_BACKUP_PROD.md`. Hacerlo implica perder lo escrito en PROD después del respaldo, así que solo con
  decisión explícita. Con el backend viejo, una DB con migraciones de más suele seguir funcionando si fueron aditivas;
  verificarlo antes de restaurar.
- Si falla antes de la etapa 3, el backend viejo sigue sirviendo y no hay nada que revertir salvo la DB.

## Cosas que se aprendieron

- Pegar comandos largos desde el chat los parte: usar comandos cortos, de una línea.
- `git fetch` desde la VPS pide la passphrase de la clave de GitHub. Los `docker` de solo lectura (`ps`, `inspect`, `logs`,
  `exec`, `build`) corrieron sin `sudo`; los `docker compose up` se ejecutaron con `sudo` (no se probó sin él).
- Una contraseña con caracteres reservados rompe una URL de conexión armada con `${VARIABLE}`: ver
  `docs/RUNBOOK_STORAGE_PROD.md`.
- El clon `/opt/cotizador/app` queda en el commit viejo a propósito; lo que corre es la imagen por SHA y la carpeta
  del frontend, no el árbol de trabajo.
