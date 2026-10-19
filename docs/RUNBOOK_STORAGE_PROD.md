# Runbook — agregar Supabase Storage a PROD

**Estado: ejecutado en PROD el 2026-10-19 (etapas 0 a 6, verificado).** Se ejecuta **solo en la VPS, por Kevin, un comando por vez**. Claude nunca corre esto contra PROD. Hubo dos desvíos respecto del plan original, documentados en la etapa 5.

## Por qué hace falta

El backend nuevo guarda y descarga los PDFs de Carta Oferta y Propuesta Formal con `supabase.storage` (buckets `cartas-oferta-privadas` y `propuestas-formales-privadas`). Las migraciones `066` y `071` crean esos buckets con `INSERT INTO storage.buckets`.

Relevado el 2026-10-12 (solo lectura):

- PROD no tiene contenedor de Storage (TEST sí: `cotizador-test-storage`, imagen `supabase/storage-api:v1.60.4`).
- El esquema `storage` existe en la DB de PROD pero está vacío: `storage.buckets` no existe. Las tablas las crea `storage-api` al arrancar por primera vez.
- Por eso el orden es obligatorio: **primero Storage, después las migraciones `066` a `082`**. Con el orden inverso, `066` falla.
- El rol `supabase_storage_admin` ya existe en la DB de PROD. Las variables `ANON_KEY`, `JWT_SECRET`, `POSTGRES_DB`, `POSTGRES_PASSWORD`, `POSTGRES_PORT` y `SERVICE_ROLE_KEY` ya están en `/opt/cotizador/supabase/.env`. Faltan 4 que no son secretas (etapa 3).
- El Envoy de PROD (`volumes/api/envoy/`) no menciona `storage`: falta la ruta `/storage/v1/` y el cluster `storage`.

## Alcance y riesgo

Se toca el stack de Supabase de PROD en `/opt/cotizador/supabase`: su `docker-compose.yml`, su `.env`, el Envoy y un directorio nuevo `volumes/storage`.

**Riesgo principal:** el Envoy de PROD es el camino del backend hacia la DB. Para cargar la ruta nueva hay que recrear su contenedor y la API corta unos segundos (etapa 6). Hacerlo en una ventana tranquila.

Los comandos usan `sudo` donde hace falta: el `.env` es legible solo por root. Nunca pegar valores de claves en chats ni en el repo.

## Etapa 0 — respaldo y copias

0.1. Respaldo manual de la DB (sin subir a Drive):

```
PROD_DB_CONTAINER=cotizador-supabase-db BACKUP_DIR=$HOME/backups/prod-db ~/backup-prod-db.sh --skip-upload
```

0.2. Confirmar que quedó:

```
ls -l $HOME/backups/prod-db
```

0.3. Copias de lo que se va a modificar:

```
cd /opt/cotizador/supabase && sudo cp -a docker-compose.yml docker-compose.yml.bak-storage && sudo cp -a volumes/api/envoy volumes/api/envoy.bak-storage && sudo cp -a .env .env.bak-storage
```

## Etapa 1 — comprobaciones de solo lectura

1.1. Ninguna de las 4 variables nuevas debe estar referenciada por los servicios que ya corren (si lo estuvieran, agregarlas al `.env` cambiaría su configuración). Debe imprimir **nada**:

```
grep -nE 'GLOBAL_S3_BUCKET|REGION|STORAGE_TENANT_ID|SUPABASE_PUBLIC_URL' /opt/cotizador/supabase/docker-compose.yml
```

1.2. El Envoy de PROD debe diferir del de TEST **solo** en lo de `storage`. Revisar la salida antes de pegarla (sin valores de claves):

```
diff -r /opt/cotizador/supabase/volumes/api/envoy /opt/cotizador/supabase-test/volumes/api/envoy
```

Si el diff muestra otras diferencias (hostnames, puertos, etc.), **no copiar los archivos de TEST**: la etapa 2 se hace a mano, solo con el bloque `storage-v1` (ruta) y el cluster `storage`.

