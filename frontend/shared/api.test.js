import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM, VirtualConsole } from 'jsdom'

// logout() es best-effort: si /auth/logout falla, igual limpia la caché local (comentario
// en api.js). Pero antes de este fix, un 403 de CSRF en ESE llamado disparaba también el
// auto-redirect genérico de request() (pensado para "tu sesión quedó inválida, reloguéate"),
// lo cual hace parecer que el logout se completó limpiamente cuando el servidor nunca
// invalidó la sesión — el bug real detrás del loop login/logout descripto en TEST.
//
// jsdom no implementa navegación real entre documentos (asignar window.location.href no
// cambia el valor observable), así que no podemos verificar el redirect leyendo
// location.href después. jsdom sí emite un evento 'jsdomError' en el VirtualConsole cada
// vez que se intenta esa navegación no soportada — lo usamos como señal de "se intentó
// redirectToLogin()".
function montarEntornoDom() {
  const intentosDeNavegacion = []
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', (err) => {
    if (/navigation/i.test(err.message)) intentosDeNavegacion.push(err.message)
  })
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://test-web.cotizador.lat/cotizar/',
    virtualConsole,
  })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  return intentosDeNavegacion
}

async function importarApiFresco(fetchMock, suffix) {
  const intentosDeNavegacion = montarEntornoDom()
  globalThis.fetch = fetchMock
  const mod = await import(`./api.js?case=${suffix}`)
  return { ...mod, intentosDeNavegacion }
}

test('logout(): un 403 de CSRF en /auth/logout no dispara el redirect genérico de request()', async () => {
  const fetchMock = async () =>
    new Response(JSON.stringify({ error: 'Token CSRF inválido o ausente' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })

  const { auth, intentosDeNavegacion } = await importarApiFresco(fetchMock, 'logout-csrf-403')

  await auth.logout()

  assert.equal(intentosDeNavegacion.length, 0, 'no debe intentar navegar por sí solo')
  assert.equal(auth.isLoggedIn(), false, 'igual limpia la caché local (best-effort)')
})

test('un 403 de CSRF en OTRA llamada mutante (no logout) sí dispara el redirect genérico', async () => {
  const fetchMock = async () =>
    new Response(JSON.stringify({ error: 'Token CSRF inválido o ausente' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })

  const { api, intentosDeNavegacion } = await importarApiFresco(fetchMock, 'otro-endpoint-csrf-403')

  await assert.rejects(() => api.post('/cotizaciones', { foo: 'bar' }))

  assert.equal(intentosDeNavegacion.length, 1, 'sigue redirigiendo para el resto de llamadas')
})
