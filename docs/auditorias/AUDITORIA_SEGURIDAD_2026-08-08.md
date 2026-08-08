# Auditoría de seguridad — Cotizador Aseguradora Tajy

**Fecha:** 2026-08-08
**Alcance:** repositorio completo `fenix1050/produccion` (rama `main`, HEAD `77b29a2`)
**Tipo:** revisión automatizada programada — OWASP Top 10 (2021), secretos expuestos, dependencias, prácticas de autenticación
**Resultado general:** ✅ Sin hallazgos críticos ni altos explotables. No se creó Issue en GitHub. 0 hallazgos previos cerrados desde la última auditoría (2026-08-07); todos siguen abiertos (medio/bajo/info, ya trackeados). 4 hallazgos nuevos, todos bajo/informativo.

---

## 1. Resumen ejecutivo

Corrida de 1 día después de la última auditoría automatizada completa (`docs/auditorias/AUDITORIA_SEGURIDAD_2026-08-07.md`, HEAD `27345b4`). Entre esa fecha y hoy se mergearon 8 PRs de producto (paneles de cotización, MRC, admin — ver `CLAUDE.md`), ninguno de superficie de seguridad. Se repitió el barrido completo (no incremental) en 4 frentes en paralelo:

1. OWASP Top 10 sobre rutas, controllers, middlewares, repositories, schemas Zod, generación de PDF (Puppeteer) y frontend.
2. Secretos expuestos en working tree + historial completo de git.
3. `npm audit`/versiones de dependencias en el workspace raíz y `backend/`.
4. Prácticas de autenticación/sesión de punta a punta.

| Categoría                                 | Resultado                                                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Secretos expuestos (repo + historial git) | Sin hallazgos nuevos.                                                                                                                          |
| Inyección (SQL/comando)                   | 1 hallazgo bajo nuevo, no explotable hoy (interpolación de string en filtro PostgREST, ver §2).                                              |
| XSS                                       | Sin hallazgos — templates de PDF y frontend escapan datos de usuario consistentemente.                                                        |
| Control de acceso (IDOR)                  | Sin hallazgos — `verificarPropiedad()` y gates de rol/permiso confirmados en las rutas revisadas.                                             |
| CSRF / sesión                             | Sin hallazgos — cookie httpOnly + CSRF doble-submit, comparación timing-safe, sin regresión.                                                  |
| Dependencias (`npm audit`)                | 1 alta (`js-yaml`), dev-only, no explotable. Además, 3 paquetes de producción un major detrás de la última versión (sin CVE), ver §3.         |
| SSRF                                      | Sin hallazgos nuevos.                                                                                                                          |
| Autenticación                             | Sólida: bcrypt (12 rounds), timing-safe login, revocación server-side (`token_version`), JWT con `algorithms` explícito.                     |
| Infraestructura (Docker/CI)               | Confirmado sin cambios: contenedor root, Puppeteer con `--no-sandbox`, mismatch Node 22 (Dockerfile) vs. `engines >=24` (package.json).       |
| Hallazgos previos                         | 0 cerrados desde 2026-08-07. Los 5 abiertos siguen abiertos (§5.1). 4 hallazgos nuevos, todos bajo/informativo (§5.2).                        |

---

## 2. OWASP Top 10 — hallazgos de esta corrida

**Bajo — `backend/src/repositories/coberturas.repository.js:129`** (A03 Injection)
`.or(\`plan_id.is.null,plan_id.eq.${planId}\`)` interpola `planId` directo en un filtro PostgREST en vez de usar dos `.eq()` encadenados o `.in()`. Hoy `planId` siempre viene de `plan.id` (un entero ya resuelto desde la base, único caller confirmado en `cotizacion.service.js:369`), así que **no es explotable en el flujo actual**. Queda documentado porque es una práctica de codificación riesgosa: si en el futuro se reutiliza esta función con un `planId` derivado más directamente de input de usuario, un valor como `1);algo.eq.(1` podría alterar la sintaxis del filtro PostgREST. Recomendación: reemplazar por dos `.eq()`/`.in()` parametrizados.

**Bajo — `backend/src/templates/oferta/pdf-utils.js:13`** (A05 Security Misconfiguration)
`puppeteer.launch({ headless: true, args: ['--no-sandbox'] })` desactiva la sandbox de Chromium (capa de defensa en profundidad frente a un bug del motor de renderizado). El HTML que se le pasa está bien escapado (`escapeHtml`, usado consistentemente para todo campo de usuario) y es autocontenido, así que hoy no hay vector directo de XSS→RCE. El riesgo se combina con el hallazgo ya conocido de que el contenedor corre como root (§5.1, ítem 6) — ninguno es explotable por sí solo hoy, pero juntos reducen la defensa en profundidad frente a un eventual 0-day de Chromium.

