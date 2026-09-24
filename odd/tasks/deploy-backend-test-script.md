# Script de deploy/rollback de backend-test (canónico)

## Objetivo

Reemplazar el flujo manual (Kevin ejecuta a mano cada comando que Claude le va dando) para
redesplegar `backend-test` en la VPS por dos scripts commiteados en `scripts/`, análogos a
`scripts/deploy-frontend-test.sh` (que ya resuelve lo mismo para el frontend).

## Por qué

Kevin lo pidió explícitamente: cada cambio de backend requiere copiar/pegar comandos sueltos
al servidor. El patrón ya existe pero nunca se persistió como herramienta reusable — cada
sesión pasada generó un set de scripts ad hoc en `backend/tmp/<feature>-test-stage/remote/`
(`preflight-test.sh`, `deploy-test-backend.sh`, `rollback-test-backend.sh`) con un SHA256 y
comentarios hardcodeados para ESE cambio puntual. Se relevaron 10 de esos sets (2026-09-10 a
2026-09-17) para extraer el patrón común.

## Alcance

- `scripts/deploy-backend-test.sh`: orquesta TODO desde la máquina local con un solo comando
  — arma el contexto de build de `backend/`, lo manda por ssh a la VPS, corre ahí el preflight
  de solo lectura (captura la imagen previa), construye la imagen candidata, recrea SOLO el
  servicio de backend-test (via override de compose, nunca toca el compose base ni otro
  servicio) y verifica salud + `NODE_ENV=test` + `COOKIE_DOMAIN`. Gateado por `--approve-deploy`.
- `scripts/rollback-backend-test.sh`: lee la imagen previa que dejó el preflight (persistida en
  `~/deploy-backups/backend-test/previous-image-tag.txt` en el remoto, no en una carpeta
  `tmp/` por-PR) y la restaura. Gateado por `--approve-test-rollback`. Por diseño no puede
  apuntar nunca a producción (mismo guard `require_test_target` que las versiones ad hoc).
- Mantener el mismo contrato de variables de entorno que las versiones ad hoc
  (`PF3_TEST_COMPOSE_FILE`, `PF3_TEST_RUNTIME_OVERRIDE_FILE`, `PF3_TEST_COMPOSE_PROJECT`,
  `PF3_TEST_BACKEND_SERVICE`, `PF3_TEST_HEALTH_URL`) — viven solo en la VPS, nunca hardcodear
  valores adivinados.

## Fuera de alcance

- No se toca nada de PROD ni el `docker-compose.yml`/`Caddyfile` del repo.
- No se automatiza la promoción a PROD (sigue siendo manual, ver CLAUDE.md).
- No se borran los sets ad hoc en `backend/tmp/*-test-stage/` — son evidencia histórica de
  trabajo pasado, no basura.

## Checklist

- [x] 1. `scripts/deploy-backend-test.sh` creado y ejecutable, sigue el patrón de
      `deploy-frontend-test.sh` (requiere `TEST_SSH_HOST`, falla con `set -euo pipefail`,
      mensajes `PASS status=... / FAIL status=...`).
- [x] 2. `scripts/rollback-backend-test.sh` creado y ejecutable, mismo patrón.
- [x] 3. Verificación estática: `bash -n` en verde sobre ambos scripts. `shellcheck` no está
      instalado en esta máquina, así que ese paso quedó pendiente (ver sección Estado).

## Estado

TDD no aplica (scripts bash de infraestructura, no hay test runner del proyecto para esto).
Verificado: `bash -n` en verde sobre ambos scripts. Pendiente: `shellcheck` (no instalado) y
prueba real contra la VPS — esta última requiere autorización explícita de Kevin en el momento
de correrla (regla de "Remote operation authorization" del CLAUDE.md global), no se ejecuta
desde esta sesión.

