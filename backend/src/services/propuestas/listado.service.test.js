import assert from 'node:assert/strict'
import { test } from 'node:test'

const AGENTE = { id: 5, rol: 'agente' }
const OTRO_AGENTE_CON_PERMISOS = {
  id: 6,
  rol: 'agente',
  puede_descargar_propuestas: true,
  puede_anular_propuestas: true,
}
const ADMIN = { id: 99, rol: 'admin' }

function filaBase(overrides = {}) {
  return {
    id: 1,
    estado: 'emitida',
    pdf_storage_path: 'mrc/1.pdf',
    agente_id: 5,
    ...overrides,
  }
}

test('listarPropuestas: an agent never gets admin scope even if a contaminated es_admin=true arrives from outside', async (t) => {
  const calls = []
  t.mock.module('../../repositories/propuestas.repository.js', {
    namedExports: {
      listarPropuestas: async (params) => {
        calls.push(params)
        return { data: [], count: 0 }
      },
    },
  })
  const { listarPropuestas } = await import('./listado.service.js?case=scope-contamination')

  // usuario.rol === 'agente' regardless of any extraneous es_admin flag that might be
  // smuggled into the object — the service must derive esAdmin from usuario.rol only.
  const usuarioContaminado = { ...AGENTE, es_admin: true }
  await listarPropuestas({}, usuarioContaminado)

  assert.equal(calls[0].esAdmin, false)
  assert.equal(calls[0].usuarioId, AGENTE.id)
})

test('listarPropuestas: admin scope is derived from rol === "admin"', async (t) => {
  const calls = []
  t.mock.module('../../repositories/propuestas.repository.js', {
    namedExports: {
      listarPropuestas: async (params) => {
        calls.push(params)
        return { data: [], count: 0 }
      },
    },
  })
  const { listarPropuestas } = await import('./listado.service.js?case=admin-scope')

  await listarPropuestas({}, ADMIN)

  assert.equal(calls[0].esAdmin, true)
  assert.equal(calls[0].usuarioId, ADMIN.id)
})

test('listarPropuestas: estado="activa" expands to the 4 live states', async (t) => {
  const calls = []
  t.mock.module('../../repositories/propuestas.repository.js', {
    namedExports: {
      listarPropuestas: async (params) => {
        calls.push(params)
        return { data: [], count: 0 }
      },
    },
  })
  const { listarPropuestas } = await import('./listado.service.js?case=activa-expansion')

  await listarPropuestas({ estado: 'activa' }, AGENTE)

  assert.deepEqual(calls[0].estados, ['borrador', 'en_revision', 'generando_pdf', 'error_pdf'])
})

test('listarPropuestas: a single real estado is passed through as a one-item array', async (t) => {
  const calls = []
  t.mock.module('../../repositories/propuestas.repository.js', {
    namedExports: {
      listarPropuestas: async (params) => {
        calls.push(params)
        return { data: [], count: 0 }
      },
    },
  })
  const { listarPropuestas } = await import('./listado.service.js?case=single-estado')

  await listarPropuestas({ estado: 'emitida' }, AGENTE)

  assert.deepEqual(calls[0].estados, ['emitida'])
})

test('listarPropuestas: no estado filter passes null (no expansion, no restriction)', async (t) => {
  const calls = []
  t.mock.module('../../repositories/propuestas.repository.js', {
    namedExports: {
      listarPropuestas: async (params) => {
        calls.push(params)
        return { data: [], count: 0 }
      },
    },
  })
  const { listarPropuestas } = await import('./listado.service.js?case=no-estado')

  await listarPropuestas({}, AGENTE)

  assert.equal(calls[0].estados, null)
})

test('listarPropuestas: agente_id is removed from every output row', async (t) => {
  t.mock.module('../../repositories/propuestas.repository.js', {
    namedExports: {
      listarPropuestas: async () => ({ data: [filaBase()], count: 1 }),
    },
  })
  const { listarPropuestas } = await import('./listado.service.js?case=strip-agente-id')

  const result = await listarPropuestas({}, AGENTE)

  assert.equal(Object.prototype.hasOwnProperty.call(result.data[0], 'agente_id'), false)
})

test('flags: puede_continuar is true for each of the 4 live states and false for terminal states', async (t) => {
  const filas = [
    filaBase({ id: 1, estado: 'borrador' }),
    filaBase({ id: 2, estado: 'en_revision' }),
    filaBase({ id: 3, estado: 'generando_pdf' }),
    filaBase({ id: 4, estado: 'error_pdf' }),
    filaBase({ id: 5, estado: 'emitida' }),
    filaBase({ id: 6, estado: 'anulada' }),
    filaBase({ id: 7, estado: 'reemplazada' }),
  ]
  t.mock.module('../../repositories/propuestas.repository.js', {
    namedExports: {
      listarPropuestas: async () => ({ data: filas, count: filas.length }),
    },
  })
  const { listarPropuestas } = await import('./listado.service.js?case=puede-continuar')

  const result = await listarPropuestas({}, AGENTE)
  const porId = Object.fromEntries(result.data.map((row) => [row.id, row]))

  assert.equal(porId[1].puede_continuar, true)
  assert.equal(porId[2].puede_continuar, true)
  assert.equal(porId[3].puede_continuar, true)
  assert.equal(porId[4].puede_continuar, true)
  assert.equal(porId[5].puede_continuar, false)
  assert.equal(porId[6].puede_continuar, false)
  assert.equal(porId[7].puede_continuar, false)
})

