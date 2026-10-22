import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

// Regresiones de layout a 375px medidas con Playwright (API simulada): el paso 3 del
// stepper de /cotizar/ llegaba a x=434 y el <select> de plan de admin → Coberturas a x=401.
async function leerCss() {
  // La copia de trabajo en Windows puede traer CRLF; el repo guarda LF.
  return (await readFile(new URL('./cotizador.css', import.meta.url), 'utf8')).replace(
    /\r\n/g,
    '\n'
  )
}

test('el stepper mobile muestra solo la etiqueta del paso activo para caber en 320-480px', async () => {
  const css = await leerCss()
  const regla = css.search(
    /\.stepper__label:not\(\.stepper__label--active\)\s*\{[^}]*display:\s*none;/
  )
  assert.ok(regla > -1, 'debe ocultar las etiquetas de los pasos inactivos')

  const mediaPrevio = css.slice(0, regla).lastIndexOf('@media')
  assert.match(
    css.slice(mediaPrevio, regla),
    /^@media \(max-width: 480px\)/,
    'la regla debe vivir dentro de un @media mobile'
  )
})

test('los controles de la barra de acciones de una tarjeta no pueden exceder su contenedor', async () => {
  const css = await leerCss()

  assert.match(css, /\.card__title__actions \.field-input\s*\{[^}]*max-width:\s*100%;/)
  assert.match(css, /\.card__title__actions\s*\{[^}]*min-width:\s*0;/)
})
