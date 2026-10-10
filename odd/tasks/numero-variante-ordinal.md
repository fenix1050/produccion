# numero-variante-ordinal — Que crear y editar una cotización no queme números del correlativo

## Objetivo

Que cada cotización nueva consuma UN solo número del correlativo del ramo (`numero_cotizacion`), de modo que la numeración visible (`MRC-593`, `MRC-594`, ...) sea consecutiva hacia adelante.

## Problema

Hallazgo del QA adversarial de TEST (2026-10-01/05): la numeración MRC avanza de a 2 (593, 595, 597...).

Causa (leída del código, verificar): `crear_cotizacion_atomica` (migración `052_cotizacion_atomica_rpc.sql`) llama a `siguiente_correlativo(p_ramo_id)` una vez para `numero_cotizacion` (l.~164) y otra vez por CADA variante para `cotizacion_variantes.numero_variante` (l.~87) — mismo contador por ramo. Una cotización con 1 variante consume 2 números; `actualizar_cotizacion_atomica` reinserta las variantes y quema 1 número por variante en cada edición. Está documentado como diseño (`docs/ESTADO_PROYECTO.md` ~l.2189) y la migración 042 asumía que `numero_variante` era "puramente interno", pero hoy se muestra en el selector de variante de la Propuesta Formal (`frontend/propuestas/propuestas.js:1311`) y viaja en el snapshot (`document-snapshot.service.js:152`).

## Decisión de Kevin (2026-10-10)

Adoptar la recomendación: `numero_variante` pasa a ser un ordinal por cotización (`'1'`, `'2'`, ...) sin tocar la tabla `correlativos` ni los números existentes. Los huecos históricos quedan como están.

## Alcance autorizado

- Una migración nueva (siguiente número libre, hoy `082_*`; verificar con `ls backend/migrations` y `backend/scripts/verificar-numeracion-migraciones.js` que no colisione) que reemplaza con `CREATE OR REPLACE FUNCTION` las funciones vigentes que generan `numero_variante`, más su test al estilo de `080_*.test.js` / `081_*.test.js`.
- Actualizar `backend/scripts/verificar-cotizacion-atomica.sql` (sus aserciones asumen el consumo viejo del correlativo).
- Si el frontend o algún test asumen que `numero_variante` es un correlativo global, ajustarlo (mínimo).
- Rama `fix/numero-variante-ordinal`, commits convencionales en español, PR (nunca push directo a `main`). Borrar la rama tras el merge.
- No ejecutar nada contra TEST ni PROD (la migración la aplican Kevin/el orquestador con aprobación explícita, después del merge). No desplegar.

## Fuera de alcance

- Renumerar cotizaciones, variantes, cartas o propuestas ya existentes.
- Tocar la tabla `correlativos`, `siguiente_correlativo` o la numeración de Propuestas Formales (`propuesta_correlativos`).
- Cambiar el esquema de la tabla (la restricción `UNIQUE (cotizacion_id, numero_variante)` de la migración 042 se mantiene y debe seguir cumpliéndose).
- Revocar o reasignar permisos de las funciones (migraciones 072/074): `CREATE OR REPLACE` conserva los grants; no hacer `GRANT` nuevos.

## Restricciones

- TDD: habilitado — fuente: instrucciones globales del usuario (`Strict TDD Mode: enabled`); runner: `npm test --workspace=backend` (`node --experimental-test-module-mocks --test src/**/*.test.js`) y los tests de migración (`backend/migrations/*.test.js`, ver el script `test:migrations:pf3` de `backend/package.json` para cómo se corren). Test primero, RED observado.
- Los tests nuevos tienen que pasar SIN `backend/.env` (como en CI): verificar corriendo desde la raíz con `env -u SUPABASE_URL -u SUPABASE_SERVICE_KEY`.
- La migración debe preservar EXACTAMENTE las firmas, el `SET search_path`, `SECURITY` y demás atributos de las funciones vigentes (copiar la última definición, no la de la 052 si otra migración posterior la reemplazó) y solo cambiar cómo se calcula `numero_variante`.
- Heurística de ~400 líneas por tarea: solo planificación.
- Comentarios SQL y de código en español, al estilo de las migraciones vecinas.

## Checklist

- [x] T-01 Mapear la definición VIGENTE de `crear_cotizacion_atomica`, `actualizar_cotizacion_atomica` y del helper que inserta variantes (buscar en TODAS las migraciones, no solo la 052) y todos los usos de `numero_variante` (SQL, backend, frontend, tests, scripts)
- [x] T-02 Test de la migración (RED) y migración `082_*` (o el número libre): `numero_variante` = ordinal por cotización (1..N), tanto al crear como al editar; sin consumir `correlativos` para variantes
- [x] T-03 Actualizar `backend/scripts/verificar-cotizacion-atomica.sql` y cualquier test o fixture que asuma el consumo viejo
- [x] T-04 Verificación completa (backend, eslint, prettier, test de numeración de migraciones) y sección nueva en `docs/ESTADO_PROYECTO.md` con el procedimiento de aplicación manual (TEST luego PROD) y qué verificar después; abrir PR

## Criterios de aceptación

Una cotización de 1 variante consume 1 número del correlativo (593, 594, 595...); una de 2 variantes tiene `numero_variante` `'1'` y `'2'`; editarla no consume números del correlativo; la restricción `UNIQUE (cotizacion_id, numero_variante)` se cumple; el test de numeración de migraciones y las suites siguen en verde, también sin `.env`.

## Progreso

- 2026-10-10: documento creado; rama creada desde `main` (`5607ce3`). Espejo en Engram pendiente (servidor desconectado en esta sesión).

- 2026-10-10 T-01: único origen de las 3 funciones = 052 (ninguna migración posterior las reemplaza); solo el helper `_insertar_detalle_cotizacion` genera `numero_variante`. Usos: 005/042 (tabla/UNIQUE), 066/067/068/070 (snapshot de carta), `document-snapshot.service.js:152`, `propuestas.js:1311` (solo mostrar), `verificar-cotizacion-atomica.sql`. Nada asume que sea global.
- 2026-10-10 T-02: RED observado (3 tests, .sql inexistente) -> GREEN (3/3, sin .env). Migración 082 solo reemplaza el helper. Test cableado en `test:migrations:pf3`.
- 2026-10-10 T-03: verificar-cotizacion-atomica.sql actualizado (+1, variante '1'); comentarios de cotizacion-persistence.service.js corregidos.
- 2026-10-10 T-04: sección 112 en ESTADO_PROYECTO.md; verificación final ver reporte. PR pendiente (lo abre el orquestador).

## Próximo paso

Delegar un writer para T-01 a T-04.
