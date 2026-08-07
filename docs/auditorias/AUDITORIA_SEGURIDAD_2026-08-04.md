# Auditoría de seguridad — Cotizador Aseguradora Tajy

**Fecha:** 2026-08-04
**Alcance:** repositorio completo `fenix1050/produccion` (rama `main`), backend Express/Supabase + frontend Vanilla JS.
**Metodología:** revisión automatizada en 4 frentes en paralelo — OWASP Top 10 (2021), secretos expuestos, dependencias desactualizadas/vulnerables, prácticas de autenticación. Lectura directa del código fuente actual, no solo del changelog de `CLAUDE.md`.

## Resumen ejecutivo

**Sin hallazgos Críticos ni Altos.** El proyecto viene de una serie de cambios de endurecimiento reciente (sesión httpOnly + CSRF de doble-submit, RLS en las 34 tablas críticas de Supabase, login con tiempo constante, transacciones atómicas por RPC plpgsql, `trust proxy` correcto) que se verificaron contra el código real y siguen vigentes. `npm audit` reporta **0 vulnerabilidades** en las 485 dependencias. No se encontraron secretos nuevos expuestos.

Los hallazgos que quedan son de severidad Media/Baja — ninguno amerita la apertura automática de un Issue según el criterio de esta rutina (solo se abre Issue ante hallazgos Críticos).

| # | Severidad | Área | Hallazgo |
|---|---|---|---|
| 1 | Media | Secretos / A02 | Hash bcrypt real de la contraseña del admin commiteado en `backend/migrations/028_auth_usuarios.sql` |
| 2 | Media | A05 Misconfiguration | Puppeteer corre con `--no-sandbox` |
| 3 | Baja/Media | Autenticación | Endpoints de cambio de contraseña (propio y admin) usan el rate limiter genérico (300/15min), no uno específico como el de login (10/15min) |
| 4 | Baja | Autenticación | `incrementarTokenVersion` no es atómico (read-then-write) — ventana de carrera real, ya trackeada en `CLAUDE.md` |
| 5 | Baja | Autenticación | `JWT_SECRET` solo se valida que no esté vacío, no su longitud/entropía mínima |
| 6 | Baja | A03 Injection (footgun) | Búsqueda de cliente por nombre no escapa comodines `%`/`_` de PostgREST (`cotizaciones.repository.js`) |
| 7 | Info | A03 Injection (footgun) | Filtro `.or()` de PostgREST con interpolación de string en `coberturas.repository.js` — hoy solo recibe IDs validados, pero es fragil ante un futuro caller sin validar |
| 8 | Info | A09 Logging | Stubs de Fase 4 (`aceptarCotizacion`/Propuesta Formal) no reciben `usuario` — recordatorio para agregar el mismo chequeo de propiedad que el resto cuando se implemente |
| 9 | Info | Higiene | `backend/package.json` exige Node `>=24.0.0`; el entorno de ejecución actual tiene Node `v22.22.2` |
| 10 | Info | Higiene | `express`, `puppeteer` y `zod` un major detrás de la última versión (sin CVEs) |

No se crea Issue en GitHub — no hay ningún hallazgo Crítico.

---

## 1. Secretos expuestos

**Resultado: sin secretos nuevos expuestos.** Árbol de trabajo limpio, sin `.env`/`config.js` reales commiteados en ningún punto del historial de git. `.gitignore` excluye correctamente `.env`, `.env.local`, `frontend/shared/config.js`, `node_modules/`. Solo existen los templates (`backend/.env.example`, `frontend/shared/config.example.js`), ambos sin valores reales. Los 5 workflows de GitHub Actions referencian credenciales exclusivamente vía `${{ secrets.* }}`, sin plaintext.

### Hallazgo #1 (Media) — Hash bcrypt real del admin en una migración SQL
**Archivo:** `backend/migrations/028_auth_usuarios.sql:19-20`

