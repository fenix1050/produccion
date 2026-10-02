import assert from 'node:assert/strict'
import { mock, test, describe, beforeEach } from 'node:test'

// QA adversarial 2026-10-01: `plan_id` inexistente/negativo/decimal/null/ausente/gigante y body
// no objeto respondían 500 porque el plan se buscaba en la DB ANTES de validar con Zod
// (`PGRST116`/`22P02`/`22003`). Ahora el body se valida primero y "sin filas" es un 404.

const llamadas = { plan: 0, ramo: 0 }
const estado = { plan: undefined, ramo: undefined, errorPlan: undefined, errorRamo: undefined }

mock.module('../repositories/ramos.repository.js', {
  namedExports: {
    findPlanById: async () => {
      llamadas.plan += 1
      if (estado.errorPlan) throw estado.errorPlan
      return estado.plan
    },
    findRamoById: async () => {
      llamadas.ramo += 1
      if (estado.errorRamo) throw estado.errorRamo
      return estado.ramo
    },
    findCoberturasByPlanId: async () => [],
  },
})
mock.module('../repositories/coberturas.repository.js', { namedExports: {} })
// Sin backend/.env (como en CI), los demás servicios que importa el módulo cargan
// config/supabase.js, que lanza si faltan SUPABASE_URL/SUPABASE_SERVICE_KEY.
mock.module('../config/supabase.js', { namedExports: { supabase: {} } })

const { validarYResolverContexto } = await import('./cotizacion-context.service.js')

const USUARIO = { id: 1, rol: 'agente' }
const BODY_AUTO = {
  plan_id: 3,
  capital_asegurado: 100_000_000,
  riesgo_datos: {
    marca: 'Toyota',
    modelo: 'Hilux',
    anio_fabricacion: 2022,
    destino: 'PARTICULAR',
    via_importacion: 'REPRESENTANTE',
  },
}

beforeEach(() => {
  llamadas.plan = 0
  llamadas.ramo = 0
  estado.plan = { id: 3, ramo_id: 1 }
  estado.ramo = { id: 1, calculador: 'auto', activo: true }
  estado.errorPlan = undefined
  estado.errorRamo = undefined
})

describe('body que no es un objeto', () => {
  for (const [nombre, body] of [
    ['array', []],
    ['null', null],
    ['string', 'hola'],
    ['número', 5],
    ['undefined', undefined],
  ]) {
    test(`${nombre} responde 400 sin consultar la DB`, async () => {
      await assert.rejects(
        () => validarYResolverContexto(body, USUARIO),
        (err) => {
          assert.equal(err.status, 400)
          assert.match(err.publicMessage, /objeto/)
          return true
        }
      )
      assert.equal(llamadas.plan, 0)
    })
  }
})

describe('plan_id inválido se rechaza ANTES de buscar el plan', () => {
  const casos = [
    ['ausente', undefined],
    ['null', null],
    ['negativo', -1],
    ['cero', 0],
    ['decimal', 1.5],
    ['string', '3'],
    ['gigante', 1e308],
    ['fuera de integer', 9_999_999_999],
  ]
  for (const [nombre, planId] of casos) {
    test(`plan_id ${nombre}`, async () => {
      const body = { ...BODY_AUTO }
      if (planId === undefined) delete body.plan_id
      else body.plan_id = planId

      await assert.rejects(
        () => validarYResolverContexto(body, USUARIO),
        (err) => {
          assert.equal(err.name, 'ZodError')
          assert.ok(err.issues.some((i) => i.path[0] === 'plan_id'))
          return true
        }
      )
      assert.equal(llamadas.plan, 0)
    })
  }
})

describe('plan o ramo inexistente', () => {
  test('plan sin filas (PGRST116) responde 404 en español, sin código de Postgres', async () => {
    estado.errorPlan = Object.assign(new Error('JSON object requested, multiple (or no) rows'), {
      code: 'PGRST116',
    })

    await assert.rejects(
      () => validarYResolverContexto(BODY_AUTO, USUARIO),
      (err) => {
        assert.equal(err.status, 404)
        assert.equal(err.publicMessage, 'Plan no encontrado')
        assert.equal(err.code, undefined)
        return true
      }
    )
  })

  test('ramo inactivo o inexistente (PGRST116) responde 404 en español', async () => {
    estado.errorRamo = Object.assign(new Error('no rows'), { code: 'PGRST116' })

    await assert.rejects(
      () => validarYResolverContexto(BODY_AUTO, USUARIO),
      (err) => {
        assert.equal(err.status, 404)
        assert.equal(err.publicMessage, 'Ramo no encontrado o inactivo')
        assert.equal(err.code, undefined)
        return true
      }
    )
  })

  test('otro error de la DB se propaga tal cual (sigue siendo un fallo real)', async () => {
    estado.errorPlan = Object.assign(new Error('conexión caída'), { code: '08006' })

    await assert.rejects(
      () => validarYResolverContexto(BODY_AUTO, USUARIO),
      (err) => err.code === '08006'
    )
  })
})

test('body válido resuelve plan, ramo y datos validados', async () => {
  const resultado = await validarYResolverContexto(BODY_AUTO, USUARIO)

  assert.equal(resultado.plan.id, 3)
  assert.equal(resultado.ramo.calculador, 'auto')
  assert.equal(resultado.datosValidados.plan_id, 3)
})
