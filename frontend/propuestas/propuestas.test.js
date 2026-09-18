import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const moduleUrl = new URL('./propuestas.js', import.meta.url)
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
    /function inputField\(name, label, value, type = 'text', required = false\)/
  )
  assert.match(moduleSource, /<textarea name="direccion" rows="2" required>/)
  assert.match(moduleSource, /valor\('partes\.asegurado\.tipo_persona'\),\s*true/)
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
