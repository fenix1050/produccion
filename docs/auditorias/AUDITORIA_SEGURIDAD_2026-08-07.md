# Auditoría de seguridad — Cotizador Aseguradora Tajy

**Fecha:** 2026-08-07
**Alcance:** repositorio completo `fenix1050/produccion` (rama `main`, HEAD `27345b4`)
**Tipo:** revisión automatizada programada — OWASP Top 10 (2021), secretos expuestos, dependencias, prácticas de autenticación
**Resultado general:** ✅ Sin hallazgos críticos ni altos explotables. No se creó Issue en GitHub. 2 hallazgos previos se cerraron desde la última auditoría; 4 siguen abiertos (medio/bajo, ya trackeados).

---

## 1. Resumen ejecutivo

Existe una auditoría automatizada de 5 días antes (`docs/auditorias/AUDITORIA_SEGURIDAD_2026-08-02.md`, HEAD `4e4598e`) y una auditoría externa manual del 2026-08-03 (documentada en `CLAUDE.md`, no en un archivo de `docs/auditorias/`) con hallazgos propios. Entre esas fechas y hoy hubo cambios de seguridad reales — el cambio `session-httponly-cookie` (PR #138) y el hardening posterior de CD — así que esta corrida:

1. Repitió el barrido completo de secretos, `npm audit` y revisión de prácticas de autenticación desde cero (no incremental).
2. Verificó el estado real de los hallazgos abiertos de ambas auditorías previas.
3. Revisó control de acceso (IDOR), inyección, XSS en la generación de PDF, CSRF, configuración de cookies/CORS/Helmet, y la cadena de despliegue (Dockerfile, docker-compose, GitHub Actions).

| Categoría                                 | Resultado                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Secretos expuestos (repo + historial git) | Sin hallazgos.                                                                                                                        |
| Inyección (SQL/comando)                   | Sin hallazgos — Supabase client parametrizado + 2 RPC atómicas, sin SQL crudo ni `eval`/`exec`.                                       |
| XSS                                       | Sin hallazgos — templates de PDF (`templates/oferta/*.js`) escapan todo dato de usuario con `escapeHtml`.                             |
| Control de acceso (IDOR)                  | Sin hallazgos — `verificarPropiedad()` gatea lectura/edición de cotizaciones por `agente_id`, gates de rol/permiso en rutas admin.    |
| CSRF / sesión                             | Sin hallazgos — cookie httpOnly + double-submit CSRF con comparación _timing-safe_, ya verificado en producción.                      |
| Dependencias (`npm audit`)                | 1 alta, dev-only, no explotable (ver §3).                                                                                             |
| SSRF                                      | Sin hallazgos — único `fetch()` saliente es una URL fija hardcodeada (cotización del dólar).                                          |
| Autenticación                             | Sólida: bcrypt (12 rounds), comparación anti-timing-attack, revocación server-side (`token_version`), JWT con `algorithms` explícito. |
| Infraestructura (Docker/CI)               | 1 hallazgo bajo nuevo confirmado (contenedor corre como root) + 1 informativo nuevo (mismatch de versión de Node).                    |
| Hallazgos previos                         | 2 **cerrados** desde el 2026-08-02 (JWT en localStorage, falta de fail-fast de `JWT_SECRET`). 4 siguen abiertos (ver §5).             |

---

## 2. Secretos expuestos

**Sin hallazgos.**

- Grep de patrones (claves AWS `AKIA...`, claves privadas PEM, tokens `sk-`/`xox`, JWT en texto plano, `password=`/`secret=`/`token=` con valores literales) sobre todo el árbol trackeado (`.js`, `.json`, `.yml`): sin matches reales, solo referencias a `process.env.*`.
- `git log --all --diff-filter=A --name-only` sobre archivos `.env*` en **todo** el historial: el único archivo creado alguna vez es `backend/.env.example` (placeholders). Nunca se commiteó un `.env` real.
- `.mcp.json` solo referencia la URL pública del servidor MCP de Supabase (`project_ref`, no un secreto) — autenticación real vía OAuth interactivo, sin token en el archivo.
- Los workflows de GitHub Actions (`deploy-backend.yml`, `supabase-backup.yml`) usan `secrets.*` correctamente; el backup de Supabase se sube como _artifact_ privado, no como release pública.

**Acción:** ninguna.

---

## 3. Dependencias desactualizadas / vulnerables

`npm audit` sobre `backend/` y sobre el workspace raíz:

```
js-yaml  4.0.0 - 4.3.0
Severity: high
JS-YAML: Quadratic CPU consumption in !!omap resolution — CVE-2026-59870 fix not backported
1 high severity vulnerability
```

- **Contexto:** `js-yaml` es una dependencia **transitiva de `eslint`** (herramienta de desarrollo, `devDependencies` del `package.json` raíz) — no forma parte del árbol de dependencias de producción del backend (`backend/package.json` no la referencia ni directa ni indirectamente) ni se ejecuta en runtime. `npm ls js-yaml` no la resuelve como dependencia productiva.
- El vector de la CVE requiere parsear un documento YAML `!!omap` malicioso — la aplicación no parsea YAML de ningún input de usuario en ningún punto del código (`grep` sobre `backend/src` no encontró parseo de YAML).
- `npm audit fix` no la resuelve sin un bump mayor de `eslint`/`@eslint/eslintrc` (el advisory indica que el fix no fue _backported_ a la rama 4.x).

**Severidad real: baja/informativa** (no alcanzable desde ningún input externo, no se despliega a producción). **Acción sugerida:** evaluar el bump de `eslint` a la próxima versión mayor cuando sea conveniente, sin urgencia.

No se detectaron paquetes de producción (`express`, `@supabase/supabase-js`, `jsonwebtoken`, `bcryptjs`, `helmet`, `cors`, `multer`, `puppeteer`, `zod`, `express-rate-limit`, `cookie-parser`, `compression`, `dotenv`, `exceljs`) con vulnerabilidades conocidas ni con versiones mayores obsoletas.

---

## 4. Prácticas de autenticación — revisión completa

Se revisó `backend/src/middleware/auth.js`, `middleware/csrf.js`, `services/auth.service.js`, `utils/cookies.js` y `middleware/rate-limit.js` de punta a punta (no incremental, por el volumen de cambios desde la última revisión completa).

**Fortalezas confirmadas:**

- Sesión en cookie `HttpOnly` + `Secure` (en producción) + `SameSite=Lax`, TTL 45 min — el JWT no es alcanzable desde JavaScript del cliente (mitiga exfiltración vía XSS).
- CSRF de doble-submit (`middleware/csrf.js`) con comparación **timing-safe** (`crypto.timingSafeEqual`) entre cookie y header, aplicado globalmente a todo método mutante antes del router.
- `jwt.verify()` fija `algorithms: ['HS256']` explícito — no delega en el propio token qué algoritmo usar (cierra el vector clásico de confusión de algoritmo / `alg: none`).
- Revocación server-side real: `requireAuth` vuelve a consultar el usuario en cada request y compara `token_version` contra la base, no solo contra el payload del token — logout, cambio de contraseña y reseteo por admin invalidan sesiones viejas aunque el JWT no haya expirado.
- Mitigación de enumeración de cuentas por canal lateral de tiempo: `login()` siempre ejecuta `bcrypt.compare()` (contra un hash dummy si el usuario no existe/está inactivo) antes de responder — el tiempo de respuesta no delata qué emails existen.
- Mensajes de error genéricos ("Email o contraseña incorrectos") independientes de la causa real; el detalle solo va a `logSeguridad()` interno.
- Rate limiting en `/auth/login` por IP+email (10/15min, `ipKeyGenerator` normaliza IPv6) y rate limiting general de API (300/15min por IP) — ambos montados correctamente antes de los routers correspondientes.
- `bcrypt` con 12 _rounds_ (`BCRYPT_ROUNDS`), consistente en las 3 rutas que hashean password (creación, reseteo por admin, cambio propio).
- CORS con origen explícito (`FRONTEND_URL`, sin wildcard) + `credentials: true`, cumpliendo la restricción del propio spec CORS.
- Arranque _fail-fast_: `createApp()` aborta si falta `JWT_SECRET` o `FRONTEND_URL` — confirmado agregado desde la auditoría anterior (ver §5, cerrado).

**Hallazgos de esta sección:** ver §5 (hash de admin en migración, `incrementarTokenVersion` no atómico) — ambos ya trackeados internamente, ninguno nuevo.

---

## 5. Hallazgos abiertos y cerrados

### 5.1 Cerrados desde la auditoría del 2026-08-02

1. ✅ **Antes 🟠 Medio — JWT en `localStorage`.** Resuelto por el cambio `session-httponly-cookie` (PR #138, 2026-08-03): el JWT ahora vive en una cookie `HttpOnly`, `frontend/shared/api.js` ya no usa `localStorage` (confirmado por grep — las únicas menciones restantes son comentarios que documentan la migración).
2. ✅ **Antes 🟡 Bajo — sin fail-fast de `JWT_SECRET`.** Resuelto (issue #87, 2026-08-03): `backend/src/app.js` ahora lanza al arrancar si falta `JWT_SECRET`, mismo patrón que `FRONTEND_URL`.

### 5.2 Siguen abiertos (sin cambios)

3. 🟡 **Bajo — sin cabeceras CSP/`X-Frame-Options` en el frontend estático.** `frontend/vercel.json` solo define `Cache-Control`; no hay Content-Security-Policy ni otras cabeceras de _hardening_ para el sitio servido por Vercel (el `helmet()` del backend no cubre el frontend, que es un origen distinto). Riesgo bajo dado que no hay renderizado de HTML no confiable en el frontend, pero es defensa en profundidad ausente.
4. 🟡 **Bajo — `aceptar`/`pdfPropuesta` de Fase 4 (KYC) siguen sin recibir `req.usuario`.** `cotizaciones.controller.js` llama `cotizacionService.aceptarCotizacion(req.params.id, req.body)` y `generarPdfPropuestaFormal(req.params.id)` sin el usuario autenticado — ambas funciones de servicio siguen siendo _stubs_ (`aceptarCotizacion(_id, _kyc)`, `generarPdfPropuestaFormal(_id)`, parámetros sin usar). No explotable hoy porque no hay lógica real detrás; **si Fase 4 se implementa sin agregar `verificarPropiedad()` ahí, sería una regresión de IDOR real** — dejarlo anotado para cuando se retome esa fase.

### 5.3 Nuevos en esta corrida (ya conocidos internamente por CLAUDE.md/auditoría externa del 2026-08-03, sin abordar todavía)

5. 🟠 **Medio — hash bcrypt de una cuenta admin real commiteado en `backend/migrations/028_auth_usuarios.sql`.** El hash (12 rounds) sigue en el historial de git, permanentemente, aunque la contraseña se rote en la base de datos. Un hash bcrypt de 12 rounds es costoso de crackear por fuerza bruta, pero si la contraseña original era débil o reutilizada en otro sitio, queda expuesta indefinidamente vía el propio repositorio. **Recomendación (ya identificada en la auditoría externa del 2026-08-03, aún sin ejecutar):** rotar esa contraseña específica en producción. Rotarla no borra el hash viejo del historial de git, pero invalida su utilidad práctica.
6. 🟡 **Bajo — el contenedor del backend corre como root.** `backend/Dockerfile` no define un `USER` no privilegiado — el proceso Node corre como root dentro del contenedor. Mitigado parcialmente por ser un contenedor Docker aislado (no acceso directo al host), pero es una capa de defensa en profundidad ausente frente a un RCE dentro del proceso Node.
7. 🟡 **Bajo — `incrementarTokenVersion` no es atómico.** `backend/src/repositories/usuarios.repository.js` hace _read-then-write_ (`findById` → `update({ token_version: usuario.token_version + 1 })`) en vez de un incremento atómico en SQL. Bajo concurrencia (dos requests de logout/cambio de password casi simultáneos para el mismo usuario) podría perderse un incremento, dejando una sesión revocada sin invalidar por una versión. Impacto bajo — ventana de carrera muy estrecha y el peor caso es que un token viejo siga siendo válido un poco más de lo esperado, no una escalada de privilegios.
8. ℹ️ **Informativo (nuevo) — versión de Node inconsistente entre `engines` y el Dockerfile.** `backend/package.json` declara `"engines": { "node": ">=24.0.0" }` (agregado 2026-08-03 como parte del hardening de issue #87), pero `backend/Dockerfile` sigue construyendo `FROM node:22-slim`. El contenedor de producción real corre Node 22 pese a que el `package.json` exige 24+. No es una vulnerabilidad en sí, pero es una inconsistencia que vale la pena reconciliar (actualizar el Dockerfile a `node:24-slim`, o relajar el `engines` si 22 sigue siendo el objetivo real).
9. ℹ️ **Informativo (nuevo) — errores de validación Zod sin mapear a 400 en `calcularPreview`/`crearCotizacion`.** `services/cotizacion.service.js:319` llama `schema.parse(body)` directo (no `safeParse` + `httpError`); un `ZodError` no tiene `.status`, así que el _error handler_ global de `app.js` lo responde como `500 Error interno del servidor` en vez de `400`. No es una vulnerabilidad — el request sigue siendo rechazado correctamente — pero ensucia logs de error de servidor con lo que en realidad son errores de validación de cliente, dificultando distinguir fallos reales de inputs inválidos en monitoreo.

---

## 6. Metodología

Auditoría automatizada, revisión estática completa (no incremental) sobre `main`, HEAD `27345b4`:

- Barrido de secretos por patrón regex sobre el árbol trackeado completo + historial de archivos `.env*` en todo `git log --all`.
- `npm audit` + `npm outdated` en el workspace raíz y en `backend/`.
- Lectura directa de: `app.js`, `middleware/auth.js`, `middleware/csrf.js`, `middleware/rate-limit.js`, `services/auth.service.js`, `utils/cookies.js`, `repositories/usuarios.repository.js`, todas las rutas (`routes/*.js`) y su _gating_ de rol/permiso, `cotizacion.service.js` (control de acceso IDOR), templates de PDF (`templates/oferta/*.js`, escapado XSS), `Dockerfile`, `docker-compose.yml`, workflows de `.github/workflows/`.
- Grep dirigido para: SQL crudo/`eval`/`exec` (inyección), `innerHTML` (XSS frontend), `fetch`/`axios` salientes (SSRF), cobertura de validación Zod en controllers.
- No se ejecutaron pruebas dinámicas (DAST) ni pentesting activo contra ambientes desplegados — es una revisión estática de código fuente e infraestructura como código.

**No se creó Issue en GitHub:** ningún hallazgo alcanza severidad crítica ni es explotable de forma directa contra la aplicación en producción. El único ítem "alto" de `npm audit` es una dependencia transitiva de desarrollo sin ruta de explotación real. Los ítems 5-9 ya estaban identificados internamente (CLAUDE.md, auditoría externa del 2026-08-03) como pendientes — se documentan acá por trazabilidad, no como hallazgos nuevos que requieran escalar.
