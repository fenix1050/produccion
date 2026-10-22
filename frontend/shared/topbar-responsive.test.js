import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

// Regresión: en mobile .topbar__crumb-area (flex: 1) tiene min-width: auto, así que su
// tamaño mínimo es el min-content de breadcrumb + usuario y desborda el viewport (el avatar
// quedaba fuera de pantalla de 320 a 414px). Con min-width: 0 puede encogerse y el
// overflow/ellipsis del breadcrumb hace su trabajo. Medido en navegador con Playwright.
test('el topbar mobile deja que .topbar__crumb-area se encoja (min-width: 0)', async () => {
  // La copia de trabajo en Windows puede traer CRLF; el repo guarda LF.
  const css = (await readFile(new URL('./cotizador.css', import.meta.url), 'utf8')).replace(
    /\r\n/g,
    '\n'
  )

  const inicio = css.indexOf('@media (max-width: 768px) {\n  .topbar__red-block')
  assert.ok(inicio > -1, 'debe existir el bloque mobile del topbar')
  const bloque = css.slice(inicio, css.indexOf('.app-body {', inicio))

  assert.match(bloque, /\.topbar__crumb-area\s*\{[^}]*min-width:\s*0;/s)
})
