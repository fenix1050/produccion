import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildMrcOfertaPages } from './mrc.js'

// Regresión del bug de auditoría: la Carta Oferta de MRC hardcodeaba los montos de sub-límites
// fijos (equipos electrónicos/agua/murallas/granizo) en vez de leerlos de `plan_coberturas`, el
// mismo catálogo que edita el panel admin. Si un admin cambiaba un monto, el PDF seguía
// mostrando el valor viejo. Este test arma un `planCoberturas` con montos DISTINTOS a los que
// estaban hardcodeados y verifica que el HTML generado refleje los montos nuevos, no los viejos.

const COTIZACION_BASE = {
  numero_cotizacion: 'MRC-0001',
  cliente_nombre: 'Cliente de Prueba',
  fecha: '2026-07-01',
  vigencia_dias: 30,
  riesgo_datos: { rubro_actividad: 'Comercio', direccion: 'Calle Falsa 123', ciudad: 'Asunción' },
  cotizacion_coberturas: [],
  cotizacion_variantes: [],
  usuarios: { nombre: 'Agente Prueba', email: 'agente@tajy.com.py' },
}

const PLAN_BASE = { nombre: 'MULTIRRIESGO COMERCIO - NORMAL' }
const RAMO_BASE = { nombre: 'mrc', nombre_display: 'Multirriesgo Comercio', calculador: 'mrc' }

function planCoberturaFija(codigo, monto) {
  return {
    incluida_por_defecto: true,
    monto,
    coberturas_catalogo: { codigo },
  }
}

test('buildMrcOfertaPages usa los montos vigentes de planCoberturas, no valores hardcodeados', () => {
  const planCoberturas = [
    planCoberturaFija('sublimite_equipos_electronicos', 9000000),
    planCoberturaFija('sublimite_danos_agua', 2500000),
    planCoberturaFija('sublimite_murallas_cercos', 1000000),
    planCoberturaFija('sublimite_granizo', 5000000),
  ]

  const { paginaDosBalanceada } = buildMrcOfertaPages({
    cotizacion: COTIZACION_BASE,
    plan: PLAN_BASE,
    ramo: RAMO_BASE,
    planCoberturas,
  })

  assert.match(paginaDosBalanceada, /Equipos Electrónicos: 9\.000\.000/)
  assert.doesNotMatch(paginaDosBalanceada, /Equipos Electrónicos: 5\.000\.000/)
})

// A pedido de Kevin (2026-08-06): los sub-límites fijos por defecto (agua/equipos
// electrónicos/granizo) también deben figurar como fila en "Sumas Aseguradas" (página 1), con
// la misma etiqueta SUBLÍMITE que ya tenía "Robo valores ventanilla" — revierte la exclusión de
// 2026-07-15. Se muestran a propósito en AMBOS lugares (esta tabla y "Distribución del capital
// asegurado"), no es una duplicación accidental.
test('buildMrcOfertaPages muestra los sub-límites fijos también en Sumas Aseguradas, igual que Robo valores ventanilla', () => {
  const planCoberturas = [
    planCoberturaFija('sublimite_equipos_electronicos', 5000000),
    planCoberturaFija('sublimite_danos_agua', 2500000),
    planCoberturaFija('sublimite_granizo', 5000000),
  ]

  const cotizacionConSublimiteAgua = {
    ...COTIZACION_BASE,
    cotizacion_coberturas: [
      {
        tipo_aplicacion: 'sublimite',
        monto: 2500000,
        franquicia: null,
        nombre_snapshot: 'Daños por agua',
        coberturas_catalogo: { codigo: 'sublimite_danos_agua' },
      },
    ],
  }

  const { paginaUno, paginaDosBalanceada } = buildMrcOfertaPages({
    cotizacion: cotizacionConSublimiteAgua,
    plan: PLAN_BASE,
    ramo: RAMO_BASE,
    planCoberturas,
  })

  assert.match(paginaUno, /badge--sublimite">Sublímite<\/span>Daños por agua/)
  assert.match(paginaDosBalanceada, /Daños por agua: 2\.500\.000/)
})

test('buildMrcOfertaPages no rompe si planCoberturas no trae un código esperado', () => {
  const { paginaDosBalanceada } = buildMrcOfertaPages({
    cotizacion: COTIZACION_BASE,
    plan: PLAN_BASE,
    ramo: RAMO_BASE,
    planCoberturas: [],
  })

  assert.match(paginaDosBalanceada, /Incendio: Mercaderías 50% \/ Contenido General 50%/)
  assert.doesNotMatch(paginaDosBalanceada, /undefined/)
})

test('buildMrcOfertaPages no rompe si planCoberturas es undefined', () => {
  assert.doesNotThrow(() => {
    buildMrcOfertaPages({
      cotizacion: COTIZACION_BASE,
      plan: PLAN_BASE,
      ramo: RAMO_BASE,
      planCoberturas: undefined,
    })
  })
})

// Ítem #8 del Ajuste MC.xlsx (Análisis de Riesgo, 2026-08-05): línea de vigencia + bloque de
// firma en la página 1.
test('buildMrcOfertaPages incluye la línea de vigencia y el bloque de firma con teléfono', () => {
  const cotizacionConTelefono = {
    ...COTIZACION_BASE,
    usuarios: { nombre: 'Agente Prueba', email: 'agente@tajy.com.py', telefono: '0981 123 456' },
  }

  const { paginaUno } = buildMrcOfertaPages({
    cotizacion: cotizacionConTelefono,
    plan: PLAN_BASE,
    ramo: RAMO_BASE,
    planCoberturas: [],
  })

  assert.match(paginaUno, /Vigencia del seguro: 1 año, desde/)
  assert.match(paginaUno, /Realizado por:/)
  assert.match(paginaUno, /Agente Prueba - Agente de Seguro/)
  assert.match(paginaUno, /0981 123 456/)
})

test('buildMrcOfertaPages omite la línea de teléfono en el bloque de firma si el agente no lo cargó', () => {
  const { paginaUno } = buildMrcOfertaPages({
    cotizacion: COTIZACION_BASE,
    plan: PLAN_BASE,
    ramo: RAMO_BASE,
    planCoberturas: [],
  })

  assert.match(paginaUno, /Realizado por:/)
  assert.doesNotMatch(paginaUno, /firma-block__linea">undefined/)
})
