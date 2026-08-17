# Proposal: Split de `cotizacion.service.js` por capa funcional (backend)

Tramo 2/3 del issue #165. Tramo 1/3 (red de seguridad de tests en frontend) ya cerrado y archivado (`2026-08-14-cotizacion-modularizacion`, PRs #281/#282/#284).

## Intent

`backend/src/services/cotizacion.service.js` (641 líneas) mezcla 7-9 responsabilidades: resolución de contexto + Zod, autorización, pipeline de pricing, shaping de payload RPC, orquestación de persistencia atómica, PDF y umbral de inspección. Cada cambio de ramo vivo (MRC, Incendio, Vida/AP) obliga a leer el archivo entero, y el `switch(ramo.calculador)` de contexto convive con lógica Auto pausada. El objetivo es cohesión por capa, sin cambiar comportamiento ni el contrato del controller.

## Scope

### In Scope

- Extraer, por relocalización pura, 4-5 módulos: `umbral-inspeccion.service.js`, `cotizacion-authorization.service.js`, `cotizacion-context.service.js`, `cotizacion-pricing.service.js`, `cotizacion-persistence.service.js`.
- Dejar `cotizacion.service.js` como orquestador/barrel que reexporta la API pública actual (`calcularPreview`, `crearCotizacion`, `listarCotizaciones`, `obtenerCotizacion`, `generarPdfOferta`, `actualizarCotizacion`, `aceptarCotizacion`, `generarPdfPropuestaFormal`).
- Actualizar los 25+ tests existentes solo por rutas de import / re-scoping por módulo; mismas aserciones.
- Grep previo a PR 2: confirmar que las claves `withCache` (`catalogoRamo:`, `tasasRamo:`, `tasasObjeto:`, `rpfCuotas`) no están duplicadas fuera del servicio.

### Out of Scope

- **Auto individual (Fase 1/2 pausada)**: `resolverTiposFranquicia` se mueve tal cual; no se resuelve su `TODO Fase 2` ni se toca `auto.calculator.js`.
- Cambiar el shape del payload RPC (`p_cotizacion`/`p_coberturas`/`p_variantes`, migración 052) ni separar `armarPayloadDetalle` de la llamada RPC.
- Cambiar strings de claves de caché.
- Split por ramo (alternativa rechazada) y deduplicación FE/BE (tramo 3, `cotizacion-contrato-fe-be`).
- Cualquier cambio observable de API, DB o UI. Cero cambios en `cotizaciones.controller.js`.

## Capabilities

### New Capabilities

- `cotizacion-backend-behavior-invariant`: contrato de paridad de comportamiento del split — API pública estable, claves de caché intactas, payload+llamada RPC juntos, relocalización byte-idéntica de la rama Auto.

### Modified Capabilities

None.

## Approach

Split **por capa funcional** (Approach 1 de la exploración), no por ramo, porque las costuras reales del código ya son por capa: contexto+repositorios es un bloque cohesivo, el pipeline de pricing es compartido entre preview y write, y payload-shaping+RPC están acoplados por contrato.

Se corrigen dos nombres del issue #165: `cotizacion-context` + `cotizacion-repository-context` se fusionan (no hay dos unidades reales), y `preview`/`write` se reemplazan por `pricing`/`persistence` (el seam real es compartido vs. persistente).

**Por qué se rechaza el split por ramo**: `construirVariantes`, `armarPayloadDetalle`, el RPC atómico y la autorización son agnósticos de ramo; separarlos por ramo los duplicaría o exigiría un archivo base compartido igual. Además obligaría a la mayor relocalización sobre el path Auto pausado y duplicaría el límite `RamoCalculator` (la matemática por ramo ya vive en `/calculators`).

Estilo TDD-caracterización, igual que el tramo 1: sin cambios de producción de comportamiento, con el fixture byte-idéntico de RPF/franquicia como guarda de regresión.

## Plan de PRs encadenados (presupuesto 400 líneas)