test('flags: puede_descargar is true only for emitida/anulada with pdf and matching authorization (mirrors canDownload)', async (t) => {
  const filas = [
    filaBase({ id: 1, estado: 'emitida', pdf_storage_path: 'p.pdf', agente_id: AGENTE.id }),
    filaBase({ id: 2, estado: 'anulada', pdf_storage_path: 'p.pdf', agente_id: AGENTE.id }),
    filaBase({ id: 3, estado: 'reemplazada', pdf_storage_path: 'p.pdf', agente_id: AGENTE.id }),
    filaBase({ id: 4, estado: 'emitida', pdf_storage_path: null, agente_id: AGENTE.id }),
    filaBase({ id: 5, estado: 'emitida', pdf_storage_path: 'p.pdf', agente_id: 999 }), // not owner
  ]
  t.mock.module('../../repositories/propuestas.repository.js', {
    namedExports: {
      listarPropuestas: async () => ({ data: filas, count: filas.length }),
    },
  })
  const { listarPropuestas } = await import('./listado.service.js?case=puede-descargar')

  const result = await listarPropuestas({}, AGENTE)
  const porId = Object.fromEntries(result.data.map((row) => [row.id, row]))

  assert.equal(porId[1].puede_descargar, true)
  assert.equal(porId[2].puede_descargar, true)
  assert.equal(porId[3].puede_descargar, false, 'reemplazada must never be downloadable')
  assert.equal(porId[4].puede_descargar, false, 'no pdf_storage_path means not downloadable')
  assert.equal(
    porId[5].puede_descargar,
    false,
    'non-owner agent without extra permission cannot download'
  )
})

test('flags: puede_descargar is true for a non-owner agent granted puede_descargar_propuestas', async (t) => {
  const filas = [filaBase({ id: 1, estado: 'emitida', pdf_storage_path: 'p.pdf', agente_id: 999 })]
  t.mock.module('../../repositories/propuestas.repository.js', {
    namedExports: {
      listarPropuestas: async () => ({ data: filas, count: 1 }),
    },
  })
  const { listarPropuestas } = await import('./listado.service.js?case=puede-descargar-permiso')

  const result = await listarPropuestas({}, OTRO_AGENTE_CON_PERMISOS)

  assert.equal(result.data[0].puede_descargar, true)
})

test('flags: puede_descargar is true for admin regardless of ownership', async (t) => {
  const filas = [filaBase({ id: 1, estado: 'anulada', pdf_storage_path: 'p.pdf', agente_id: 999 })]
  t.mock.module('../../repositories/propuestas.repository.js', {
    namedExports: {
      listarPropuestas: async () => ({ data: filas, count: 1 }),
    },
  })
  const { listarPropuestas } = await import('./listado.service.js?case=puede-descargar-admin')

  const result = await listarPropuestas({}, ADMIN)

  assert.equal(result.data[0].puede_descargar, true)
})

test('flags: puede_anular is true only for estado=emitida with matching authorization (mirrors anularPropuesta guard)', async (t) => {
  const filas = [
    filaBase({ id: 1, estado: 'emitida', agente_id: AGENTE.id }),
    filaBase({ id: 2, estado: 'borrador', agente_id: AGENTE.id }),
    filaBase({ id: 3, estado: 'anulada', agente_id: AGENTE.id }),
  ]
  t.mock.module('../../repositories/propuestas.repository.js', {
    namedExports: {
      listarPropuestas: async () => ({ data: filas, count: filas.length }),
    },
  })
  const { listarPropuestas } = await import('./listado.service.js?case=puede-anular-no-permiso')

  const result = await listarPropuestas({}, AGENTE)
  const porId = Object.fromEntries(result.data.map((row) => [row.id, row]))

  assert.equal(porId[1].puede_anular, false, 'agent without puede_anular_propuestas cannot annul')
  assert.equal(porId[2].puede_anular, false)
  assert.equal(porId[3].puede_anular, false)
})

test('flags: puede_anular is true for an agent with puede_anular_propuestas on estado=emitida', async (t) => {
  const filas = [filaBase({ id: 1, estado: 'emitida', agente_id: 999 })]
  t.mock.module('../../repositories/propuestas.repository.js', {
    namedExports: {
      listarPropuestas: async () => ({ data: filas, count: 1 }),
    },
  })
  const { listarPropuestas } = await import('./listado.service.js?case=puede-anular-permiso')

  const result = await listarPropuestas({}, OTRO_AGENTE_CON_PERMISOS)

  assert.equal(result.data[0].puede_anular, true)
})

test('flags: puede_anular is true for admin on estado=emitida', async (t) => {
  const filas = [filaBase({ id: 1, estado: 'emitida', agente_id: 999 })]
  t.mock.module('../../repositories/propuestas.repository.js', {
    namedExports: {
      listarPropuestas: async () => ({ data: filas, count: 1 }),
    },
  })
  const { listarPropuestas } = await import('./listado.service.js?case=puede-anular-admin')

  const result = await listarPropuestas({}, ADMIN)

  assert.equal(result.data[0].puede_anular, true)
})

test('listarPropuestas: propagates { count } from the repository unchanged', async (t) => {
  t.mock.module('../../repositories/propuestas.repository.js', {
    namedExports: {
      listarPropuestas: async () => ({ data: [filaBase()], count: 42 }),
    },
  })
  const { listarPropuestas } = await import('./listado.service.js?case=count-propagation')

  const result = await listarPropuestas({}, AGENTE)

  assert.equal(result.count, 42)
})
