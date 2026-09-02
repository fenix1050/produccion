import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildIncendioOfertaPages } from './incendio.js'

// Cada uno de los 4 planes de Incendio tiene texto legal (Coberturas Principales/Exclusiones/
// Recomendaciones) DISTINTO. Estos tests verifican que cada plan renderiza su propio texto, y
// que un plan no arrastra el texto de otro (regresión de un eventual mapeo mal armado en
// TEXTOS_POR_PLAN).

const COTIZACION_BASE = {
  numero_cotizacion: 'INC-0001',
  cliente_nombre: 'Cliente de Prueba',
  fecha: '2026-07-28',
  vigencia_dias: 30,
  riesgo_datos: { rubro_actividad: 'Vivienda', direccion: 'Calle Falsa 123', ciudad: 'Asunción' },
  cotizacion_coberturas: [],
  cotizacion_variantes: [],
  usuarios: { nombre: 'Agente Prueba', email: 'agente@tajy.com.py' },
}

test('buildIncendioOfertaPages — INCENDIO HIPOTECARIO renderiza su texto propio', () => {
  const { paginaDosBalanceada } = buildIncendioOfertaPages({
    cotizacion: COTIZACION_BASE,
    plan: { nombre: 'INCENDIO HIPOTECARIO' },
  })

  assert.match(paginaDosBalanceada, /informe de tasación/)
  assert.doesNotMatch(paginaDosBalanceada, /INSPECCION DE RIESGO No\. XXXX/)
  assert.doesNotMatch(paginaDosBalanceada, /Cláusula Adicional de Cobranzas/)
})

test('buildIncendioOfertaPages — INCENDIO CON INSPECCION renderiza su texto propio, incluyendo el placeholder literal', () => {
  const { paginaDosBalanceada } = buildIncendioOfertaPages({
    cotizacion: COTIZACION_BASE,
    plan: { nombre: 'INCENDIO CON INSPECCION' },
  })

  assert.match(paginaDosBalanceada, /INSPECCION DE RIESGO No\. XXXX\/XXXX/)
  assert.match(paginaDosBalanceada, /inspección de riesgo, la cual obra en el archivo/)
  assert.doesNotMatch(paginaDosBalanceada, /informe de tasación/)
})

test('buildIncendioOfertaPages — INCENDIO SIN INSPECCION renderiza su texto propio', () => {
  const { paginaDosBalanceada } = buildIncendioOfertaPages({
    cotizacion: COTIZACION_BASE,
    plan: { nombre: 'INCENDIO SIN INSPECCION' },
  })

  assert.match(paginaDosBalanceada, /Se solicita tomar las siguientes medidas de prevención/)
  assert.doesNotMatch(paginaDosBalanceada, /INSPECCION DE RIESGO No\. XXXX/)
  assert.doesNotMatch(paginaDosBalanceada, /informe de tasación/)
})

test('buildIncendioOfertaPages — MAQUINARIA BASICO tiene Cláusula de Cobranzas y Cobertura, sin Exclusiones/Recomendaciones', () => {
  const { paginaDosBalanceada } = buildIncendioOfertaPages({
    cotizacion: COTIZACION_BASE,
    plan: { nombre: 'MAQUINARIA BASICO' },
  })

  assert.match(paginaDosBalanceada, /Cláusula Adicional de Cobranzas/)
  assert.match(paginaDosBalanceada, /Ley No\. 1682\/01/)
  assert.match(paginaDosBalanceada, />Cobertura</)
  assert.match(paginaDosBalanceada, /impacto de aviones hasta 100% del valor de mercado/)
  assert.doesNotMatch(paginaDosBalanceada, />Exclusiones</)
  assert.doesNotMatch(paginaDosBalanceada, />Recomendaciones</)
})

test('buildIncendioOfertaPages — plan.nombre desconocido no rompe (fallback)', () => {
  assert.doesNotThrow(() => {
    const { paginaDosBalanceada } = buildIncendioOfertaPages({
      cotizacion: COTIZACION_BASE,
      plan: { nombre: 'PLAN INEXISTENTE' },
    })
    assert.match(paginaDosBalanceada, /Texto legal pendiente de carga/)
  })
})
