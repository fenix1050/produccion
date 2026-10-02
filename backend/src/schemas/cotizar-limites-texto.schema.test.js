import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { cotizarAutoSchema } from './auto.schema.js'
import { cotizarIncendioSchema } from './incendio.schema.js'
import { cotizarMrcSchema } from './mrc.schema.js'
import { cotizarVidaApSchema } from './vida-ap.schema.js'

// QA adversarial 2026-10-01: strings sin tope. `cliente_nombre` de 1 MB reventaba la columna
// (`22001` -> 500) y `direccion` de 200 KB hacía tardar 22 s al render del PDF.

const largo = (n) => 'a'.repeat(n)

const BASE_AJUSTES = { descuentos: [], recargos: [] }

const BODIES_VALIDOS = {
  auto: {
    schema: cotizarAutoSchema,
    body: {
      plan_id: 1,
      capital_asegurado: 1000,
      riesgo_datos: {
        marca: 'Toyota',
        modelo: 'Hilux',
        anio_fabricacion: 2022,
        destino: 'PARTICULAR',
        via_importacion: 'REPRESENTANTE',
      },
      ...BASE_AJUSTES,
    },
  },
  mrc: {
    schema: cotizarMrcSchema,
    body: {
      plan_id: 1,
      capital_asegurado: 1000,
      riesgo_datos: {
        cedula: '123',
        direccion: 'Calle 1',
        rubro_actividad: 'Comercio',
        ciudad: 'Asunción',
        capital_edificio: 1000,
      },
      ...BASE_AJUSTES,
    },
  },
  incendio: {
    schema: cotizarIncendioSchema,
    body: {
      plan_id: 1,
      riesgo_datos: { rubro_actividad: 'Comercio', capital_edificio: 1000 },
      ...BASE_AJUSTES,
    },
  },
  'vida-ap': {
    schema: cotizarVidaApSchema,
    body: { plan_id: 1, riesgo_datos: { capital_asegurado: 1000 }, ...BASE_AJUSTES },
  },
}

function conCambio(nombreRamo, mutar) {
  const { body } = BODIES_VALIDOS[nombreRamo]
  const copia = structuredClone(body)
  mutar(copia)
  return copia
}

describe('los bodies base son válidos (control)', () => {
  for (const [ramo, { schema, body }] of Object.entries(BODIES_VALIDOS)) {
    test(ramo, () => assert.equal(schema.safeParse(body).success, true))
  }
})

describe('cliente_nombre y cliente_contacto: máximo 200', () => {
  for (const [ramo, { schema }] of Object.entries(BODIES_VALIDOS)) {
    for (const campo of ['cliente_nombre', 'cliente_contacto']) {
      test(`${ramo}.${campo}: 200 pasa, 201 falla`, () => {
        assert.equal(
          schema.safeParse(conCambio(ramo, (b) => (b[campo] = largo(200)))).success,
          true
        )
        const r = schema.safeParse(conCambio(ramo, (b) => (b[campo] = largo(201))))
        assert.equal(r.success, false)
        assert.equal(r.error.issues[0].path[0], campo)
      })
    }
  }
})

describe('campos de riesgo de MRC', () => {
  const limites = { cedula: 50, direccion: 500, ciudad: 100, rubro_actividad: 200 }
  for (const [campo, max] of Object.entries(limites)) {
    test(`mrc.riesgo_datos.${campo}: ${max} pasa, ${max + 1} falla`, () => {
      const { schema } = BODIES_VALIDOS.mrc
      assert.equal(
        schema.safeParse(conCambio('mrc', (b) => (b.riesgo_datos[campo] = largo(max)))).success,
        true
      )
      assert.equal(
        schema.safeParse(conCambio('mrc', (b) => (b.riesgo_datos[campo] = largo(max + 1)))).success,
        false
      )
    })
  }

  test('mrc.riesgo_datos.direccion de 200 KB falla (caso del QA)', () => {
    const { schema } = BODIES_VALIDOS.mrc
    const r = schema.safeParse(conCambio('mrc', (b) => (b.riesgo_datos.direccion = largo(200_000))))
    assert.equal(r.success, false)
  })
})

describe('rubro_actividad de Incendio: máximo 200', () => {
  test('200 pasa, 201 falla', () => {
    const { schema } = BODIES_VALIDOS.incendio
    assert.equal(
      schema.safeParse(conCambio('incendio', (b) => (b.riesgo_datos.rubro_actividad = largo(200))))
        .success,
      true
    )
    assert.equal(
      schema.safeParse(conCambio('incendio', (b) => (b.riesgo_datos.rubro_actividad = largo(201))))
        .success,
      false
    )
  })
})

describe('descripcion de descuentos y recargos: máximo 200', () => {
  for (const [ramo, { schema }] of Object.entries(BODIES_VALIDOS)) {
    for (const lista of ['descuentos', 'recargos']) {
      test(`${ramo}.${lista}: 200 pasa, 201 falla`, () => {
        const ajuste = (n) => [{ descripcion: largo(n), porcentaje: 5 }]
        assert.equal(
          schema.safeParse(conCambio(ramo, (b) => (b[lista] = ajuste(200)))).success,
          true
        )
        assert.equal(
          schema.safeParse(conCambio(ramo, (b) => (b[lista] = ajuste(201)))).success,
          false
        )
      })
    }
  }
})
