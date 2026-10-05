# ui-filtro-y-mensajes-error — Filtro literal del historial y mensajes de error claros

## Objetivo

Que el filtro de cliente del historial busque texto literal, y que los errores de validación y de red le digan al usuario qué pasó y qué hacer, sin mensajes técnicos crudos.

## Problema

Hallazgos del QA de UI contra TEST (2026-10-05), bloque 5:

- En `/historial/`, escribir `%` o `_` en el filtro de cliente devuelve todas las filas: `cotizaciones.repository.js:87` hace `ilike('cliente_nombre', \`%${cliente}%\`)` sin escapar los comodines.
- Una dirección de 100 emojis o un nombre de más de 200 caracteres muestra "Datos de entrada inválidos" sin decir qué campo ni cuál es el límite (la API sí devuelve `detalles` con campo y mensaje; el frontend los descarta).
- Offline se muestra "Failed to fetch" y ante un 500 el texto crudo del servidor.

## Alcance autorizado

- Backend: escapar `%`, `_` y `\` en el filtro de cliente; mensajes de límite de largo en español y con el nombre legible del campo.
- Frontend: `frontend/shared/api.js` y donde se muestren los errores del cotizador y del historial.
- Rama `fix/ui-filtro-y-mensajes-error`, commits convencionales en español, PR (nunca push directo a `main`). Borrar la rama tras el merge.
- No tocar TEST ni PROD. No desplegar.

## Fuera de alcance

- Migraciones SQL: el filtro `busqueda` del listado de Propuestas Formales usa ILIKE dentro de funciones SQL (migraciones 069, 075, 076) y puede tener el mismo problema; queda anotado para un cambio aparte.
- Perder el formulario con F5, mensaje de "sesión expirada", validación del login vacío, stepper en 375 px.
- Los puntos de decisión pendientes de Kevin (tope de `suma_asegurada`, numeración de 2 en 2, visibilidad de `GET /propuestas`, `codigo` de Postgres en los 500).

## Restricciones

- TDD: habilitado — fuente: instrucciones globales del usuario (`Strict TDD Mode: enabled`); runners: `npm test --workspace=backend` (`node --experimental-test-module-mocks --test src/**/*.test.js`) y `npm test --workspace=frontend` (`node --test **/*.test.js`). RED observado antes de implementar.
- Lección del PR #463: los tests nuevos tienen que pasar SIN `backend/.env` (como en CI). Mockear `../config/supabase.js` cuando el módulo bajo prueba arrastre un repository, y verificar corriendo cada archivo nuevo desde la raíz con `env -u SUPABASE_URL -u SUPABASE_SERVICE_KEY`.
- Heurística de ~400 líneas por tarea: solo planificación.
- Textos al usuario en español.

## Checklist

- [x] T-01 Backend: `escaparLike` y filtro de cliente literal (`%`, `_`, `\`), con test del repository
- [x] T-02 Backend: mensajes de límite de largo en español con el nombre legible del campo (cliente, dirección, cédula, ciudad, rubro, descripción de ajuste)
- [x] T-03 Frontend: `api.js` conserva `detalles` del 400 y el cotizador muestra "campo: mensaje" en vez de "Datos de entrada inválidos"
- [x] T-04 Frontend: errores de red ("Failed to fetch") y 5xx con texto técnico muestran un mensaje claro en español, sin texto crudo del servidor
- [x] T-05 Verificación completa (backend y frontend, eslint, prettier) y sección nueva en `docs/ESTADO_PROYECTO.md`; abrir PR

## Criterios de aceptación

Filtrar por `%`, `_` o `\` busca ese carácter literal; un 400 de validación muestra el campo y el límite; offline y 5xx muestran mensajes claros; suites en verde también sin `.env`.

## Progreso

- 2026-10-05: documento creado; rama creada desde `main` (`700c81c`). Espejo en Engram pendiente (servidor desconectado en esta sesión).
- 2026-10-05: T-01 a T-05 implementadas. RED observado en cada test nuevo; GREEN: backend 571 tests (570 pass, 0 fail), frontend 130 pass; eslint y prettier limpios; archivos de backend nuevos pasan sin .env. Filtro `%`/`_` no verificado contra la DB real (pendiente en TEST). PR sin abrir (lo hace el orquestador).

## Próximo paso

Mergear el PR, desplegar a TEST (con aprobación de Kevin) y verificar en vivo que filtrar por `%`, `_` y `\` en el historial no devuelve todas las filas.
