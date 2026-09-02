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

test('buildMrcOfertaPages ubica Robo valores ventanilla inmediatamente debajo de Valores en caja fuerte', () => {
  const cotizacionConValoresVentanilla = {
    ...COTIZACION_BASE,
    cotizacion_coberturas: [
      {
        tipo_aplicacion: 'cobertura',
        monto: 1000000,
        franquicia: null,
        nombre_snapshot: 'Valores en caja fuerte',
        coberturas_catalogo: { codigo: 'robo_caja_registradora' },
      },
      {
        tipo_aplicacion: 'cobertura',
        monto: 2000000,
        franquicia: null,
        nombre_snapshot: 'Responsabilidad Civil',
        coberturas_catalogo: { codigo: 'responsabilidad_civil' },
      },
      {
        tipo_aplicacion: 'sublimite',
        monto: 300000,
        franquicia: 500000,
        nombre_snapshot: 'Daños por agua',
        coberturas_catalogo: { codigo: 'sublimite_danos_agua' },
      },
      {
        tipo_aplicacion: 'sublimite',
        monto: 100000,
        franquicia: null,
        nombre_snapshot: 'Robo valores ventanilla',
        coberturas_catalogo: { codigo: 'robo_valores_ventanilla' },
      },
      {
        tipo_aplicacion: 'sublimite',
        monto: 400000,
        franquicia: null,
        nombre_snapshot: 'Daños por granizo',
        coberturas_catalogo: { codigo: 'sublimite_granizo' },
      },
    ],
  }

  const { paginaUno } = buildMrcOfertaPages({
    cotizacion: cotizacionConValoresVentanilla,
    plan: PLAN_BASE,
    ramo: RAMO_BASE,
    planCoberturas: [],
  })

  assert.match(
    paginaUno,
    /Valores en caja fuerte<\/td>\s*<td>1\.000\.000<\/td>\s*<td>Sin deducible<\/td>\s*<\/tr>\s*<tr>\s*<td><span class="badge badge--sublimite">Sublímite<\/span>Robo valores ventanilla/
  )
  assert.ok(
    paginaUno.indexOf('Robo valores ventanilla') < paginaUno.indexOf('Responsabilidad Civil')
  )
  assert.ok(paginaUno.indexOf('Responsabilidad Civil') < paginaUno.indexOf('Daños por agua'))
  assert.ok(paginaUno.indexOf('Daños por agua') < paginaUno.indexOf('Daños por granizo'))
})

test('buildMrcOfertaPages imprime NULL exactamente como Sin deducible desde el snapshot histórico', () => {
  const cotizacionConSnapshotNulo = {
    ...COTIZACION_BASE,
    cotizacion_coberturas: [
      {
        tipo_aplicacion: 'cobertura',
        monto: 1_000_000,
        franquicia: null,
        nombre_snapshot: 'Cristales histórico',
        coberturas_catalogo: { codigo: 'cristales' },
      },
    ],
  }

  const { paginaUno } = buildMrcOfertaPages({
    cotizacion: cotizacionConSnapshotNulo,
    plan: PLAN_BASE,
    ramo: RAMO_BASE,
    planCoberturas: [{ franquicia: 800_000, coberturas_catalogo: { codigo: 'cristales' } }],
  })

  assert.match(paginaUno, /Cristales histórico[\s\S]*<td>Sin deducible<\/td>/)
  assert.doesNotMatch(paginaUno, /Sin franquicia/)
})