| PR  | Contenido                                                                                                                                    | Líneas aprox. | Riesgo |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------ |
| 1   | `umbral-inspeccion.service.js` + `cotizacion-authorization.service.js`                                                                       | ~180-220      | Bajo   |
| 2   | `cotizacion-context.service.js` (fusiona validar+resolver contexto)                                                                          | ~260-300      | Medio  |
| 3   | `cotizacion-pricing.service.js` (`construirVariantes`, `resolverTiposFranquicia`, `resolverCuotas`, `resolverDescuentos`, `resolverTasaRpf`) | ~340-390      | Medio  |
| 4   | `cotizacion-persistence.service.js` (`armarPayloadDetalle` + `crearCotizacion` + `actualizarCotizacion`)                                     | ~340-390      | Alto   |
| 5   | Opcional: orquestación de PDF (`cotizacion-oferta.service.js`), solo si el orquestador sigue grande                                          | ~120-160      | Bajo   |

Cada PR apunta al branch del anterior (Feature Branch Chain). PR 5 se decide después del PR 4.

## Affected Areas

| Area                                                 | Impact    | Description                       |
| ---------------------------------------------------- | --------- | --------------------------------- |
| `backend/src/services/cotizacion.service.js`         | Modified  | Se reduce a orquestador/barrel    |
| `backend/src/services/cotizacion-*.service.js`       | New       | 4-5 módulos por capa              |
| `backend/src/services/umbral-inspeccion.service.js`  | New       | `resolverUmbralInspeccion`        |
| `backend/src/services/cotizacion.service*.test.js`   | Modified  | Solo rutas de import / re-scoping |
| `backend/src/controllers/cotizaciones.controller.js` | Unchanged | Cero cambios (criterio de éxito)  |
| `backend/migrations/**`, `frontend/**`               | Unchanged | Fuera de alcance                  |

## Risks

| Risk                                                                       | Likelihood | Mitigation                                                                             |
| -------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| Tocar lógica Auto pausada al mover `resolverTiposFranquicia`               | Med        | Relocalización pura, sin editar el `TODO Fase 2`; fixture RPF/franquicia byte-idéntico |
| Romper el invariante "sin compensación manual" del RPC atómico (migr. 052) | Med        | `armarPayloadDetalle` + llamada RPC en el mismo módulo; test de passthrough de error   |
| Desincronizar claves `withCache` con `invalidarCacheCatalogos` (admin)     | Med        | Grep de call sites antes del PR 2; strings movidos verbatim                            |
| Colisión de nombre con el `pdf.service.js` existente                       | Low        | PR 5 usa `cotizacion-oferta.service.js`, o queda inline                                |
| Ciclos de import entre orquestador y módulos                               | Low        | Dependencias en una sola dirección: orquestador → módulos; nunca al revés              |
| Un PR supera 400 líneas                                                    | Med        | Cadena de 4-5 PRs; PR 3/4 sliceables si hace falta                                     |

## Rollback Plan

Sin migraciones ni estado persistido. `git revert` del merge de cada PR (en orden inverso de la cadena) restaura `cotizacion.service.js` completo; la API pública y el controller no cambian, así que un revert parcial no rompe consumidores.

## Dependencies

- Tramo 1 (`cotizacion-modularizacion`) cerrado — cumplido.
- Suite backend en verde (154/154) como baseline antes del PR 1.

## Success Criteria

- [ ] `cotizaciones.controller.js` con cero líneas modificadas al final de la cadena.
- [ ] `npm test --prefix backend` en verde en cada PR, con las mismas aserciones que hoy.
- [ ] Fixture byte-idéntico de RPF/franquicia Auto sin cambios.
- [ ] `cotizacion.service.js` reducido a orquestador (< ~150 líneas).
- [ ] Claves `withCache` y payload RPC idénticos (verificable por diff).
- [ ] Ningún PR de la cadena supera 400 líneas sin excepción aceptada.

## Proposal question round

No hubo canal interactivo para preguntar; estas quedan para que Kevin confirme o corrija (no bloquean la propuesta, sí pueden bloquear diseño):

1. ¿El PR 5 (PDF) entra en este change o se difiere? Asunción: opcional, se decide tras el PR 4.
2. ¿Se acepta que los tests se re-scopeen en archivos por módulo (`cotizacion-pricing.service.test.js`, etc.) en vez de mantener los 2 archivos actuales? Asunción: sí, mismas aserciones.
3. ¿`aceptarCotizacion` / `generarPdfPropuestaFormal` (stubs de Fase 4) se quedan en el orquestador? Asunción: sí, no se mueven.
4. ¿Confirma que no se aprovecha este change para resolver el `TODO Fase 2` de franquicia Auto? Asunción: no se toca, Auto sigue pausado.
