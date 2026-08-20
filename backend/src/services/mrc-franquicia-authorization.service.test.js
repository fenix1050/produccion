import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  FRANQUICIA_MRC_RESTRINGIDA_MONTO,
  normalizarFranquiciasMrc,
  puedeSeleccionarFranquicia,
} from './mrc-franquicia-authorization.service.js'

const DATOS_MRC = {
  riesgo_datos: {
    capital_edificio: 10_000_000,
    capital_contenido: 5_000_000,
    coberturas_adicionales: [
      { codigo: 'cristales', suma_asegurada: 1_200_000 },
      { codigo: 'responsabilidad_civil', suma_asegurada: 1_000_000 },
      { codigo: 'sublimite_danos_agua', suma_asegurada: 500_000 },
      { codigo: 'sublimite_granizo', suma_asegurada: 500_000 },
      { codigo: 'robo_valores_ventanilla', suma_asegurada: 300_000 },
      { codigo: 'sublimite_equipos_electronicos', suma_asegurada: 5_000_000 },
    ],
    franquicias_por_cobertura: {
      incendio_edificio: null,
      cristales: 1_200_000,
      responsabilidad_civil: 500_000,
      sublimite_danos_agua: null,
      sublimite_granizo: null,
      robo_valores_ventanilla: null,
      sublimite_equipos_electronicos: 800_000,
      codigo_forjado: 1,
    },
  },
}

test('normalizarFranquiciasMrc conserva solo los dos códigos obligatorios para un usuario sin permiso', () => {
  const resultado = normalizarFranquiciasMrc(DATOS_MRC, {
    rol: 'comercial',
    puede_seleccionar_franquicia: false,
  })

  assert.deepEqual(resultado.riesgo_datos.franquicias_por_cobertura, {
    robo_valores_ventanilla: FRANQUICIA_MRC_RESTRINGIDA_MONTO,
    sublimite_equipos_electronicos: FRANQUICIA_MRC_RESTRINGIDA_MONTO,
  })
})

test('normalizarFranquiciasMrc fuerza los sublímites obligatorios para un rol autorizado y conserva las demás selecciones', () => {
  const resultado = normalizarFranquiciasMrc(DATOS_MRC, {
    rol: 'analisis-riesgo',
    puede_seleccionar_franquicia: true,
  })

  assert.deepEqual(resultado.riesgo_datos.franquicias_por_cobertura, {
    incendio_edificio: null,
    incendio_contenido: null,
    cristales: 1_200_000,
    responsabilidad_civil: 500_000,
    sublimite_danos_agua: null,
    sublimite_granizo: null,
    robo_valores_ventanilla: FRANQUICIA_MRC_RESTRINGIDA_MONTO,
    sublimite_equipos_electronicos: FRANQUICIA_MRC_RESTRINGIDA_MONTO,
  })
})

test('puedeSeleccionarFranquicia reserva el bypass explícito para admin', () => {
  assert.equal(puedeSeleccionarFranquicia({ rol: 'admin' }), true)
  assert.equal(puedeSeleccionarFranquicia({ rol: 'agente' }), false)
})