1.3. Propietario del directorio de archivos de TEST (para replicarlo):

```
ls -ld /opt/cotizador/supabase-test/volumes/storage
```

## Etapa 2 — Envoy (sin recrear todavía)

Solo si el diff de 1.2 mostró únicamente diferencias de `storage`:

```
sudo cp /opt/cotizador/supabase-test/volumes/api/envoy/lds.template.yaml /opt/cotizador/supabase-test/volumes/api/envoy/cds.yaml /opt/cotizador/supabase/volumes/api/envoy/
```

Verificar que PROD ahora tiene la ruta y el cluster:

```
grep -c -i storage /opt/cotizador/supabase/volumes/api/envoy/lds.template.yaml /opt/cotizador/supabase/volumes/api/envoy/cds.yaml
```

El Envoy en ejecución probablemente no relee estos archivos hasta recrearlo (etapa 6). Si llegara a recargarlos, solo suma un cluster `storage` sin endpoints y una ruta que nadie usa todavía: no afecta a `/rest/v1`.

## Etapa 3 — variables y servicio en el compose

3.1. Agregar las 4 variables no secretas al `.env` (los mismos valores que TEST; el `\n` inicial evita pegarse a una última línea sin salto):

```
printf '\nGLOBAL_S3_BUCKET=storage\nREGION=local\nSTORAGE_TENANT_ID=stub\nSUPABASE_PUBLIC_URL=http://api-gw:8000\n' | sudo tee -a /opt/cotizador/supabase/.env > /dev/null
```

3.2. Armar el bloque del servicio a partir del de TEST, cambiando solo el nombre del contenedor:

```
awk '/^  storage:/{f=1} /^networks:/{f=0} f' /opt/cotizador/supabase-test/docker-compose.yml | sed 's/cotizador-test-storage/cotizador-supabase-storage/' > /tmp/storage-block.yml
```

Revisar `/tmp/storage-block.yml` (debe empezar en `  storage:`, tener `container_name: cotizador-supabase-storage` y terminar con la red `supabase_internal`).

3.3. Insertarlo antes del `networks:` de nivel superior del compose de PROD:

```
awk 'FNR==NR{blk=blk $0 "\n"; next} /^networks:/{printf "%s", blk} {print}' /tmp/storage-block.yml /opt/cotizador/supabase/docker-compose.yml | sudo tee /opt/cotizador/supabase/docker-compose.yml.new > /dev/null
```

3.4. Validar el archivo nuevo antes de usarlo (no imprime nada si está bien):

```
cd /opt/cotizador/supabase && sudo docker compose -f docker-compose.yml.new config -q
```

3.5. Si 3.4 no dio error, activarlo:

```
cd /opt/cotizador/supabase && sudo mv docker-compose.yml.new docker-compose.yml
```

## Etapa 4 — directorio de archivos

Crear `volumes/storage` con el mismo propietario que en TEST (resultado de 1.3):

```
cd /opt/cotizador/supabase && sudo mkdir -p volumes/storage && sudo chown --reference=/opt/cotizador/supabase-test/volumes/storage volumes/storage
```

## Etapa 5 — levantar solo Storage

`--no-deps` evita tocar `db` y `rest`:

```
cd /opt/cotizador/supabase && sudo docker compose up -d --no-deps storage
```

Esperar a que quede `healthy` y mirar que haya corrido sus migraciones sin errores de conexión o de autenticación del rol `supabase_storage_admin`:

```
docker ps --format '{{.Names}} | {{.Status}}' | grep supabase-storage
docker logs --tail 40 cotizador-supabase-storage
```

### Desvíos encontrados en PROD el 2026-10-19

El primer arranque entró en bucle de reinicio. Había dos causas, que se resolvieron en este orden:

