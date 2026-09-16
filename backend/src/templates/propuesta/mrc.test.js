import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { buildLocalMrcFixture } from '../../../scripts/render-mrc-propuesta-local.js'

import { buildMrcPropuestaHtml } from './mrc.js'

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
      partes: {
        tomador_igual_asegurado: true,
        asegurado: {
          tipo_persona: 'fisica',
          nombre_razon_social: 'Client',
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
      declaraciones_generales: { contenido: 'Approved declaration text.' },
      declaracion_jurada_origen_fondos: {
        contenido: 'Declaración Jurada de Origen de Fondos\nApproved source-of-funds text.',
      },
      autorizaciones_tomador_poliza_digital: { contenido: 'Approved authorization text.' },
      coberturas_principales: { contenido: 'Approved coverage text.' },
      condiciones_mrc: { contenido: 'Approved conditions text.' },
      clausula_adicional_cobranzas: {
        contenido: 'CLÁUSULA ADICIONAL DE COBRANZAS\n\nApproved collection clause.',
      },
    },
    ...overrides,
  }
}

test('MRC local candidate fixture restores the official contractual content anchors', () => {
  const candidate = buildLocalMrcFixture('b')
  const official = buildLocalMrcFixture('c')
  const contentKeys = [
    'declaraciones_generales',
    'declaracion_jurada_origen_fondos',
    'autorizaciones_tomador_poliza_digital',
  ]

  for (const key of contentKeys) {
    assert.equal(candidate.texts[key].contenido, official.texts[key].contenido)
  }

  const html = buildMrcPropuestaHtml(candidate)

  for (const anchor of [
    'Declaro que el propósito del presente acuerdo es expresa y específicamente',
    'Declaración Jurada de Origen de Fondos',
    'Ley Nº 1.015/97, sus modificatorias y otras normas sobre PLA/FT',
    '1.2.1 Comunicaciones y documentos relativos a la presente solicitud de seguro',
    '1.2.2 La póliza de seguro propiamente dicha;',
    '1.2.3 Las documentaciones remitidas vía electrónica serán consideradas como recibidas por el asegurado al momento en el cual este acceda al link de descarga y/o acceda a su usuario web de la compañía. Cuando el texto de la póliza difiera del contenido de la propuesta, la diferencia se considerará aprobada por el tomador si no reclama dentro de un mes de haber recibido la póliza. (Art. 1.556 CC).',
  ]) {
    assert.ok(html.includes(anchor), `Missing official contractual anchor: ${anchor}`)
  }
})

test('MRC formal proposal renders the fixed header and insured grid with immutable data', () => {
  const html = buildMrcPropuestaHtml(fixture())

  assert.match(html, /Propuesta:<\/b><span>17<\/span>/)
  assert.match(html, /Fecha de Emisión:/)
  assert.match(html, /Vigencia:/)
  assert.match(html, /Hasta:/)
  assert.match(html, /Hora Inicio:/)
  assert.match(html, /Hora Fin:/)
  assert.match(html, /Propuesta de Renovación a la Póliza:/)
  assert.match(html, /Póliza Nro\.:/)
  assert.match(html, /<div class="insured-grid">/)
  assert.match(html, /Sexo:/)
  assert.match(html, /R\.U\.C\.:/)
  assert.match(html, /Lugar de trabajo:/)
  assert.match(html, /Período:/)
  assert.match(html, /Modalidad de la Cobertura Solicitada : 1020/)
  assert.match(html, /Approved declaration text\./)
  assert.match(html, /Approved coverage text\./)
  assert.match(html, /Sin deducible/)
  assert.match(html, /ASEGURADORA TAJY PROP\.COOP\. S\.A\./)
  assert.match(html, /Página: 1/)
  assert.match(html, /Página: 2/)
  assert.doesNotMatch(html, /undefined/)
})

