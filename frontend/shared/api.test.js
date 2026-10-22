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

test('cargarSesion caches user and CSRF token; mutations use cache, not document.cookie', async () => {
  const requests = []
  const fetchMock = async (url, options = {}) => {
    requests.push({ url, options })
    return new Response(JSON.stringify({ usuario: { id: 7 }, csrfToken: 'csrf-en-memoria' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const { api, auth } = await importarApiFresco(fetchMock, 'csrf-token-cache')
  document.cookie = 'tajy_csrf=csrf-antiguo'

  assert.equal((await auth.cargarSesion()).id, 7)
  await api.post('/cotizaciones', {})

  assert.equal(requests[0].url.endsWith('/auth/me'), true)
  assert.equal(requests[1].options.headers['X-CSRF-Token'], 'csrf-en-memoria')
  assert.equal(auth.getUsuario().id, 7)

  auth.clearSession()
  assert.equal(auth.getUsuario(), null)
  await api.post('/cotizaciones', {})
  assert.equal(requests[2].options.headers['X-CSRF-Token'], undefined)
})

test('una sesión fallida limpia user y CSRF token en memoria', async () => {
  let call = 0
  const fetchMock = async (_url, options = {}) => {
    call += 1
    if (call === 1) {
      return new Response(JSON.stringify({ usuario: { id: 7 }, csrfToken: 'csrf-en-memoria' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (options.method === 'POST') {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
    }
    return new Response('{}', { status: 401 })
  }
  const { api, auth } = await importarApiFresco(fetchMock, 'csrf-cache-clear-401')
  await auth.cargarSesion()
  await assert.rejects(() => api.post('/cotizaciones', {}))
  assert.equal(auth.getUsuario(), null)
  await api.post('/cotizaciones', {}).catch(() => {})
  assert.equal(auth.getUsuario(), null)
})

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

// QA de UI 2026-10-05: el 400 de validación mostraba solo "Datos de entrada inválidos", offline
// "Failed to fetch" y un 500 el texto crudo del servidor.
const respuestaJson = (status, cuerpo) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

test('un 400 de validación conserva `detalles` y arma un mensaje con el campo y el límite', async () => {
  const detalles = [
    {
      campo: 'riesgo_datos.direccion',
      mensaje: 'La dirección admite como máximo 500 caracteres.',
    },
  ]
  const fetchMock = async () =>
    respuestaJson(400, { error: 'Datos de entrada inválidos', detalles })
  const { api } = await importarApiFresco(fetchMock, 'error-400-detalles')

  const error = await api.post('/cotizaciones', {}).catch((e) => e)

  assert.equal(error.status, 400)
  assert.deepEqual(error.detalles, detalles)
  assert.equal(error.message, 'La dirección admite como máximo 500 caracteres.')
})

test('un 400 de validación con mensaje no autoexplicativo antepone la etiqueta legible del campo', async () => {
  const detalles = [
    { campo: 'cliente_nombre', mensaje: 'Expected string, received number' },
    { campo: 'descuentos.0.descripcion', mensaje: 'Required' },
  ]
  const fetchMock = async () =>
    respuestaJson(400, { error: 'Datos de entrada inválidos', detalles })
  const { api } = await importarApiFresco(fetchMock, 'error-400-etiquetas')

  const error = await api.post('/cotizaciones', {}).catch((e) => e)

  assert.equal(
    error.message,
    'Nombre del cliente: Expected string, received number Descuento 1, descripción: Required'
  )
})

test('un 400 sin `detalles` mantiene el mensaje del servidor', async () => {
  const fetchMock = async () => respuestaJson(400, { error: 'JSON inválido' })
  const { api } = await importarApiFresco(fetchMock, 'error-400-sin-detalles')

  const error = await api.post('/cotizaciones', {}).catch((e) => e)

  assert.equal(error.message, 'JSON inválido')
})

test('un 4xx con mensaje de negocio en español se muestra tal cual', async () => {
  const fetchMock = async () => respuestaJson(409, { error: 'El plan ya no está activo' })
  const { api } = await importarApiFresco(fetchMock, 'error-409')

  const error = await api.post('/cotizaciones', {}).catch((e) => e)

  assert.equal(error.message, 'El plan ya no está activo')
  assert.equal(error.status, 409)
})

test('un 5xx nunca muestra el texto crudo del servidor', async () => {
  const fetchMock = async () =>
    respuestaJson(500, { error: 'duplicate key value violates unique constraint "x"' })
  const { api } = await importarApiFresco(fetchMock, 'error-500')

  const error = await api.post('/cotizaciones', {}).catch((e) => e)

  assert.equal(error.message, 'Ocurrió un error en el servidor. Intentá de nuevo en unos minutos.')
  assert.equal(error.status, 500)
})

test('si fetch falla por red (Failed to fetch) muestra un mensaje claro de conexión', async () => {
  const fetchMock = async () => {
    throw new TypeError('Failed to fetch')
  }
  const { api } = await importarApiFresco(fetchMock, 'error-red')

  const error = await api.get('/ramos').catch((e) => e)

  assert.equal(
    error.message,
    'No hay conexión con el servidor. Revisá tu internet e intentá de nuevo.'
  )
})

test('getBlob aplica los mismos mensajes claros de red y de 5xx', async () => {
  const sinRed = await importarApiFresco(async () => {
    throw new TypeError('Failed to fetch')
  }, 'blob-red')
  const errorRed = await sinRed.api.getBlob('/x').catch((e) => e)
  assert.equal(
    errorRed.message,
    'No hay conexión con el servidor. Revisá tu internet e intentá de nuevo.'
  )

  const caido = await importarApiFresco(
    async () => respuestaJson(500, { error: 'boom' }),
    'blob-500'
  )
  const error500 = await caido.api.getBlob('/x').catch((e) => e)
  assert.equal(
    error500.message,
    'Ocurrió un error en el servidor. Intentá de nuevo en unos minutos.'
  )
})

const AVISO_SESION_EXPIRADA = 'Tu sesión expiró. Ingresá de nuevo para continuar.'

const respuestaMe = () =>
  new Response(JSON.stringify({ usuario: { id: 7 }, csrfToken: 'csrf' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

test('un 401 a mitad de sesión deja un aviso de sesión expirada para la pantalla de login', async () => {
  let call = 0
  const fetchMock = async () => {
    call += 1
    return call === 1 ? respuestaMe() : new Response('{}', { status: 401 })
  }
  const { api, auth } = await importarApiFresco(fetchMock, 'aviso-401-mid-session')

  await auth.cargarSesion()
  await assert.rejects(() => api.get('/cotizaciones'))

  assert.equal(auth.consumirAvisoLogin(), AVISO_SESION_EXPIRADA)
  assert.equal(auth.consumirAvisoLogin(), null, 'el aviso se muestra una sola vez')
})

test('un 401 al cargar una página nueva con una sesión que estaba activa en la pestaña también avisa', async () => {
  const fetchMock = async () => new Response('{}', { status: 401 })
  const { auth } = await importarApiFresco(fetchMock, 'aviso-401-nueva-pagina')
  window.sessionStorage.setItem('tajy_sesion_activa', '1')

  assert.equal(await auth.cargarSesion(), null)

  assert.equal(auth.consumirAvisoLogin(), AVISO_SESION_EXPIRADA)
})

test('un 401 en la primera visita (sin sesión previa) no dice que la sesión expiró', async () => {
  const fetchMock = async () => new Response('{}', { status: 401 })
  const { auth } = await importarApiFresco(fetchMock, 'aviso-401-primera-visita')

  assert.equal(await auth.cargarSesion(), null)

  assert.equal(auth.consumirAvisoLogin(), null)
})

test('logout() borra la marca de sesión activa: un 401 posterior no avisa expiración', async () => {
  let call = 0
  const fetchMock = async () => {
    call += 1
    if (call === 1) return respuestaMe()
    if (call === 2) return new Response(null, { status: 204 })
    return new Response('{}', { status: 401 })
  }
  const { auth } = await importarApiFresco(fetchMock, 'aviso-logout-limpia-marca')

  await auth.cargarSesion()
  await auth.logout()
  assert.equal(await auth.cargarSesion(), null)

  assert.equal(auth.consumirAvisoLogin(), null)
})

test('consumirAvisoLogin tolera que sessionStorage no esté disponible', async () => {
  const { auth } = await importarApiFresco(async () => respuestaMe(), 'aviso-sin-storage')
  Object.defineProperty(window, 'sessionStorage', {
    get() {
      throw new Error('storage bloqueado')
    },
    configurable: true,
  })

  assert.equal(auth.consumirAvisoLogin(), null)
  assert.equal((await auth.cargarSesion()).id, 7)
})