El hash bcrypt (`$2b$12$...`, costo 12) de la contraseña real del usuario admin `kevinruiz@tajy.com.py` está commiteado permanentemente en el historial de git. El hash en sí es computacionalmente sólido (bcrypt/12 no es crackeable en bulk), así que el riesgo depende de si esa contraseña específica es débil o está reutilizada en otro lado — no del algoritmo. Es mala práctica igualmente: una vez en el historial de git, no se puede "des-commitear".

Este hallazgo **ya estaba trackeado** como pendiente en `CLAUDE.md` desde la auditoría externa del 2026-08-03 ("evaluar rotar esa contraseña específica") — no es nuevo, sigue sin resolver.

**Recomendación:** rotar esa contraseña específica de producción. A futuro, sembrar usuarios admin vía script en tiempo de ejecución o variable de entorno, nunca en un archivo de migración versionado.

---

## 2. Dependencias

**`npm audit --json` sobre el lockfile raíz** (`package-lock.json`, workspace con `backend`): **0 vulnerabilidades** en 485 dependencias (306 prod, 178 dev, 3 optional) — crítico/alto/moderado/bajo/info todos en 0.

### Hallazgo #9 (Info) — Mismatch de versión de Node
`backend/package.json` declara `"engines": {"node": ">=24.0.0"}`, pero el Node del entorno de ejecución es `v22.22.2`. No es una vulnerabilidad, pero con `engine-strict` activado rompería instalación/CI en ese entorno.

### Hallazgo #10 (Info) — Paquetes un major detrás
Sin CVEs asociados, pero vale la pena una actualización planificada (no urgente):

| paquete | fijado | última | nota |
|---|---|---|---|
| express | 4.22.2 | 5.2.1 | sigue recibiendo parches 4.x |
| puppeteer | 24.43.1 | 25.4.0 | — |
| zod | 3.25.76 | 4.4.3 | v4 tiene cambios de API — toca todos los schemas de riesgo por ramo, requiere sesión dedicada |

Paquetes de seguridad crítica ya al día: `jsonwebtoken` 9.0.3, `bcryptjs` 3.0.3, `helmet` 8.3.0, `cors` 2.8.6, `multer` 2.2.0, `express-rate-limit` 8.6.1, `@supabase/supabase-js` 2.111.0 (1 patch detrás de 2.112.0).

---

## 3. OWASP Top 10 (excluyendo autenticación y dependencias, cubiertas aparte)

**Sin hallazgos Críticos ni Altos.** Control de acceso (A01) está notablemente bien implementado: `verificarPropiedad` bloquea IDOR sobre cotizaciones (`cotizacion.service.js:224`), y `usuarios.service.js`/`roles.service.js` tienen guards explícitos y testeados contra escalación de privilegios (auto-promoción a admin, otorgarse permisos que no se tienen, modificar cuentas admin, subirse el propio tope de descuento).

### Hallazgo #2 (Media) — Puppeteer con `--no-sandbox`
**Archivo:** `backend/src/templates/oferta/pdf-utils.js:13`

Estándar para Docker sin privilegios, pero elimina la capa de aislamiento de procesos de Chrome. El contenido hoy está bien escapado (`escapeHtml()` consistente en los templates de PDF de MRC/Incendio), así que no es explotable ahora mismo — pero convierte cualquier futura interpolación sin escapar en un template de PDF en un vector de RCE en vez de solo HTML injection. Considerar `--disable-setuid-sandbox` + capabilities mínimas, o gVisor/seccomp, como defensa en profundidad.

### Hallazgo #6 (Baja) — Wildcards de PostgREST sin escapar en búsqueda de cliente
**Archivo:** `backend/src/repositories/cotizaciones.repository.js:87`

```js
query.ilike('cliente_nombre', `%${cliente}%`)
```