1. **`TypeError: Cannot read properties of undefined (reading 'searchParams')`.** La contraseña de PROD tiene caracteres reservados en una URL. `DATABASE_URL: postgres://supabase_storage_admin:${POSTGRES_PASSWORD}@...` no se puede parsear (TEST usa una clave simple y por eso no falló). Solución, sin tocar la contraseña ni mostrarla: agregar al `.env` una variable con la misma clave codificada y usarla solo en la línea `DATABASE_URL` del servicio `storage`:

```
sudo python3 -c "import urllib.parse;f='/opt/cotizador/supabase/.env';p=[l.split('=',1)[1].rstrip('\n') for l in open(f) if l.startswith('POSTGRES_PASSWORD=')][0];open(f,'a').write('\nPOSTGRES_PASSWORD_URLENC='+urllib.parse.quote(p,safe='')+'\n')"
```

Luego, en `docker-compose.yml`, la línea `DATABASE_URL` del servicio `storage` pasa a usar `${POSTGRES_PASSWORD_URLENC}` (se hizo con `sed` sobre esa línea; validar con `docker compose config -q`).

2. **`password authentication failed for user "supabase_storage_admin"` (28P01).** La contraseña de ese rol en la DB de PROD no coincidía con `POSTGRES_PASSWORD`. Ningún servicio usaba ese rol, así que se la alineó sin mostrar la clave:

```
sudo python3 -c "import subprocess;f='/opt/cotizador/supabase/.env';p=[l.split('=',1)[1].rstrip('\n') for l in open(f) if l.startswith('POSTGRES_PASSWORD=')][0];sql=\"ALTER ROLE supabase_storage_admin WITH PASSWORD '\"+p.replace(\"'\",\"''\")+\"'\";r=subprocess.run(['docker','exec','-i','cotizador-supabase-db','psql','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],input=sql.encode(),capture_output=True);print(r.stdout.decode().strip(),r.returncode)"
```

Después se recreó solo Storage con `up -d --no-deps --force-recreate storage`: quedó `healthy`.

Verificar que ahora existe la tabla de buckets en la DB de PROD:

```
docker exec cotizador-supabase-db psql -U supabase_admin -d postgres -tc "select to_regclass('storage.buckets')"
```

## Etapa 6 — recrear el Envoy (corte de segundos)

```
cd /opt/cotizador/supabase && sudo docker compose up -d --no-deps --force-recreate api-gw
```

Verificar que el backend de PROD sigue hablando con la DB y ahora llega a Storage por el Envoy. El primer comando debe imprimir `200`; el segundo, el estado HTTP de Storage (sin imprimir claves):

```
docker exec cotizador-tajy-backend node -e "fetch('http://127.0.0.1:3000/health').then(r=>console.log(r.status))"
docker exec cotizador-tajy-backend node -e "fetch(process.env.SUPABASE_URL+'/storage/v1/status',{headers:{apikey:process.env.SUPABASE_SERVICE_KEY}}).then(r=>console.log(r.status))"
```

Resultado del 2026-10-19: Envoy `healthy`, `/health` 200, `storage 200` y `rest 200` desde el backend de PROD. Para comprobar la DB por el Envoy conviene además consultar `/rest/v1/ramos?select=id&limit=1` con la clave de servicio (200), porque `/health` no garantiza que toque la DB.

## Rollback

Si algo falla antes de la etapa 6: `sudo docker compose stop storage` y restaurar los `.bak-storage`. Si falla después:

```
cd /opt/cotizador/supabase && sudo docker compose stop storage && sudo cp -a docker-compose.yml.bak-storage docker-compose.yml && sudo cp -a .env.bak-storage .env && sudo rm -rf volumes/api/envoy && sudo cp -a volumes/api/envoy.bak-storage volumes/api/envoy && sudo docker compose up -d --no-deps --force-recreate api-gw
```

Storage nunca modifica tablas del esquema `public`; el único cambio persistente en la DB es el contenido del esquema `storage`, que no usa nada existente.

## Después

Con Storage andando, sigue el ensayo y la aplicación de las migraciones `066` a `082` (runbook aparte, tras ensayarlas sobre una restauración del respaldo).
