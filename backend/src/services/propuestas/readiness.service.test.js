import assert from 'node:assert/strict'
import { test } from 'node:test'

import { evaluarReadiness } from './readiness.service.js'

test('PF-2 readiness is informative and never enables emission', () => {
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
          telefono: '021000000',
          actividad_economica: 'Comercio',
        },
      },
      pla_ft: {
        es_pep: false,
        sujeto_obligado: false,
        origen_fondos_descripcion: 'Ingresos operativos',
      },
    },
  }

  const readiness = evaluarReadiness({ propuesta, carta: { id: 7 } })

  assert.equal(readiness.listo, true)
  assert.equal(readiness.informativo, true)
  assert.equal(readiness.emision_habilitada, false)
})
