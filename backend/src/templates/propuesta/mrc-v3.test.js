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

test('MRC proposal v3 prints the phone with the local "0" prefix instead of the form\'s "+595"', () => {
  const html = buildMrcPropuestaV3Html(
    fixture({
      draft: {
        ...fixture().draft,
        partes: {
          ...fixture().draft.partes,
          asegurado: { ...fixture().draft.partes.asegurado, telefono: '981-927-418' },
        },
      },
    }),
    {
      tajyLogoDataUri: 'data:image/svg+xml;base64,TEST',
      footerSloganDataUri: 'data:image/png;base64,FOOTER',
    }
  )

  assert.match(html, /<b>Celular<\/b><span>0981-927-418<\/span>/)
  assert.match(html, /Tel\.: 0981-927-418/)
  assert.doesNotMatch(html, /\+595/)
})

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

test('MRC proposal v3 prints the document template version in both page footers', () => {
  const html = buildMrcPropuestaV3Html(fixture())

  const footerElements = [...html.matchAll(/<footer\b[^>]*>[\s\S]*?<\/footer>/g)].map(
    (match) => match[0]
  )
  assert.equal(footerElements.length, 2)
  for (const footerMarkup of footerElements) {
    assert.match(footerMarkup, /<span class="footer-version">Ver\.: 1\.0\.1<\/span>/)
  }
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

test('MRC proposal v3 emits a page-overflow fit guard', () => {
  const html = buildMrcPropuestaV3Html(fixture())

  assert.match(html, /const hasCoverageVisualOverflow = \(\) =>/)
  assert.match(html, /coverageCard\.querySelectorAll\('\*'\)/)
  assert.match(html, /extendsBeyondCard/)
  assert.match(html, /extendsIntoFollowingContent/)
  assert.match(html, /let pageOverflow = hasCoverageVisualOverflow\(\)/)
  assert.match(html, /for \(const page of document\.querySelectorAll\('\.proposal-page'\)\)/)
  assert.match(html, /if \(isOverflowing\(page\)\) pageOverflow = true/)
  assert.match(html, /window\.__proposalFitError = 'page-overflow'/)
  assert.match(html, /document\.documentElement\.dataset\.proposalFit = 'error'/)
})

test('MRC proposal v3 renders twelve compact inline coverage summary items', () => {
  const coverages = Array.from({ length: 12 }, (_, index) => ({
    nombre_snapshot: `Coverage ${index + 1}`,
    monto: (index + 1) * 100000,
    franquicia: index % 2 === 0 ? null : 5000,
  }))
  const html = buildMrcPropuestaV3Html(
    fixture({ carta: { ...fixture().carta, coberturas: coverages } })
  )
  const summaryStart = html.indexOf('<ul class="coverage-summary">')
  const summaryEnd = html.indexOf('</ul>', summaryStart) + '</ul>'.length
  const summary = html.slice(summaryStart, summaryEnd)
  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')

  assert.equal((summary.match(/<li class="coverage-summary-item"/g) ?? []).length, 12)
  assert.equal((summary.match(/<span class="coverage-summary-inline">/g) ?? []).length, 12)
  assert.equal((summary.match(/Hasta /g) ?? []).length, 12)
  assert.equal((summary.match(/Franquicia:/g) ?? []).length, 12)
  assert.doesNotMatch(summary, /coverage-summary-(?:name|detail)/)
  for (const [index, coverage] of coverages.entries()) {
    const amount = ((index + 1) * 100000).toLocaleString('es-PY')
    const franchise = coverage.franquicia == null ? 'Sin deducible' : 'Gs. 5.000'
    const row = `- ${coverage.nombre_snapshot}: Hasta Gs. ${amount} · Franquicia: ${franchise}`
    assert.match(
      summary,
      new RegExp(`<span class="coverage-summary-inline">${escapeRegExp(row)}<\\/span>`)
    )
  }
})

test('MRC proposal v3 uses compact inline two-column coverage markup', () => {
  const html = buildMrcPropuestaV3Html(fixture())
  const summaryRule = html.match(/\.coverage-summary \{[^}]+\}/)?.[0] ?? ''
  const itemRule = html.match(/\.coverage-summary-item \{[^}]+\}/)?.[0] ?? ''
  const inlineRule = html.match(/\.coverage-summary-inline \{[^}]+\}/)?.[0] ?? ''

  assert.match(
    html,
    /<ul class="coverage-summary"><li class="coverage-summary-item"><span class="coverage-summary-inline">- Fire: Hasta Gs\. 1\.000\.000 · Franquicia: Sin deducible<\/span><\/li><\/ul>/
  )
  assert.match(summaryRule, /display: grid;/)
  assert.match(summaryRule, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/)
  assert.match(summaryRule, /column-gap: 1mm;/)
  assert.match(summaryRule, /row-gap: \.1mm;/)
  assert.match(summaryRule, /font-size: 5\.4px;/)
  assert.match(summaryRule, /line-height: 1;/)
  assert.match(itemRule, /display: block;/)
  assert.match(itemRule, /padding: \.1mm 0;/)
  assert.match(inlineRule, /display: block;/)
  assert.match(inlineRule, /overflow-wrap: anywhere;/)
})

