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
- [ ] **6. Sacar panel "Publicar texto MRC" del paso 5**
  - `renderTextControls()` (frontend/propuestas/propuestas.js:1088), visible solo si `state.textos.puede_gestionar` (línea 572).
  - Verificar que "Emitir Propuesta Formal" (línea 797) se habilite con la modalidad de firma completa — hoy también depende de `state.textos.emision_habilitada`, revisar qué controla ese flag antes de asumir que sacar el panel alcanza.
- [ ] **7. Hora Inicio/Hora Fin y Vigencia en el PDF**
  - `backend/src/templates/propuesta/mrc-v3.js:364-365` — "Hora Inicio"/"Hora Fin" hoy renderizan `UNAVAILABLE`; deben tomar la hora del equipo al momento de emisión (misma hora para ambas).
  - `mrc-v3.js:361` — "Vigencia" hoy `UNAVAILABLE`; debe decir fijo "30 días".
- [ ] **8. Sacar "Franquicia: ..." del detalle de cobertura en el PDF**
  - `mrc-v3.js:423-424` — línea de cobertura arma `"- {nombre}: Hasta {monto} · Franquicia: {monto o 'Sin deducible'}"`; sacar la parte de Franquicia.

## Progreso

- 2026-09-22: Lista completa acordada con Kevin. Arrancamos por el punto 1.

## Próximo paso

Implementar punto 1 (fix readiness pasos 3 y 4).
