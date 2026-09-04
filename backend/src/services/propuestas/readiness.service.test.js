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
