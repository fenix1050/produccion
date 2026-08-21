import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
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
      incendio_edificio: 800_000,
      incendio_contenido: null,
      cristales: 1_200_000,
      responsabilidad_civil: 1_500_000,
      sublimite_danos_agua: 1_200_000,
      sublimite_granizo: 1_200_000,
      robo_valores_ventanilla: 1_200_000,
      sublimite_equipos_electronicos: 1_200_000,
      codigo_forjado: 1,
    },
  },
}

const PLAN_COBERTURAS = [
  ['incendio_edificio', null],
  ['incendio_contenido', null],
  ['cristales', 500_000],
  ['responsabilidad_civil', 800_000],
  ['sublimite_danos_agua', 500_000],
  ['sublimite_granizo', 800_000],
  ['robo_valores_ventanilla', 500_000],
  ['sublimite_equipos_electronicos', 800_000],
].map(([codigo, franquicia]) => ({ franquicia, coberturas_catalogo: { codigo } }))

test('normalizarFranquiciasMrc reemplaza todo valor forjado por el default plan+cobertura sin permiso', () => {
  const resultado = normalizarFranquiciasMrc(
    DATOS_MRC,
    { rol: 'comercial', puede_seleccionar_franquicia: false },
    PLAN_COBERTURAS
  )

  assert.deepEqual(resultado.riesgo_datos.franquicias_por_cobertura, {
    incendio_edificio: null,
    incendio_contenido: null,
    cristales: 500_000,
    responsabilidad_civil: 800_000,
    sublimite_danos_agua: 500_000,
    sublimite_granizo: 800_000,
    robo_valores_ventanilla: 500_000,
    sublimite_equipos_electronicos: 800_000,
  })
})

test('normalizarFranquiciasMrc conserva selecciones soportadas visibles y fuerza defaults ocultos', () => {
  const resultado = normalizarFranquiciasMrc(
    DATOS_MRC,
    { rol: 'analisis-riesgo', puede_seleccionar_franquicia: true },
    PLAN_COBERTURAS
  )

  assert.deepEqual(resultado.riesgo_datos.franquicias_por_cobertura, {
    incendio_edificio: 800_000,
    incendio_contenido: null,
    cristales: 1_200_000,
    responsabilidad_civil: 1_500_000,
    sublimite_danos_agua: 500_000,
    sublimite_granizo: 800_000,
    robo_valores_ventanilla: 500_000,
    sublimite_equipos_electronicos: 800_000,
  })
})

test('normalizarFranquiciasMrc falla cerrado si falta la configuración requerida del plan', () => {
  assert.throws(
    () =>
      normalizarFranquiciasMrc(
        DATOS_MRC,
        { rol: 'comercial' },
        PLAN_COBERTURAS.filter(
          (fila) => fila.coberturas_catalogo.codigo !== 'responsabilidad_civil'
        )
      ),
    /configuración de franquicia/i
  )
})

test('normalizarFranquiciasMrc acepta default NULL para cualquier cobertura y lo fuerza sin permiso', () => {
  const configuracionSinDeducible = PLAN_COBERTURAS.map((fila) =>
    fila.coberturas_catalogo.codigo === 'cristales' ? { ...fila, franquicia: null } : fila
  )

  const resultado = normalizarFranquiciasMrc(
    DATOS_MRC,
    { rol: 'comercial', puede_seleccionar_franquicia: false },
    configuracionSinDeducible
  )
  assert.equal(resultado.riesgo_datos.franquicias_por_cobertura.cristales, null)
})

test('normalizarFranquiciasMrc sigue fallando cerrado ante un default negativo', () => {
  const configuracionInvalida = PLAN_COBERTURAS.map((fila) =>
    fila.coberturas_catalogo.codigo === 'cristales' ? { ...fila, franquicia: -1 } : fila
  )

  assert.throws(
    () => normalizarFranquiciasMrc(DATOS_MRC, { rol: 'comercial' }, configuracionInvalida),
    /configuración de franquicia/i
  )
})

test('normalizarFranquiciasMrc acepta como selección el default positivo configurado aunque no sea estándar', () => {
  const configuracion = PLAN_COBERTURAS.map((fila) =>
    fila.coberturas_catalogo.codigo === 'cristales' ? { ...fila, franquicia: 700_000 } : fila
  )
  const datos = structuredClone(DATOS_MRC)
  datos.riesgo_datos.franquicias_por_cobertura.cristales = 700_000

  const resultado = normalizarFranquiciasMrc(
    datos,
    { puede_seleccionar_franquicia: true },
    configuracion
  )
  assert.equal(resultado.riesgo_datos.franquicias_por_cobertura.cristales, 700_000)
})

test('normalizarFranquiciasMrc rechaza una selección autorizada no soportada o sin deducible donde no aplica', () => {
  const noSoportada = structuredClone(DATOS_MRC)
  noSoportada.riesgo_datos.franquicias_por_cobertura.cristales = 700_000
  assert.throws(
    () =>
      normalizarFranquiciasMrc(
        noSoportada,
        { puede_seleccionar_franquicia: true },
        PLAN_COBERTURAS
      ),
    /franquicia seleccionada/i
  )

  const sinDeducible = structuredClone(DATOS_MRC)
  sinDeducible.riesgo_datos.franquicias_por_cobertura.cristales = null
  assert.throws(
    () =>
      normalizarFranquiciasMrc(
        sinDeducible,
        { puede_seleccionar_franquicia: true },
        PLAN_COBERTURAS
      ),
    /franquicia seleccionada/i
  )
})

test('normalizarFranquiciasMrc rechaza equipos_electronicos forjado aun con permiso y default de plan', () => {
  const datos = structuredClone(DATOS_MRC)
  datos.riesgo_datos.coberturas_adicionales.push({
    codigo: 'equipos_electronicos',
    suma_asegurada: 2_000_000,
  })
  datos.riesgo_datos.franquicias_por_cobertura.equipos_electronicos = 1_500_000
  const configuracion = [
    ...PLAN_COBERTURAS,
    {
      franquicia: 500_000,
      coberturas_catalogo: { codigo: 'equipos_electronicos' },
    },
  ]

  for (const usuario of [
    { rol: 'comercial', puede_seleccionar_franquicia: false },
    { rol: 'admin', puede_seleccionar_franquicia: true },
  ]) {
    assert.throws(
      () => normalizarFranquiciasMrc(datos, usuario, configuracion),
      (error) => {
        assert.equal(error.status, 422)
        assert.match(error.publicMessage, /equipos electrónicos.*no puede solicitarse/i)
        return true
      }
    )
  }
})

test('puedeSeleccionarFranquicia reserva el bypass explícito para admin', () => {
  assert.equal(puedeSeleccionarFranquicia({ rol: 'admin' }), true)
  assert.equal(puedeSeleccionarFranquicia({ rol: 'agente' }), false)
})
