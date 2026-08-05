import assert from 'node:assert/strict'
import { test } from 'node:test'

// Cambio `rpf-variable-mrc`, Fase 3 (admin backend) — GET/PUT /admin/rpf-cuotas. Archivo
// separado (no admin.controller.test.js, que no existe) siguiendo el mismo criterio de
// aislamiento que admin.controller.rubros-actividad.test.js: mockear Supabase evita que los
// otros 6 services que admin.controller.js importa exploten al cargar sin backend/.env.
function mockearSupabase(t) {
  t.mock.module('../config/supabase.js', { namedExports: { supabase: {} } })
}

function crearResFake() {
  const res = { statusCode: 200, body: undefined }
  res.status = (codigo) => {
    res.statusCode = codigo
    return res
  }
  res.json = (payload) => {
    res.body = payload
    return res
  }
  return res
}

function celda(overrides = {}) {
  return { forma_pago_id: 2, cuotas: 5, tasa_rpf: 3.04, ...overrides }
}

test('admin editarCurvaRpf: payload válido llama al service, invalida caché y responde 200', async (t) => {
  mockearSupabase(t)
  let celdasRecibidas
  let cacheInvalidada = false
  t.mock.module('../services/admin/planes.service.js', {
    namedExports: {
      listarCurvaRpf: () => [],
      editarCurvaRpf: (celdas) => {
        celdasRecibidas = celdas
        return celdas.map((c, i) => ({ id: i + 1, ...c }))
      },
    },
  })
  t.mock.module('../services/cache.js', {
    namedExports: {
      invalidarCacheCatalogos: () => {
        cacheInvalidada = true
      },
    },
  })
  const { editarCurvaRpf } = await import('./admin.controller.js?case=rpf-cuotas-valido')

  const req = { body: { celdas: [celda(), celda({ cuotas: 6, tasa_rpf: 3.88 })] } }
  const res = crearResFake()
  let errorPasadoANext
  await editarCurvaRpf(req, res, (err) => {
    errorPasadoANext = err
  })

  assert.equal(errorPasadoANext, undefined)
  assert.equal(celdasRecibidas.length, 2)
  assert.equal(cacheInvalidada, true)
  assert.equal(res.body.length, 2)
  assert.equal(res.body[0].tasa_rpf, 3.04)
})

// NOTA: `editarCurvaRpfSchema.parse()` lanza un ZodError crudo (sin `.status`) — mismo
// patrón que el resto de los controllers de admin.controller.js (ningún schema.parse() de
// este archivo mapea a httpError(400) explícito; es un gap conocido y aceptado, ver CLAUDE.md
// "errores Zod sin mapear a 400"). Estos tests verifican que next() recibe el ZodError y que
// el service NUNCA se invoca con datos inválidos — no el código HTTP final (eso lo decide el
// error handler de app.js, fuera del alcance de un test de controller aislado).
test('admin editarCurvaRpf: celda malformada (sin tasa_rpf) pasa un ZodError a next() y no llama al service', async (t) => {
  mockearSupabase(t)
  let llamado = false
  t.mock.module('../services/admin/planes.service.js', {
    namedExports: {
      listarCurvaRpf: () => [],
      editarCurvaRpf: () => {
        llamado = true
        return []
      },
    },
  })
  t.mock.module('../services/cache.js', {
    namedExports: { invalidarCacheCatalogos: () => {} },
  })
  const { editarCurvaRpf } = await import('./admin.controller.js?case=rpf-cuotas-malformado')

  const req = { body: { celdas: [{ forma_pago_id: 1, cuotas: 3 }] } }
  const res = crearResFake()
  let errorPasadoANext
  await editarCurvaRpf(req, res, (err) => {
    errorPasadoANext = err
  })

  assert.equal(llamado, false)
  assert.ok(errorPasadoANext)
  assert.equal(errorPasadoANext.name, 'ZodError')
})

test('admin editarCurvaRpf: array de celdas vacío pasa un ZodError a next()', async (t) => {
  mockearSupabase(t)
  t.mock.module('../services/admin/planes.service.js', {
    namedExports: { listarCurvaRpf: () => [], editarCurvaRpf: () => [] },
  })
  t.mock.module('../services/cache.js', {
    namedExports: { invalidarCacheCatalogos: () => {} },
  })
  const { editarCurvaRpf } = await import('./admin.controller.js?case=rpf-cuotas-vacio')

  const req = { body: { celdas: [] } }
  const res = crearResFake()
  let errorPasadoANext
  await editarCurvaRpf(req, res, (err) => {
    errorPasadoANext = err
  })

  assert.ok(errorPasadoANext)
  assert.equal(errorPasadoANext.name, 'ZodError')
})

test('admin listarCurvaRpf: responde con la curva devuelta por el service', async (t) => {
  mockearSupabase(t)
  t.mock.module('../services/admin/planes.service.js', {
    namedExports: {
      listarCurvaRpf: () => [{ id: 1, forma_pago_id: 1, cuotas: 1, tasa_rpf: 1.2 }],
      editarCurvaRpf: () => [],
    },
  })
  const { listarCurvaRpf } = await import('./admin.controller.js?case=rpf-cuotas-listar')

  const req = {}
  const res = crearResFake()
  await listarCurvaRpf(req, res, () => {})

  assert.equal(res.body.length, 1)
  assert.equal(res.body[0].tasa_rpf, 1.2)
})
