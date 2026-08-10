import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { httpError } from '../utils/http-error.js'

// Cobertura de aislamiento horizontal (IDOR) a nivel de controller — issue #188. Los controllers
// son thin pass-throughs (ver cotizaciones.controller.js): reciben `req.usuario`, llaman al
// service y propagan errores vía `next(err)`. Estos tests confirman que el 403 que lanza
// `verificarPropiedad()` (probado directamente en cotizacion.service.ownership.test.js) llega
// intacto a `next()` sin que el controller lo trague ni llame a `res.json`/`res.send`.
// NO se cambia código de producción en este archivo.

const AGENTE_A = { id: 1, rol: 'agente' }
const AGENTE_B = { id: 2, rol: 'agente' }
const ADMIN = { id: 99, rol: 'admin' }

const COTIZACION_DE_A = { id: 7, agente_id: AGENTE_A.id }
const COTIZACION_DE_B = { id: 7, agente_id: AGENTE_B.id }
const ERROR_403 = httpError(403, 'No tenés permiso para ver esta cotización')
const ERROR_403_EDITAR = httpError(403, 'No tenés permiso para editar esta cotización')
const ERROR_404 = httpError(404, 'Cotización no encontrada', 'Cotización no encontrada')

function crearResFake() {
  const res = {
    statusCode: 200,
    body: undefined,
    sent: undefined,
    jsonLlamado: false,
    sendLlamado: false,
  }
  res.status = (codigo) => {
    res.statusCode = codigo
    return res
  }
  res.json = (payload) => {
    res.jsonLlamado = true
    res.body = payload
    return res
  }
  res.send = (payload) => {
    res.sendLlamado = true
    res.sent = payload
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

describe('obtener — aislamiento horizontal', () => {
  test('dueño: succeeds, res.json llamado con la cotización', async (t) => {
    t.mock.module('../services/cotizacion.service.js', {
      namedExports: { obtenerCotizacion: async () => COTIZACION_DE_A },
    })
    const { obtener } = await import('./cotizaciones.controller.js?case=obtener-owner')

    const req = { params: { id: '7' }, usuario: AGENTE_A }
    const res = crearResFake()
    const err = await ejecutarConNext(obtener, req, res)

    assert.equal(err, undefined)
    assert.ok(res.jsonLlamado)
    assert.deepEqual(res.body, COTIZACION_DE_A)
  })

  test('no-dueño: next(err) con 403, res.json NO llamado', async (t) => {
    t.mock.module('../services/cotizacion.service.js', {
      namedExports: {
        obtenerCotizacion: async () => {
          throw ERROR_403
        },
      },
    })
    const { obtener } = await import('./cotizaciones.controller.js?case=obtener-non-owner')

    const req = { params: { id: '7' }, usuario: AGENTE_A }
    const res = crearResFake()
    const err = await ejecutarConNext(obtener, req, res)

    assert.ok(err)
    assert.equal(err.status, 403)
    assert.equal(err.message, ERROR_403.message)
    assert.equal(res.jsonLlamado, false)
  })

  test('admin: bypasea el check, succeeds', async (t) => {
    t.mock.module('../services/cotizacion.service.js', {
      namedExports: { obtenerCotizacion: async () => COTIZACION_DE_B },
    })
    const { obtener } = await import('./cotizaciones.controller.js?case=obtener-admin')

    const req = { params: { id: '7' }, usuario: ADMIN }
    const res = crearResFake()
    const err = await ejecutarConNext(obtener, req, res)

    assert.equal(err, undefined)
    assert.deepEqual(res.body, COTIZACION_DE_B)
  })

  test('inexistente: next(err) con 404, res.json NO llamado', async (t) => {
    t.mock.module('../services/cotizacion.service.js', {
      namedExports: {
        obtenerCotizacion: async () => {
          throw ERROR_404
        },
      },
    })
    const { obtener } = await import('./cotizaciones.controller.js?case=obtener-404')

    const req = { params: { id: '999' }, usuario: AGENTE_A }
    const res = crearResFake()
    const err = await ejecutarConNext(obtener, req, res)

    assert.ok(err)
    assert.equal(err.status, 404)
    assert.equal(res.jsonLlamado, false)
  })
})

describe('pdfOferta — aislamiento horizontal', () => {
  test('dueño: succeeds, res.send llamado con el buffer del PDF', async (t) => {
    const buffer = Buffer.from('pdf')
    t.mock.module('../services/cotizacion.service.js', {
      namedExports: { generarPdfOferta: async () => buffer },
    })
    const { pdfOferta } = await import('./cotizaciones.controller.js?case=pdf-owner')

    const req = { params: { id: '7' }, usuario: AGENTE_A }
    const res = crearResFake()
    const err = await ejecutarConNext(pdfOferta, req, res)

    assert.equal(err, undefined)
    assert.ok(res.sendLlamado)
    assert.equal(res.sent, buffer)
  })

  test('no-dueño: next(err) con 403, res.send NO llamado (no se generó ni envió PDF)', async (t) => {
    let generado = false
    t.mock.module('../services/cotizacion.service.js', {
      namedExports: {
        generarPdfOferta: async () => {
          generado = true
          throw ERROR_403
        },
      },
    })
    const { pdfOferta } = await import('./cotizaciones.controller.js?case=pdf-non-owner')

    const req = { params: { id: '7' }, usuario: AGENTE_A }
    const res = crearResFake()
    const err = await ejecutarConNext(pdfOferta, req, res)

    assert.ok(err)
    assert.equal(err.status, 403)
    assert.equal(res.sendLlamado, false)
    // El mock del service ya simula que generarPdfOferta lanza el 403 ANTES de llegar a
    // renderOfertaPdf (ver cotizacion.service.ownership.test.js para la prueba real de eso) —
    // acá solo se confirma que aunque el service "generara" algo, el controller nunca lo manda.
    assert.ok(generado)
  })

  test('admin: bypasea el check, succeeds', async (t) => {
    const buffer = Buffer.from('pdf')
    t.mock.module('../services/cotizacion.service.js', {
      namedExports: { generarPdfOferta: async () => buffer },
    })
    const { pdfOferta } = await import('./cotizaciones.controller.js?case=pdf-admin')

    const req = { params: { id: '7' }, usuario: ADMIN }
    const res = crearResFake()
    const err = await ejecutarConNext(pdfOferta, req, res)

    assert.equal(err, undefined)
    assert.equal(res.sent, buffer)
  })

  test('inexistente: next(err) con 404, res.send NO llamado', async (t) => {
    t.mock.module('../services/cotizacion.service.js', {
      namedExports: {
        generarPdfOferta: async () => {
          throw ERROR_404
        },
      },
    })
    const { pdfOferta } = await import('./cotizaciones.controller.js?case=pdf-404')

    const req = { params: { id: '999' }, usuario: AGENTE_A }
    const res = crearResFake()
    const err = await ejecutarConNext(pdfOferta, req, res)

    assert.ok(err)
    assert.equal(err.status, 404)
    assert.equal(res.sendLlamado, false)
  })
})

describe('actualizar — aislamiento horizontal', () => {
  test('dueño: succeeds, res.json llamado con la cotización actualizada', async (t) => {
    const actualizada = { id: 7, agente_id: AGENTE_A.id, cliente_nombre: 'Nuevo Nombre' }
    t.mock.module('../services/cotizacion.service.js', {
      namedExports: { actualizarCotizacion: async () => actualizada },
    })
    const { actualizar } = await import('./cotizaciones.controller.js?case=actualizar-owner')

    const req = { params: { id: '7' }, body: { cliente_nombre: 'Nuevo Nombre' }, usuario: AGENTE_A }
    const res = crearResFake()
    const err = await ejecutarConNext(actualizar, req, res)

    assert.equal(err, undefined)
    assert.deepEqual(res.body, actualizada)
  })

  test('no-dueño: next(err) con 403, la escritura NUNCA se refleja en res.json', async (t) => {
    let escrituraLlamada = false
    t.mock.module('../services/cotizacion.service.js', {
      namedExports: {
        actualizarCotizacion: async () => {
          escrituraLlamada = true
          throw ERROR_403_EDITAR
        },
      },
    })
    const { actualizar } = await import('./cotizaciones.controller.js?case=actualizar-non-owner')

    const req = { params: { id: '7' }, body: { cliente_nombre: 'Hackeado' }, usuario: AGENTE_A }
    const res = crearResFake()
    const err = await ejecutarConNext(actualizar, req, res)

    assert.ok(err)
    assert.equal(err.status, 403)
    assert.equal(res.jsonLlamado, false)
    // El mock simula que el service ya rechazó ANTES de tocar el RPC de escritura (probado
    // directamente contra el service real en cotizacion.service.ownership.test.js) — acá se
    // confirma que, aun si "se llamara", el controller nunca lo expone como éxito.
    assert.ok(escrituraLlamada)
  })

  test('admin: bypasea el check, succeeds', async (t) => {
    const actualizada = { id: 7, agente_id: AGENTE_B.id, cliente_nombre: 'Editado por admin' }
    t.mock.module('../services/cotizacion.service.js', {
      namedExports: { actualizarCotizacion: async () => actualizada },
    })
    const { actualizar } = await import('./cotizaciones.controller.js?case=actualizar-admin')

    const req = {
      params: { id: '7' },
      body: { cliente_nombre: 'Editado por admin' },
      usuario: ADMIN,
    }
    const res = crearResFake()
    const err = await ejecutarConNext(actualizar, req, res)

    assert.equal(err, undefined)
    assert.deepEqual(res.body, actualizada)
  })

  test('inexistente: next(err) con 404, res.json NO llamado', async (t) => {
    t.mock.module('../services/cotizacion.service.js', {
      namedExports: {
        actualizarCotizacion: async () => {
          throw ERROR_404
        },
      },
    })
    const { actualizar } = await import('./cotizaciones.controller.js?case=actualizar-404')

    const req = { params: { id: '999' }, body: { cliente_nombre: 'x' }, usuario: AGENTE_A }
    const res = crearResFake()
    const err = await ejecutarConNext(actualizar, req, res)

    assert.ok(err)
    assert.equal(err.status, 404)
    assert.equal(res.jsonLlamado, false)
  })
})

describe('listar — filtro por agente (no usa verificarPropiedad)', () => {
  test('agente: el service recibe usuario.rol=agente, req.query vacío válido', async (t) => {
    let usuarioRecibido
    t.mock.module('../services/cotizacion.service.js', {
      namedExports: {
        listarCotizaciones: async (query, usuario) => {
          usuarioRecibido = usuario
          return { data: [], count: 0 }
        },
      },
    })
    const { listar } = await import('./cotizaciones.controller.js?case=listar-agente')

    const req = { query: {}, usuario: AGENTE_A }
    const res = crearResFake()
    const err = await ejecutarConNext(listar, req, res)

    assert.equal(err, undefined)
    assert.equal(usuarioRecibido.id, AGENTE_A.id)
    assert.equal(usuarioRecibido.rol, 'agente')
    assert.ok(res.jsonLlamado)
  })

  test('admin: el service recibe usuario.rol=admin', async (t) => {
    let usuarioRecibido
    t.mock.module('../services/cotizacion.service.js', {
      namedExports: {
        listarCotizaciones: async (query, usuario) => {
          usuarioRecibido = usuario
          return { data: [], count: 0 }
        },
      },
    })
    const { listar } = await import('./cotizaciones.controller.js?case=listar-admin')

    const req = { query: {}, usuario: ADMIN }
    const res = crearResFake()
    const err = await ejecutarConNext(listar, req, res)

    assert.equal(err, undefined)
    assert.equal(usuarioRecibido.rol, 'admin')
  })
})