No es SQL injection (parametrizado vía PostgREST), pero `%`/`_` en el input del usuario no se escapan, así que un usuario puede ensanchar su propia búsqueda de forma inesperada. Impacto bajo porque los resultados ya están acotados por `agente_id` para no-admins.

### Hallazgo #7 (Info) — Filtro `.or()` de PostgREST con interpolación de string
**Archivo:** `backend/src/repositories/coberturas.repository.js:129`

```js
.or(`plan_id.is.null,plan_id.eq.${planId}`)
```

Verificado: el único caller pasa un entero resuelto desde la base (`plan.id`), nunca un valor crudo de request — no explotable hoy. Es un footgun si un futuro caller pasa input sin validar directamente, dado que la sintaxis `.or()` de PostgREST usa comas/operadores sin escapar acá.

### Hallazgo #8 (Info) — Stubs de Fase 4 sin `usuario`
**Archivo:** `backend/src/services/cotizacion.service.js:209-215`

`aceptarCotizacion`/`generarPdfPropuestaFormal` hoy solo tiran "Fase 4 pendiente", no explotable. Recordatorio para cuando se implemente Propuesta Formal (KYC): agregar el mismo chequeo `verificarPropiedad` que ya usa el resto de rutas de cotizaciones — el controller y la ruta (`cotizaciones.routes.js:15-16`) hoy descartan `req.usuario` en el camino a estos dos stubs.

### Verificado como ya bien resuelto (leído en el código, no asumido del changelog)
- **A01 Broken Access Control**: todas las rutas admin gateadas correctamente, distinción rol-vs-permiso aplicada bien, vectores de escalación de privilegios bloqueados con tests + `logSeguridad`.
- **A02 Cryptographic Failures**: `seguridad-logger.js` redacta campos sensibles por nombre, sin secretos/tokens en logs.
- **A03 Injection**: las 2 RPC plpgsql nuevas (`crear_cotizacion_atomica`/`actualizar_cotizacion_atomica`, migración 052) usan solo extracción JSONB tipada, sin SQL dinámico/`EXECUTE`; permiso `EXECUTE` correctamente revocado de `PUBLIC`.
- **A04 Insecure Design**: `apiRateLimiter` (300/15min por IP) cubre todo `/api`, no solo login.
- **A05 Security Misconfiguration**: `helmet()`, CORS con origin explícito (sin wildcard) + `credentials:true`, `trust proxy:1` correctamente acotado a un solo salto, error handler centralizado nunca expone `err.stack` al cliente.
- **A08 Software/Data Integrity**: workflows de CI/CD sin interpolación de input no confiable en `run:`, `deploy-backend.yml` solo dispara tras CI verde en `main`, con rollback automático si falla el health check.
- **Carga de archivos**: `admin-tasas.routes.js` filtra extensión+MIME `.xlsx`, límite de 10MB con 400 explícito (no 500), archivo temporal siempre borrado en `finally`, nombre generado por multer (sin path traversal).

---

## 4. Autenticación y sesiones