test('MRC formal proposal keeps the metadata rows and digital-delivery form structurally explicit', () => {
  const html = buildMrcPropuestaHtml(fixture())
  const headerMarkup = html.slice(
    html.indexOf('<div class="header-meta">'),
    html.indexOf('<div class="header-dash">')
  )
  const primaryRow = headerMarkup.match(
    /<div class="header-meta-row header-meta-row--primary">([\s\S]*?)<\/div>\s*<div class="header-meta-row header-meta-row--secondary">/
  )
  const secondaryRow = headerMarkup.match(
    /<div class="header-meta-row header-meta-row--secondary">([\s\S]*?)<\/div>\s*<\/div>/
  )

  assert.ok(primaryRow)
  assert.ok(secondaryRow)
  assert.equal((primaryRow[1].match(/class="header-cell"/g) ?? []).length, 6)
  assert.equal((secondaryRow[1].match(/class="header-cell"/g) ?? []).length, 2)
  assert.match(
    secondaryRow[1],
    /Propuesta de Renovación a la Póliza:<\/b><span>No disponible<\/span>/
  )
  assert.match(secondaryRow[1], /Póliza Nro\.:<\/b><span>No disponible<\/span>/)
  assert.match(html, /\.header-meta-row--primary \{ height: 3\.8mm; \}/)
  assert.match(
    html,
    /\.header-meta-row--secondary \.header-cell \{ padding-left: 1\.3mm; padding-right: 1\.3mm; \}/
  )
  assert.doesNotMatch(html, /\.header-cell > \* \{ transform: translateY/)

  const digitalMarkup = html.slice(
    html.indexOf('<section class="digital-delivery">'),
    html.indexOf('</section>', html.indexOf('<section class="digital-delivery">'))
  )
  assert.equal((digitalMarkup.match(/class="digital-delivery-row/g) ?? []).length, 2)
  assert.match(digitalMarkup, /class="digital-delivery-row digital-delivery-row--choice"/)
  assert.match(
    digitalMarkup,
    /class="digital-choice"><span>SI<\/span><i><\/i><span>NO<\/span><i><\/i><\/span>/
  )
  assert.match(
    digitalMarkup,
    /class="digital-delivery-row digital-delivery-row--email"><span class="digital-email-label">E-mail:<\/span><span class="digital-email-value">client@example\.com<\/span>/
  )
  assert.match(
    html,
    /\.digital-delivery \{ height: 7\.65mm; padding: \.8mm 1\.2mm \.35mm;[^}]*grid-template-rows: 4\.3mm 1\.7mm;[^}]*row-gap: \.15mm;/
  )
  assert.match(html, /\.digital-choice i \{[^}]*width: 4\.3mm; height: 4\.3mm;/)
  assert.match(
    html,
    /\.digital-delivery-row--email \{ display: grid; grid-template-columns: auto minmax\(78mm, 1fr\);[^}]*align-items: baseline;/
  )
})

test('MRC formal proposal keeps the digital-delivery email row when the email is unavailable', () => {
  const html = buildMrcPropuestaHtml(
    fixture({
      draft: {
        ...fixture().draft,
        partes: {
          ...fixture().draft.partes,
          asegurado: { ...fixture().draft.partes.asegurado, email: '' },
        },
      },
    })
  )
  const digitalMarkup = html.slice(
    html.indexOf('<section class="digital-delivery">'),
    html.indexOf('</section>', html.indexOf('<section class="digital-delivery">'))
  )

  assert.equal((digitalMarkup.match(/class="digital-delivery-row/g) ?? []).length, 2)
  assert.match(digitalMarkup, /class="digital-email-value">No disponible<\/span>/)
  assert.match(
    html,
    /\.digital-email-value \{ min-width: 0; height: 1\.7mm; line-height: 1\.7mm;[^}]*border-bottom: \.65px dotted var\(--rule\); \}/
  )
})

test('MRC formal proposal preserves insured field markup while using only three structural separators', () => {
  const html = buildMrcPropuestaHtml(fixture())
  const insured = html.slice(
    html.indexOf('<section class="insured-panel">'),
    html.indexOf('<section class="modality">')
  )
  const insuredGridRule = html.match(/\.insured-grid \{[^}]*\}/)?.[0] ?? ''
  const insuredFieldRule = html.match(/\.insured-field \{[^}]*\}/)?.[0] ?? ''

  assert.deepEqual(
    [...insured.matchAll(/<div class="insured-field ([^"]+)"><b>([^<]+):<\/b>/g)].map(
      ([, span, label]) => [span, label]
    ),
    [
      ['span-7', 'Nombre'],
      ['span-2', 'Sexo'],
      ['span-2', 'Fec. Nac.'],
      ['span-3', 'C.I. / Documento'],
      ['span-2', 'R.U.C.'],
      ['span-3', 'Nacionalidad'],
      ['span-2', 'Estado civil'],
      ['span-4', 'E-mail'],
      ['span-2', 'Lugar de trabajo'],
      ['span-3', 'Ocupación'],
      ['span-2', 'Celular'],
      ['span-4', 'Monto ingreso mensual'],
      ['span-4', 'Proveedor del Estado'],
      ['span-10', 'Dir. Comercial'],
      ['span-3', 'Ciudad'],
      ['span-3', 'Tel.'],
      ['span-10', 'Dir. Particular'],
      ['span-3', 'Ciudad'],
      ['span-3', 'Tel.'],
      ['span-8', 'Ha desempeñado cargo público nacional o extranjero'],
      ['span-4', 'Institución'],
      ['span-2', 'Cargo'],
      ['span-2', 'Período'],
    ]
  )
  assert.doesNotMatch(insuredFieldRule, /border-(?:right|bottom)/)
  assert.equal(
    (insuredGridRule.match(/linear-gradient\(var\(--rule\), var\(--rule\)\)/g) ?? []).length,
    3
  )
  for (const boundary of ['13.95mm', '18.6mm', '23.25mm']) {
    assert.match(insuredGridRule, new RegExp(`0 ${boundary.replace('.', '\\.')}`))
  }
})

test('MRC formal proposal removes header dividers and aligns Póliza Nro. to Hora Fin', () => {
  const html = buildMrcPropuestaHtml(fixture())
  const headerCellRule = html.match(/\.header-cell \{[^}]*\}/)?.[0] ?? ''
  const primaryRule =
    html.match(/\.header-meta-row--primary \{ grid-template-columns:[^}]*\}/)?.[0] ?? ''
  const secondaryRule =
    html.match(/\.header-meta-row--secondary \{ grid-template-columns:[^}]*\}/)?.[0] ?? ''

  assert.doesNotMatch(headerCellRule, /border-right/)
  assert.match(headerCellRule, /border-bottom: \.55px solid var\(--rule\)/)
  assert.match(html, /\.header-meta-row--primary \.header-cell \{ border-bottom: 0; \}/)
  assert.doesNotMatch(primaryRule, /border/)
  assert.match(primaryRule, /12\.75% 12\.75%/)
  assert.match(secondaryRule, /grid-template-columns: 87\.25% 12\.75%/)
  assert.equal(100 - 12.75, 87.25)
  assert.match(
    html,
    /Propuesta de Renovación a la Póliza:<\/b><span>No disponible<\/span>[\s\S]*Póliza Nro\.:<\/b><span>No disponible<\/span>/
  )
})

