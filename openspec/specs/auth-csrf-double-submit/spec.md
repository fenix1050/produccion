# Delta for Auth Csrf Double Submit

## ADDED Requirements

### Requirement: Emisión del token CSRF en el login

Al autenticar exitosamente, el sistema MUST emitir, junto con la cookie de sesión, una cookie CSRF separada, legible por JavaScript (NO `httpOnly`), `Secure`, `SameSite=Lax`, `Domain=.cotizador.lat`, con el mismo tiempo de vida que la sesión (45 minutos). El token CSRF MUST generarse una única vez por sesión (no rota por request).

#### Scenario: Login emite ambas cookies

- GIVEN credenciales válidas
- WHEN el cliente hace `POST /auth/login`
- THEN la respuesta MUST incluir dos cookies: la de sesión (`httpOnly`) y la de CSRF (no `httpOnly`, legible por `document.cookie`)
- AND ambas cookies MUST compartir el mismo `Domain` y expiración

### Requirement: Validación double-submit en métodos mutantes

El sistema MUST validar, mediante un middleware global (no opt-in por ruta), que toda request `POST`, `PUT`, `PATCH` o `DELETE` incluya un header `X-CSRF-Token` cuyo valor coincida con el valor de la cookie CSRF vigente de esa sesión. El middleware MUST cubrir todas las rutas mutantes de la API sin requerir registro individual por ruta.

#### Scenario: Request mutante sin header CSRF es rechazada

- GIVEN una cookie de sesión válida
- WHEN el cliente hace `POST`, `PUT`, `PATCH` o `DELETE` sin el header `X-CSRF-Token`
- THEN el sistema MUST responder 403

#### Scenario: Request mutante con header CSRF que no matchea la cookie es rechazada

- GIVEN una cookie de sesión válida y una cookie CSRF con valor `A`
- WHEN el cliente hace una request mutante con header `X-CSRF-Token: B` (distinto de `A`)
- THEN el sistema MUST responder 403

#### Scenario: Request mutante con header CSRF correcto pasa

- GIVEN una cookie de sesión válida y una cookie CSRF con valor `A`
- WHEN el cliente hace una request mutante con header `X-CSRF-Token: A`
- THEN el sistema MUST procesar la request normalmente (sin bloqueo por CSRF)

#### Scenario: Requests de solo lectura no requieren el header CSRF

- GIVEN una cookie de sesión válida
- WHEN el cliente hace `GET` o `HEAD`
- THEN el sistema MUST NOT exigir el header `X-CSRF-Token`

### Requirement: El frontend adjunta el header CSRF en toda mutación

`frontend/shared/api.js` MUST leer el valor de la cookie CSRF y MUST adjuntarlo como header `X-CSRF-Token` en toda request `POST`, `PUT`, `PATCH` o `DELETE` emitida por el wrapper de fetch compartido.

#### Scenario: El wrapper de fetch agrega el header automáticamente

- GIVEN una sesión de usuario activa con la cookie CSRF seteada
- WHEN cualquier módulo del frontend invoca el wrapper compartido para un método mutante
- THEN la request saliente MUST incluir `X-CSRF-Token` con el valor exacto de la cookie CSRF vigente

### Requirement: Logout limpia la cookie CSRF

`logout()` MUST limpiar la cookie CSRF con `res.clearCookie` usando los mismos atributos con los que fue seteada, en la misma respuesta en que limpia la cookie de sesión.

#### Scenario: Logout limpia ambas cookies

- GIVEN un usuario con sesión activa
- WHEN hace `POST /auth/logout`
- THEN la respuesta MUST incluir `Set-Cookie` de limpieza tanto para la cookie de sesión como para la cookie CSRF

## Non-Goals

- No se rota el token CSRF por request — un token por sesión, confirmado explícitamente por decisión de negocio.
- No se protegen requests `GET`/`HEAD` con CSRF (no mutan estado).
- No se implementa CSRF basado en tokens sincronizador de servidor (patrón alternativo) — se usa exclusivamente double-submit.
- No se agrega período de transición: el middleware aplica a todas las rutas mutantes desde el mismo cambio, sin modo "solo advertencia".