test('MRC proposal v3 escapes inline coverage summary values', () => {
  const html = buildMrcPropuestaV3Html(
    fixture({
      carta: {
        ...fixture().carta,
        coberturas: [{ nombre_snapshot: '<Fire & "quoted">', monto: 1000000, franquicia: 5000 }],
      },
    })
  )
  const summaryStart = html.indexOf('<ul class="coverage-summary">')
  const summaryEnd = html.indexOf('</ul>', summaryStart) + '</ul>'.length
  const summary = html.slice(summaryStart, summaryEnd)

  assert.match(
    summary,
    /<span class="coverage-summary-inline">- &lt;Fire &amp; &quot;quoted&quot;&gt;: Hasta Gs\. 1\.000\.000 · Franquicia: Gs\. 5\.000<\/span>/
  )
  assert.equal((summary.match(/<span class="coverage-summary-inline">/g) ?? []).length, 1)
  assert.doesNotMatch(summary, /<Fire & "quoted">/)
})

test('MRC proposal v3 makes the coverage card content-driven', () => {
  const html = buildMrcPropuestaV3Html(fixture())
  const coverageRule = html.match(/\.coverage-card \{[^}]+\}/)?.[0] ?? ''

  assert.match(coverageRule, /height: auto;/)
  assert.match(coverageRule, /min-height: 60mm;/)
  assert.match(coverageRule, /overflow: visible;/)
  assert.doesNotMatch(coverageRule, /\sheight: 60mm;/)
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

test('MRC proposal v3 preserves escaped user newlines in the risk description without synthetic breaks', () => {
  const html = buildMrcPropuestaV3Html(
    fixture({
      draft: {
        ...fixture().draft,
        descripcion_detallada: 'First line <&>\nSecond line "quoted"',
      },
    })
  )
  const riskDescriptionStart = html.indexOf('<div class="risk-description')
  const riskDescription = html.slice(
    riskDescriptionStart,
    html.indexOf('</div><b>', riskDescriptionStart)
  )
  const userDescription = riskDescription.slice(0, riskDescription.indexOf('<b>UBICACIÓN'))

  assert.match(userDescription, /First line &lt;&amp;&gt;\nSecond line &quot;quoted&quot;/)
  assert.match(html, /\.risk-description \{[^}]*white-space: pre-line;/)
  assert.doesNotMatch(userDescription, /<br\s*\/>/)
})

test('MRC proposal v3 renders five independent principal coverage entries', () => {
  const entries = [
    'Incendio de edificio y contenido, con extensión a rayo, explosión y humo conforme a las condiciones generales.',
    'Daños materiales por huracán, vendaval, ciclón, tornado e impacto de vehículos, cuando corresponda.',
    'Robo y asalto de contenido, mercaderías, mobiliario, equipos y enseres declarados.',
    'Rotura de cristales, vidrios y espejos dentro de los límites contratados.',
    'Responsabilidad civil por daños a terceros, hasta la suma asegurada indicada.',
  ]
  const html = buildMrcPropuestaV3Html(
    fixture({
      texts: {
        ...fixture().texts,
        coberturas_principales: { contenido: `Coberturas Principales:\n\n${entries.join('\n\n')}` },
      },
    })
  )
  const coverages = html.slice(
    html.indexOf('data-fit-section="principal-coverages"'),
    html.indexOf('</section>', html.indexOf('data-fit-section="principal-coverages"'))
  )

  for (const entry of entries) {
    assert.match(coverages, new RegExp(entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.equal(coverages.includes(`<p class="coverage-list-block">${entry}`), true)
  }
})

test('MRC proposal v3 renders the coberturas_principales title line, primary item, and Distribución del Capital Asegurado tables', () => {
  const html = buildMrcPropuestaV3Html(
    fixture({
      texts: {
        ...fixture().texts,
        coberturas_principales: {
          contenido:
            'Coberturas Principales:\nIncendio, Rayo y Explosión;\n\nIncendio y daños materiales por Huracán, Vendaval, Ciclón o Tornados;\n\nDistribución del Capital Asegurado:\nIncendio\nMercadería | Muebles, Equipos y Enseres\n50% | 50%\n\nRobo\nMercadería | Equipos | Mueble\n60% | 10% | 30%',
        },
      },
    })
  )
  const coverages = html.slice(
    html.indexOf('data-fit-section="principal-coverages"'),
    html.indexOf('</section>', html.indexOf('data-fit-section="principal-coverages"'))
  )

  assert.match(
    coverages,
    /<p class="coverage-title-block"><strong>Coberturas Principales:<\/strong><strong class="coverage-primary">Incendio, Rayo y Explosión;<\/strong><\/p>/
  )
  assert.match(
    coverages,
    /<p class="coverage-list-block">Incendio y daños materiales por Huracán, Vendaval, Ciclón o Tornados;<\/p>/
  )
  assert.match(
    coverages,
    /<div class="coverage-table-block"><strong class="coverage-subheading">Distribución del Capital Asegurado:<\/strong><strong class="coverage-subheading">Incendio<\/strong><div class="coverage-table" style="--coverage-table-columns:2"><strong>Mercadería<\/strong><strong>Muebles, Equipos y Enseres<\/strong><span>50%<\/span><span>50%<\/span><\/div><\/div>/
  )
  assert.match(
    coverages,
    /<div class="coverage-table-block"><strong class="coverage-subheading">Robo<\/strong><div class="coverage-table" style="--coverage-table-columns:3"><strong>Mercadería<\/strong><strong>Equipos<\/strong><strong>Mueble<\/strong><span>60%<\/span><span>10%<\/span><span>30%<\/span><\/div><\/div>/
  )
})

test('MRC proposal v3 renders escaped dynamic agent, cardholder, and insured signatures with fallbacks', () => {
  const html = buildMrcPropuestaV3Html(
    fixture({
      proposal: {
        ...fixture().proposal,
        agente: { nombre: '<Agent &>', matricula: 'M<&>' },
      },
      draft: {
        ...fixture().draft,
        partes: {
          ...fixture().draft.partes,
          tomador_igual_asegurado: false,
          titular_tarjeta: { nombre_razon_social: '<Cardholder &>', documento: 'CARD<&>' },
          asegurado: {
            ...fixture().draft.partes.asegurado,
            nombre_razon_social: '<Insured &>',
            documento: 'INSURED<&>',
          },
        },
      },
    })
  )
  const signatureMarkup = html.slice(
    html.indexOf('<section class="card signatures"'),
    html.indexOf('</section>', html.indexOf('<section class="card signatures"'))
  )

  for (const value of [
    '<Agent &>',
    'M<&>',
    '<Cardholder &>',
    'CARD<&>',
    '<Insured &>',
    'INSURED<&>',
  ])
    assert.equal(signatureMarkup.includes(value), false, `unescaped signature value: ${value}`)
  for (const value of [
    '&lt;Agent &amp;&gt;',
    'M&lt;&amp;&gt;',
    '&lt;Cardholder &amp;&gt;',
    'CARD&lt;&amp;&gt;',
    '&lt;Insured &amp;&gt;',
    'INSURED&lt;&amp;&gt;',
  ])
    assert.equal(signatureMarkup.includes(value), true, `escaped signature value: ${value}`)
  assert.equal((signatureMarkup.match(/class="signature"/g) ?? []).length, 3)

  const fallbackHtml = buildMrcPropuestaV3Html(
    fixture({
      draft: {
        ...fixture().draft,
        partes: { ...fixture().draft.partes, tomador_igual_asegurado: false, tomador: {} },
      },
    })
  )
  const fallbackSignatures = fallbackHtml.slice(
    fallbackHtml.indexOf('<section class="card signatures"'),
    fallbackHtml.indexOf('</section>', fallbackHtml.indexOf('<section class="card signatures"'))
  )
  assert.match(
    fallbackSignatures,
    /Aclaración: No disponible[\s\S]*Aclaración: &lt;Client &amp; Co\. &quot;quoted&quot;&gt;/
  )
  assert.match(
    fallbackSignatures,
    /Aclaración: &lt;Client &amp; Co\. &quot;quoted&quot;&gt;[\s\S]*Nro de C\.I\.: 1/
  )
})

test('MRC proposal v3 removes clipping from localized legal/content blocks', () => {
  const html = buildMrcPropuestaV3Html(fixture())

  for (const rule of [
    html.match(/\.conditions-flow \{[^}]+\}/)?.[0],
    html.match(/\[data-fit-section\] \{[^}]+\}/)?.[0],
  ]) {
    assert.match(rule ?? '', /overflow: visible;/)
  }
  assert.doesNotMatch(html, /\.mini-card\b/)
  assert.match(html, /\.risk-description \{[^}]*overflow: visible;/)
  assert.equal((html.match(/class="proposal-page/g) ?? []).length, 2)
})

test('MRC proposal v3 applies the fixed-page density tokens without clipping coverage overflow', () => {
  const html = buildMrcPropuestaV3Html(fixture())

  assert.match(
    html,
    /\.coverage-card \{[^}]*height: auto;[^}]*min-height: 60mm;[^}]*overflow: visible;/
  )
  assert.match(
    html,
    /data-fit-section="declarations" data-fit-target="8" data-fit-minimum="6" data-fit-step="0\.2"/
  )
  assert.match(
    html,
    /data-fit-section="principal-coverages" data-fit-target="8" data-fit-minimum="4\.8" data-fit-step="0\.2"/
  )
  assert.match(html, /\.declaration-flow p \{[^}]*margin: 0 0 \.25mm;/)
  assert.match(
    html,
    /\.risk-columns--head \{[^}]*min-height: 7mm;[^}]*padding: 1mm;[^}]*font-size: 7px;/
  )
  assert.match(html, /\.risk-columns--body \{[^}]*min-height: 35mm;/)
  assert.match(html, /\.risk-columns--body > \* \{[^}]*padding: 1mm;/)
  assert.match(
    html,
    /\.risk-columns--total \{[^}]*min-height: 6\.5mm;[^}]*padding: 1mm;[^}]*font-size: 7px;/
  )

  assert.match(html, /\.page-two-content \{[^}]*gap: \.6mm;/)
  assert.match(html, /\.conditions-box,[^{]*\{[^}]*min-height: 0;/)
  assert.match(html, /\.conditions-box \{ padding-bottom: 1mm; \}/)
  assert.match(
    html,
    /\.conditions-flow \{[^}]*margin: 0 \.6mm \.6mm;[^}]*padding: \.6mm 1mm;[^}]*font-size: 7px;[^}]*line-height: 1\.05;/
  )
  assert.match(html, /\.payment-row-shell \{[^}]*min-height: 0;[^}]*padding: 1mm;/)
  assert.match(html, /\.payment-row \{[^}]*min-height: 0;[^}]*gap: 1\.5mm;/)
  assert.match(
    html,
    /\.finance-card h2 \{[^}]*min-height: 7mm;[^}]*padding: 1mm 1\.5mm;[^}]*font-size: 8px;/
  )
  assert.match(
    html,
    /\.payment-line \{[^}]*min-height: 6mm;[^}]*padding: \.8mm 0;[^}]*font-size: 7\.2px;/
  )
  assert.match(html, /\.payment-line span \{[^}]*font-size: 7\.4px;/)
  assert.match(
    html,
    /\.collection-clause \.legal-paragraph \{[^}]*font-size: 7px;[^}]*line-height: 1\.15;/
  )
  assert.match(html, /\.observations \{[^}]*min-height: 0;/)
  assert.match(html, /\.observation-value \{[^}]*min-height: 4mm;[^}]*padding: 1mm;/)
  assert.match(html, /\.writing-line \{[^}]*height: 2\.5mm;/)
  assert.match(html, /\.signatures \{[^}]*min-height: 0;/)
  assert.match(html, /\.signature-grid \{[^}]*padding: 1mm;/)
  assert.match(html, /\.signature \{[^}]*padding: 1mm 1\.5mm;/)
  assert.match(html, /\.signature-space \{[^}]*height: 8mm;/)
  assert.match(html, /\.proposal-eco-row \{[^}]*min-height: 10mm;[^}]*padding: 1\.5mm 2mm;/)
})
