import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const moduleUrl = new URL('./propuestas.js', import.meta.url)
const bienvenidaUrl = new URL('../bienvenida/bienvenida.js', import.meta.url)
const historialUrl = new URL('../historial/historial.js', import.meta.url)

test('PF-2 frontend converges both entries on /propuestas and keeps PF-3 emission disabled', async () => {
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
  assert.match(moduleSource, /Emitir Propuesta Formal<\/button>/)
  assert.match(moduleSource, /class="btn-outline pf-emit" disabled/)
})