test('MRC formal proposal omits unavailable risk descriptions without changing generic fallbacks', () => {
  const withDescription = (descripcion_detallada, email = 'client@example.com') =>
    buildMrcPropuestaHtml(
      fixture({
        draft: {
          ...fixture().draft,
          descripcion_detallada,
          partes: {
            ...fixture().draft.partes,
            asegurado: { ...fixture().draft.partes.asegurado, email },
          },
        },
      })
    )
  const riskDescription = (html) =>
    html.slice(
      html.indexOf('<div class="risk-description'),
      html.indexOf('</div><b>Gs.', html.indexOf('<div class="risk-description'))
    )

  for (const unavailable of [null, undefined, '', ' \t ', 'No disponible', ' nÓ dÍsPóNiBlE ']) {
    assert.doesNotMatch(riskDescription(withDescription(unavailable)), /<p>/)
  }
  assert.match(
    riskDescription(withDescription('Real risk description.')),
    /<p>Real risk description\.<\/p>/
  )
  assert.match(
    withDescription('Real risk description.', ''),
    /class="digital-email-value">No disponible<\/span>/
  )
})

test('MRC formal proposal reserves risk-description capacity beyond the measured 8px-floor deficit', () => {
  const html = buildMrcPropuestaHtml(fixture())
  const basePaddingRule = html.match(/\.risk-columns > \* \{[^}]*\}/)?.[0] ?? ''
  const riskPaddingRule = html.match(/\.risk-columns--body \.risk-description \{[^}]*\}/)?.[0] ?? ''
  const measuredDeficitPx = 171 - 165
  const requiredSafetyMarginPx = 0.5
  const pxPerMm = 96 / 25.4
  const inheritedVerticalPaddingMm = 1
  const overriddenVerticalPaddingMm = 0.1
  const recoveredCapacityPx =
    2 * (inheritedVerticalPaddingMm - overriddenVerticalPaddingMm) * pxPerMm

  assert.match(basePaddingRule, /padding: 1mm;/)
  assert.match(riskPaddingRule, /padding-block: \.1mm;/)
  assert.doesNotMatch(riskPaddingRule, /padding(?:-inline|-left|-right):/)
  assert.ok(
    recoveredCapacityPx >= measuredDeficitPx + requiredSafetyMarginPx,
    `Expected ${recoveredCapacityPx}px capacity recovery to exceed the ${measuredDeficitPx}px deficit with a ${requiredSafetyMarginPx}px safety margin`
  )
})

