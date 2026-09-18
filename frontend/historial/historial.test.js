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
    /import\s*\{\s*decidirAccionPropuesta\s*\}\s*from\s*['"]\.\/propuesta-accion\.js['"]/
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
  assert.match(src, /window\.location\.href = el\.dataset\.href/)
})
