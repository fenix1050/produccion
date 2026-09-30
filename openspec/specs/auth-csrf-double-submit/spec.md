# Delta for Auth Csrf Double Submit

## ADDED Requirements

### Requirement: Emisión del token CSRF en el login

Al autenticar exitosamente, el sistema MUST emitir `tajy_csrf_v2` (o el nombre base configurado con sufijo `_v2`) junto a la sesión. La cookie CSRF MUST ser host-only (sin `Domain`), `HttpOnly`, `SameSite=Lax`, y compartir los 45 minutos de expiración de la sesión. El token MUST generarse una vez por sesión. `GET /auth/me` MUST devolver el valor de la cookie CSRF versionada en su JSON autenticado; el frontend MUST conservarlo solo en memoria junto al usuario.

#### Scenario: Login emite ambas cookies

- GIVEN credenciales válidas
- WHEN el cliente hace `POST /auth/login`
- THEN la respuesta MUST incluir dos cookies (`tajy_session_v2` y `tajy_csrf_v2`, o sus nombres base configurados con sufijo `_v2`), ambas `HttpOnly` y sin atributo `Domain`
- AND ambas cookies MUST tener el mismo tiempo de vida

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

`frontend/shared/api.js` MUST obtener el token CSRF junto al usuario desde `GET /auth/me`, conservar ambos en memoria y adjuntar el token cacheado como header `X-CSRF-Token` en toda request `POST`, `PUT`, `PATCH` o `DELETE` emitida por el wrapper compartido. El cliente MUST NOT leer `document.cookie` para obtener el token.

#### Scenario: El wrapper de fetch agrega el header automáticamente

- GIVEN `GET /auth/me` devolvió un usuario autenticado y el token correspondiente a su cookie CSRF
- WHEN cualquier módulo del frontend invoca el wrapper compartido para un método mutante
- THEN la request saliente MUST incluir `X-CSRF-Token` con el valor cacheado en memoria

### Requirement: Ignorar y expirar cookies CSRF legacy

El sistema MUST NOT autenticar ni validar CSRF a partir de las cookies legacy (`COOKIE_CSRF_NAME` o el nombre default `tajy_csrf`). Si una request transporta ese nombre, el sistema MUST emitir una expiración para él con `Domain=.cotizador.lat`; este es el único uso permitido de `Domain`. La cookie nueva versionada MUST seguir validándose mediante double-submit con su propio header.

#### Scenario: El valor CSRF legacy no sustituye la cookie versionada

- GIVEN la cookie legacy CSRF y un header con el mismo valor, pero sin la cookie `tajy_csrf_v2`
- WHEN el cliente envía una request mutante
- THEN el sistema MUST responder 403 y expirar la cookie legacy con `Domain=.cotizador.lat`

### Requirement: Logout limpia la cookie CSRF

`logout()` MUST limpiar la cookie CSRF con `res.clearCookie` usando los mismos atributos host-only con los que fue seteada, en la misma respuesta en que limpia la cookie de sesión. La cookie CSRF MUST ser `HttpOnly`.

#### Scenario: Logout limpia ambas cookies

- GIVEN un usuario con sesión activa
- WHEN hace `POST /auth/logout`
- THEN la respuesta MUST incluir `Set-Cookie` de limpieza tanto para la cookie de sesión como para la cookie CSRF

## Non-Goals

- No se rota el token CSRF por request — un token por sesión, confirmado explícitamente por decisión de negocio.
- No se protegen requests `GET`/`HEAD` con CSRF (no mutan estado).
- No se implementa CSRF basado en tokens sincronizador de servidor (patrón alternativo) — se usa exclusivamente double-submit.
- No se agrega período de transición: el middleware aplica a todas las rutas mutantes desde el mismo cambio, sin modo "solo advertencia".