test('MRC formal proposal prevents a synthetic detailed risk description from clipping at the 8px fit floor', () => {
  const html = buildMrcPropuestaHtml(
    fixture({
      draft: { ...fixture().draft, descripcion_detallada: 'Synthetic detailed risk description.' },
    })
  )
  const riskDescription = html.slice(
    html.indexOf('<div class="risk-description'),
    html.indexOf('</div><b>Gs.', html.indexOf('<div class="risk-description'))
  )
  const riskRule = html.match(/\.risk-description \{[^}]*\}/)?.[0] ?? ''
  const stylesheet = html.slice(
    html.indexOf('<style>') + '<style>'.length,
    html.indexOf('</style>')
  )
  const selectorSpecificity = (selector) => [
    (selector.match(/#[\w-]+/g) ?? []).length,
    (selector.match(/(?:\.[\w-]+|\[[^\]]+\]|:[\w-]+)/g) ?? []).length,
    (selector.match(/(?:^|[\s>+~])[a-z][\w-]*/gi) ?? []).length,
  ]
  const compareCascade = (left, right) => {
    for (let index = 0; index < left.specificity.length; index += 1) {
      if (left.specificity[index] !== right.specificity[index]) {
        return left.specificity[index] - right.specificity[index]
      }
    }
    return left.sourceOrder - right.sourceOrder
  }
  const matchesRiskDescriptionParagraph = (selector) =>
    selector === '.risk-columns--body p' ||
    (/\.risk-description(?:\s|>|$)/.test(selector) && /(?:\s|>)p$/.test(selector))
  const marginRules = [...stylesheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .flatMap(([, selectors, declarations], sourceOrder) =>
      selectors.split(',').map((selector) => ({
        selector: selector.trim(),
        margin: declarations.match(/\bmargin:\s*([^;]+);/)?.[1],
        sourceOrder,
      }))
    )
    .filter(({ selector, margin }) => margin && matchesRiskDescriptionParagraph(selector))
    .map((rule) => ({ ...rule, specificity: selectorSpecificity(rule.selector) }))
  const effectiveMarginRule = marginRules.reduce(
    (winner, rule) => (!winner || compareCascade(rule, winner) > 0 ? rule : winner),
    null
  )
  const availableContentHeight = ((43.9 - 2) * 96) / 25.4
  const lineCount = 18
  const lineHeight = 1.08
  const paragraphMarginPx = 96 / 25.4
  const fit = (paragraphMargin) => {
    let size = 9.2
    let contentHeight = lineCount * size * lineHeight + paragraphMargin
    while (contentHeight > availableContentHeight && size > 8) {
      size = Math.max(8, Number((size - 0.2).toFixed(2)))
      contentHeight = lineCount * size * lineHeight + paragraphMargin
    }
    return { final: size, overflow: contentHeight > availableContentHeight }
  }

  assert.match(riskDescription, /<p>Synthetic detailed risk description\.<\/p>/)
  assert.match(riskRule, /font-size: var\(--type-e-size\); line-height: var\(--type-e-line\);/)
  assert.ok(
    marginRules.some(
      ({ selector, margin }) => selector === '.risk-columns--body p' && margin === '0 0 1mm'
    )
  )
  assert.ok(
    marginRules.some(
      ({ selector, margin }) => selector.includes('.risk-description') && margin === '0'
    )
  )
  assert.equal(effectiveMarginRule?.margin, '0')
  assert.deepEqual(fit(paragraphMarginPx), { final: 8, overflow: true })
  assert.deepEqual(fit(effectiveMarginRule?.margin === '0' ? 0 : paragraphMarginPx), {
    final: 8,
    overflow: false,
  })
})

test('MRC formal proposal removes duplicate contract headings and the invented conditions heading', () => {
  const html = buildMrcPropuestaHtml(fixture())
  const originOfFundsHeadingCount = (html.match(/Declaración Jurada de Origen de Fondos/g) ?? [])
    .length
  const collectionClauseHeadingCount = (html.match(/CLÁUSULA ADICIONAL DE COBRANZAS/g) ?? []).length

  assert.equal(originOfFundsHeadingCount, 1)
  assert.equal(collectionClauseHeadingCount, 1)
  assert.match(html, /Approved conditions text\./)
  assert.match(
    html,
    /<h2>CLÁUSULA ADICIONAL DE COBRANZAS<\/h2><div><p class="legal-paragraph">Approved collection clause\.<\/p><\/div>/
  )
  assert.doesNotMatch(html, /Condiciones, sub-límites, franquicias y exclusiones/)
  assert.ok(
    html.indexOf('Approved declaration text.') < html.indexOf('Approved collection clause.')
  )
})

test('MRC formal proposal removes stored collection-clause title variants from the generated body', () => {
  for (const storedTitle of [
    'CLAUSULA ADICIONAL DE COBRANZAS',
    'CLAUSULAADICIONALDECOBRANZAS',
    'CLÁUSULA-ADICIONAL-DE-COBRANZAS',
  ]) {
    const html = buildMrcPropuestaHtml(
      fixture({
        texts: {
          ...fixture().texts,
          clausula_adicional_cobranzas: { contenido: `${storedTitle}\nLegal clause body.` },
        },
      })
    )

    assert.equal((html.match(/CLÁUSULA ADICIONAL DE COBRANZAS/g) ?? []).length, 1)
    assert.match(
      html,
      /<h2>CLÁUSULA ADICIONAL DE COBRANZAS<\/h2><div><p class="legal-paragraph">Legal clause body\.<\/p><\/div>/
    )
    assert.doesNotMatch(html, /CLAUSULAADICIONALDECOBRANZAS/)
  }
})

test('MRC formal proposal keeps the measured fixed-form geometry without Auto-only data', () => {
  const html = buildMrcPropuestaHtml(fixture())

  assert.match(html, /padding: 4\.2mm 7\.1mm 2\.9mm 10mm/)
  assert.match(html, /grid-template-columns: 8\.3mm 1fr 25\.3mm 17\.7mm/)
  assert.match(html, /\.risk-columns--body \{ height: 43\.9mm;/)
  assert.match(html, /height: 164\.8mm/)
  assert.match(html, /\.risk-table \{ flex: none;/)
  assert.match(html, /\.contract-stack \{ flex: 0 0 164\.8mm; height: 164\.8mm;/)
  assert.match(html, /height: 87\.3mm/)
  assert.match(
    html,
    /\.payment-row-shell \{ height: 27\.25mm; border: \.65px solid var\(--rule\); \}/
  )
  assert.match(html, /grid-template-columns: 53mm 3\.9mm 46mm 1fr/)
  assert.match(html, /grid-template-columns: 40% 36\.8% 23\.2%/)
  assert.match(
    html,
    /\.signature:nth-child\(1\) \.signature-line \{ width: 74\.5%; margin-left: -\.2mm; \}/
  )
  assert.match(
    html,
    /\.signature:nth-child\(2\) \.signature-line \{ margin: 0 -1mm \.7mm 17\.7mm; \}/
  )
  assert.match(
    html,
    /\.signature:nth-child\(2\) \.signature-detail \{ transform: translateX\(17\.4mm\); \}/
  )
  assert.match(
    html,
    /\.signature:nth-child\(3\) \.signature-line \{ margin: 0 -\.4mm \.7mm -\.7mm; \}/
  )
  assert.match(
    html,
    /\.signature:nth-child\(3\)::before \{ content: ''; position: absolute; top: 3\.8mm; bottom: 0; left: 0; border-left: \.65px solid var\(--rule\); \}/
  )
  assert.match(html, /\.writing-line \{ height: 3\.3mm/)
  assert.match(
    html,
    /class="digital-choice"><span>SI<\/span><i><\/i><span>NO<\/span><i><\/i><\/span>/
  )
  assert.doesNotMatch(html, /Placa|Chasis|Marca|Modelo/)
  assert.doesNotMatch(html, /tajy-red|#b00000|barcode|barcode-number/)
})

test('MRC formal proposal keeps full-height structural dividers for all four risk body cells', () => {
  const html = buildMrcPropuestaHtml(fixture())
  const bodyStart = html.indexOf('<div class="risk-columns risk-columns--body">')
  const totalStart = html.indexOf('<div class="risk-columns risk-columns--total">')
  const body = html.slice(bodyStart, totalStart)

  assert.match(
    body,
    /^<div class="risk-columns risk-columns--body"><span>1<\/span><div class="risk-description fit-box"[^>]*>[\s\S]*<\/div><b>Gs\. 1\.000\.000<\/b><b>Gs\. 100\.000<\/b><\/div>\n\s*$/
  )
  assert.match(
    html,
    /\.risk-columns > \* \{ min-width: 0; padding: 1mm; border-right: \.65px solid var\(--rule\);/
  )
  assert.match(
    html,
    /\.risk-columns--body > b \{ display: flex; align-items: center; justify-content: flex-end; text-align: right; \}/
  )
  assert.doesNotMatch(html, /\.risk-columns--body > b \{[^}]*align-self: center/)
})

test('MRC formal proposal keeps numeric risk headings on one line without global nowrap', () => {
  const html = buildMrcPropuestaHtml(fixture())
  const heading = html.slice(
    html.indexOf('<div class="risk-columns risk-columns--head">'),
    html.indexOf('<div class="risk-columns risk-columns--body">')
  )

  assert.match(
    heading,
    /<span class="risk-heading--numeric">Suma Asegurada Gs\.<\/span><span class="risk-heading--numeric">Prima Gs\.<\/span>/
  )
  assert.match(
    html,
    /\.risk-columns--head > \.risk-heading--numeric \{[^}]*padding-left: \.35mm; padding-right: \.35mm; white-space: nowrap; overflow-wrap: normal;/
  )
  assert.doesNotMatch(html, /\.risk-columns > \* \{[^}]*white-space: nowrap/)
  assert.match(
    html,
    /\.risk-columns--head > \* \{ display: flex; align-items: center; justify-content: center; \}/
  )
})

test('MRC formal proposal uses the supplied official logo image without barcode framing', () => {
  const logoDataUri = 'data:image/svg+xml;base64,PHN2Zy8+'
  const html = buildMrcPropuestaHtml(fixture(), { tajyLogoDataUri: logoDataUri })

  assert.ok(html.includes(`<img class="tajy-logo" src="${logoDataUri}"`))
  assert.match(html, /<div class="header-page">Página 1<\/div>/)
  assert.doesNotMatch(html, /barcode|Código de propuesta|barcode-number/)
})

test('MRC formal proposal preserves zero values and keeps the debit authorization form without card data', () => {
  const html = buildMrcPropuestaHtml(
    fixture({
      proposal: { numero_propuesta: 1, emitida_at: '2026-09-01T12:00:00.000Z', agente: {} },
      carta: { render_context: {}, riesgo_datos: {}, coberturas: [] },
      commercial: {
        variante: { prima: 0 },
        plan_pago: {
          formas_pago: { codigo: 'tarjeta_credito' },
          rpf_monto: null,
          iva_monto: 0,
          premio_total: 0,
          monto_inicial: 0,
        },
      },
      draft: { partes: { asegurado: {} }, pla_ft: { es_pep: false }, tipo_firma: 'digital' },
      texts: {},
    })
  )

  assert.match(html, /Gs\. 0/)
  assert.match(html, /R\.P\.F\.:<\/b><span>No disponible<\/span>/)
  assert.match(html, /Sub-Total:<\/b><span>No disponible<\/span>/)
  assert.match(html, /En mi carácter de titular de cuenta autorizo irrevocablemente/)
  assert.match(html, /Tipo:<span class="debit-box"><\/span>Visa/)
  assert.doesNotMatch(html, /DATOS DE TARJETA|Datos de tarjeta y autorización de débito/)
  assert.match(html, /Operador: No disponible/)
  assert.match(html, /<span class="check-box checked">X<\/span>/)
  assert.doesNotMatch(html, /&lt;span class="check-box/)
  assert.doesNotMatch(html, /undefined/)
})

test('MRC formal proposal converts sentence-level newlines into natural legal-text flow', () => {
  const html = buildMrcPropuestaHtml(
    fixture({
      texts: {
        ...fixture().texts,
        declaraciones_generales: {
          contenido: 'First legal sentence.\nSecond legal sentence.\nThird legal sentence.',
        },
        declaracion_jurada_origen_fondos: {
          contenido:
            'Declaración Jurada de Origen de Fondos\nFirst source sentence.\nSecond source sentence.',
        },
      },
    })
  )

  assert.match(
    html,
    /<p class="declaration-paragraph declaration-paragraph--lead">First legal sentence\. Second legal sentence\. Third legal sentence\.<\/p>/
  )
  assert.match(
    html,
    /<div class="declaration-subsection"><h3>Declaración Jurada de Origen de Fondos<\/h3><p>First source sentence\. Second source sentence\.<\/p><\/div>/
  )
  assert.doesNotMatch(html, /white-space: pre-line/)
  assert.doesNotMatch(html, /First legal sentence\.<br/)
})

test('MRC formal proposal builds escaped declaration form semantics from snapshot texts', () => {
  const html = buildMrcPropuestaHtml(
    fixture({
      texts: {
        ...fixture().texts,
        declaraciones_generales: {
          contenido:
            'DECLARACIONES:\n\nFirst sentence.\nSecond <script>alert(1)</script> sentence.',
        },
        declaracion_jurada_origen_fondos: {
          contenido: `Declaración Jurada de Origen de Fondos
Escaped & verified body.

* Que SI (    ) NO (    ) declaro el estado. Motivo: ________________________. -

* Que SI (    ) NO (    ) declaro el segundo estado. Motivo: ________________________. -

Electrónica c/Firma Digital (       ) Impresa c/Firma Facsimilar (     ) Impresa c/Firma Manuscrita (    )`,
        },
        autorizaciones_tomador_poliza_digital: {
          contenido: `1. Autorizaciones del Tomador y/o Representante Legal - En caso de opción Póliza Digital.

1.1 Mecanismos de Entrega (puede seleccionar más de una opción)

Correo Electrónico (      ) Vía Teléfono Móvil (     ) Usuario Web (      )

1.2 Autorizo el envío de documentos.

1.2.1 Primer documento.

1.2.2 Segundo documento.

1.2.3 Tercer documento.`,
        },
      },
    })
  )
  const declarations = html.slice(
    html.indexOf('<div class="declarations-stack'),
    html.indexOf('<section class="contract-section contract-section--coverage')
  )

  assert.match(
    declarations,
    /First sentence\. Second &lt;script&gt;alert\(1\)&lt;\/script&gt; sentence\./
  )
  assert.doesNotMatch(declarations, /<script>alert/)
  assert.match(declarations, /SI \( {4}\) NO \( {4}\)/)
  assert.equal((declarations.match(/class="motive-writing-line"/g) ?? []).length, 2)
  assert.match(declarations, /declaration-choice-group--signatures/)
  assert.match(declarations, /declaration-choice-group--delivery/)
  assert.equal((declarations.match(/Vía Teléfono Móvil/g) ?? []).length, 1)
  assert.doesNotMatch(declarations, /Vía Teléfono Móvi(?=\s*\()/u)
  assert.match(declarations, /declaration-paragraph--numbered-1-2-1/)
  assert.match(declarations, /declaration-paragraph--numbered-1-2-2/)
  assert.match(declarations, /declaration-paragraph--numbered-1-2-3/)
  assert.doesNotMatch(declarations, /class="check-box/)
})

test('MRC formal proposal normalizes the legacy truncated delivery label only in its choice group', () => {
  const officialLabel = 'Vía Teléfono Móvil'
  const legacyLabel = officialLabel.slice(0, -1)
  const unrelatedText = `Unrelated ${legacyLabel} prose remains unchanged.`
  const html = buildMrcPropuestaHtml(
    fixture({
      texts: {
        ...fixture().texts,
        autorizaciones_tomador_poliza_digital: {
          contenido: `${unrelatedText}\n\nCorreo Electrónico ( ) ${legacyLabel} ( ) Usuario Web ( )`,
        },
      },
    })
  )

  assert.match(html, new RegExp(unrelatedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.equal((html.match(/Vía Teléfono Móvil/g) ?? []).length, 1)
  assert.ok(!html.includes(`${legacyLabel} ( )`))
})

test('MRC formal proposal renders official coverage hierarchy and distributions from snapshot text values', () => {
  const html = buildMrcPropuestaHtml(
    fixture({
      texts: {
        ...fixture().texts,
        coberturas_principales: {
          contenido: `Coberturas Principales:

Incendio, Rayo y Explosión;
Daños materiales por Humo y Hollín;

Robo y/o Asalto del Contenido.-
Robo (Caja registradora).-

Distribución del Capital Asegurado:
Incendio
Mercadería
Muebles, Equipos y Enseres
50%
50%

Sublímite de prueba: Gs. 5.000.000.-

Robo
Mercadería
Equipos
Mueble
60%
10%
30%`,
        },
      },
    })
  )

  assert.match(html, /coverage-list coverage-list--fire/)
  assert.match(html, /coverage-list coverage-list--theft/)
  assert.match(html, /coverage-distribution coverage-distribution--fire/)
  assert.match(html, /coverage-distribution__grid coverage-distribution__grid--fire/)
  assert.match(
    html,
    /<strong>Mercadería<\/strong><strong>Muebles, Equipos y Enseres<\/strong>\s*<span>50%<\/span><span>50%<\/span>/
  )
  assert.match(html, /coverage-sublimits/)
  assert.match(html, /coverage-distribution coverage-distribution--theft/)
  assert.match(
    html,
    /<strong>Mercadería<\/strong><strong>Equipos<\/strong><strong>Mueble<\/strong>\s*<span>60%<\/span><span>10%<\/span><span>30%<\/span>/
  )
})

test('MRC formal proposal renders conditions as sublimits, franchises, exclusions, and final prose', () => {
  const html = buildMrcPropuestaHtml(
    fixture({
      texts: {
        ...fixture().texts,
        condiciones_mrc: {
          contenido: `Sub-límites oficiales.

Detalle de sublímites.

Franquicias:

Detalle de franquicias.

Exclusiones:

Detalle de exclusiones.

La asegurada dará aviso fehaciente de los cambios.`,
        },
      },
    })
  )
  const conditions = html.slice(
    html.indexOf('<section class="conditions-box'),
    html.indexOf('<div class="payment-row-shell">')
  )

  assert.match(conditions, /conditions-intro[^]*Sub-límites oficiales\.[^]*Detalle de sublímites\./)
  assert.match(conditions, /conditions-section--franchises"><h3>Franquicias:<\/h3>/)
  assert.match(conditions, /conditions-section--exclusions"><h3>Exclusiones:<\/h3>/)
  assert.match(conditions, /conditions-final[^]*La asegurada dará aviso fehaciente/)
  assert.doesNotMatch(conditions, /CONDICIONES PARTICULARES|Condiciones, sub-límites/)
})

test('MRC renderer contains no embedded proposal, customer, agent, or operator literals', () => {
  const source = readFileSync(new URL('./mrc.js', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)
  assert.doesNotMatch(source, /\b\d{3,}[.-]\d{3,}[.-]\d{3,}\b/)
  assert.doesNotMatch(source, /\b0\d{8,}\b/)
  assert.match(source, /proposal\.agente\?\.nombre/)
  assert.match(source, /draft\.observaciones/)
  assert.match(source, /risk\.direccion/)
})

test('MRC formal proposal declares calibrated A-N typography tokens and local fit bounds', () => {
  const html = buildMrcPropuestaHtml(fixture())
  const expectedTokens = [
    ['a', 'Arial, Helvetica, sans-serif', '6.8667px', '1.1'],
    ['b', 'Arial, Helvetica, sans-serif', '6.1167px', '1.05'],
    ['c', 'Arial, Helvetica, sans-serif', '11.8px', '1'],
    ['d', 'Arial, Helvetica, sans-serif', '9.2px', '1'],
    ['e', '"Courier New", Courier, monospace', '9.2px', '1.08'],
    ['f', 'Arial, Helvetica, sans-serif', '6.8px', '1.1'],
    ['g', 'Arial, Helvetica, sans-serif', '10.6px', '1.12'],
    ['h', 'Arial, Helvetica, sans-serif', '10.6px', '1.12'],
    ['i', 'Arial, Helvetica, sans-serif', '9.8667px', '1.04'],
    ['j', 'Arial, Helvetica, sans-serif', '8px', '1.12'],
    ['k', 'Calibri, Arial, sans-serif', '8.1px', '1.12'],
    ['l', 'Arial, Helvetica, sans-serif', '7.4667px', '1.08'],
    ['m', 'Arial, Helvetica, sans-serif', '7.55px', '1'],
    ['n', 'Arial, Helvetica, sans-serif', '8.8px', '1.1'],
  ]

  for (const [token, family, size, line] of expectedTokens) {
    assert.ok(
      html.includes(
        `--type-${token}-family: ${family}; --type-${token}-size: ${size}; --type-${token}-line: ${line};`
      )
    )
  }

  for (const [section, target, minimum, step] of [
    ['risk-description', '9.2', '8', '0.2'],
    ['declarations', '6.8', '5.9', '0.1'],
    ['principal-coverages', '10.6', '9.2', '0.2'],
    ['conditions', '10.6', '9.2', '0.2'],
    ['collection-clause', '8.1', '7', '0.1'],
  ]) {
    assert.match(
      html,
      new RegExp(
        `data-fit-section="${section}" data-fit-target="${target.replace('.', '\\.')}" data-fit-minimum="${minimum.replace('.', '\\.')}" data-fit-step="${step.replace('.', '\\.')}"`
      )
    )
  }

  assert.match(html, /element\.scrollHeight > element\.clientHeight \+ 0\.5/)
  assert.match(html, /element\.scrollWidth > element\.clientWidth \+ 0\.5/)
  assert.match(html, /size = Math\.max\(minimum, Number\(\(size - step\)\.toFixed\(2\)\)\)/)
  assert.match(html, /element\.dataset\.fitOverflow = String\(overflow\)/)
  assert.match(html, /document\.documentElement\.dataset\.proposalFit = 'complete'/)
  assert.match(html, /\.risk-description \{[^}]*height: 100%; min-height: 0; overflow: hidden;/)
})

test('MRC formal proposal retains the protected insured, payment, and signature form geometry', () => {
  const html = buildMrcPropuestaHtml(fixture())
  const metadata = html.slice(
    html.indexOf('<div class="header-meta">'),
    html.indexOf('<div class="header-dash">')
  )
  const insured = html.slice(
    html.indexOf('<section class="insured-panel">'),
    html.indexOf('<section class="modality">')
  )
  const signatures = html.slice(
    html.indexOf('<section class="signatures">'),
    html.indexOf('<section class="digital-delivery">')
  )

  assert.equal((metadata.match(/class="header-meta-row/g) ?? []).length, 2)
  assert.equal((metadata.match(/class="header-cell"/g) ?? []).length, 8)
  assert.equal((insured.match(/class="insured-field/g) ?? []).length, 23)
  assert.doesNotMatch(insured, /class="insured-annex span-16"/)
  assert.equal((insured.match(/class="check-box/g) ?? []).length, 4)
  assert.equal((signatures.match(/class="signature"/g) ?? []).length, 3)
  assert.equal((signatures.match(/class="signature-label"/g) ?? []).length, 3)
  assert.equal((signatures.match(/class="signature-detail"/g) ?? []).length, 7)

  assert.match(
    html,
    /\.insured-panel h1 \{ height: 3\.4mm; margin: 0; padding: \.55mm 1\.3mm; font-size: 7\.8667px; line-height: 1; \}/
  )
  assert.match(
    html,
    /\.insured-grid \{[^}]*grid-template-columns: repeat\(16, minmax\(0, 1fr\)\); grid-auto-rows: 4\.65mm;/
  )
  assert.match(insured, /<div class="insured-field span-10"><b>Dir\. Comercial:<\/b>/)
  assert.match(html, /\.insured-field \{ min-width: 0; padding: \.55mm \.7mm; font: inherit;/)
  assert.match(html, /\.insured-field \{ min-width: 0; padding: \.55mm \.7mm; font: inherit;/)
  assert.match(html, /\.insured-field \{ min-width: 0; padding: \.55mm \.7mm; font: inherit;/)
  assert.match(html, /\.span-10 \{ grid-column: span 10; \}/)
  assert.match(
    html,
    /\.cost-box \.payment-line:first-child, \.payment-box \.payment-line:first-child \{ border-top: 0; \}/
  )
  assert.match(
    html,
    /\.payment-line \{ min-height: 0; display: grid; grid-template-columns: 44% 1fr; align-items: center; padding: \.35mm 1\.1mm; border-top: \.5px solid var\(--rule\);/
  )
  assert.match(
    html,
    /\.payment-line \{ min-height: 0; display: grid; grid-template-columns: 44% 1fr; align-items: center; padding: \.35mm 1\.1mm; border-top: \.5px solid var\(--rule\);/
  )
  assert.match(html, /\.check-box \{[^}]*width: 3mm; height: 3mm;[^}]*font-size: 6px;/)
  assert.match(
    html,
    /\.signatures \{ height: 19\.15mm;[^}]*grid-template-columns: 40% 36\.8% 23\.2%;/
  )
  assert.match(html, /\.signature \{ min-width: 0; padding: 3\.8mm 1mm 0;/)
  assert.match(html, /\.signature-label \{ margin-bottom: 1mm; font-size: inherit; \}/)
  assert.match(
    html,
    /\.signature-detail \{ text-align: left; line-height: \.88; white-space: nowrap; \}/
  )
  assert.match(
    html,
    /\.signature:nth-child\(1\) \.signature-label \{ transform: translate\(-9\.9mm, -\.5mm\); \}/
  )
  assert.match(
    html,
    /\.signature:nth-child\(1\) \.signature-detail \{ line-height: \.88; transform: translateY\(-\.5mm\); \}/
  )
})

test('MRC formal proposal gives page-two transitions one structural border owner without gaps', () => {
  const html = buildMrcPropuestaHtml(fixture())
  const pageTwo = html.slice(html.indexOf('<article class="proposal-page proposal-page--two">'))

  assert.match(
    pageTwo,
    /<section class="conditions-box fit-box"[^>]*>[\s\S]*<\/section>\s*<div class="payment-row-shell">/
  )
  assert.match(pageTwo, /<\/div>\s*<section class="contract-section collection-clause fit-box"/)
  assert.match(html, /\.conditions-box \{[^}]*border-bottom: 0;/)
  assert.match(
    html,
    /\.payment-row-shell \{ height: 27\.25mm; border: \.65px solid var\(--rule\); \}/
  )
  assert.match(html, /\.collection-clause \{[^}]*border-top: 0;/)
  assert.match(html, /\.cost-box, \.payment-box \{ height: 100%;/)
  assert.match(
    html,
    /\.debit-authorization \{ grid-column: 4; height: 100%; padding: \.8mm 1\.2mm \.45mm; border-left: 0;/
  )
  assert.doesNotMatch(html, /\.payment-row \{[^}]*margin: \.65mm/)
})