**Sin hallazgos Críticos ni Altos.** La sesión httpOnly + CSRF (`session-httponly-cookie`, PR #138) y el login con tiempo constante están correctamente implementados y verificados contra el código actual, no solo asumidos del changelog.

### Hallazgo #3 (Baja/Media) — Endpoints de cambio de contraseña sin rate limit dedicado
**Archivos:** `backend/src/routes/auth.routes.js:11`, `backend/src/routes/admin.routes.js:28`, `backend/src/middleware/rate-limit.js:18-25`

`PUT /auth/password` exige la contraseña actual (`bcrypt.compare`), pero solo aplica el `apiRateLimiter` genérico (300 req/15min por IP) — mucho más laxo que `loginRateLimiter` (10/15min). Un atacante con una cookie de sesión robada (ej. vía XSS en otro endpoint, o dispositivo filtrado) tiene ~300 intentos/15min contra la contraseña real del usuario, sin bloqueo. Misma brecha en `PUT /admin/usuarios/:id/password` (reseteo por admin).

**Recomendación:** aplicar un rate limiter dedicado y más estricto a ambos endpoints de cambio de contraseña.

### Hallazgo #4 (Baja) — `incrementarTokenVersion` no atómico
**Archivo:** `backend/src/repositories/usuarios.repository.js:112-126`

Patrón read-then-write en vez de una expresión SQL atómica `token_version + 1`. Dos revocaciones concurrentes (logout duplicado, o cambio de contraseña compitiendo con un logout) pueden leer el mismo valor y ambas escribir `old+1`, perdiendo silenciosamente una revocación. Ventana angosta, ya trackeado como pendiente en `CLAUDE.md`.

### Hallazgo #5 (Baja) — `JWT_SECRET` sin validación de fuerza
**Archivo:** `backend/src/app.js:18-22`

El fail-fast ante ausencia/vacío está bien implementado, pero no hay chequeo de longitud/entropía mínima. Un secreto corto o de baja entropía en `.env` igual dejaría arrancar la app y produciría tokens HS256 crackeables por fuerza bruta.

**Recomendación:** agregar una aserción de longitud mínima (ej. ≥32 bytes) al arranque.

### Verificado como ya bien resuelto (leído en el código, no asumido del changelog)
- **Flags de cookie**: `secure:true` en producción, `sameSite:'lax'`, `httpOnly:true` en la cookie de sesión; `httpOnly:false` solo en la cookie CSRF (por diseño, doble-submit) — `backend/src/utils/cookies.js:17-39`.
- **CSRF**: enforced globalmente en todos los métodos mutantes salvo `/auth/login`, comparación en tiempo constante (`timingSafeEqual`) con chequeo de longitud previo — `backend/src/middleware/csrf.js`.
- **`Authorization: Bearer` realmente eliminado**: `requireAuth` solo lee `req.cookies[COOKIE_SESION]` — `middleware/auth.js:18`.
- **`jwt.verify` fija `algorithms: ['HS256']`** — `middleware/auth.js:29`, cierra la clase de bugs de confusión de algoritmo/`none`.
- **Login con tiempo constante**: `bcrypt.compare` corre incondicionalmente contra `HASH_DUMMY_TIMING` en el camino "usuario no existe/inactivo" antes del 401 genérico — `auth.service.js:34-47`.
- **Expiración de token**: 45 minutos, consistente entre `JWT_EXPIRES_IN` y `MAX_AGE_MS` de la cookie.
- **Revocación real** (salvo hallazgo #4): `token_version` se valida contra una lectura fresca de la DB en cada request; logout y cambio de contraseña propio ambos lo incrementan.
- **Política de contraseña**: mínimo 8 caracteres vía Zod en creación, reseteo por admin y cambio propio.
- **Sin rol/privilegio confiado del cliente**: `rol_id` solo se puede setear vía `/admin/usuarios`/`/admin/roles`, ambos gateados por permiso verificado server-side. No existe endpoint de registro público.
- **CORS**: origin explícito (`FRONTEND_URL`, sin wildcard) con `credentials:true`.
- **`.env` nunca commiteado** (verificado contra todo el historial de git).

---

## Conclusión

El proyecto mantiene una postura de seguridad sólida tras las rondas de endurecimiento recientes. No hay hallazgos que requieran acción inmediata de emergencia. Se recomienda:

1. Rotar la contraseña real del admin cuyo hash está en `028_auth_usuarios.sql` (hallazgo #1, pendiente desde la auditoría anterior).
2. Agregar rate limiting dedicado a los endpoints de cambio de contraseña (hallazgo #3).
3. Considerar el resto de hallazgos Bajos/Info como backlog de mejora continua, sin urgencia.

No se abrió ningún Issue en GitHub en esta corrida — no se detectó ningún hallazgo de severidad Crítica.
