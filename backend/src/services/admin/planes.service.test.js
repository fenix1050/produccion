import assert from 'node:assert/strict'
import { test } from 'node:test'

function mockear(t, { codigo = 'cristales', franquiciaActual = 500_000, calculador = 'mrc' } = {}) {
  const cobertura = { id: 10, ramo_id: 5, codigo, nombre: codigo }
  const fila = {
    id: 20,
    plan_id: 50,
    cobertura_id: cobertura.id,
    franquicia: franquiciaActual,
    coberturas_catalogo: cobertura,
  }
  const escrituras = []

  t.mock.module('../../repositories/coberturas.repository.js', {
    namedExports: {
      findCoberturaCatalogoById: async () => cobertura,
      findPlanCoberturaById: async () => fila,
      crearPlanCobertura: async (_planId, datos) => ({ ...fila, ...datos }),
      actualizarPlanCobertura: async (_id, cambios) => {
        escrituras.push(cambios)
        return { ...fila, ...cambios }
      },
      findPlanCoberturasByPlanId: async () => [],
      eliminarPlanCobertura: async () => {},
    },
  })
  t.mock.module('../../repositories/ramos.repository.js', {
    namedExports: {
      findPlanById: async () => ({ id: 50, ramo_id: 5 }),
      findRamoById: async () => ({ id: 5, calculador }),
      findFormasPagoDelPlanTodas: async () => [],
      findCurvaRpf: async () => [],
    },
  })
  t.mock.module('../../repositories/tasas.repository.js', {
    namedExports: {
      findAllPlanes: async () => [],
      actualizarPlan: async () => null,
      findPlanById: async () => null,
      eliminarPlan: async () => {},
      actualizarPlanFormaPago: async () => null,
      upsertCurvaRpf: async () => [],
    },
  })
  return escrituras
}

for (const [codigo, entrada, esperada] of [
  ['incendio_edificio', null, null],
  ['cristales', null, null],
  ['responsabilidad_civil', 0, null],
  ['cristales', 800_000, 800_000],
]) {
  test(`editarPlanCobertura canonicaliza la franquicia MRC ${String(entrada)} para ${codigo}`, async (t) => {
    const escrituras = mockear(t, { codigo })
    const { editarPlanCobertura } = await import(
      `./planes.service.js?case=editar-${codigo}-${String(entrada)}`
    )
    const resultado = await editarPlanCobertura(20, { franquicia: entrada })

    assert.equal(resultado.franquicia, esperada)
    assert.deepEqual(escrituras, [{ franquicia: esperada }])
  })
}

test('agregarCoberturaAPlan canonicaliza cero a NULL para cualquier cobertura MRC', async (t) => {
  mockear(t, { codigo: 'responsabilidad_civil' })
  const { agregarCoberturaAPlan } = await import('./planes.service.js?case=agregar-mrc-cero')

  const resultado = await agregarCoberturaAPlan(50, {
    cobertura_id: 10,
    incluida_por_defecto: false,
    monto: null,
    franquicia: 0,
  })
  assert.equal(resultado.franquicia, null)
})

test('editarPlanCobertura sigue rechazando franquicias MRC negativas', async (t) => {
  const escrituras = mockear(t, { codigo: 'cristales' })
  const { editarPlanCobertura } = await import('./planes.service.js?case=mrc-cristales-negativa')

  await assert.rejects(() => editarPlanCobertura(20, { franquicia: -1 }), /no puede ser negativa/i)
  assert.deepEqual(escrituras, [])
})

test('agregarCoberturaAPlan no cambia el nullable histórico de otros ramos', async (t) => {
  mockear(t, { codigo: 'otra', calculador: 'incendio' })
  const { agregarCoberturaAPlan } = await import('./planes.service.js?case=otro-ramo-null')
  const resultado = await agregarCoberturaAPlan(50, {
    cobertura_id: 10,
    incluida_por_defecto: false,
    monto: null,
    franquicia: null,
  })
  assert.equal(resultado.franquicia, null)
})