**Info / sospecha a confirmar — `backend/src/utils/cookies.js:28`** (A05, alcance de cookie)
`domain: '.cotizador.lat'` en producción hace que `tajy_session`/`tajy_csrf` sean válidas para cualquier subdominio de `cotizador.lat` (incluye `api.cotizador.lat`). La cookie de sesión es httpOnly (no legible por JS de ningún subdominio), pero `tajy_csrf` sí es legible por JS en cualquier subdominio del dominio raíz. No verificado que exista hoy un subdominio de menor confianza — se marca como sospecha a confirmar, no como hallazgo activo.

**Bajo/Info — política de contraseñas mínima** (`backend/src/schemas/auth.schema.js:12`, `admin.schema.js:9,27`)
Único requisito es `min(8)`, sin exigencia de complejidad ni verificación contra contraseñas filtradas. Aceptable bajo NIST 800-63B (longitud por sobre complejidad forzada) y mitigado por bcrypt cost=12 + rate limiting de login — no es explotable por sí solo, pero para un sistema que maneja datos KYC/PLA-FT valdría la pena subir el mínimo a 10-12 caracteres.

**Confirmado sin cambios (no son hallazgos nuevos):** control de acceso IDOR (`verificarPropiedad` en `cotizaciones.controller.js`), gates de rol/permiso en todas las rutas admin sensibles, CORS con origin explícito + `credentials:true` (nunca wildcard), `helmet()`, `trust proxy` a 1 salto, validación Zod en el 100% de endpoints mutantes revisados, importador de Excel con límite de 10MB + validación de extensión/mimetype.

---

## 3. Secretos expuestos

**Sin hallazgos nuevos.**

- Grep de patrones (claves AWS, `sk-...`, claves privadas PEM, JWT en texto plano, `password=`/`secret=`/`token=` con valores literales) sobre el árbol trackeado completo: sin coincidencias reales.
- `git log --all --diff-filter=A -- '*.env*' '*.pem' '*.key' 'credentials*'` sobre todo el historial: el único archivo agregado alguna vez es `backend/.env.example` (placeholders, commit `da60628`).
- `.gitignore` cubre `.env`, `.env.local`, `.env.*.local`, `node_modules/`.
- `backend/src/config/supabase.js` lee `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` solo desde `process.env`, sin fallback hardcodeado (falla explícito si faltan).
- Workflows de `.github/workflows/*.yml`: todos los valores sensibles usan `secrets.*` de GitHub Actions correctamente.
- Sin `console.log`/`error`/`warn` que impriman `process.env.*`.

**Recordatorio ya conocido (no es hallazgo nuevo):** `backend/migrations/028_auth_usuarios.sql` sigue conteniendo un hash bcrypt real de una cuenta admin — ver §5.1 ítem 5.

---

## 4. Dependencias desactualizadas / vulnerables

`npm audit` sobre el workspace raíz y `backend/`:

```
js-yaml  4.0.0 - 4.3.0
Severity: high
JS-YAML: Quadratic CPU consumption in !!omap resolution — CVE-2026-59870
1 high severity vulnerability
```

- **Contexto:** dependencia transitiva de `eslint`/`cosmiconfig` (`devDependencies` del workspace raíz) — no forma parte del árbol de producción de `backend/`, no se ejecuta en runtime, y la aplicación no parsea YAML de ningún input de usuario. **Severidad real: baja/informativa.** `npm audit fix` no la resuelve sin un bump mayor de `eslint` — evaluar sin urgencia.

**Versiones de producción — instalado vs. última en npm** (sin CVE reportada en ninguno, `npm audit` limpio para el árbol de producción):

| Paquete       | Instalado | Última | Nota                                                             |
| ------------- | --------- | ------ | ----------------------------------------------------------------- |
| `express`     | 4.22.2    | 5.2.1  | Un major detrás. Migrar a v5 requiere sesión dedicada (breaking changes de middleware/routing) — no urgente, sin CVE activa en 4.x. |
| `zod`         | 3.25.76   | 4.4.3  | Un major detrás. v4 cambia la API de todos los schemas por ramo — no actualizar sin sesión dedicada. |
| `puppeteer`   | 24.43.1   | 25.5.0 | Un major detrás, sin CVE. Requiere probar en CI (bump del Chromium empaquetado). |

Resto de dependencias de producción (`jsonwebtoken`, `bcryptjs`, `@supabase/supabase-js`, `helmet`, `cors`, `cookie-parser`, `multer`, `exceljs`, `dotenv`, `compression`, `express-rate-limit`) al día o con diferencia solo de patch/minor, sin vulnerabilidad conocida.

**Nota de reconciliación:** la auditoría del 2026-08-07 no había señalado estos 3 majors — se documentan hoy por completitud (`npm view <pkg> version` contra el lockfile real), no representan una regresión ni tienen explotación conocida.

---

## 5. Hallazgos abiertos y cerrados

### 5.1 Siguen abiertos (sin cambios desde 2026-08-07)

