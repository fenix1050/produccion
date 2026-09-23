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
- [ ] **3. Campo Sexo en datos del Asegurado** (femenino/masculino) — la Propuesta ya lo requiere.
- [ ] **4. Formato de Teléfono**
  - Prefijo fijo `+595`, separar el resto en formato `981-927-418`.
  - En el PDF de la Propuesta debe salir como `0981-927-418` (prefijo reemplazado por `0`).
- [ ] **5. Separar "Documento o RUC" en dos campos con selector (C.I. / RUC)**
  - `formatearRuc()` (frontend/propuestas/propuestas.js:53) hoy aplica formato de RUC a cualquier documento — una cédula de 7 dígitos sale mal agrupada.
  - Selector C.I./RUC despliega el campo correspondiente con su propio formato.
  - Cambio más grande: toca schema del formulario, no solo presentación.
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
