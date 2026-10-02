import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

// QA adversarial 2026-10-01: `:id` no numérico llegaba crudo a Supabase (`22P02` -> 500).
// Todos los handlers con `:id` deben validar con cotizacionIdParamsSchema y responder 400.

const USUARIO = { id: 1, rol: 'agente' }

function crearResFake() {
  const res = { jsonLlamado: false, sendLlamado: false }
  res.json = (payload) => {
    res.jsonLlamado = true
    res.body = payload
    return res
  }
  res.send = () => {
    res.sendLlamado = true
    return res
  }
  res.setHeader = () => res
  return res
}

async function ejecutarConNext(handler, req, res) {
  let errorPasadoANext
  await handler(req, res, (err) => {
    errorPasadoANext = err
  })
  return errorPasadoANext
}

const IDS_INVALIDOS = ['abc', '1.5', '-3', '0', '1e999', '', '99999999999']

describe('obtener — :id inválido', () => {
  for (const id of IDS_INVALIDOS) {
    test(`id "${id}" responde 400 y no toca el service`, async (t) => {
      let servicioLlamado = false
      t.mock.module('../services/cotizacion.service.js', {
        namedExports: {
          obtenerCotizacion: async () => {
            servicioLlamado = true
          },
        },
      })
      const { obtener } = await import(`./cotizaciones.controller.js?case=obtener-id-${id}`)

      const err = await ejecutarConNext(
        obtener,
        { params: { id }, usuario: USUARIO },
        crearResFake()
      )

      assert.equal(err?.status, 400)
      assert.equal(servicioLlamado, false)
    })
  }

  test('id numérico llega al service como número', async (t) => {
    let idRecibido
    t.mock.module('../services/cotizacion.service.js', {
      namedExports: {
        obtenerCotizacion: async (id) => {
          idRecibido = id
          return { id }
        },
      },
    })
    const { obtener } = await import('./cotizaciones.controller.js?case=obtener-id-ok')

    const err = await ejecutarConNext(
      obtener,
      { params: { id: '7' }, usuario: USUARIO },
      crearResFake()
    )

    assert.equal(err, undefined)
    assert.equal(idRecibido, 7)
  })
})

describe('actualizar — :id inválido', () => {
  for (const id of IDS_INVALIDOS) {
    test(`id "${id}" responde 400 y no toca el service`, async (t) => {
      let servicioLlamado = false
      t.mock.module('../services/cotizacion.service.js', {
        namedExports: {
          actualizarCotizacion: async () => {
            servicioLlamado = true
          },
        },
      })
      const { actualizar } = await import(`./cotizaciones.controller.js?case=actualizar-id-${id}`)

      const err = await ejecutarConNext(
        actualizar,
        { params: { id }, body: {}, usuario: USUARIO },
        crearResFake()
      )

      assert.equal(err?.status, 400)
      assert.equal(servicioLlamado, false)
    })
  }
})
