import assert from 'node:assert/strict'
import { test } from 'node:test'

// QA adversarial 2026-10-01: `POST /:id/aceptar` y `GET /:id/pdf-propuesta` eran stubs que
// siempre lanzaban un Error (500). La Propuesta Formal vive en `/propuestas`, así que las rutas
// de cotizaciones no deben existir (Express responde 404 solo).

test('cotizaciones.routes no registra los stubs aceptar ni pdf-propuesta', async (t) => {
  const handler = async () => {}
  t.mock.module('../controllers/cotizaciones.controller.js', {
    // aceptar/pdfPropuesta se incluyen a propósito: si la ruta los usara, quedarían registrados.
    namedExports: {
      calcular: handler,
      crear: handler,
      listar: handler,
      obtener: handler,
      actualizar: handler,
      pdfOferta: handler,
      aceptar: handler,
      pdfPropuesta: handler,
    },
  })
  const { router } = await import('./cotizaciones.routes.js')

  const rutas = router.stack.filter((layer) => layer.route).map((layer) => layer.route.path)

  assert.ok(rutas.includes('/:id/pdf-oferta'))
  assert.ok(!rutas.some((ruta) => ruta.includes('aceptar')))
  assert.ok(!rutas.some((ruta) => ruta.includes('pdf-propuesta')))
})