1. 🟡 **Bajo — sin cabeceras CSP/`X-Frame-Options` en el frontend estático.** `frontend/vercel.json` solo define `Cache-Control`. No re-verificado línea por línea en esta corrida; se asume sin cambios salvo indicación contraria.
2. 🟡 **Bajo — `aceptar`/`pdfPropuesta` de Fase 4 (KYC) siguen sin recibir `req.usuario`.** Stubs sin lógica real todavía — riesgo de IDOR solo si Fase 4 se implementa sin agregar `verificarPropiedad()`. No re-verificado esta corrida (Fase 4 no fue tocada desde la última auditoría).
3. 🟠 **Medio — hash bcrypt de una cuenta admin real commiteado en `backend/migrations/028_auth_usuarios.sql`.** Confirmado presente hoy (§3). Recomendación sin ejecutar: rotar esa contraseña específica en producción.
4. 🟡 **Bajo — el contenedor del backend corre como root.** `backend/Dockerfile` confirmado hoy sin directiva `USER` — combinado con el hallazgo nuevo de `--no-sandbox` en Puppeteer (§2), reduce la defensa en profundidad frente a un RCE dentro del proceso Node/Chromium.
5. 🟡 **Bajo — `incrementarTokenVersion` no es atómico.** `backend/src/repositories/usuarios.repository.js` sigue con read-then-write (`findById` → `update`) en vez de un incremento atómico vía RPC (mismo patrón ya usado en `crear_cotizacion_atomica`). Confirmado hoy con escenario de explotación concreto: bajo incrementos concurrentes sobre la misma base, se puede "perder" un evento de invalidación, dejando una sesión recién emitida sobrevivir unos milisegundos más a una intención de revocación concurrente. Ventana angosta, impacto bajo.
6. ℹ️ **Informativo — versión de Node inconsistente entre `engines` y el Dockerfile.** Confirmado hoy: `backend/package.json` exige `>=24.0.0`, `backend/Dockerfile` sigue en `FROM node:22-slim`. El contenedor de producción real corre Node 22.
7. ℹ️ **Informativo — errores de validación Zod sin mapear a 400** en algunos flujos de `admin.controller.js`/`cotizacion.service.js`. Confirmado sin cambios — no es una vulnerabilidad, ensucia logs de error de servidor.

### 5.2 Nuevos en esta corrida

8. 🟡 **Bajo — interpolación de string en filtro PostgREST** (`coberturas.repository.js:129`). Ver §2. No explotable hoy.
9. 🟡 **Bajo — Puppeteer con `--no-sandbox`** (`pdf-utils.js:13`). Ver §2.
10. ℹ️ **Informativo — alcance de cookie `tajy_csrf` a todo `*.cotizador.lat`** (`cookies.js:28`). Ver §2, sospecha a confirmar.
11. ℹ️ **Informativo — política de contraseñas solo exige longitud mínima de 8.** Ver §2.

### 5.3 Cerrados desde la última auditoría

Ninguno — no se detectó que se haya resuelto código de ninguno de los hallazgos de 2026-08-07 en el rango de commits revisado (ninguno de los 8 PRs mergeados desde entonces tocó superficie de seguridad).

---

## 6. Metodología

Auditoría automatizada, revisión estática completa (no incremental) sobre `main`, HEAD `77b29a2`, en 4 sub-revisiones en paralelo:

- Barrido de secretos por patrón regex sobre el árbol trackeado completo + `git log --all --diff-filter=A` sobre archivos `.env*`/`.pem`/`.key`/`credentials*`.
- `npm audit` + comparación de versión instalada vs. última (`npm view`) en el workspace raíz y en `backend/`.
- Lectura directa de: rutas/controllers/middlewares/repositories/schemas del backend, `middleware/auth.js`, `middleware/csrf.js`, `middleware/rate-limit.js`, `services/auth.service.js`, `utils/cookies.js`, `repositories/usuarios.repository.js`, templates de PDF (`templates/oferta/*.js`), `Dockerfile`, `docker-compose.yml`.
- Grep dirigido para: SQL crudo/`eval`/`exec` (inyección), `innerHTML` (XSS frontend), interpolación de input de usuario en filtros de Supabase/PostgREST, cobertura de validación Zod en controllers.
- No se ejecutaron pruebas dinámicas (DAST) ni pentesting activo contra ambientes desplegados — es una revisión estática de código fuente e infraestructura como código.

**No se creó Issue en GitHub:** ningún hallazgo alcanza severidad crítica ni tiene una ruta de explotación directa confirmada contra la aplicación en producción. El único ítem "alto" de `npm audit` es una dependencia transitiva de desarrollo sin ruta de explotación real. Los hallazgos medio/bajo/info ya estaban identificados (mayoría) o son de bajo impacto y quedan documentados para trazabilidad y seguimiento en próximas corridas, sin requerir escalar.
