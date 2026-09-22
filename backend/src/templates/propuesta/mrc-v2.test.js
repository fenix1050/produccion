import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildMrcPropuestaV2Html } from './mrc-v2.js'

function fixture() {
  return {
    proposal: {
      numero_propuesta: 17,
      emitida_at: '2026-09-01T12:00:00.000Z',
      agente: { nombre: 'Agent Test', matricula: 'N/A' },
    },
    carta: {
      render_context: { timezone: 'America/Asuncion', locale: 'es-PY' },
      riesgo_datos: { direccion: 'Test Street', ciudad: 'Asunción' },
      coberturas: [{ nombre_snapshot: 'Fire', monto: 1000000, franquicia: null }],
    },
    commercial: {
      variante: { prima: 100000 },
      plan_pago: {
        formas_pago: { codigo: 'contado', nombre_display: 'Contado' },
        premio_total: 110000,
        monto_inicial: 110000,
      },
    },
    draft: {
      descripcion_detallada: 'Risk description marker.',
      observaciones: 'Observation marker.',
      partes: {
        tomador_igual_asegurado: true,
        asegurado: {
          tipo_persona: 'fisica',
          nombre_razon_social: '<Client & Co. "quoted">',
          documento: '1',
          direccion: 'Address',
          ciudad: 'City',
          telefono: '1',
          email: 'client@example.com',
        },
      },
      pla_ft: {},
      tipo_firma: 'manual',
    },
    texts: {
      declaraciones_generales: { contenido: 'DECLARACIONES:\n\nDeclaration marker.' },
      declaracion_jurada_origen_fondos: {
        contenido: 'Declaración Jurada de Origen de Fondos\nFunds marker.',
      },
      autorizaciones_tomador_poliza_digital: {
        contenido: 'Autorizaciones del Tomador y/o Representante Legal\nAuthorization marker.',
      },
      coberturas_principales: { contenido: 'Coberturas Principales:\n\nCoverage marker.' },
      condiciones_mrc: { contenido: 'Conditions marker.' },
      clausula_adicional_cobranzas: {
        contenido: 'CLÁUSULA ADICIONAL DE COBRANZAS\n\nCollection marker.',
      },
    },
  }
}

test('MRC proposal v2 selects the Carta Oferta palette and preserves formal content', () => {
  const html = buildMrcPropuestaV2Html(fixture())

  assert.match(html, /<html lang="es" data-proposal-design="v2" data-proposal-fit="pending">/)
  assert.match(html, /@page \{ size: Legal; margin: 0; \}/)
  for (const marker of ['#d8132e', '#7a0f11', '#f4f3f1']) assert.match(html, new RegExp(marker))
  for (const marker of [
    'Declaration marker.',
    'Funds marker.',
    'Authorization marker.',
    'Coverage marker.',
    'Conditions marker.',
    'Collection marker.',
  ]) {
    assert.match(html, new RegExp(marker))
  }
})

test('MRC proposal v2 applies the solid red page chrome and anchored footer contract', () => {
  const html = buildMrcPropuestaV2Html(fixture())

  assert.match(html, /\.proposal-page::before \{[\s\S]*background: var\(--v2-red\);/)
  assert.match(
    html,
    /\.insured-panel h1,\s+\.contract-section h2,\s+\.observations h2,\s+\.cost-box h2,\s+\.payment-box h2 \{[\s\S]*background: var\(--v2-red\);[\s\S]*color: #fff;/
  )
  assert.match(
    html,
    /\.proposal-footer \{[\s\S]*margin-top: auto;[\s\S]*background: var\(--v2-red\);/
  )
  assert.match(html, /\.proposal-page--two \.proposal-footer \{ transform: none; \}/)
  assert.match(
    html,
    /\.header-cell,[\s\S]*\.motive-writing-line \{ border-color: var\(--v2-line\); /
  )
  assert.match(html, /\.risk-columns--total \{ height: 8mm; border-top-color: var\(--v2-line\); \}/)
  assert.doesNotMatch(html, /linear-gradient\(180deg, var\(--v2-red\)/)

  assert.equal((html.match(/class="proposal-page/g) ?? []).length, 2)
  assert.match(html, /const fitSections = async \(\)/)
  assert.match(html, /data-fit-section="conditions"/)
  assert.match(html, /fit-box--overflow/)
})

test('MRC proposal v2 escapes dynamic snapshot data', () => {
  const html = buildMrcPropuestaV2Html(fixture())

  assert.match(html, /&lt;Client &amp; Co\. &quot;quoted&quot;&gt;/)
  assert.doesNotMatch(html, /<Client & Co\. "quoted">/)
})
