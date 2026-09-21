import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildMrcPropuestaV3Html } from './mrc-v3.js'

function fixture(overrides = {}) {
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
    ...overrides,
  }
}

test('MRC proposal v3 renders the reference two-page A4 structure', () => {
  const html = buildMrcPropuestaV3Html(fixture(), {
    tajyLogoDataUri: 'data:image/svg+xml;base64,TEST',
    footerSloganDataUri: 'data:image/png;base64,FOOTER',
  })

  assert.match(html, /data-proposal-design="v3" data-proposal-fit="pending"/)
  assert.match(html, /@page \{ size: A4; margin: 0; \}/)
  assert.equal((html.match(/class="proposal-page/g) ?? []).length, 2)
  const footerElements = [...html.matchAll(/<footer\b[^>]*>[\s\S]*?<\/footer>/g)].map(
    (match) => match[0]
  )
  assert.equal(footerElements.length, 2)
  const footerMarkup = footerElements.join('\n')
  assert.match(footerMarkup, /ASEGURADORA TAJY PROP\.COOP\. S\.A\./)
  assert.match(footerMarkup, /Protegemos lo que te importa/)
  assert.equal((footerMarkup.match(/<img class="footer-slogan"/g) ?? []).length, 2)
  assert.match(
    footerMarkup,
    /<img class="footer-slogan" src="data:image\/png;base64,FOOTER" alt="Seguros para un mejor mañana" \/>/
  )
  assert.doesNotMatch(footerMarkup, /<svg class="footer-slogan"|font-family:\s*cursive/)
  assert.doesNotMatch(footerMarkup, /Página [12] de 2/)
  for (const marker of [
    'Datos del asegurado',
    'Modalidad de la Cobertura Solicitada : 1020',
    'Detalle de cobertura',
    'Condiciones',
    'Costo del seguro',
    'Forma de pago',
    'Autorización de débito',
    'Cláusula adicional de cobranzas',
    'Observaciones',
    'Firmas',
    'data-fit-section="risk-description"',
    'data-fit-section="declarations"',
    'data-fit-section="principal-coverages"',
    'data-fit-section="conditions"',
    'data-fit-section="collection-clause"',
  ])
    assert.match(html, new RegExp(marker))
  assert.match(html, /<svg viewBox="0 0 24 24">/)
  assert.match(html, /src="data:image\/svg\+xml;base64,TEST"/)
})

test('MRC proposal v3 preserves dynamic values and escaping without example literals', () => {
  const html = buildMrcPropuestaV3Html(
    fixture({
      proposal: {
        numero_propuesta: 99,
        emitida_at: '2027-01-02T12:00:00.000Z',
        agente: { nombre: 'Other Agent' },
      },
      carta: {
        render_context: { timezone: 'America/Asuncion', locale: 'es-PY' },
        riesgo_datos: {},
        coberturas: [],
      },
      draft: {
        ...fixture().draft,
        descripcion_detallada: 'Changed risk',
        observaciones: 'Changed observation',
      },
    })
  )

  assert.match(html, />99<\/span>/)
  assert.match(html, /Changed risk/)
  assert.match(html, /Changed observation/)
  assert.match(html, /&lt;Client &amp; Co\. &quot;quoted&quot;&gt;/)
  assert.doesNotMatch(html, /<Client & Co\. "quoted">/)
  assert.doesNotMatch(html, /Example Customer|Synthetic Agent|1000000/)
})

test('MRC proposal v3 keeps legal content and fit metrics isolated from v1 markup', () => {
  const html = buildMrcPropuestaV3Html(fixture())

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
  assert.match(html, /const fitSections = async \(\)/)
  assert.match(html, /document\.querySelectorAll\('\[data-fit-section\]'\)/)
})

test('MRC proposal v3 uses one four-column header grid with explicit cell placement', () => {
  const html = buildMrcPropuestaV3Html(fixture())
  const headerMetaRule = html.match(/\.header-meta \{[^}]+\}/)?.[0] ?? ''
  const headerCellRule = html.match(/\.header-cell \{[^}]+\}/)?.[0] ?? ''

  assert.match(headerMetaRule, /display: grid;/)
  assert.match(headerMetaRule, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/)
  assert.match(headerMetaRule, /grid-template-rows: repeat\(2, minmax\(8mm, auto\)\);/)
  assert.doesNotMatch(html, /header-meta-row/)
  assert.match(headerCellRule, /padding: \.7mm 2\.1mm;/)
  assert.match(headerCellRule, /grid-template-columns: 5mm 1fr;/)

  const expectedCells = [
    ['proposal', 1, 1],
    ['issue-date', 2, 1],
    ['validity', 3, 1],
    ['until', 4, 1],
    ['renewal', 1, 2],
    ['start', 2, 2],
    ['end', 3, 2],
    ['policy', 4, 2],
  ]
  const headerSections = [...html.matchAll(/<section class="header-meta">([\s\S]*?)<\/section>/g)]
  assert.equal(headerSections.length, 2)
  for (const [, content] of headerSections) {
    const cells = [...content.matchAll(/class="header-cell header-cell--([^"]+)"/g)].map(
      ([, placement]) => placement
    )
    assert.deepEqual(
      cells,
      expectedCells.map(([placement]) => placement)
    )
  }
  for (const [placement, column, row] of expectedCells) {
    const placementRule =
      html.match(new RegExp(`\\.header-cell--${placement} \\{[^}]+\\}`))?.[0] ?? ''
    assert.match(placementRule, new RegExp(`grid-column: ${column}; grid-row: ${row};`))
    assert.doesNotMatch(placementRule, /margin|transform/)
  }
})

