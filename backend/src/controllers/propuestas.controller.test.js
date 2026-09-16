import assert from 'node:assert/strict'
import { test } from 'node:test'

function crearResFake() {
  const res = { statusCode: 200, body: undefined, endCalled: false }
  res.status = (statusCode) => {
    res.statusCode = statusCode
    return res
  }
  res.json = (body) => {
    res.body = body
    return res
  }
  res.end = () => {
    res.endCalled = true
    return res
  }
  return res
}

test('probarRenderErrorPdf delegates the parsed id and authenticated admin, then returns 204 without a body', async (t) => {
  let serviceInput
  t.mock.module('../services/propuestas/emision.service.js', {
    namedExports: {
      probarRenderErrorPdf: async (...input) => {
        serviceInput = input
      },
      puedeProbarRenderErrorPdf: () => false,
    },
  })
  t.mock.module('../services/propuestas/borradores.service.js', { namedExports: {} })
  t.mock.module('../services/propuestas/elegibilidad.service.js', { namedExports: {} })
  const { probarRenderErrorPdf } = await import('./propuestas.controller.js?case=test-render-probe')

  const res = crearResFake()
  let nextError
  await probarRenderErrorPdf(
    { params: { id: '15' }, usuario: { id: 99, rol: 'admin' } },
    res,
    (error) => {
      nextError = error
    }
  )

  assert.equal(nextError, undefined)
  assert.deepEqual(serviceInput, [15, { id: 99, rol: 'admin' }])
  assert.equal(res.statusCode, 204)
  assert.equal(res.endCalled, true)
  assert.equal(res.body, undefined)
})

test('obtenerBorrador derives the render-probe capability internally and returns only its public DTO', async (t) => {
  const proposal = {
    id: 15,
    estado: 'error_pdf',
    revision: 3,
    cotizacion_variante_id: 24,
    cotizacion_plan_pago_id: 36,
    draft_json: { tomador: { nombre: 'Asegurado SA' } },
    numero_propuesta: 'PF-2026-000015',
    reemplazada_por_propuesta: 20,
    carta_detalle: { carta_id: 9, estado: 'apta' },
    readiness: { lista: false, faltantes: ['firma'] },
    snapshot_json: { proposal: {} },
    snapshot_hash: 'secret-snapshot-hash',
    draft_hash: 'secret-draft-hash',
    template_version: 'v7',
    texto_version: 'legal-v4',
    pdf_storage_path: 'private/propuestas/15.pdf',
    pdf_storage_bucket: 'propuestas',
    pdf_sha256: 'private-pdf-hash',
    emitida_en: '2026-07-31T12:00:00.000Z',
    anulada_en: null,
    motivo_anulacion: null,
    error_pdf: 'internal renderer detail',
    audit_log: [{ actor_id: 99 }],
    cotizacion_variante: { cotizacion: { agente: { email: 'private@example.test' } } },
    cotizacion_plan_pago: { plan: { configuracion_interna: true } },
  }
  const expectedDto = {
    id: 15,
    estado: 'error_pdf',
    revision: 3,
    cotizacion_variante_id: 24,
    cotizacion_plan_pago_id: 36,
    draft_json: { tomador: { nombre: 'Asegurado SA' } },
    numero_propuesta: 'PF-2026-000015',
    reemplazada_por_propuesta: 20,
    carta_detalle: { carta_id: 9, estado: 'apta' },
    readiness: { lista: false, faltantes: ['firma'] },
    puede_probar_render_error_pdf: true,
  }
  let capabilityInput
  t.mock.module('../services/propuestas/emision.service.js', {
    namedExports: {
      probarRenderErrorPdf: async () => {},
      puedeProbarRenderErrorPdf: (...input) => {
        capabilityInput = input
        return true
      },
    },
  })
  t.mock.module('../services/propuestas/borradores.service.js', {
    namedExports: { obtenerBorrador: async () => proposal },
  })
  t.mock.module('../services/propuestas/elegibilidad.service.js', { namedExports: {} })
  const { obtenerBorrador } =
    await import('./propuestas.controller.js?case=test-render-probe-capability')

  const usuario = { id: 99, rol: 'admin' }
  const res = crearResFake()
  let nextError
  await obtenerBorrador({ params: { id: '15' }, usuario }, res, (error) => {
    nextError = error
  })

  assert.equal(nextError, undefined)
  assert.deepEqual(capabilityInput, [proposal, usuario])
  assert.deepEqual(res.body, expectedDto)
  assert.deepEqual(Object.keys(res.body).sort(), Object.keys(expectedDto).sort())

  for (const internalField of [
    'snapshot_json',
    'snapshot_hash',
    'draft_hash',
    'template_version',
    'texto_version',
    'pdf_storage_path',
    'pdf_storage_bucket',
    'pdf_sha256',
    'emitida_en',
    'anulada_en',
    'motivo_anulacion',
    'error_pdf',
    'audit_log',
    'cotizacion_variante',
    'cotizacion_plan_pago',
  ]) {
    assert.equal(internalField in res.body, false, `${internalField} must not be exposed`)
  }
})
