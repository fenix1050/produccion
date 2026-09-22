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
