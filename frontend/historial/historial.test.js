import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

// Test de fuente (mismo patrón que frontend/propuestas/propuestas.test.js:18): asertar
// contra el texto de historial.js en vez de montar DOM, porque lo que importa acá es que
// la integración delegue en decidirAccionPropuesta() y preserve el contrato de navegación
// de las 3 ramas, sin reescribir el archivo entero.

test('historial.js delega la decisión de acción a propuesta-accion.js', async () => {
  const src = await readFile(new URL('./historial.js', import.meta.url), 'utf8')
  assert.match(
    src,
    /import\s*\{[^}]*decidirAccionPropuesta[^}]*\}\s*from\s*['"]\.\/propuesta-accion\.js['"]/
  )
  assert.match(src, /decidirAccionPropuesta\(cartaApta\)/)
})

test('historial.js ya no tiene la lógica inline "Reabrir"/"Preparar" hardcodeada', async () => {
  const src = await readFile(new URL('./historial.js', import.meta.url), 'utf8')
  assert.doesNotMatch(
    src,
    /cartaApta\.propuesta_borrador_id\s*\?\s*'Reabrir propuesta'\s*:\s*'Preparar propuesta'/
  )
})

test('preserva el literal ../propuestas/?carta= exigido por propuestas.test.js:18', async () => {
  const src = await readFile(new URL('./historial.js', import.meta.url), 'utf8')
  assert.match(src, /\.\.\/propuestas\/\?carta=/)
})

test('la navegación real usa el href calculado por decidirAccionPropuesta (data-href), no un literal hardcodeado por click', async () => {
  const src = await readFile(new URL('./historial.js', import.meta.url), 'utf8')
  assert.match(src, /data-action="accion-propuesta"/)
  assert.match(src, /navegarRutaInterna\(el\.dataset\.href\)/)
  assert.match(src, /url\.origin !== window\.location\.origin/)
})

// "Descargar Carta Oferta" es un botón de solo ícono (cabe en una línea sin scroll lateral): el
// texto vive en aria-label/title y la descarga NO puede reemplazar textContent, que borraría el ícono.
test('el botón de descarga de la Carta Oferta es de solo ícono con aria-label y title', async () => {
  const src = await readFile(new URL('./historial.js', import.meta.url), 'utf8')
  assert.match(src, /const ICON_DESCARGA = `<svg/)
  assert.match(
    src,
    /data-action="descargar-oferta"[^>]*aria-label="Descargar Carta Oferta"[^>]*title="Descargar Carta Oferta"[^>]*>\$\{ICON_DESCARGA\}<\/button>/
  )
  assert.doesNotMatch(src, />Descargar Carta Oferta<\/button>/)
})

test('la variante deshabilitada del botón de descarga también es de solo ícono y explica el motivo', async () => {
  const src = await readFile(new URL('./historial.js', import.meta.url), 'utf8')
  assert.match(
    src,
    /disabled aria-disabled="true" aria-label="Carta Oferta no disponible para este ramo todavía" title="Carta Oferta no disponible para este ramo todavía">\$\{ICON_DESCARGA\}<\/button>/
  )
})

test('descargarOferta conserva el ícono: no usa textContent y restaura el aria-label original', async () => {
  const src = await readFile(new URL('./historial.js', import.meta.url), 'utf8')
  const fn = src.slice(src.indexOf('async function descargarOferta'), src.indexOf('// Render'))
  assert.doesNotMatch(fn, /textContent/)
  assert.match(fn, /innerHTML/)
  assert.doesNotMatch(fn, /removeAttribute\('aria-label'\)/)
})