Diseño: ambos scripts corren 100% desde la máquina local (igual que `deploy-frontend-test.sh`)
y hacen ssh a la VPS para las partes que necesitan docker. `deploy-backend-test.sh` arma el
contexto de build con `git archive HEAD -- backend` (solo lo committeado — si hay cambios sin
commitear en backend/, el script avisa y los deja afuera), lo manda por scp, corre un preflight
de solo lectura que persiste la imagen previa en
`~/deploy-backups/backend-test/previous-image-tag.txt` en el remoto, y recién ahí construye y
recrea el servicio. `rollback-backend-test.sh` lee ese mismo archivo. Ninguno de los dos asume
valores concretos de `PF3_TEST_COMPOSE_FILE` / `PF3_TEST_RUNTIME_OVERRIDE_FILE` /
`PF3_TEST_COMPOSE_PROJECT` / `PF3_TEST_BACKEND_SERVICE` / `PF3_TEST_HEALTH_URL` — esos viven
solo en la VPS y no están commiteados en el repo, así que siguen siendo variables de entorno
obligatorias sin default (no se adivinaron).

## Próximo paso

Ninguno pendiente de código.

**Corrección 2026-09-22, confirmada contra la VPS real (SRV-COTIZADOR) con Kevin:** el diseño
original asumía dos archivos de compose (`PF3_TEST_COMPOSE_FILE` + un
`PF3_TEST_RUNTIME_OVERRIDE_FILE` separado, calcado del patrón viejo de PR #390). La realidad es
un solo archivo — se sacó con `docker inspect cotizador-test-backend --format
'{{.Config.Labels}}'` y el label `com.docker.compose.project.config_files` solo lista uno. Se
sacó `PF3_TEST_RUNTIME_OVERRIDE_FILE` de ambos scripts y de sus invocaciones a `docker compose`.
Valores confirmados para la próxima corrida real:

- `PF3_TEST_COMPOSE_PROJECT=cotizador-backend-test`
- `PF3_TEST_BACKEND_SERVICE=backend-test`
- `PF3_TEST_COMPOSE_FILE=/opt/cotizador/backend-test/docker-compose.yml`
- `PF3_TEST_HEALTH_URL=https://test-api.cotizador.lat/health` (por convención, no confirmada
  todavía con un curl real desde la sesión)

`TEST_SSH_HOST=soporte@192.168.0.90` (llave `~/.ssh/id_ed25519`, con passphrase — Kevin la carga
con `ssh-agent` en su propia Git Bash, nunca por esta sesión).

**Verificación en vivo 2026-09-22 (Kevin, en su Git Bash, agente ssh propio):**
`./scripts/deploy-backend-test.sh --preflight-only` con las 5 variables confirmadas arriba dio
`PASS status=preflight previous_image=cotizador-test-backend:pf3-mrc-v3-20260921172704-bab1c8044c0b
health=healthy node_env=test`. Conectividad, labels de compose, health check y captura de la
imagen previa (para rollback) confirmados de punta a punta contra la VPS real. Se agregó un modo
`--preflight-only` a `deploy-backend-test.sh` (no estaba en el diseño original) para poder validar
esto sin construir ni reemplazar nada.

Pendiente real: un deploy completo (`--approve-deploy`) todavía no se probó en vivo — decisión de
Kevin, no bloqueante. `shellcheck` sigue sin instalarse en esta máquina.

**Deploy completo verificado en vivo 2026-09-23 (Kevin, en su Git Bash, agente ssh propio):**
`--approve-deploy` corrido de punta a punta contra la VPS real — build, recreate de
`cotizador-test-backend` y health check en verde. `deploy-frontend-test.sh` también corrido en
vivo (fallback tar+ssh, sin rsync local), `PASS` de integridad contra lo servido públicamente.

**2026-09-23, acceso propio de Claude a TEST (pedido explícito de Kevin — "quiero que puedas
entrar y ejecutar vos los scripts, pero que solo tengas acceso al test").** Usar la clave
personal de Kevin nunca fue la idea; en Linux pertenecer al grupo `docker` (o `sudo docker` sin
restricciones) equivale a root del host, así que no alcanza con "otro usuario en el mismo
grupo" para acotar el acceso solo a TEST — hace falta restringir por comando exacto.

Diseño final:

- Usuario dedicado `claude-test-deploy` en la VPS, **sin** grupo `docker`, clave ed25519 propia
  sin passphrase (uso no interactivo), `authorized_keys` con
  `no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty`.
- `/usr/local/bin/claude-test-deploy-docker`: wrapper en bash que valida en código (no en
  sintaxis de sudoers — mucho más frágil para esto, ver más abajo) que el comando sea
  EXACTAMENTE uno de los que usan `deploy-backend-test.sh`/`rollback-backend-test.sh`
  (`ps`/`inspect`/`image inspect`/`build`/`compose up`/`compose ps`), siempre atado a
  `cotizador-backend-test`/`backend-test`/la ruta fija del `docker-compose.yml` de TEST.
  Cualquier otra cosa (`docker run`, `docker exec`, apuntar a otro proyecto/servicio) se
  rechaza sin ejecutar nada — probado explícitamente con 5 casos de rechazo antes de instalar.
- `/etc/sudoers.d/claude-test-deploy`: una sola regla trivial, `NOPASSWD` para correr
  únicamente ese wrapper (`.../claude-test-deploy-docker *`) — toda la lógica de scoping vive
  en el wrapper, no en sudoers.
- Escritura en `/opt/cotizador/frontend-test` (nunca en `frontend/` de producción) vía grupo
  dedicado `frontend-test-deploy` + setgid en los directorios.
- `scripts/deploy-backend-test.sh`/`rollback-backend-test.sh`: nueva variable opcional
  `DOCKER_CMD` (default `docker`, sin cambios para Kevin/soporte) para poder decir
  `sudo -n /usr/local/bin/claude-test-deploy-docker` en vez de `docker` a secas. Viaja
  codificada en base64 entre el script local y el heredoc remoto — `ssh host bash -s --
arg1 arg2 ...` NO preserva el quoting entre argumentos (los concatena con espacios y el
  shell remoto los vuelve a tokenizar), así que un `DOCKER_CMD` con espacios llegaba partido
  en varias palabras sueltas al script remoto. Bug real encontrado y corregido en esta sesión.
- `scripts/deploy-frontend-test.sh`: la extracción remota de `tar` ahora usa
  `--no-same-permissions -m` y tolera que falle solo por eso (`|| true`) — un usuario que no
  es dueño de directorios preexistentes (creados por otro usuario en un deploy anterior)
  nunca puede hacer `chmod`/`utime` sobre ellos (restricción de POSIX, no algo que se pueda
  evitar con flags), pero el contenido de los archivos sí se escribe bien. El chequeo de hash
  que ya corría después sigue siendo la verificación real de que el deploy funcionó.
- Iteración de sudoers: 3 intentos fallidos por sintaxis antes de llegar al wrapper —
  `!requiretty` no es una setting reconocida en esta versión de sudo, y comodines `*` sueltos
  (sin nada pegado) en múltiples argumentos de una misma regla no están permitidos. Confirma
  que expresar este tipo de whitelist en sintaxis de sudoers es frágil; el wrapper en bash
  (testeable localmente antes de tocar la VPS) fue mucho más robusto.
- Verificado en vivo con la clave nueva, sin pedirle nada a Kevin: `docker ps` vía el wrapper
  devuelve el container id real, `deploy-backend-test.sh --preflight-only` da `PASS`, y
  `deploy-frontend-test.sh` da `PASS` de integridad. Producción sigue siendo 100% manual —
  esta clave no tiene ningún acceso a los paths/proyectos de prod (ni por sudoers, ni por
  grupo de archivos).

**2026-09-23, extensión a la DB de TEST (mismo pedido de Kevin, "si, seria bueno si lo armas
también así como lo anterior").** Mismo usuario `claude-test-deploy`, mismo patrón de wrapper:

- `/usr/local/bin/claude-test-deploy-psql`: `exec /usr/bin/docker exec -i cotizador-test-db psql
-U supabase_admin -d postgres "$@"` — nombre de contenedor fijo en el código, no llega como
  argumento. Sudoers: una sola regla `NOPASSWD` para ese wrapper exacto, mismo archivo
  `/etc/sudoers.d/claude-test-deploy`.
- Kevin eligió explícitamente **lectura y escritura completa** (no solo lectura) cuando se le
  preguntó.
- Verificado en vivo: `select 1;` vía el wrapper, y confirmado que apunta a TEST y no a prod
  antes de usarlo para nada mutante.

**2026-09-23, primera tanda real de uso de punta a punta (3 PRs en el mismo día — #436, #437,
#438).** Reproducción y fix de un bug real reportado por Kevin (una Carta Oferta con Propuesta
Formal ya emitida se podía reabrir y volver a completar), un segundo bug relacionado (un borrador
en `error_pdf` quedaba bloqueado para siempre por un guard que solo permitía `estado='borrador'`,
mientras el frontend mentía sobre la causa del 409 diciendo "cambió en otra pestaña"), y una
mejora visual pedida por Kevin (reusar el modal de progreso del cotizador al emitir una Propuesta
Formal). Detalle completo de cada fix en Engram (`pf3-carta-ya-emitida-fix`,
`pf3-editar-borrador-error-pdf-y-codigo-error`, `pf3-modal-emision-y-deploy-verificado`).

Flujo real usado, de punta a punta, sin pedirle nada a Kevin salvo el merge del PR:

1. Reproducir el bug leyendo el estado real de `propuestas_formales` vía `claude-test-deploy-psql`.
2. Escribir la migración SQL + fix de código, con tests locales en verde.
3. PR + merge (Kevin revisa y mergea).
4. `git pull --ff-only` en `main`, aplicar la migración a TEST pipeando el `.sql` por stdin al
   wrapper de psql, deployar backend (`--preflight-only` primero, después `--approve-deploy`) y
   frontend con `deploy-backend-test.sh`/`deploy-frontend-test.sh`.
5. Verificar en vivo contra `test-web.cotizador.lat`/`test-api.cotizador.lat` con Playwright real
   (no local — el backend de dev local tenía un problema de conectividad a Supabase ajeno a estos
   cambios) y con consultas SQL directas antes/después.

Hallazgo operativo: `deploy-backend-test.sh --approve-deploy` falló en su propio paso interno de
verificación post-deploy (el wrapper rechazó un `docker inspect --format ... <id>` con argv que
no matcheaba exactamente el patrón esperado) — pero el build y el `recreate` del contenedor SÍ
habían terminado bien. Se confirmó manualmente comparando el tag de la imagen construida
(`cotizador-backend-test:<sha-commit>-<timestamp>`) contra el commit del merge, más `/health`
público en 200. No bloqueante, pero revisar si se repite — podría ser una diferencia de forma
entre el argv que arma el script real vs. los casos que se probaron al testear el wrapper.

**2026-09-24, fix del hallazgo operativo de arriba (se repitió, como se advirtió).** Al desplegar
el PR #442 se confirmó la causa exacta: la verificación post-deploy usaba `docker inspect
--format '{{ .Config.Image }}'` (con espacios) mientras el preflight ya usaba con éxito
`'{{.Config.Image}}'` (sin espacios) para el mismo campo — el wrapper `claude-test-deploy-docker`
matchea el argv exacto, espacios incluidos, así que solo la forma sin espacios estaba permitida.
Corregidas ambas ocurrencias (`deploy-backend-test.sh` y `rollback-backend-test.sh`, que tenía el
mismo texto copiado) para usar la forma sin espacios en todos lados. Verificado contra el wrapper
real: `docker inspect --format '{{.Config.Image}}' cotizador-test-backend` corre sin rechazo, y
`--preflight-only` sigue en verde. No se repitió `--approve-deploy` completo para no reconstruir
una imagen idéntica — el punto de falla (esa única línea) quedó confirmado en aislado.
