import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><div id="app"></div>')
globalThis.document = dom.window.document

const { state } = await import('../state.js')
const { renderCoberturas, renderModalCobertura } = await import('./coberturas.js')

function prepararMrc() {
  state.ramos = [{ id: 5, nombre: 'mrc', nombre_display: 'MRC' }]
  state.ramoCoberturasSeleccionado = 5
  state.planCoberturasSeleccionado = 50
  state.planesPorRamoCob = { 5: { loading: false, error: '', datos: [{ id: 50, nombre: 'Plan' }] } }
  state.coberturasDelPlan = {
    50: {
      loading: false,
      error: '',
      datos: [
        {
          id: 1,
          cobertura_id: 10,
          franquicia: 500000,
          monto: null,
          incluida_por_defecto: false,
          coberturas_catalogo: {
            codigo: 'cristales',
            nombre: 'Cristales',
            categoria: 'Coberturas',
          },
        },
        {
          id: 2,
          cobertura_id: 11,
          franquicia: null,
          monto: null,
          incluida_por_defecto: false,
          coberturas_catalogo: {
            codigo: 'incendio_edificio',
            nombre: 'Incendio Edificio',
            categoria: 'Coberturas',
          },
        },
      ],
    },
  }
  state.coberturaEnEdicion = new Set([1, 2])
}

test('renderCoberturas permite cero o vacío para cualquier franquicia MRC', () => {
  prepararMrc()
  const documento = new JSDOM(renderCoberturas()).window.document
  const filas = [...documento.querySelectorAll('tbody tr')]

  for (const nombre of ['Cristales', 'Incendio Edificio']) {
    const fila = filas.find((candidata) => candidata.textContent.includes(nombre))
    assert.equal(fila.querySelector('input[name="franquicia"]')?.min, '0')
  }
})

test('renderModalCobertura comunica que cero equivale a Sin deducible para MRC', () => {
  prepararMrc()
  state.catalogoPorRamo = {
    5: [{ id: 12, codigo: 'responsabilidad_civil', nombre: 'Responsabilidad Civil' }],
  }
  state.modalCobertura = {
    error: '',
    guardando: false,
    cobertura_id: 12,
    incluida_por_defecto: false,
    monto: '',
    franquicia: '',
  }

  const documento = new JSDOM(renderModalCobertura()).window.document
  const input = documento.querySelector('input[name="franquicia"]')
  assert.equal(input?.min, '0')
  assert.match(input?.labels[0]?.textContent ?? '', /0 = Sin deducible/i)
})
