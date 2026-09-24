import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  asegurarReadinessEmision,
  evaluarReadiness,
  MRC_REQUIRED_TEXT_KEYS,
} from './readiness.service.js'

test('PF-3 readiness enables emission only after all required MRC fields are present', () => {
  const propuesta = {
    carta_oferta_id: 7,
    cotizacion_variante_id: 10,
    cotizacion_plan_pago_id: 20,
    draft_json: {
      partes: {
        asegurado: {
          tipo_persona: 'juridica',
          nombre_razon_social: 'Comercio SA',
          documento: '80000000-1',
          direccion: 'Asunción',
          ciudad: 'Asunción',
          telefono: '021000000',
          email: 'comercio@example.com',
          actividad_economica: 'Comercio',
        },
        representante_legal: { nombre: 'Representative Test', documento: '2', cargo: 'Director' },
      },
      tipo_firma: 'manual',
      pla_ft: {
        es_pep: false,
        sujeto_obligado: false,
        origen_fondos_descripcion: 'Ingresos operativos',
      },
    },
  }

  const readiness = evaluarReadiness({ propuesta, carta: { id: 7 } })

  assert.equal(readiness.listo, true)
  assert.equal(readiness.informativo, false)
  assert.equal(readiness.emision_habilitada, true)
})

test('PF-3 readiness requires sexo for a persona física insured, not for jurídica', () => {
  const base = {
    carta_oferta_id: 7,
    cotizacion_variante_id: 10,
    cotizacion_plan_pago_id: 20,
    draft_json: {
      partes: {
        asegurado: {
          tipo_persona: 'fisica',
          nombre_razon_social: 'Juan Pérez',
          documento: '1234567',
          direccion: 'Asunción',
          ciudad: 'Asunción',
          telefono: '0981000000',
          email: 'juan@example.com',
          actividad_economica: 'Comercio',
          fecha_nacimiento: '1990-01-01',
          nacionalidad: 'Paraguaya',
          estado_civil: 'Soltero',
          ocupacion: 'Comerciante',
        },
      },
      tipo_firma: 'manual',
    },
  }

  const sinSexo = evaluarReadiness({ propuesta: base, carta: { id: 7 } })
  assert.ok(sinSexo.pendientes.includes('asegurado.sexo'))
  assert.equal(sinSexo.listo, false)

  const conSexo = evaluarReadiness({
    propuesta: {
      ...base,
      draft_json: {
        ...base.draft_json,
        partes: {
          asegurado: { ...base.draft_json.partes.asegurado, sexo: 'Femenino' },
        },
      },
    },
    carta: { id: 7 },
  })
  assert.equal(conSexo.pendientes.includes('asegurado.sexo'), false)
  assert.equal(conSexo.listo, true)
})

test('PF-3 readiness requires ruc instead of documento when documento_tipo is ruc', () => {
  const base = {
    carta_oferta_id: 7,
    cotizacion_variante_id: 10,
    cotizacion_plan_pago_id: 20,
    draft_json: {
      partes: {
        asegurado: {
          tipo_persona: 'juridica',
          nombre_razon_social: 'Comercio SA',
          direccion: 'Asunción',
          ciudad: 'Asunción',
          telefono: '021000000',
          email: 'comercio@example.com',
          actividad_economica: 'Comercio',
          documento_tipo: 'ruc',
        },
        representante_legal: { nombre: 'Representative Test', documento: '2', cargo: 'Director' },
      },
      tipo_firma: 'manual',
    },
  }

  const sinRuc = evaluarReadiness({ propuesta: base, carta: { id: 7 } })
  assert.ok(sinRuc.pendientes.includes('asegurado.ruc'))
  assert.equal(sinRuc.pendientes.includes('asegurado.documento'), false)

  const conRuc = evaluarReadiness({
    propuesta: {
      ...base,
      draft_json: {
        ...base.draft_json,
        partes: {
          ...base.draft_json.partes,
          asegurado: { ...base.draft_json.partes.asegurado, ruc: '80028528-9' },
        },
      },
    },
    carta: { id: 7 },
  })
  assert.equal(conRuc.pendientes.includes('asegurado.ruc'), false)
})

test('PF-3 requires the complete approved MRC text set before issuance', () => {
  const propuesta = {
    cotizacion_variante_id: 10,
    cotizacion_plan_pago_id: 20,
    draft_json: {
      partes: {
        asegurado: {
          tipo_persona: 'juridica',
          nombre_razon_social: 'Client SA',
          documento: '80000000-1',
          direccion: 'Address',
          ciudad: 'Asunción',
          telefono: '021000000',
          email: 'client@example.com',
          actividad_economica: 'Commerce',
        },
        representante_legal: { nombre: 'Representative', documento: '2', cargo: 'Director' },
      },
      tipo_firma: 'manual',
    },
  }
  const partial = asegurarReadinessEmision({
    propuesta,
    carta: { id: 7 },
    textos: [{ clave: MRC_REQUIRED_TEXT_KEYS[0] }],
  })
  const complete = asegurarReadinessEmision({
    propuesta,
    carta: { id: 7 },
    textos: MRC_REQUIRED_TEXT_KEYS.map((clave) => ({ clave })),
  })

  assert.equal(partial.error, 'PF_TEXTOS_INCOMPLETOS')
  assert.deepEqual(partial.textosFaltantes, MRC_REQUIRED_TEXT_KEYS.slice(1))
  assert.equal(complete.error, null)
})

test('readiness marks an over-limit descripcion_detallada as pending so it never reaches the PDF render', async () => {
  const { DESCRIPCION_DETALLADA_MAX_LINEAS } = await import('../../schemas/propuestas.schema.js')
  const propuesta = {
    carta_oferta_id: 7,
    cotizacion_variante_id: 10,
    cotizacion_plan_pago_id: 20,
    draft_json: {
      partes: {
        asegurado: {
          tipo_persona: 'juridica',
          nombre_razon_social: 'Comercio SA',
          documento: '80000000-1',
          direccion: 'Asunción',
          ciudad: 'Asunción',
          telefono: '021000000',
          email: 'comercio@example.com',
          actividad_economica: 'Comercio',
        },
        representante_legal: { nombre: 'Representative Test', documento: '2', cargo: 'Director' },
      },
      tipo_firma: 'manual',
      descripcion_detallada: Array.from(
        { length: DESCRIPCION_DETALLADA_MAX_LINEAS + 1 },
        () => 'x'
      ).join('\n'),
    },
  }

  const readiness = evaluarReadiness({ propuesta, carta: { id: 7 } })
  assert.equal(readiness.listo, false)
  assert.deepEqual(readiness.pendientes, ['descripcion_detallada'])

  const withinLimit = evaluarReadiness({
    propuesta: {
      ...propuesta,
      draft_json: { ...propuesta.draft_json, descripcion_detallada: 'Local comercial.' },
    },
    carta: { id: 7 },
  })
  assert.equal(withinLimit.listo, true)
})
