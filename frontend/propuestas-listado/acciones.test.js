import assert from 'node:assert/strict'
import { test } from 'node:test'

import { accionesDeFila } from './acciones.js'

// accionesDeFila es puro (sin DOM): recibe una fila del listado (ya con los 3 flags
// calculados en el backend — puede_continuar/puede_descargar/puede_anular, ver
// listado.service.js) y devuelve la lista de botones a renderizar. Nunca vuelve a
// derivar permisos a partir de `estado` en el cliente (spec: "gated strictly by the
// flags returned by the backend").

function fila(overrides = {}) {
  return {
    id: 42,
    numero_propuesta: 100042,
    estado: 'borrador',
    puede_continuar: false,
    puede_descargar: false,
    puede_anular: false,
    ...overrides,
  }
}

test('borrador activo: solo Continuar habilitado + Ver detalle, sin Descargar/Anular', () => {
  const acciones = accionesDeFila(fila({ estado: 'borrador', puede_continuar: true }))
  const porAccion = Object.fromEntries(acciones.map((a) => [a.action, a]))

  assert.equal(porAccion.continuar.href, '../propuestas/?propuesta=42')
  assert.equal(porAccion.continuar.enabled, true)
  assert.equal(porAccion.descargar.enabled, false)
  assert.equal(porAccion.descargar.disabledTitle, 'No tenés permiso para descargar esta propuesta.')
  assert.equal(porAccion.anular.enabled, false)
  assert.equal(porAccion.anular.disabledTitle, 'No tenés permiso para anular propuestas.')
  assert.ok(porAccion['ver-detalle'])
})

test('escenario del spec: puede_continuar=false, puede_descargar=true, puede_anular=false → solo descarga habilitada', () => {
  const acciones = accionesDeFila(
    fila({ estado: 'emitida', puede_continuar: false, puede_descargar: true, puede_anular: false })
  )
  const porAccion = Object.fromEntries(acciones.map((a) => [a.action, a]))

  assert.equal(porAccion.continuar, undefined)
  assert.equal(porAccion.descargar.enabled, true)
  assert.equal(porAccion.anular.enabled, false)
  assert.ok(porAccion['ver-detalle'])
})

test('emitida con todos los permisos: descargar y anular habilitados', () => {
  const acciones = accionesDeFila(
    fila({ estado: 'emitida', puede_continuar: false, puede_descargar: true, puede_anular: true })
  )
  const porAccion = Object.fromEntries(acciones.map((a) => [a.action, a]))

  assert.equal(porAccion.descargar.enabled, true)
  assert.equal(porAccion.anular.enabled, true)
})

test('reemplazada sin ningún permiso: solo Ver detalle utilizable, resto deshabilitado', () => {
  const acciones = accionesDeFila(fila({ estado: 'reemplazada' }))
  const porAccion = Object.fromEntries(acciones.map((a) => [a.action, a]))

  assert.equal(porAccion.continuar, undefined)
  assert.equal(porAccion.descargar.enabled, false)
  assert.equal(porAccion.anular.enabled, false)
  assert.ok(porAccion['ver-detalle'])
})

test('ver-detalle siempre está presente y habilitado', () => {
  for (const estado of [
    'borrador',
    'en_revision',
    'generando_pdf',
    'error_pdf',
    'emitida',
    'anulada',
    'reemplazada',
  ]) {
    const acciones = accionesDeFila(fila({ estado }))
    const verDetalle = acciones.find((a) => a.action === 'ver-detalle')
    assert.ok(verDetalle, `ver-detalle ausente para estado ${estado}`)
    assert.equal(verDetalle.enabled, true)
  }
})
