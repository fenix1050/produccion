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
