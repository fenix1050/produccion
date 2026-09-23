# Propuesta Formal — ajustes al formulario de captura (wizard MRC)

## Objetivo

Kevin revisó el wizard de Propuesta Formal (test-web.cotizador.lat/propuestas/?carta=...) y pidió 8 ajustes puntuales de UI/lógica/contenido, a resolver uno por uno, verificando cada uno antes de pasar al siguiente.

## Por qué

Feedback directo de uso real sobre el formulario recién liberado (PF-3 MRC v3, PR #422/#424 ya en main).

## Alcance

Frontend del wizard (`frontend/propuestas/propuestas.js`) y template de PDF (`backend/src/templates/propuesta/mrc-v3.js`). No toca otros ramos ni Auto (pausado).

## Modo TDD

No confirmado explícitamente por Kevin en esta sesión. Repo tiene tests unitarios existentes (`*.test.js`) para lógica pura — se agregan/actualizan tests para funciones puras tocadas (ej. `pasoListo`, `calcularPendientesFor`, formateo de teléfono/documento) sin imponer ciclo RED/GREEN formal salvo que se pida.

## Checklist

- [x] **1. Progreso del wizard falso-positivo** (paso 3 "Tomador" y paso 4 "Validaciones") — DONE 2026-09-23
  - Causa: ninguno de los dos pasos tiene campos realmente obligatorios (Tomador solo exige datos si se desmarca "es la misma persona"; PLA-FT es opcional en el schema/`readiness.service.js`), así que `pasoListo()` los daba por completos desde el arranque.
  - Fix acordado con Kevin (opción recomendada): un paso solo pasa a "Completado" si el usuario ya lo alcanzó de verdad, no solo por ausencia de campos obligatorios.
  - Implementado en `frontend/propuestas/propuestas.js`: `pasoCamposCompletos()` (check de campos, antes inline en `pasoListo`), `pasoAlcanzado()` + `pasoMaximoAlcanzadoDeDraft()` (gate de "visitado", persistido en `draft_json.paso_maximo_alcanzado`, actualizado en `registrarPasoAlcanzado()` dentro de `avanzarPaso()`), `pasoListo()` combina ambos. `determinarPasoInicial()` y `obtenerReadinessActual()` propagan `pasoMaximoAlcanzado`. Default de compatibilidad para borradores viejos sin el campo: como máximo 2 (solo pasos 1 y 2 tienen requisitos reales verificables retroactivamente).
  - Verificado: 17 tests unitarios en `frontend/propuestas/propuestas.test.js` (16 previos + 1 nuevo) en verde. Verificación en vivo con Playwright contra TEST self-hosted (túnel SSH a `cotizador-test-envoy`, ver nota de infra abajo): borrador nuevo sobre carta MRC-579 muestra 3/4 en "Pendiente"; al completar paso 1 y avanzar, pasa a "Completado" (check verde) y 2 queda "En progreso" sin marcar 3/4 de más.
  - Nota de infra (fuera de este cambio, pero relevante para futuras sesiones): `backend/.env` local apuntaba a un proyecto Supabase cloud dado de baja (`klvbqznjctgwdqwqkmdr.supabase.co`, no resuelve DNS). Se corrigió apuntándolo al self-hosted de TEST vía túnel SSH (`ssh -N -L 8000:172.20.0.2:8000 soporte@192.168.0.90` hacia `cotizador-test-envoy`, ruteo `/rest/v1/*` en `/opt/cotizador/supabase-test/volumes/api/envoy/lds.template.yaml`), con `SUPABASE_URL=http://localhost:8000` y `SUPABASE_SERVICE_KEY=<SERVICE_ROLE_KEY de /opt/cotizador/supabase-test/.env>`. El túnel debe estar abierto para poder probar localmente.
- [x] **2. Rediseño visual card "Origen Verificado"** — DONE 2026-09-23
  - Implementado en `frontend/propuestas/propuestas.css` (`.pf-origin`, `.pf-origin__icon`, `.pf-back`): barra lateral roja (`::before`) en vez del borde completo anterior, textura circular sutil de fondo (`::after` radial-gradient), ícono con fondo redondeado (`--tajy-radius-lg`), botón "Cambiar Carta" en pill (`--tajy-radius-pill`). Sin cambios de markup en `propuestas.js`, solo CSS — usa los tokens `--tajy-*` existentes así se adapta solo a modo oscuro sin overrides nuevos en `theme-dark.css`.
  - Verificado visualmente con Playwright en claro y oscuro contra TEST self-hosted (carta MRC-579) — aprobado por Kevin sin ajustes.
- [x] **3. Campo Sexo en datos del Asegurado** (femenino/masculino) — DONE 2026-09-23
  - `backend/src/templates/propuesta/mrc-v3.js:388` (y `mrc.js:105` para PDFs históricos) ya renderizaban `insured.sexo`, pero no existía forma de cargarlo — quedaba siempre vacío (`UNAVAILABLE`).
  - Agregado como `selectField` (Femenino/Masculino, valores = texto de presentación directo, sin traducción de códigos) en `renderAseguradoPanel()`, requerido solo para persona física — mismo patrón que `fecha_nacimiento`/`nacionalidad`/`estado_civil`/`ocupacion`.
  - Propagado a `leerFormulario()`, `calcularPendientesFor()`/`calcularCamposRequeridos()` (frontend) y `readiness.service.js` (backend, fuente de verdad para habilitar la emisión) — antes solo se agregó en el frontend por error de alcance, corregido para que el gate real de emisión también lo exija.
  - Schema Zod: `personaSchema.sexo = z.enum(['Femenino', 'Masculino']).optional()` en `backend/src/schemas/propuestas.schema.js`.
  - Verificado: 3 tests nuevos (readiness.service.test.js, propuestas.schema.test.js) + 30/30 en verde. En vivo con Playwright: campo aparece con las 2 opciones, `required` cuando tipo de persona es física, valor persiste tras guardar y recargar la página.
- [x] **4. Formato de Teléfono** — DONE 2026-09-23
  - Formulario: `phoneField()` (frontend/propuestas/propuestas.js) ahora aplica `formatearTelefono()` (agrupa en `981-927-418`, máx. 9 dígitos) tanto al valor inicial como en cada tecleo, vía el mismo mecanismo `data-format` que ya usaban RUC/montos (`formatearInputPreservandoCursor()`). El prefijo `+595` sigue siendo puramente decorativo (`aria-hidden`), nunca se persiste.
  - PDF: nuevo helper `celular()` en `backend/src/templates/propuesta/mrc-v3.js` antepone `0` a los 9 dígitos guardados y los reagrupa igual, aplicado en las 3 líneas que muestran el teléfono (Celular, Tel. dirección comercial, Tel. dirección particular). Robusto a valores históricos sin guiones o con prefijo ya incluido (toma los últimos 9 dígitos).
  - Verificado: tests nuevos en `propuestas.test.js` y `mrc-v3.test.js` (36/36 en verde) + Playwright en vivo — el input formatea mientras se escribe y persiste igual tras guardar/recargar.
- [x] **5. Separar "Documento o RUC" en dos campos con selector (C.I. / RUC)** — DONE 2026-09-23
  - Causa real confirmada: `formatearRuc()` asumía dígito verificador a partir de 8 dígitos — una cédula larga (7-8 dígitos, sin verificador real) se formateaba como si fuera un RUC, insertando un guion falso. El PDF (`mrc-v3.js:390-391`) ya esperaba dos campos separados (`insured.documento` para C.I., `insured.ruc` para R.U.C.) que el formulario nunca llenaba por separado.
  - Agregado `selectField('documento_tipo', ...)` (C.I./R.U.C., default `'ci'` para compatibilidad con borradores viejos) en `renderAseguradoPanel()`; despliega `documento` (nuevo formateador `formatearCi()`, solo agrupa sin guion) o `ruc` (mantiene `formatearRuc()`) según la selección. `documento_tipo` sumado a los campos que disparan re-render (como `tipo_persona`).
  - Propagado a `leerFormulario()`, `calcularPendientesFor()`/`calcularCamposRequeridos()`/`etiquetaPendiente()` (frontend), `readiness.service.js` (backend) y `personaSchema` (Zod: `documento_tipo` enum + campo `ruc` nuevo). También corregido el chequeo `tomador.identidad_distinta` para comparar contra el documento efectivo del asegurado (documento o ruc según el tipo), no siempre `documento`.
  - Verificado: 6 tests nuevos (52/52 en verde) + Playwright en vivo — C.I. de 7 dígitos da `5.592.751` (sin guion falso), R.U.C. da `80.028.528-9`, ambos persisten tras guardar y recargar.
- [x] **6. Sacar panel "Publicar texto MRC" del paso 5** — DONE 2026-09-23
  - Antes de tocar nada se confirmó con Kevin: ese panel era el **único lugar de toda la app** para publicar/actualizar los textos legales de MRC (nada en `/admin/` lo reemplazaba). Se acordó moverlo, no borrarlo sin reemplazo.
  - Nueva sección `/admin/` "Textos de Propuesta Formal": `frontend/admin/secciones.js` (registro + ícono), `frontend/admin/state.js` (`state.textosPropuesta`), `frontend/admin/textos-propuesta.js` (carga/publica, mismo endpoint `GET`/`POST /propuestas/textos` de siempre), `frontend/admin/render/textos-propuesta.js` (tabla de publicados + formulario), wireado en `render/shell.js` y `admin.js`.
  - Bug encontrado y corregido en el camino: `seccionesVisibles()` solo chequeaba el flag `puede_gestionar_textos_propuesta` a secas, pero el backend (`emision.service.js`) siempre deja pasar a `rol === 'admin'` aunque el flag esté en `false` — sin el fix (`adminBypass: true` en la sección), un admin literal sin ese flag tildado no habría visto la sección nueva en el sidebar. Verificado en vivo con un admin real (qatest@test.com) que no tenía el flag explícito y aun así ve la sección.
  - Sacado de `frontend/propuestas/propuestas.js`: `renderTextControls()`, `publicarTexto()`, el `<div class="pf-step-five-support">` del paso 5, y el wiring del submit `#pf-text-form`.
  - Verificado que "Emitir Propuesta Formal" no dependía del panel: `state.textos.emision_habilitada` ya era un flag independiente calculado 100% en el backend (`asegurarReadinessEmision`) — sacar el panel no lo afecta, confirmado sin cambios adicionales necesarios.
  - Verificado: 414 tests backend + 118 frontend en verde, sin ningún test nuevo necesario (módulo admin simple, mismo patrón sin test dedicado que `roles.js`). En vivo: la sección nueva carga los 6 textos ya publicados con su historial, y el wizard ya no tiene rastro del formulario viejo.
- [x] **7. Hora Inicio/Hora Fin y Vigencia en el PDF** — DONE 2026-09-23
  - `backend/src/templates/propuesta/mrc-v3.js`: nuevo helper `fmtHora()` deriva la hora de `proposal.emitida_at` (mismo instante que ya usaba "Fecha de Emisión", en el timezone de la carta) y se usa igual para "Hora Inicio" y "Hora Fin". "Vigencia" ahora es el literal fijo "30 días". "Hasta"/"Propuesta de Renovación"/"Póliza Nro." quedan sin tocar (`No disponible`), no estaban pedidos.
  - Verificado: 21 tests en `mrc-v3.test.js` en verde (415 backend total) + PDF real generado con Puppeteer (pipeline completo, no solo el HTML) mostrando "Vigencia: 30 días" y "Hora Inicio"/"Hora Fin: 12:45 p.m." correctamente.
  - **Hallazgo aparte, fuera de este punto**: al intentar emitir la propuesta real de la carta MRC-579 (id 11, la que venimos usando para probar) salió `ProposalFitOverflowError: declarations@6px` — el texto de "declaraciones_generales" actualmente publicado no entra en su caja ni al mínimo tamaño de fuente permitido. No es de acá (afecta el bloque de Declaraciones, no las celdas del header que tocamos), pero bloquea emitir esa carta puntual en TEST. Resuelto por separado en el punto 9.
- [x] **8. Sacar "Franquicia: ..." del detalle de cobertura en el PDF** — DONE 2026-09-23
  - `coverageSummaryV3()` en `mrc-v3.js` armaba `"- {nombre}: Hasta {monto} · Franquicia: {monto o 'Sin deducible'}"`; ahora es solo `"- {nombre}: Hasta {monto}"`. Sacado también sin condicionar (ni siquiera se muestra "Sin deducible").
  - Verificado: 3 tests existentes actualizados en `mrc-v3.test.js` (415 backend en verde) + PDF real generado con Puppeteer confirmando que ninguna cobertura (con o sin franquicia real en los datos) imprime esa palabra. PR #433 mergeado.
- [x] **9. (Follow-up, fuera de los 8 originales) Fix del overflow de Declaraciones en página 1** — DONE 2026-09-23
  - Causa real (confirmada con Kevin viendo 3 PDFs comparativos antes de elegir): la caja de "Declaraciones" en la página 1 junta 3 textos legales (`declaraciones_generales` + `declaracion_jurada_origen_fondos` + `autorizaciones_tomador_poliza_digital`, ~5.880 caracteres combinados) y ya reducía la fuente al mínimo permitido (6px) sin entrar. No era un texto mal cargado — los 3 son contenido legal real, íntegro.
  - Opción descartada (A, mover Declaraciones a página 2): empeora — la página 2 ya está justa con Condiciones/Coberturas/Cláusula de cobranzas, y sumarle Declaraciones hace desbordar las 4 secciones en vez de 1.
  - Opción elegida (B, comprimir página 1): reclamar espacio de la página 1 sin tocar una palabra del texto legal. Diff mínimo verificado necesario ítem por ítem en `mrc-v3.js`: `gap` de la página 1 (2.5mm→1mm, con override propio `.proposal-page--one` para no afectar la página 2), `.datum` (fila de dato del asegurado, 5.5mm→4.5mm), `.address-card` (19mm→14mm), `.modality` (banda "Modalidad de la Cobertura", 15.5mm→10mm), `.coverage-card`/`.risk-columns--body` (tabla de riesgo, 60mm→32mm / 35mm→14mm — el contenido real con 12 coberturas necesitaba menos piso del que tenía), `.conditions-flow` (line-height 1.05→1, párrafo 0.5mm→0.3mm — comparte clase con página 2, ahí solo gana aire de más).
  - Verificado con el ciclo completo: 21 tests actualizados en `mrc-v3.test.js` (valores de CSS cambiados) + 415 backend en verde + **emisión real de la propuesta N° 11 sobre la carta MRC-579** (antes fallaba con 500) — PDF descargado y revisado página por página, texto completo de las 3 declaraciones visible sin cortes, sin desborde en ninguna sección de ninguna página.

## Progreso

- 2026-09-22: Lista completa acordada con Kevin. Arrancamos por el punto 1.
- 2026-09-23: Los 8 puntos originales cerrados, cada uno con su propio PR mergeado a `main` (#426–#433). Punto 9 (follow-up del hallazgo de layout) resuelto en la misma sesión, pendiente de commit/PR propio.

## Próximo paso

Ninguno pendiente. Los 8 puntos originales y el follow-up del overflow de Declaraciones (punto 9) están cerrados, verificados con una emisión real exitosa de la carta MRC-579.
