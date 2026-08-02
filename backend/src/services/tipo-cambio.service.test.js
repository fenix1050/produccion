import assert from 'node:assert/strict'
import { test } from 'node:test'

import { invalidarCacheCatalogos } from './cache.js'

// Servicio de tipo de cambio (grupo 2 de "incendio-3-planes-y-moneda"): fetch a la API pública
// de dolarPy con timeout + fallback a la última fila persistida en `tipos_cambio` si el fetch
// falla, cacheado por 15 min vía `withCache` (services/cache.js) para no pegarle a un tercero
// sin SLA en cada preview de cotización. Ver design.md "Interfaces / Contracts" y "Threat
// Matrix" para el contrato completo de casos adversariales cubiertos acá.

const RESPUESTA_DOLARPY_OK = {
  dolarpy: {
    set: { compra: 7250.5, venta: 7300.75 },
  },
}

function mockearRepositorio(t, { ultimoVigente = null, insertados = [] } = {}) {
  t.mock.module('../repositories/tipos-cambio.repository.js', {
    namedExports: {
      findUltimoVigente: async () => ultimoVigente,
      insertTipoCambio: async (datos) => {
        const fila = { id: insertados.length + 1, obtenido_en: new Date().toISOString(), ...datos }
        insertados.push(fila)
        return fila
      },
    },
  })
}

function mockearFetchOk(t, respuesta = RESPUESTA_DOLARPY_OK) {
  return t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    status: 200,
    json: async () => respuesta,
  }))
}

function mockearFetchHttpError(t, status = 500) {
  return t.mock.method(globalThis, 'fetch', async () => ({
    ok: false,
    status,
    json: async () => ({}),
  }))
}

function mockearFetchTimeout(t) {
  return t.mock.method(globalThis, 'fetch', (_url, { signal } = {}) => {
    return new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => {
        const err = new Error('The operation was aborted')
        err.name = 'AbortError'
        reject(err)
      })
    })
  })
}

function mockearFetchJsonInvalido(t, body) {
  return t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  }))
}

test('obtenerTipoCambioVigente: fetch OK persiste el valor y devuelve stale:false', async (t) => {
  invalidarCacheCatalogos()
  const insertados = []
  mockearRepositorio(t, { insertados })
  mockearFetchOk(t)

  const { obtenerTipoCambioVigente } = await import('./tipo-cambio.service.js?case=fetch-ok')

  const resultado = await obtenerTipoCambioVigente({ moneda: 'USD' })

  assert.equal(resultado.venta, 7300.75)
  assert.equal(resultado.compra, 7250.5)
  assert.equal(resultado.stale, false)
  assert.equal(resultado.fuente, 'dolarpy:set')
  assert.equal(insertados.length, 1, 'debe persistir la fila fresca en tipos_cambio')
})

test(
  'obtenerTipoCambioVigente: timeout (>3s) cae al último valor de DB con stale:true',
  async (t) => {
    invalidarCacheCatalogos()
    const ultimoVigente = {
      venta: 7100,
      compra: 7050,
      obtenido_en: '2026-07-20T10:00:00Z',
      fuente: 'dolarpy:set',
      origen: 'api',
    }
    mockearRepositorio(t, { ultimoVigente })
    mockearFetchTimeout(t)

    const warnOriginal = console.warn
    let logueoStale = false
    console.warn = (...args) => {
      logueoStale = true
      warnOriginal(...args)
    }

    try {
      const { obtenerTipoCambioVigente } = await import('./tipo-cambio.service.js?case=timeout')
      const resultado = await obtenerTipoCambioVigente({ moneda: 'USD' })

      assert.equal(resultado.stale, true)
      assert.equal(resultado.venta, 7100)
      assert.equal(logueoStale, true, 'debe loguear WARN cuando usa un valor stale')
    } finally {
      console.warn = warnOriginal
    }
  },
  { timeout: 8000 }
)

test('obtenerTipoCambioVigente: HTTP 4xx/5xx cae al último valor de DB con stale:true, sin reintento', async (t) => {
  invalidarCacheCatalogos()
  const ultimoVigente = {
    venta: 7100,
    compra: 7050,
    obtenido_en: '2026-07-20T10:00:00Z',
    fuente: 'dolarpy:set',
    origen: 'api',
  }
  mockearRepositorio(t, { ultimoVigente })
  const fetchMock = mockearFetchHttpError(t, 503)

  const { obtenerTipoCambioVigente } = await import('./tipo-cambio.service.js?case=http-5xx')
  const resultado = await obtenerTipoCambioVigente({ moneda: 'USD' })

  assert.equal(resultado.stale, true)
  assert.equal(fetchMock.mock.callCount(), 1, 'no debe reintentar en la misma request')
})

test('obtenerTipoCambioVigente: JSON malformado / campo dolarpy.set ausente cae a stale:true', async (t) => {
  invalidarCacheCatalogos()
  const ultimoVigente = {
    venta: 7100,
    compra: 7050,
    obtenido_en: '2026-07-20T10:00:00Z',
    fuente: 'dolarpy:set',
    origen: 'api',
  }
  mockearRepositorio(t, { ultimoVigente })
  mockearFetchJsonInvalido(t, { algo_inesperado: true })

  const { obtenerTipoCambioVigente } = await import('./tipo-cambio.service.js?case=json-sin-set')
  const resultado = await obtenerTipoCambioVigente({ moneda: 'USD' })

  assert.equal(resultado.stale, true)
  assert.equal(resultado.venta, 7100)
})

test('obtenerTipoCambioVigente: venta no numérico cae a stale:true', async (t) => {
  invalidarCacheCatalogos()
  const ultimoVigente = {
    venta: 7100,
    compra: 7050,
    obtenido_en: '2026-07-20T10:00:00Z',
    fuente: 'dolarpy:set',
    origen: 'api',
  }
  mockearRepositorio(t, { ultimoVigente })
  mockearFetchJsonInvalido(t, { dolarpy: { set: { compra: 7250, venta: 'no-numerico' } } })

  const { obtenerTipoCambioVigente } =
    await import('./tipo-cambio.service.js?case=venta-no-numerica')
  const resultado = await obtenerTipoCambioVigente({ moneda: 'USD' })

  assert.equal(resultado.stale, true)
  assert.equal(resultado.venta, 7100)
})

test('obtenerTipoCambioVigente: sin fetch exitoso ni valor previo en DB rechaza con 422', async (t) => {
  invalidarCacheCatalogos()
  mockearRepositorio(t, { ultimoVigente: null })
  mockearFetchHttpError(t, 500)

  const { obtenerTipoCambioVigente } = await import('./tipo-cambio.service.js?case=sin-fetch-ni-db')

  await assert.rejects(
    () => obtenerTipoCambioVigente({ moneda: 'USD' }),
    (err) => {
      assert.equal(err.status, 422)
      return true
    }
  )
})

test('obtenerTipoCambioVigente: segunda llamada dentro del TTL no vuelve a fetchear (withCache)', async (t) => {
  invalidarCacheCatalogos()
  const insertados = []
  mockearRepositorio(t, { insertados })
  const fetchMock = mockearFetchOk(t)

  const { obtenerTipoCambioVigente } = await import('./tipo-cambio.service.js?case=cache-ttl')

  await obtenerTipoCambioVigente({ moneda: 'USD' })
  await obtenerTipoCambioVigente({ moneda: 'USD' })

  assert.equal(fetchMock.mock.callCount(), 1, 'el segundo llamado debe servirse desde caché')
  assert.equal(insertados.length, 1)
})