test('MRC proposal v3 keeps the insured PEP row in normal flow before modality', () => {
  const html = buildMrcPropuestaV3Html(fixture())
  const insuredRule = html.match(/\.insured-card \{[^}]+\}/)?.[0] ?? ''

  assert.match(insuredRule, /flex: 0 0 auto;/)
  assert.match(insuredRule, /height: auto;/)
  assert.match(insuredRule, /overflow: visible;/)
  assert.doesNotMatch(insuredRule, /overflow: hidden;/)
  assert.match(
    html,
    /<div class="pep-row">[\s\S]*?Sí[\s\S]*?No[\s\S]*?Institución[\s\S]*?Cargo[\s\S]*?Período[\s\S]*?<\/section>\s*<section class="modality">/
  )
})

test('MRC proposal v3 applies shared header, PEP label, and footer asset geometry', () => {
  const html = buildMrcPropuestaV3Html(fixture(), {
    footerSloganDataUri: 'data:image/png;base64,FOCUSED',
  })
  const headerRule = html.match(/\.proposal-header \{[^}]+\}/)?.[0] ?? ''
  const pepLabelRule = html.match(/\.pep-row \.pep-label \{[^}]+\}/)?.[0] ?? ''
  const footerMarkup = [...html.matchAll(/<footer\b[^>]*>[\s\S]*?<\/footer>/g)]
    .map((match) => match[0])
    .join('\n')

  assert.match(headerRule, /flex: 0 0 23mm;/)
  assert.match(headerRule, /height: 23mm;/)
  assert.match(pepLabelRule, /display: flex;/)
  assert.match(pepLabelRule, /align-items: center;/)
  assert.match(pepLabelRule, /gap: 1\.4mm;/)
  assert.match(
    html,
    /<strong class="pep-label"><span class="icon"[\s\S]*?<span>Ha desempeñado cargo público nacional o extranjero<\/span><\/strong>/
  )
  assert.equal(
    (footerMarkup.match(/<img class="footer-slogan" src="data:image\/png;base64,FOCUSED"/g) ?? [])
      .length,
    2
  )
  assert.doesNotMatch(footerMarkup, /font-family:\s*cursive/)

  const withoutSlogan = buildMrcPropuestaV3Html(fixture())
  assert.doesNotMatch(withoutSlogan, /class="footer-slogan"/)
})

test('MRC proposal v3 isolates the ecological delivery row and preserves its dynamic email', () => {
  const html = buildMrcPropuestaV3Html(
    fixture({
      draft: {
        ...fixture().draft,
        partes: {
          ...fixture().draft.partes,
          asegurado: {
            ...fixture().draft.partes.asegurado,
            email: 'eco<&"quoted@example.com',
          },
        },
      },
    })
  )
  const rowStart = html.indexOf('<section class="proposal-eco-row">')
  const rowEnd = html.indexOf('</section>', rowStart) + '</section>'.length
  const ecoMarkup = html.slice(rowStart, rowEnd)

  assert.ok(rowStart >= 0)
  for (const className of [
    'proposal-eco-row',
    'proposal-eco-message',
    'proposal-eco-icon',
    'proposal-eco-text',
    'proposal-eco-options',
    'proposal-eco-option',
    'proposal-checkbox',
    'proposal-eco-divider',
    'proposal-eco-email',
    'proposal-eco-email-label',
    'proposal-eco-email-value',
    'proposal-eco-email-line',
  ])
    assert.match(ecoMarkup, new RegExp(`class="${className}"`))
  assert.match(
    ecoMarkup,
    /class="proposal-eco-email-value">eco&lt;&amp;&quot;quoted@example\.com<\/span>/
  )
  assert.equal((ecoMarkup.match(/class="proposal-eco-option"/g) ?? []).length, 2)
  assert.equal((ecoMarkup.match(/class="proposal-checkbox"/g) ?? []).length, 2)
  assert.match(ecoMarkup, /<span>SI<\/span>[\s\S]*<span>NO<\/span>/)
  assert.doesNotMatch(ecoMarkup, /digital-delivery|digital-choice|digital-email/)
  assert.match(
    html,
    /\.proposal-eco-row \{[^}]*display: grid;[^}]*break-inside: avoid;[^}]*page-break-inside: avoid;/
  )
  for (const [className, count] of [
    ['proposal-header', 2],
    ['insured-card', 1],
    ['pep-row', 1],
    ['coverage-card', 1],
    ['signatures', 1],
    ['proposal-footer', 2],
  ]) {
    assert.equal(
      (html.match(new RegExp(`class="[^"]*\\b${className}\\b`, 'g')) ?? []).length,
      count
    )
  }

  for (const marker of [
    'Datos del asegurado',
    'Ha desempeñado cargo público nacional o extranjero',
    'Detalle de cobertura',
    'Firmas',
    'Protegemos lo que te importa',
  ]) {
    assert.match(html, new RegExp(marker))
  }
})