test('buildMrcOfertaPages prints each deductible from its coverage snapshot, including water and hail', () => {
  const cotizacionConFranquiciasSnapshot = {
    ...COTIZACION_BASE,
    cotizacion_coberturas: [
      {
        tipo_aplicacion: 'sublimite',
        monto: 300000,
        franquicia: 500000,
        nombre_snapshot: 'Robo valores ventanilla',
        coberturas_catalogo: { codigo: 'robo_valores_ventanilla' },
      },
      {
        tipo_aplicacion: 'sublimite',
        monto: 5000000,
        franquicia: 800000,
        nombre_snapshot: 'Daños a los Equipos Electrónicos',
        coberturas_catalogo: { codigo: 'sublimite_equipos_electronicos' },
      },
      {
        tipo_aplicacion: 'sublimite',
        monto: 2500000,
        franquicia: 500000,
        nombre_snapshot: 'Daños por agua',
        coberturas_catalogo: { codigo: 'sublimite_danos_agua' },
      },
      {
        tipo_aplicacion: 'sublimite',
        monto: 5000000,
        franquicia: 800000,
        nombre_snapshot: 'Daños por granizo',
        coberturas_catalogo: { codigo: 'sublimite_granizo' },
      },
    ],
  }

  const { paginaUno, paginaDosBalanceada } = buildMrcOfertaPages({
    cotizacion: cotizacionConFranquiciasSnapshot,
    plan: PLAN_BASE,
    ramo: RAMO_BASE,
    planCoberturas: [],
  })

  const franquiciaVentanilla = '10% en todo y cada siniestro, mínimo Gs. 500.000'
  const franquiciaEquipos = '10% en todo y cada siniestro, mínimo Gs. 800.000'
  assert.match(paginaUno, new RegExp(`Robo valores ventanilla[\\s\\S]*${franquiciaVentanilla}`))
  assert.match(
    paginaUno,
    new RegExp(`Daños a los Equipos Electrónicos[\\s\\S]*${franquiciaEquipos}`)
  )
  assert.match(paginaDosBalanceada, new RegExp(`Robo valores ventanilla: ${franquiciaVentanilla}`))
  assert.match(
    paginaDosBalanceada,
    new RegExp(`Daños a los Equipos Electrónicos: ${franquiciaEquipos}`)
  )
  assert.match(paginaUno, new RegExp(`Daños por agua[\\s\\S]*${franquiciaVentanilla}`))
  assert.match(paginaUno, new RegExp(`Daños por granizo[\\s\\S]*${franquiciaEquipos}`))
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

// Ítem #8 del Ajuste MC.xlsx (Análisis de Riesgo, 2026-08-05): línea de vigencia en la página 1
// + bloque de firma. A pedido de Kevin (2026-08-10) la firma se movió a la página 2, debajo de
// "Forman parte del contrato" (antes vivía al pie de la página 1).
test('buildMrcOfertaPages incluye la línea de vigencia en la página 1 y el bloque de firma con teléfono en la página 2', () => {
  const cotizacionConTelefono = {
    ...COTIZACION_BASE,
    usuarios: { nombre: 'Agente Prueba', email: 'agente@tajy.com.py', telefono: '0981 123 456' },
  }

  const { paginaUno, paginaDosFlex } = buildMrcOfertaPages({
    cotizacion: cotizacionConTelefono,
    plan: PLAN_BASE,
    ramo: RAMO_BASE,
    planCoberturas: [],
  })

  assert.match(paginaUno, /Vigencia del seguro: 1 año, desde/)
  assert.doesNotMatch(paginaUno, /Realizado por:/)
  assert.match(paginaDosFlex, /Realizado por:/)
  assert.match(paginaDosFlex, /Agente Prueba - Agente de Seguro/)
  assert.match(paginaDosFlex, /Telef\. 0981 123 456/)
})

test('buildMrcOfertaPages muestra el rol real del usuario en el bloque de firma, no "Agente de Seguro" fijo', () => {
  const cotizacionConRol = {
    ...COTIZACION_BASE,
    usuarios: { nombre: 'Nestor Zorrilla', roles: { nombre: 'Jefe de Análisis de Riesgo' } },
  }

  const { paginaDosFlex } = buildMrcOfertaPages({
    cotizacion: cotizacionConRol,
    plan: PLAN_BASE,
    ramo: RAMO_BASE,
    planCoberturas: [],
  })

  assert.match(paginaDosFlex, /Nestor Zorrilla - Jefe de Análisis de Riesgo/)
})

test('buildMrcOfertaPages capitaliza roles de sistema en minúscula (ej. "agente" -> "Agente")', () => {
  const cotizacionRolSistema = {
    ...COTIZACION_BASE,
    usuarios: { nombre: 'Agente Prueba', roles: { nombre: 'agente' } },
  }

  const { paginaDosFlex } = buildMrcOfertaPages({
    cotizacion: cotizacionRolSistema,
    plan: PLAN_BASE,
    ramo: RAMO_BASE,
    planCoberturas: [],
  })

  assert.match(paginaDosFlex, /Agente Prueba - Agente</)
})

test('buildMrcOfertaPages usa "Agente de Seguro" si el usuario no trae rol embebido', () => {
  const { paginaDosFlex } = buildMrcOfertaPages({
    cotizacion: COTIZACION_BASE,
    plan: PLAN_BASE,
    ramo: RAMO_BASE,
    planCoberturas: [],
  })

  assert.match(paginaDosFlex, /Agente Prueba - Agente de Seguro/)
})

test('buildMrcOfertaPages omite la línea de teléfono en el bloque de firma si el agente no lo cargó', () => {
  const { paginaDosFlex } = buildMrcOfertaPages({
    cotizacion: COTIZACION_BASE,
    plan: PLAN_BASE,
    ramo: RAMO_BASE,
    planCoberturas: [],
  })

  assert.match(paginaDosFlex, /Realizado por:/)
  assert.doesNotMatch(paginaDosFlex, /firma-block__linea">undefined/)
})
