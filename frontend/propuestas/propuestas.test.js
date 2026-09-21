import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const moduleUrl = new URL('./propuestas.js', import.meta.url)
const stylesheetUrl = new URL('./propuestas.css', import.meta.url)
const bienvenidaUrl = new URL('../bienvenida/bienvenida.js', import.meta.url)
const historialUrl = new URL('../historial/historial.js', import.meta.url)

test('PF-3 frontend converges both entries and issues only through the authoritative proposal API', async () => {
  const [moduleSource, bienvenidaSource, historialSource] = await Promise.all([
    readFile(moduleUrl, 'utf8'),
    readFile(bienvenidaUrl, 'utf8'),
    readFile(historialUrl, 'utf8'),
  ])

  assert.match(bienvenidaSource, /window\.location\.href = '\.\.\/propuestas\/'/)
  assert.match(historialSource, /\.\.\/propuestas\/\?carta=/)
  assert.match(moduleSource, /api\.post\(`\/propuestas\/cartas\/\$\{cartaId\}\/borrador`/)
  assert.match(moduleSource, /revision: state\.propuesta\.revision/)
  assert.match(moduleSource, /error\.status === 409/)
  assert.match(moduleSource, /api\.post\(`\/propuestas\/\$\{state\.propuesta\.id\}\/emitir`/)
  assert.match(moduleSource, /api\.getBlob\(`\/propuestas\/\$\{state\.propuesta\.id\}\/pdf`/)
  assert.match(moduleSource, /api\.post\(`\/propuestas\/\$\{state\.propuesta\.id\}\/anular`/)
  assert.match(moduleSource, /async function abrirPropuesta\(propuestaId\)/)
  assert.match(moduleSource, /api\.get\(`\/propuestas\/\$\{propuestaId\}`\)/)
  assert.match(moduleSource, /state\.carta = propuesta\.carta_detalle/)
  assert.match(moduleSource, /propuesta\.reemplazada_por_propuesta/)
  assert.match(moduleSource, /Historial de reemplazo/)
  assert.match(moduleSource, /href="\?propuesta=\$\{encodeURIComponent\(reemplazo\.id\)\}"/)
  assert.match(moduleSource, /Emitir Propuesta Formal/)
  assert.match(moduleSource, /state\.textos\.emision_habilitada/)
  assert.match(
    moduleSource,
    /function inputField\(name, label, value, type = 'text', required = false, options = \{\}\)/
  )
  assert.match(moduleSource, /<textarea name="direccion" rows="2" required>/)
  assert.match(moduleSource, /selectField\(\s*'tipo_persona',\s*'Tipo de persona'/)
})

test('PF-3 frontend escapes proposal metadata and fallback text before HTML interpolation', async () => {
  const moduleSource = await readFile(moduleUrl, 'utf8')

  assert.match(
    moduleSource,
    /\(state\.textos\.faltantes \?\? \[\]\)\.map\(\(item\) => escapeHtml\(item\)\)\.join\(', '\)/
  )
  assert.match(moduleSource, /const INPUT_TYPES = new Set\(\['text', 'email', 'date', 'number'\]\)/)
  assert.match(moduleSource, /escapeHtml\(label\).*escapeHtml\(name\)/s)
  assert.match(moduleSource, /const selectedValue = String\(selected \?\? ''\)/)
  assert.match(moduleSource, /const optionValue = String\(value \?\? ''\)/)
  assert.match(moduleSource, /escapeHtml\(optionValue\).*escapeHtml\(text\)/s)
})

test('PF-3 required fields and numeric inputs expose the proposal form contract', async () => {
  const moduleSource = await readFile(moduleUrl, 'utf8')
  const stylesheetSource = await readFile(stylesheetUrl, 'utf8')

  assert.match(moduleSource, /function requiredMark\(\)/)
  assert.match(moduleSource, /class="pf-required-mark" aria-hidden="true">\*<\/span>/)
  assert.match(moduleSource, /required \? requiredMark\(\) : ''/)
  assert.match(moduleSource, /function formatearRuc\(value\)/)
  assert.match(moduleSource, /function parseGsInput\(value\)/)
  assert.match(
    moduleSource,
    /const formatAttribute = options\.format \? `data-format="\$\{options\.format\}"`/
  )
  assert.match(moduleSource, /format: 'ruc'/)
  assert.match(moduleSource, /format: 'gs'/)
  assert.match(moduleSource, /inputMode: 'numeric'/)
  assert.match(moduleSource, /formatearInputPreservandoCursor\(event\.target\)/)
  assert.match(
    stylesheetSource,
    /\.pf-field > span \.pf-required-mark\s*\{[\s\S]*color: var\(--tajy-red-a11y\)/
  )
})

test('PF-3 hides the pointless single-variant selector and auto-selects it via a hidden field, keeping the dropdown for a future multi-variant scenario', async () => {
  const moduleSource = await readFile(moduleUrl, 'utf8')

  assert.match(moduleSource, /variantes\.length === 1 \? variantes\[0\] : null/)
  assert.match(
    moduleSource,
    /type="hidden" id="cotizacion-variante-id" value="\$\{escapeHtml\(variantes\[0\]\.id\)\}"/
  )
  assert.match(moduleSource, /<select id="cotizacion-variante-id" class="field-input">/)
  assert.match(moduleSource, /<span>Forma de pago\$\{requiredMark\(\)\}<\/span>/)
  assert.doesNotMatch(moduleSource, /<span>Variante\$\{requiredMark\(\)\}<\/span>/)
})

test('PF-3 logout keeps its fixed internal login redirect', async () => {
  const moduleSource = await readFile(moduleUrl, 'utf8')

  assert.match(moduleSource, /const LOGIN_PATH = '\.\.\/login\/'/)
  assert.match(moduleSource, /window\.location\.assign\(loginUrl\.pathname\)/)
  assert.match(moduleSource, /auth\.logout\(\)\.then\(redirectToLogin\)/)
})

test('PF-3 proposal editor exposes a five-step accessible wizard contract', async () => {
  const moduleSource = await readFile(moduleUrl, 'utf8')

  assert.match(moduleSource, /currentStep: null/)
  assert.match(moduleSource, /state\.currentStep = determinarPasoInicial\(propuesta\)/)
  assert.match(moduleSource, /data-action="ir-paso"/)
  assert.match(moduleSource, /aria-current="step"/)
  assert.match(moduleSource, /data-action="paso-atras"/)
  assert.match(moduleSource, /data-action="paso-continuar"/)
  assert.match(moduleSource, /function validarPaso\(step\)/)
  assert.match(moduleSource, /function renderStepPanel\(\s*step,\s*/)
  assert.match(moduleSource, /function renderReviewStatuses\(readiness, currentStep\)/)
})

test('PF-3 editor keeps the reference dashboard structure and end-of-form actions', async () => {
  const [moduleSource, stylesheetSource] = await Promise.all([
    readFile(moduleUrl, 'utf8'),
    readFile(stylesheetUrl, 'utf8'),
  ])

  for (const marker of [
    'main main--propuestas',
    'pf-progress',
    'pf-steps',
    'pf-origin',
    'pf-review',
    'pf-actions-bar',
    'pf-group-label',
  ]) {
    assert.match(moduleSource, new RegExp(`class="[^"]*${marker}`))
  }
  assert.match(stylesheetSource, /\.pf-steps\s*\{[\s\S]*grid-template-columns: repeat\(5,/)
  assert.match(stylesheetSource, /\.pf-review\s*\{[\s\S]*position: sticky;/)
  assert.match(stylesheetSource, /\.pf-actions-bar\s*\{[\s\S]*position: static;/)
  assert.match(stylesheetSource, /@media \(max-width: 900px\)/)
  assert.match(stylesheetSource, /@media \(max-width: 640px\)/)
})

test('PF-3 wizard prioritizes the active step and starts ready proposals at review', async () => {
  const moduleSource = await readFile(moduleUrl, 'utf8')

  assert.match(
    moduleSource,
    /pf-review__step--\$\{current \? 'current' : complete \? 'complete' : 'pending'\}/
  )
  assert.match(
    moduleSource,
    /const status = current \? 'En progreso' : complete \? 'Completado' : 'Pendiente'/
  )
  assert.match(
    moduleSource,
    /function determinarPasoInicial\(propuesta\)[\s\S]*?for \(const step of \[1, 2, 3, 4\]\)[\s\S]*?return step[\s\S]*?return 5/
  )
  assert.doesNotMatch(moduleSource, /return propuesta\?\.estado === 'borrador' \? 2 : 5/)
})

test('PF-3 reference grouping keeps active presentation and readiness contracts', async () => {
  const [moduleSource, stylesheetSource] = await Promise.all([
    readFile(moduleUrl, 'utf8'),
    readFile(stylesheetUrl, 'utf8'),
  ])

  for (const label of [
    'Datos del asegurado',
    'Completa la información de la persona o empresa que será asegurada.',
    'Datos personales',
    'Información básica del asegurado.',
    'Contacto',
    'Medios de contacto del asegurado.',
    'Dirección',
    'Domicilio del asegurado.',
    'REVISIÓN INFORMATIVA',
    'Progreso de la propuesta',
    'Completa la información para continuar.',
    'Completado',
    'En progreso',
    'Pendiente',
    '🇵🇾 \\+595',
  ])
    assert.match(moduleSource, new RegExp(label.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')))

  assert.match(
    moduleSource,
    /Faltan \$\{escapeHtml\(pendientes\.length\)\} \$\{pendientes\.length === 1 \? 'campo' : 'campos'\} por completar/
  )
  assert.match(moduleSource, /function calcularCamposRequeridos\(propuesta\)/)
  assert.match(moduleSource, /const required = calcularCamposRequeridos\(propuesta\)/)
  assert.doesNotMatch(moduleSource, /const total = 5/)
  assert.match(
    moduleSource,
    /currentStep === 5 && state\.textos\.puede_gestionar \? `<div class="pf-step-five-support">\$\{renderTextControls\(\)\}/
  )
  const avanzarPasoSource = moduleSource.match(/function avanzarPaso\(\)[\s\S]*?\n\}/)?.[0] ?? ''
  assert.match(avanzarPasoSource, /state\.currentStep \+= 1[\s\S]*?render\(\)/)
  assert.doesNotMatch(avanzarPasoSource, /programarAutosave\(\)/)
  assert.match(
    stylesheetSource,
    /\.pf-step--complete \.pf-step__number[\s\S]*?var\(--tajy-green-fg\)/
  )
  assert.match(
    stylesheetSource,
    /\.pf-step--pending \.pf-step__number[\s\S]*?var\(--tajy-text-muted\)/
  )
})

test('PF-3 review rail and insured cards keep contextual, current-step guidance', async () => {
  const [moduleSource, stylesheetSource] = await Promise.all([
    readFile(moduleUrl, 'utf8'),
    readFile(stylesheetUrl, 'utf8'),
  ])

  assert.match(moduleSource, /ICON_PHONE/)
  assert.match(moduleSource, /ICON_LOCATION/)
  assert.match(moduleSource, /class="pf-subcard__icon"/)
  assert.match(moduleSource, /function pendientesDelPaso\(pendientes, step\)/)
  assert.match(moduleSource, /Campos pendientes en este paso/)
  assert.match(moduleSource, /function renderReviewTip\(currentStep, readiness, pendientesCount\)/)
  assert.match(moduleSource, /class="pf-review__tip"/)
  assert.doesNotMatch(moduleSource, /code\.replace\('carta:'/)
  assert.match(
    moduleSource,
    /if \(step === 4\) return !pendientes\.some\(\(item\) => item\.startsWith\('pla_ft\.'\)\)/
  )
  assert.match(stylesheetSource, /\.pf-review__tip\s*\{[\s\S]*background:/)
  assert.match(
    stylesheetSource,
    /\.pf-actions-bar\s*\{[\s\S]*grid-template-columns: auto minmax\(0, 1fr\) auto;/
  )
})

test('PF-3 autosave waits for typing to settle and keeps successful background saves in place', async () => {
  const moduleSource = await readFile(moduleUrl, 'utf8')

  assert.match(moduleSource, /const AUTOSAVE_DEBOUNCE_MS = 2000/)
  assert.match(
    moduleSource,
    /autosaveTimer = window\.setTimeout\(\(\) => guardar\(\{ silencioso: true \}\), AUTOSAVE_DEBOUNCE_MS\)/
  )
  assert.match(moduleSource, /async function guardar\(\{ silencioso = false \} = \{\}\)/)
  assert.match(
    moduleSource,
    /state\.saveState = `Guardado · revisión \$\{state\.propuesta\.revision\}`[\s\S]*?if \(!silencioso\) render\(\)/
  )
  assert.match(moduleSource, /if \(action === 'guardar'\) guardar\(\)/)
  assert.match(moduleSource, /function renderPreservandoVista\(\)/)
})

test('PF-3 frontend escapes proposal metadata and fallback text before HTML interpolation', async () => {
  const moduleSource = await readFile(moduleUrl, 'utf8')

  assert.match(
    moduleSource,
    /\(state\.textos\.faltantes \?\? \[\]\)\.map\(\(item\) => escapeHtml\(item\)\)\.join\(', '\)/
  )
  assert.match(moduleSource, /const INPUT_TYPES = new Set\(\['text', 'email', 'date', 'number'\]\)/)
  assert.match(moduleSource, /escapeHtml\(label\).*escapeHtml\(name\)/s)
  assert.match(moduleSource, /const selectedValue = String\(selected \?\? ''\)/)
  assert.match(moduleSource, /const optionValue = String\(value \?\? ''\)/)
  assert.match(moduleSource, /escapeHtml\(optionValue\).*escapeHtml\(text\)/s)
})

test('PF-3 logout keeps its fixed internal login redirect', async () => {
  const moduleSource = await readFile(moduleUrl, 'utf8')

  assert.match(moduleSource, /const LOGIN_PATH = '\.\.\/login\/'/)
  assert.match(moduleSource, /window\.location\.assign\(loginUrl\.pathname\)/)
  assert.match(moduleSource, /auth\.logout\(\)\.then\(redirectToLogin\)/)
})

test('PF-3 hides the pointless single-variant selector and auto-selects it via a hidden field, keeping the dropdown for a future multi-variant scenario', async () => {
  const moduleSource = await readFile(moduleUrl, 'utf8')

  // MRC/Incendio/Vida-AP always produce exactly one variant per cotización — the dropdown
  // never has a real choice to make, so it auto-selects instead of asking the agent to pick.
  assert.match(moduleSource, /variantes\.length === 1 \? variantes\[0\] : null/)
  assert.match(
    moduleSource,
    /type="hidden" id="cotizacion-variante-id" value="\$\{escapeHtml\(variantes\[0\]\.id\)\}"/
  )
  // The <select> fallback stays in the source for a future scenario with more than one
  // variant (e.g. Auto's dual franquicia, paused today) — it must not be deleted outright.
  assert.match(moduleSource, /<select id="cotizacion-variante-id" class="field-input">/)
})

test('PF-3 only offers "Anular Propuesta" on the just-issued wizard to a user allowed to annul', async () => {
  const moduleSource = await readFile(moduleUrl, 'utf8')

  // Bug real: el wizard mostraba "Anular Propuesta" a cualquier agente apenas
  // estado === 'emitida', sin chequear rol/permiso — el backend igual lo bloqueaba con
  // 403, pero la UI prometía una acción que después fallaba. Mismo criterio que ya usa
  // puedeAnular() en backend/src/services/propuestas/listado.service.js.
  assert.match(moduleSource, /usuario: null,/)
  assert.match(moduleSource, /state\.usuario = usuario/)
  assert.match(
    moduleSource,
    /function puedeAnular\(usuario\) \{\s*return Boolean\(usuario\) && \(usuario\.rol === 'admin' \|\| Boolean\(usuario\.puede_anular_propuestas\)\)/
  )

  const renderAccionSource =
    moduleSource.match(/function renderAccionSecundariaEmitida\(propuesta\) \{[\s\S]*?\n\}/)?.[0] ??
    ''
  assert.notEqual(renderAccionSource, '', 'renderAccionSecundariaEmitida debe existir')
  // Estado distinto de "emitida" (ej. reemplazada) siempre ofrece "Preparar reemplazo",
  // sin depender del permiso de anulación.
  assert.match(
    renderAccionSource,
    /if \(propuesta\.estado !== 'emitida'\) \{\s*return '<button type="button" class="btn-outline" data-action="reemplazar">Preparar reemplazo<\/button>'/
  )
  // Emitida + sin permiso: no se renderiza ningún botón de anulación.
  assert.match(renderAccionSource, /if \(!puedeAnular\(state\.usuario\)\) return ''/)
  // Emitida + con permiso: recién ahí aparece el botón de anular.
  assert.match(
    renderAccionSource,
    /return '<button type="button" class="btn-outline" data-action="anular">Anular Propuesta<\/button>'/
  )

  assert.match(
    moduleSource,
    /\? `<button type="button" class="btn-primary" data-action="descargar-pdf">Descargar PDF<\/button>\$\{renderAccionSecundariaEmitida\(propuesta\)\}`/
  )
})
