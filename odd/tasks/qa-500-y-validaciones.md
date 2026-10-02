# qa-500-y-validaciones — Arreglar los 500 y validaciones flojas del QA adversarial de TEST

## Objetivo

Que entradas inválidas o maliciosas a la API devuelvan 4xx con un mensaje claro, nunca 500, y que no se filtren códigos internos de Postgres.

## Problema

El QA adversarial contra `test-api` (main `94ce809`, 2026-10-01/02) encontró estos fallos. Detalle en Engram, topics `qa/test-adversarial/2026-10-01-bloques-1-3` y `qa/test-adversarial/2026-10-01`.

- `GET /cotizaciones/:id` con id no numérico responde 500 (`22P02`).
- `POST /cotizaciones/:id/aceptar` y `GET /cotizaciones/:id/pdf-propuesta` son stubs que lanzan `Error` (siempre 500); la Propuesta Formal vive en `/propuestas`.
- ~~`POST` autenticado con `Origin` ajeno responde 500~~ — falso positivo del QA: el body era `{}` y el 500 era el de `plan_id`; CORS no se toca.
- `plan_id` inexistente, negativo, decimal, `null`, ausente o gigante responde 500 en calcular, crear y editar (`validarYResolverContexto` busca el plan antes de validar con Zod). Body array y body de 2 MB también.
- Byte nulo (`\u0000`) en cualquier string responde 500 (`22P05`), en cotizaciones y propuestas.
- Strings sin límite de largo: `cliente_nombre` de 1 MB en `POST /cotizaciones` responde 500 (`22001`); `direccion` de 200 KB hace tardar 22 s al PDF.
- `PUT /propuestas/:id` con un JSON extra de 1 MB responde 500 (`23514`, check de la DB); body de 5 MB responde 413 con el texto "Error interno del servidor"; body `null` o string responde 400 con ese mismo texto.
- `fecha_nacimiento` futura (`2999-01-01`) se acepta.

## Alcance autorizado

- Cambios en `backend/` (rutas, controllers, services, schemas, middleware) y su frontend solo si algo llama a las rutas eliminadas.
- Rama `fix/qa-500-y-validaciones`, commits convencionales en español, PR (nunca push directo a `main`). Borrar la rama tras el merge.
- No tocar TEST ni PROD. No desplegar.

## Fuera de alcance (necesitan decisión de Kevin)

- Tope de `suma_asegurada` en coberturas adicionales (1e308 da prima 8e305; 9e9 se acepta).
- Numeración de cotizaciones que salta de 2 en 2.
- Si `GET /propuestas` debe mostrar propuestas de otros clientes a un agente.
- Quitar `codigo` (código de Postgres) de las respuestas 500.

## Restricciones

- TDD: habilitado — fuente: instrucciones globales del usuario (`Strict TDD Mode: enabled`); runner: `npm test --workspace=backend` (`node --experimental-test-module-mocks --test src/**/*.test.js`). Un test por comportamiento, RED observado antes de implementar.
- Heurística de ~400 líneas cambiadas por tarea: solo planificación, no es un tope.
- Mensajes de error al usuario en español, como el resto de la API. Código y comentarios siguen el estilo del archivo que se toca.

## Checklist

- [x] T-01 `:id` no numérico en `/cotizaciones/:id` (obtener, actualizar, pdf-oferta) responde 400 usando `cotizacionIdParamsSchema`
- [x] T-02 Eliminar rutas, controller y stubs de `aceptar` y `pdf-propuesta` de cotizaciones (y cualquier referencia muerta)
- [x] T-03 ~~CORS 403~~ descartada: no era un bug (ver Problema); se revirtió el cambio de `app.js`
- [x] T-04 `plan_id` inválido o inexistente en calcular, crear y editar responde 400/404, nunca 500; body no objeto responde 400
- [x] T-05 Rechazar byte nulo en strings del body JSON con 400 (cotizaciones y propuestas)
- [x] T-06 Límites de largo en strings de cotizaciones (nombre, contacto, dirección, cédula, ciudad, rubro, descripción de ajustes) en todos los schemas de ramo
- [x] T-07 Propuestas: tope de tamaño del `draft_json` con 400 claro; `fecha_nacimiento` no futura
- [x] T-08 Mensajes correctos para body demasiado grande (413) y JSON inválido o no objeto (400)
- [x] T-09 Verificación completa (`npm test`, lint) y registro en `docs/ESTADO_PROYECTO.md`; abrir PR

## Criterios de aceptación

Cada caso del QA que dio 500 devuelve 4xx con mensaje en español y sin código de Postgres; los tests nuevos fallan sin el fix y pasan con él; la suite del backend sigue en verde.

## Progreso

- 2026-10-02: documento creado; rama creada desde `main`. Espejo en Engram pendiente (el servidor de Engram está desconectado en esta sesión).
- 2026-10-02 T-01: RED 13 fallos (controller pasaba el id crudo), GREEN 29/29 con el test de ownership. T-02: RED en cotizaciones.routes.test.js (rutas registradas); el borrado del controller se hizo junto con T-01, GREEN 1/1. T-03/T-08: RED 5 fallos en app.http.test.js (400 sin 403; 413/400 con texto genérico), GREEN 9/9. T-04: RED 15 fallos en cotizacion-context.service.test.js, GREEN 17/17. T-05: RED (módulo inexistente + test HTTP), GREEN 14/14. T-06: RED 22 fallos, GREEN 31/31. T-07: RED 3 fallos, GREEN 20/20. T-09: sección 108 de ESTADO_PROYECTO.md; suite backend completa en verde, eslint y prettier limpios. Commit/PR a cargo del orquestador.

## Próximo paso

Delegar un writer para T-01 a T-09.
