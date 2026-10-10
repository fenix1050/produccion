# mrc-tope-suma-total — Tope de la suma total asegurada en MRC

## Objetivo

Que una cotización MRC no pueda superar la Responsabilidad Máx. Cotizable del plan sumando coberturas adicionales, y que valores absurdos (`1e308`, `Infinity`) se rechacen con un mensaje claro en vez de producir primas absurdas o un 500.

## Problema

Hallazgo del QA adversarial de TEST (2026-10-01/02):

- `riesgo_datos.coberturas_adicionales[].suma_asegurada` no tiene tope. Con `1e308` la prima del preview da `8e305` y al guardar falla con `22003` (500); con `9e9` se aceptó y se persistió una prima de ~72 M.
- El máximo cotizable del plan (`plan.responsabilidad_maxima_cotizable`, Gs. 7.200.000.000 en MRC NORMAL) solo se compara contra `capital_edificio + capital_contenido` (`backend/src/calculators/utils/edificio-contenido.js:21-29`). Incendio, en cambio, lo compara contra la suma total (`incendio.calculator.js:356-362`).
- `schemas/mrc.schema.js` no tiene tope de sanidad ni `.finite()` en los montos.

## Decisión de Kevin (2026-10-09)

El tope se aplica a la **suma total**, no por línea: edificio + contenido + coberturas adicionales ≤ `responsabilidad_maxima_cotizable` del plan.

## Alcance autorizado

- Backend: `schemas/mrc.schema.js`, `calculators/mrc.calculator.js` (y utils) y sus tests. Frontend solo si hace falta para mostrar el mensaje del 422.
- Rama `fix/mrc-tope-suma-total`, commits convencionales en español, PR (nunca push directo a `main`). Borrar la rama tras el merge.
- No tocar TEST ni PROD. No desplegar. Sin migraciones.

## Fuera de alcance

- Topes por cobertura en el catálogo (columna nueva, migración, admin).
- Los otros puntos abiertos (numeración de 2 en 2, `codigo` de Postgres en los 500): esperan decisión de Kevin.
- Datos ya persistidos con sumas altas: no se tocan.

## Restricciones

- TDD: habilitado — fuente: instrucciones globales del usuario (`Strict TDD Mode: enabled`); runners: `npm test --workspace=backend` (`node --experimental-test-module-mocks --test src/**/*.test.js`) y `npm test --workspace=frontend` si se toca el frontend. RED observado antes de implementar.
- Los tests nuevos tienen que pasar SIN `backend/.env` (como en CI): mockear `../config/supabase.js` si el módulo bajo prueba arrastra un repository, y verificar con `env -u SUPABASE_URL -u SUPABASE_SERVICE_KEY` desde la raíz.
- Heurística de ~400 líneas por tarea: solo planificación.
- Mensajes al usuario en español, con el estilo de los 422 existentes del calculador.

## Checklist

- [x] T-01 Definir qué cuenta como "suma total" reutilizando la definición existente (coberturas con `incluye_en_suma_asegurada_total !== false` y que no sean sublímite; ver `templates/oferta/mrc.js:173-177` y `frontend/cotizar/domain-rules.js` `capitalTotalAsegurado`), sin duplicar reglas
- [x] T-02 Calculador MRC: rechazar con 422 cuando edificio + contenido + adicionales que cuentan supera `responsabilidad_maxima_cotizable`, con mensaje claro; plan con tope `null` no valida (queda solo el tope de sanidad)
- [x] T-03 Schema MRC: `.finite()` y tope de sanidad (por debajo del límite de `NUMERIC(14,2)`, < 1e12) en `suma_asegurada`, `capital_edificio`, `capital_contenido` y `capital_asegurado`, con mensajes en español
- [x] T-04 Verificación (backend y frontend si aplica, eslint, prettier) y sección nueva en `docs/ESTADO_PROYECTO.md`; abrir PR (PR pendiente, a cargo del orquestador)

## Criterios de aceptación

Una cotización MRC cuya suma total supera el máximo del plan responde 422 con mensaje claro; `1e308`, `1e999` y montos ≥ 1e12 responden 400 o 422 sin 500; los casos válidos y los tests existentes siguen igual; suites en verde también sin `.env`.

## Progreso

- 2026-10-09: documento creado; rama creada desde `main` (`2f55393`). Espejo en Engram pendiente (servidor desconectado en esta sesión).

- 2026-10-09 T-01/T-02: RED observado (test de tope total falló: no lanzaba 422); GREEN en `mrc.calculator.test.js` (36/36). Definición de total reutilizada: no sublímite y `incluye_en_suma_asegurada_total !== false`, desde el catálogo ya cargado en el calculador.
- 2026-10-09 T-03: RED observado (16 tests de `mrc.schema.test.js` fallaban); GREEN 17/17. Ambos archivos pasan sin `.env`.
- 2026-10-09 T-04: `npm test --workspace=backend` 593 tests, 592 pass, 0 fail; eslint y prettier OK; sección 110 en `docs/ESTADO_PROYECTO.md`. Frontend no tocado.

## Próximo paso

Commit, PR y merge (a cargo del orquestador); deploy manual a TEST y verificación allí.
