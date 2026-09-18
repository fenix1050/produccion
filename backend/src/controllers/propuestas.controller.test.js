import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

const AGENTE = { id: 5, rol: 'agente' }

function crearResFake() {
  const res = { statusCode: 200, body: undefined, jsonLlamado: false }
  res.status = (codigo) => {
    res.statusCode = codigo
    return res
  }
  res.json = (payload) => {
    res.jsonLlamado = true
    res.body = payload
    return res
  }
  return res
}

async function ejecutarConNext(handler, req, res) {
  let errorPasadoANext
  await handler(req, res, (err) => {
    errorPasadoANext = err
  })
  return errorPasadoANext
}

describe('listar', () => {
  test('invalid query (limit=0) rejects with a 400 error passed to next(), service never called', async (t) => {
    let servicioLlamado = false
    t.mock.module('../services/propuestas/listado.service.js', {
      namedExports: {
        listarPropuestas: async () => {
          servicioLlamado = true
          return { data: [], count: 0 }
        },
      },
    })
    const { listar } = await import('./propuestas.controller.js?case=listar-invalid-query')

    const req = { query: { limit: '0' }, usuario: AGENTE }
    const res = crearResFake()
    const err = await ejecutarConNext(listar, req, res)

    assert.ok(err)
    assert.equal(err.status, 400)
    assert.equal(res.jsonLlamado, false)
    assert.equal(servicioLlamado, false)
  })

  test('invalid estado rejects with a 400 error', async (t) => {
    t.mock.module('../services/propuestas/listado.service.js', {
      namedExports: {
        listarPropuestas: async () => ({ data: [], count: 0 }),
      },
    })
    const { listar } = await import('./propuestas.controller.js?case=listar-invalid-estado')

    const req = { query: { estado: 'no-existe' }, usuario: AGENTE }
    const res = crearResFake()
    const err = await ejecutarConNext(listar, req, res)

    assert.ok(err)
    assert.equal(err.status, 400)
  })

  test('valid query passes the service result through as res.json({ data, count })', async (t) => {
    const respuestaServicio = { data: [{ id: 1, estado: 'emitida' }], count: 1 }
    let queryRecibida
    let usuarioRecibido
    t.mock.module('../services/propuestas/listado.service.js', {
      namedExports: {
        listarPropuestas: async (query, usuario) => {
          queryRecibida = query
          usuarioRecibido = usuario
          return respuestaServicio
        },
      },
    })
    const { listar } = await import('./propuestas.controller.js?case=listar-valid')

    const req = { query: { busqueda: 'cliente' }, usuario: AGENTE }
    const res = crearResFake()
    const err = await ejecutarConNext(listar, req, res)

    assert.equal(err, undefined)
    assert.ok(res.jsonLlamado)
    assert.deepEqual(res.body, respuestaServicio)
    assert.equal(queryRecibida.busqueda, 'cliente')
    assert.equal(queryRecibida.limit, 20)
    assert.equal(queryRecibida.offset, 0)
    assert.equal(usuarioRecibido.id, AGENTE.id)
  })

  test('service errors propagate to next(err)', async (t) => {
    const errorServicio = new Error('boom')
    t.mock.module('../services/propuestas/listado.service.js', {
      namedExports: {
        listarPropuestas: async () => {
          throw errorServicio
        },
      },
    })
    const { listar } = await import('./propuestas.controller.js?case=listar-service-error')

    const req = { query: {}, usuario: AGENTE }
    const res = crearResFake()
    const err = await ejecutarConNext(listar, req, res)

    assert.equal(err, errorServicio)
    assert.equal(res.jsonLlamado, false)
  })
})
