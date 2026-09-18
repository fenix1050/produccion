import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

// C-1 (sdd-verify): el deep link "Ver propuestas" que arma Historial
// (propuesta-accion.js:42, `../propuestas-listado/?carta_oferta_id=<id>`) es
// funcionalmente inerte porque cargarPropuestas() nunca leía window.location.search — el
// usuario terminaba viendo el listado completo sin filtrar. Estos tests montan la página
// real (mismo patrón que shared/api.test.js) con esa query string y verifican que el GET
// /propuestas efectivo incluya carta_oferta_id.

function montarEntornoDom(url) {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  return dom
}

function fetchMockFabrica(llamadas, propuestas = []) {
  return async (url) => {
    llamadas.push(String(url))
    if (String(url).includes('/auth/me')) {
      return new Response(JSON.stringify({ usuario: { id: 1, rol: 'agente' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ data: propuestas, count: propuestas.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

async function esperarCargaInicial() {
  // init() encadena auth.cargarSesion() -> renderApp() -> cargarPropuestas(), todas
  // promesas de microtask; varias vueltas de la cola de microtasks alcanzan sin recurrir
  // a temporizadores reales.
  for (let i = 0; i < 15; i++) await Promise.resolve()
}

test('cargarPropuestas() envía carta_oferta_id al backend cuando la URL trae ?carta_oferta_id=<id>', async () => {
  montarEntornoDom('http://localhost/propuestas-listado/?carta_oferta_id=777')

  const llamadas = []
  globalThis.fetch = fetchMockFabrica(llamadas)

  await import('./propuestas-listado.js?case=carta-oferta-id-777')
  await esperarCargaInicial()

  const llamadaPropuestas = llamadas.find((u) => u.includes('/propuestas?'))
  assert.ok(llamadaPropuestas, 'debería haber llamado a GET /propuestas')
  assert.match(llamadaPropuestas, /[?&]carta_oferta_id=777\b/)
})

test('sin carta_oferta_id en la URL, el listado no lo envía (comportamiento sin filtrar preservado)', async () => {
  montarEntornoDom('http://localhost/propuestas-listado/')

  const llamadas = []
  globalThis.fetch = fetchMockFabrica(llamadas)

  await import('./propuestas-listado.js?case=sin-carta-oferta-id')
  await esperarCargaInicial()

  const llamadaPropuestas = llamadas.find((u) => u.includes('/propuestas?'))
  assert.ok(llamadaPropuestas, 'debería haber llamado a GET /propuestas')
  assert.doesNotMatch(llamadaPropuestas, /carta_oferta_id/)
})

test('el detalle conserva los datos en cards y ofrece cierre visible accesible', async () => {
  montarEntornoDom('http://localhost/propuestas-listado/')

  const llamadas = []
  globalThis.fetch = fetchMockFabrica(llamadas, [
    {
      id: 6,
      numero_propuesta: '6',
      numero_carta: 'MRC-575',
      cliente_nombre: 'Cliente de prueba',
      estado: 'anulada',
      created_at: '2026-09-11T00:00:00.000Z',
      emitida_at: '2026-09-17T00:00:00.000Z',
    },
  ])

  await import('./propuestas-listado.js?case=detalle-modal-markup')
  await esperarCargaInicial()

  const botonDetalle = document.querySelector('[data-action="ver-detalle"]')
  assert.ok(botonDetalle, 'debería existir la acción Ver detalle')
  botonDetalle.focus()
  botonDetalle.click()

  const modal = document.querySelector('.admin-modal--detalle')
  assert.ok(modal, 'debería renderizarse el modal de detalle')
  assert.equal(modal.querySelector('h2').textContent, 'Detalle de propuesta')
  assert.match(
    modal.querySelector('.propuestas-listado-detalle__subtitle').textContent,
    /Información completa/
  )
  assert.equal(modal.querySelectorAll('.propuestas-listado-detalle__card').length, 6)
  assert.deepEqual(
    Array.from(modal.querySelectorAll('dt')).map((label) => label.textContent),
    ['Propuesta', 'Carta', 'Cliente', 'Estado', 'Creada', 'Emitida']
  )
  assert.equal(
    modal.querySelector('.propuestas-listado-detalle__close').getAttribute('aria-label'),
    'Cerrar detalle de propuesta'
  )
  assert.equal(
    modal
      .querySelector('.propuestas-listado-detalle__footer [data-action="cerrar-modal-detalle"]')
      .textContent.trim(),
    'Cerrar'
  )

  modal.querySelector('.propuestas-listado-detalle__close').click()
  const botonDetalleNuevo = document.querySelector('[data-action="ver-detalle"]')
  assert.notEqual(botonDetalleNuevo, botonDetalle, 'renderApp() debe crear un trigger nuevo')
  assert.equal(
    document.activeElement,
    botonDetalleNuevo,
    'el foco debe volver al trigger del detalle'
  )
})

// Único punto de entrada para crear una propuesta hoy es la pantalla de Bienvenida
// (../propuestas/ sin query arranca directo en cargarCartas(), el selector de Carta
// Oferta elegible — ver frontend/propuestas/propuestas.js:1190-1199, archivo de Codex,
// no tocado). Kevin pidió (2026-09-18) un link directo desde este listado, junto a
// "Limpiar filtros", en vez de tener que pasar por Bienvenida.
test('link "Nueva propuesta" presente junto a Limpiar filtros, apunta al selector de Carta Oferta del wizard', async () => {
  montarEntornoDom('http://localhost/propuestas-listado/')

  const llamadas = []
  globalThis.fetch = fetchMockFabrica(llamadas)

  await import('./propuestas-listado.js?case=nueva-propuesta-link')
  await esperarCargaInicial()

  const link = document.querySelector('a[data-action="nueva-propuesta"]')
  assert.ok(link, 'debería existir un link con data-action="nueva-propuesta"')
  assert.equal(link.getAttribute('href'), '../propuestas/')
  assert.equal(link.textContent.trim(), 'Nueva propuesta')

  const limpiarFiltros = document.querySelector('[data-action="limpiar-filtros"]')
  assert.ok(limpiarFiltros, 'debería seguir existiendo el botón Limpiar filtros')
  assert.equal(
    link.parentElement,
    limpiarFiltros.parentElement,
    'el link debe vivir en el mismo contenedor de acciones de filtros que Limpiar filtros'
  )
})
