import assert from 'node:assert/strict'
import { test } from 'node:test'

test('POST /:id/test-render-error-pdf is registered with the non-emitting render probe controller', async (t) => {
  const probeHandler = () => {}
  t.mock.module('../controllers/propuestas.controller.js', {
    namedExports: {
      listarCartas: () => {},
      obtenerCarta: () => {},
      crearBorrador: () => {},
      listarTextos: () => {},
      publicarTexto: () => {},
      obtenerBorrador: () => {},
      actualizarBorrador: () => {},
      emitir: () => {},
      pdf: () => {},
      anular: () => {},
      probarRenderErrorPdf: probeHandler,
    },
  })
  const { router } = await import('./propuestas.routes.js?case=test-render-probe-route')

  const layer = router.stack.find((item) => item.route?.path === '/:id/test-render-error-pdf')

  assert.ok(layer)
  assert.equal(layer.route.methods.post, true)
  assert.equal(layer.route.stack[0].handle, probeHandler)
})
