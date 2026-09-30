# Delta for Auth Sesion Cookie

## ADDED Requirements

### Requirement: Emisión de la sesión como cookie httpOnly en el login

Al autenticar exitosamente, el sistema MUST emitir el JWT exclusivamente como cookie `HttpOnly`, `SameSite=Lax`, host-only (sin `Domain`) y con los 45 minutos actuales de expiración. El nombre nuevo MUST ser el nombre base configurado (`COOKIE_SESSION_NAME`) o `tajy_session`, con sufijo `_v2`. El body de `POST /auth/login` MUST NOT incluir el JWT. El sistema MUST NOT aceptar `Authorization: Bearer`.

#### Scenario: Login exitoso setea la cookie de sesión sin exponer el token en el body

- GIVEN credenciales válidas de un usuario activo
- WHEN el cliente hace `POST /auth/login`
- THEN la respuesta MUST incluir `tajy_session_v2` (o el nombre base configurado con sufijo `_v2`) como cookie `HttpOnly`, `SameSite=Lax`, sin `Domain`
- AND el body JSON de la respuesta MUST NOT contener un campo con el JWT
- AND `document.cookie` en el navegador MUST NOT exponer el valor de esa cookie

#### Scenario: Request autenticado sin cookie de sesión es rechazado

- GIVEN un endpoint que requiere autenticación
- WHEN el cliente hace la request sin la cookie de sesión
- THEN el sistema MUST responder 401

#### Scenario: Un Bearer token válido sin cookie ya no es aceptado

- GIVEN un JWT válido y no expirado obtenido de una sesión previa
- WHEN el cliente lo envía como header `Authorization: Bearer <token>` sin la cookie de sesión
- THEN el sistema MUST responder 401 (el middleware ya no lee el header `Authorization`)

### Requirement: Transición desde las cookies legacy compartidas

Las cookies legacy usan el nombre base previo (`COOKIE_SESSION_NAME` o `tajy_session`) sin sufijo `_v2`. El backend MUST NOT leerlas como credenciales: solo la cookie versionada autentica. Cuando una request transporta cookies legacy, el backend MUST emitir expiración para cada nombre legacy recibido, apuntando a `Domain=.cotizador.lat` y `Path=/`. `Domain` MUST NOT aparecer en ninguna cookie nueva ni en la limpieza de cookies versionadas. Como la primera request puede transportar valores legacy pero estos se ignoran, las sesiones activas requieren autenticación de nuevo.

#### Scenario: Una request con solo la cookie legacy se rechaza y la expira

- GIVEN una cookie `tajy_session` válida para el flujo anterior y ninguna cookie `tajy_session_v2`
- WHEN el cliente solicita un recurso autenticado
- THEN el backend MUST responder 401, sin buscar ni aceptar el token legacy
- AND MUST expirar la cookie legacy con `Domain=.cotizador.lat`

#### Scenario: Login sin sesión también limpia cookies legacy recibidas

- GIVEN un request no autenticado a `POST /auth/login` que transporta cookies legacy
- WHEN el request atraviesa el API
- THEN el backend MUST emitir expiración para cada cookie legacy recibida y emitir nuevas cookies versionadas sin `Domain`

### Requirement: Verificación del JWT con algoritmo explícito

`middleware/auth.js` MUST invocar `jwt.verify()` con la opción `algorithms: ['HS256']` explícita, en vez de dejar que la librería infiera el algoritmo del token.

#### Scenario: Token firmado con un algoritmo distinto es rechazado

- GIVEN un JWT válido en estructura pero firmado con un algoritmo distinto de `HS256`
- WHEN se intenta validar en `middleware/auth.js`
- THEN la validación MUST fallar y el sistema MUST responder 401

### Requirement: Endpoint de identidad `GET /auth/me`

El sistema MUST exponer `GET /auth/me`, que MUST leer la sesión desde la cookie `HttpOnly` y devolver los datos del usuario autenticado (al menos: rol y permisos) junto al token de la cookie CSRF. El frontend MUST cachear usuario y token CSRF juntos en memoria para que `auth.tieneAccesoAdmin()`/`auth.isLoggedIn()` sigan síncronos, sin leer `localStorage` ni `document.cookie`.

#### Scenario: Auth/me con cookie de sesión válida

- GIVEN una cookie de sesión válida correspondiente a un usuario activo con `token_version` vigente
- WHEN el cliente hace `GET /auth/me`
- THEN el sistema MUST responder 200 con el rol, permisos y `csrfToken` correspondiente a la cookie CSRF del usuario

#### Scenario: Auth/me sin cookie o con cookie inválida

- GIVEN una request sin cookie de sesión, o con una cookie cuyo JWT es inválido/expirado, o cuyo `token_version` no coincide con el vigente del usuario
- WHEN el cliente hace `GET /auth/me`
- THEN el sistema MUST responder 401

### Requirement: Logout limpia la sesión server-side

`logout()` MUST invocar `incrementarTokenVersion` (comportamiento existente, sin cambios) y MUST limpiar la cookie de sesión con `res.clearCookie` usando exactamente los mismos atributos (`HttpOnly`, `Secure`, `SameSite`, `Path`) con los que fue seteada. La cookie MUST ser host-only (sin `Domain`).

#### Scenario: Logout invalida la sesión y limpia la cookie

- GIVEN un usuario con sesión activa
- WHEN hace `POST /auth/logout`
- THEN el sistema MUST incrementar `token_version` del usuario
- AND la respuesta MUST incluir un `Set-Cookie` que expira/limpia la cookie de sesión
- AND una request posterior con la cookie previa (ya limpiada por el navegador, o reenviada manualmente) MUST responder 401

### Requirement: CORS con credenciales explícitas, nunca wildcard

El sistema MUST configurar CORS con `credentials: true` y un `origin` explícito igual a `FRONTEND_URL` (o lista explícita de orígenes permitidos). El sistema MUST NOT usar `origin: '*'` en conjunto con `credentials: true`.

#### Scenario: Origen permitido puede enviar y recibir cookies

- GIVEN una request desde `FRONTEND_URL` configurado
- WHEN el cliente hace fetch con `credentials: 'include'`
- THEN el navegador MUST poder enviar la cookie de sesión y recibir `Set-Cookie` en la respuesta

#### Scenario: Configuración de CORS nunca combina wildcard con credenciales

- GIVEN la configuración de CORS del backend
- WHEN se define `credentials: true`
- THEN `origin` MUST NOT ser `'*'` en ninguna rama de configuración (dev, prod)

## Non-Goals

- No se modifica el mecanismo `token_version`/invalidación de sesión existente — sigue exactamente igual, solo cambia el transporte del token.
- No se agregan refresh tokens, sesión persistente ni "recordarme".
- No se cambia la duración de sesión (permanece en 45 minutos).
- No se resuelven otros hallazgos Bajos/Info de la auditoría (Dockerfile sin `USER` no-root, `incrementarTokenVersion` no atómico, errores Zod sin mapear a 400, rotación del hash de admin de la migración 028) salvo `algorithms: ['HS256']`, ya incluido arriba.
- No hay período de transición con doble soporte de header `Authorization` y cookie.
