import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'http://localhost/admin/' })
globalThis.window = dom.window
globalThis.document = dom.window.document

const { api } = await import('../shared/api.js')
const { state } = await import('./state.js')
const { guardarModalCobertura, guardarMontoFranquicia } = await import('./coberturas.js')

function prepararMrc() {
  state.ramos = [{ id: 5, nombre: 'mrc', calculador: 'mrc', nombre_display: 'MRC' }]
  state.ramoCoberturasSeleccionado = 5
  state.planCoberturasSeleccionado = 50
  state.planesPorRamoCob = { 5: { loading: false, error: '', datos: [{ id: 50, nombre: 'Plan' }] } }
  state.catalogoPorRamo = {
    5: [{ id: 10, ramo_id: 5, codigo: 'cristales', nombre: 'Cristales' }],
  }
  state.coberturasDelPlan = {
    50: {
      loading: false,
      error: '',
      datos: [
        {
          id: 20,
          cobertura_id: 10,
          monto: 1_000_000,
          franquicia: 500_000,
          coberturas_catalogo: { codigo: 'cristales', nombre: 'Cristales' },
        },
      ],
    },
  }
  state.coberturaEnEdicion = new Set([20])
}

test('acciones Admin MRC canonicalizan franquicia 0 o vacía a NULL en altas y ediciones', async () => {
  prepararMrc()
  const putOriginal = api.put
  const postOriginal = api.post
  const getOriginal = api.get
  const llamadas = []
  api.put = async (ruta, body) => {
    llamadas.push({ metodo: 'put', ruta, body })
    return { id: 20, ...body }
  }
  api.post = async (ruta, body) => {
    llamadas.push({ metodo: 'post', ruta, body })
    return { id: 21, ...body }
  }
  api.get = async () => []

  try {
    for (const entrada of ['0', '']) {
      await guardarMontoFranquicia(20, 50, {
        monto: { value: '1000000' },
        franquicia: { value: entrada },
      })
    }

    state.modalCobertura = {
      error: '',
      guardando: false,
      cobertura_id: 10,
      incluida_por_defecto: false,
      monto: '',
      franquicia: '0',
    }
    await guardarModalCobertura({
      cobertura_id: { value: '10' },
      incluida_por_defecto: { checked: false },
      monto: { value: '' },
      franquicia: { value: '0' },
    })

    assert.deepEqual(
      llamadas.map((llamada) => llamada.body.franquicia),
      [null, null, null]
    )
  } finally {
    api.put = putOriginal
    api.post = postOriginal
    api.get = getOriginal
  }
})
