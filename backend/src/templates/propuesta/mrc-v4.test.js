import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  PROPUESTA_FORMAL_V4_STYLE,
  buildMrcPropuestaV4Html,
  planPagination,
  renderContinuationHeader,
} from './mrc-v4.js'

const LOGO = 'data:image/svg+xml;base64,TEST'

function fixture(overrides = {}) {
  return {
    proposal: {
      numero_propuesta: 17,
      emitida_at: '2026-09-01T12:00:00.000Z',
      agente: { nombre: 'Agent Test', matricula: 'N/A', email: 'agent@example.com' },
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
        rpf_monto: 0,
        iva_monto: 10000,
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

function build(overrides, options = { tajyLogoDataUri: LOGO }) {
  return buildMrcPropuestaV4Html(fixture(overrides), options)
}

// ---------------------------------------------------------------- T2: skeleton

test('v4 skeleton declares the design, A4 page size and the red/ink tokens', () => {
  const html = build()

  assert.match(html, /<html lang="es" data-proposal-design="v4"/)
  assert.match(html, /@page \{ size: A4; margin: 0; \}/)
  assert.match(PROPUESTA_FORMAL_V4_STYLE, /--v4-red:\s*#b31432/i)
  assert.match(PROPUESTA_FORMAL_V4_STYLE, /--v4-ink:/)
  assert.match(PROPUESTA_FORMAL_V4_STYLE, /width:\s*210mm/)
  assert.match(PROPUESTA_FORMAL_V4_STYLE, /height:\s*297mm/)
  assert.match(PROPUESTA_FORMAL_V4_STYLE, /overflow:\s*hidden/)
})

test('v4 skeleton renders the five topic pages in order with the contract markup', () => {
  const html = build()

  const topics = [...html.matchAll(/<article class="proposal-page"[^>]*data-topic="([^"]+)"/g)].map(
    (match) => match[1]
  )
  assert.deepEqual(topics, ['cover', 'coverage', 'declarations', 'conditions', 'payment'])
  assert.equal((html.match(/<div class="page-body">/g) ?? []).length, 5)
  assert.equal((html.match(/<footer class="proposal-footer">/g) ?? []).length, 5)
  // Pages 2-5 use the reusable compact header; page 1 uses the big cover header.
  assert.equal((html.match(/<header class="page-header"/g) ?? []).length, 4)
  assert.equal((html.match(/<header class="cover-header"/g) ?? []).length, 1)
  assert.doesNotMatch(html, /data-fit-/)
  assert.equal((html.match(/<script>/gi) ?? []).length, 1)
})

test('v4 cover header shows eyebrow, title, proposal number and issue date', () => {
  const html = build()

  assert.match(html, /ASEGURADORA TAJY PROP\. COOP\. S\.A\./)
  assert.match(html, /Propuesta formal/)
  assert.match(html, /de seguro/)
  assert.match(html, /Riesgos varios \/ Multirriesgo comercio/)
  assert.match(html, /Propuesta N\.º/)
  assert.match(html, /<span class="cover-number">17<\/span>/)
  assert.match(html, /<span class="cover-date">01 SEP 2026<\/span>/)
})

test('v4 uses the supplied red/black logo as-is, never inverted or on a red tile', () => {
  const html = build()

  assert.match(html, /<img class="tajy-logo" src="data:image\/svg\+xml;base64,TEST"/)
  assert.doesNotMatch(PROPUESTA_FORMAL_V4_STYLE, /invert\(|brightness\(0\)/)
  assert.doesNotMatch(PROPUESTA_FORMAL_V4_STYLE, /\.logo-tile/)
})

test('v4 falls back to the text brand mark when no logo is supplied', () => {
  const html = buildMrcPropuestaV4Html(fixture(), {})

  assert.doesNotMatch(html, /<img class="tajy-logo"/)
  assert.match(html, /tajy-logo-fallback/)
})

test('v4 footer repeats on every page with brand, proposal number and page placeholders', () => {
  const html = build()

  const footers = [...html.matchAll(/<footer class="proposal-footer">[\s\S]*?<\/footer>/g)].map(
    (match) => match[0]
  )
  assert.equal(footers.length, 5)
  footers.forEach((footer, index) => {
    assert.match(footer, /TAJY • Aseguradora Tajy Prop\. Coop\. S\.A\./)
    assert.match(footer, /Propuesta N\.º 17 · Página /)
    assert.match(footer, new RegExp(`<span data-page-number>${index + 1}</span>`))
    assert.match(footer, /<span data-page-total>5<\/span>/)
  })
})

test('v4 never prints the mockup artifact texts or the yellow review note', () => {
  const html = build()

  for (const forbidden of [
    'Documento conceptual',
    'Diseño alternativo B',
    'Versión original',
    'Alternativa B',
    'NOTA DE REVISIÓN',
    'Importe conservado',
    'COSTO TOTAL DECLARADO',
  ]) {
    assert.ok(!html.includes(forbidden), `must not contain "${forbidden}"`)
  }
  assert.doesNotMatch(
    PROPUESTA_FORMAL_V4_STYLE,
    /review-note|revision-note|yellow|#fff[0-9a-f]*e\b/i
  )
})

test('renderContinuationHeader builds the reusable compact header with escaping', () => {
  const header = renderContinuationHeader({
    topic: 'declarations',
    number: '<17>',
    logo: LOGO,
  })

  assert.match(header, /^<header class="page-header" data-continuation>/)
  assert.match(header, /<img class="tajy-logo" src="data:image\/svg\+xml;base64,TEST"/)
  assert.match(header, /Propuesta para seguro/i)
  assert.match(header, /N[º°] &lt;17&gt;/)
  assert.doesNotMatch(header, /<17>/)
  assert.match(header, /Marco contractual · Declaraciones/i)
})

test('renderContinuationHeader tolerates an unknown topic and a missing logo', () => {
  const header = renderContinuationHeader({ topic: 'unknown', number: 3 })

  assert.match(header, /<header class="page-header"/)
  assert.match(header, /tajy-logo-fallback/)
})

// ---------------------------------------------------------------- shared test helpers

// Body markup of the page of a topic (between `.page-body` and the footer).
function pageBody(html, topic) {
  const start = html.indexOf(`<article class="proposal-page" data-topic="${topic}"`)
  assert.ok(start >= 0, `topic ${topic} exists`)
  const marker = '<div class="page-body">'
  const bodyStart = html.indexOf(marker, start) + marker.length
  const footerStart = html.indexOf('<footer', bodyStart)
  const body = html.slice(bodyStart, footerStart)
  return body.slice(0, body.lastIndexOf('</div>'))
}

// Opening tags found at depth 0 of an HTML fragment.
function topLevelChildren(fragment) {
  const voidTags = new Set(['img', 'br', 'hr', 'input'])
  const children = []
  let depth = 0
  for (const match of fragment.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>/gi)) {
    const [, closing, tag, attrs] = match
    if (closing) {
      depth -= 1
      continue
    }
    if (depth === 0) children.push({ tag, attrs })
    if (!voidTags.has(tag.toLowerCase())) depth += 1
  }
  return children
}

function assertAllBlocks(html, topic) {
  const children = topLevelChildren(pageBody(html, topic))
  assert.ok(children.length > 0, `${topic} has blocks`)
  for (const child of children) {
    assert.match(child.attrs, /\bdata-block\b/, `${topic}: <${child.tag}> must be data-block`)
  }
}

// ---------------------------------------------------------------- T3: page 1

test('v4 page 1 meta row has 3 equal cells without a policy number', () => {
  const body = pageBody(build(), 'cover')

  assert.match(body, /<section class="meta-row meta-row--3" data-block>/)
  assert.equal((body.match(/<div class="meta-cell"/g) ?? []).length, 3)
  assert.match(body, />Vigencia desde</)
  assert.match(body, />Vigencia hasta</)
  assert.match(body, />Modalidad</)
  assert.doesNotMatch(body, /Póliza N\.º|Renovación|renewal/i)
})

test('v4 page 1 meta row shows a 4th "Póliza N.º" cell only when numero_poliza is non-empty', () => {
  const base = fixture().draft
  const body = pageBody(build({ draft: { ...base, numero_poliza: '  P-<123>  ' } }), 'cover')

  assert.match(body, /<section class="meta-row meta-row--4" data-block>/)
  assert.equal((body.match(/<div class="meta-cell"/g) ?? []).length, 4)
  assert.match(body, /Póliza N\.º/)
  assert.match(body, /P-&lt;123&gt;/)
  assert.doesNotMatch(body, /P-<123>/)

  for (const blank of ['', '   ', null, undefined, 7]) {
    const html = build({ draft: { ...base, numero_poliza: blank } })
    assert.doesNotMatch(pageBody(html, 'cover'), /Póliza N\.º/, `blank: ${String(blank)}`)
  }
})

test('v4 page 1 keeps v3 vigencia and hour logic (+6 days, +1 year, local hour)', () => {
  const body = pageBody(
    build({ proposal: { ...fixture().proposal, emitida_at: '2026-09-28T15:45:00.000Z' } }),
    'cover'
  )

  // 28/09/2026 + 6 days = 04/10/2026 -> +1 year = 04/10/2027. 15:45 UTC = 12:45 in Asunción.
  assert.match(body, /<span class="meta-value">04\/10\/2026<\/span>/)
  assert.match(body, /<span class="meta-value">04\/10\/2027<\/span>/)
  const hours = body.match(/<span class="meta-sub">12:45\s*(?:a\.?\s*m\.?|p\.?\s*m\.?)?<\/span>/gi)
  assert.equal((hours ?? []).length, 2)
  assert.match(body, /<span class="meta-value">1020<\/span>/)
  assert.match(body, /<span class="meta-sub">Multirriesgo comercio<\/span>/)
})

test('v4 page 1 identification maps the insured with escaping and local phone prefix', () => {
  const base = fixture().draft
  const body = pageBody(
    build({
      draft: {
        ...base,
        partes: {
          ...base.partes,
          asegurado: {
            ...base.partes.asegurado,
            telefono: '981-927-418',
            ingreso_mensual: 5000000,
            ruc: '80000-1',
          },
        },
      },
    }),
    'cover'
  )

  assert.match(
    body,
    /<span class="section-num">01<\/span><span class="section-name">Identificación del asegurado<\/span>/
  )
  assert.match(body, /&lt;Client &amp; Co\. &quot;quoted&quot;&gt;/)
  assert.doesNotMatch(body, /<Client & Co\. "quoted">/)
  assert.match(
    body,
    /<span class="datum-label">Celular<\/span><span class="datum-value">0981-927-418<\/span>/
  )
  assert.doesNotMatch(body, /\+595/)
  assert.match(body, /Ingreso mensual<\/span><span class="datum-value">Gs\. 5\.000\.000/)
  assert.match(body, /R\.U\.C\.<\/span><span class="datum-value">80000-1</)
  assert.match(body, /Correo electrónico<\/span><span class="datum-value">client@example\.com</)
  assert.match(body, /Lugar de trabajo<\/span><span class="datum-value">No disponible</)
})

test('v4 page 1 state-provider / PEP band uses checkboxes and the fine print line', () => {
  const base = fixture().draft
  const body = pageBody(
    build({
      draft: {
        ...base,
        pla_ft: { proveedor_estado: false, es_pep: true, pep_institucion: 'Inst <X>' },
      },
    }),
    'cover'
  )

  assert.match(body, /Proveedor del Estado:/)
  assert.match(body, /Cargo público nacional o extranjero:/)
  assert.match(body, /Sí <i class="cb"><\/i> No <i class="cb on"><\/i>/)
  assert.match(body, /Sí <i class="cb on"><\/i> No <i class="cb"><\/i>/)
  assert.match(body, /Institución: Inst &lt;X&gt;/)
  assert.match(body, /Cargo: No disponible/)
  assert.match(body, /Si el asegurado es distinto al tomador, completar el anexo 1\./)
})

function locationGrid(overrides) {
  const base = fixture()
  const body = pageBody(
    build({
      draft: {
        ...base.draft,
        partes: { ...base.draft.partes, ...overrides.partes },
      },
    }),
    'cover'
  )
  return body.match(/<div class="location-grid" data-block>[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? ''
}

test('v4 locations render the asegurado comercial address only when it is filled', () => {
  const asegurado = fixture().draft.partes.asegurado
  const withCommercial = locationGrid({
    partes: { asegurado: { ...asegurado, direccion_comercial: 'Av. <Comercial> 99' } },
  })
  assert.match(withCommercial, /Dirección particular[\s\S]*Address/)
  assert.match(withCommercial, /Dirección comercial[\s\S]*Av\. &lt;Comercial&gt; 99/)
  assert.ok(
    withCommercial.indexOf('Dirección particular') < withCommercial.indexOf('Dirección comercial')
  )
  assert.doesNotMatch(withCommercial, /Dirección del tomador/)

  for (const blank of [undefined, '', '   ']) {
    const grid = locationGrid({
      partes: { asegurado: { ...asegurado, direccion_comercial: blank } },
    })
    assert.match(grid, /Dirección particular/)
    assert.doesNotMatch(grid, /Dirección comercial/)
  }
})

test('v4 locations add a tomador box only when the tomador is a different person', () => {
  const asegurado = fixture().draft.partes.asegurado
  const grid = locationGrid({
    partes: {
      tomador_igual_asegurado: false,
      asegurado: { ...asegurado, direccion_comercial: 'Commercial St' },
      tomador: { direccion: 'Tomador St', ciudad: 'Luque', telefono: '2' },
    },
  })
  assert.match(grid, /Dirección particular[\s\S]*Address/)
  assert.match(grid, /Dirección comercial[\s\S]*Commercial St/)
  assert.match(grid, /Dirección del tomador[\s\S]*Tomador St[\s\S]*Luque · Tel\./)
  assert.equal((grid.match(/class="location"/g) ?? []).length, 3)
})

test('v4 page 1 locations, risk description and total band', () => {
  const base = fixture()
  const body = pageBody(
    build({
      carta: {
        ...base.carta,
        riesgo_datos: { direccion: 'Risk <St>', ciudad: 'Asunción' },
        coberturas: [
          { nombre_snapshot: 'A', monto: 100000000 },
          { nombre_snapshot: 'B', monto: 440500000 },
        ],
      },
      commercial: { ...base.commercial, variante: { prima: 2351250 } },
      draft: {
        ...base.draft,
        descripcion_detallada: 'First paragraph.\n\nSecond <b>paragraph</b>.',
      },
    }),
    'cover'
  )

  assert.match(
    body,
    /<span class="section-num">02<\/span><span class="section-name">Ubicaciones declaradas<\/span>/
  )
  assert.match(body, /Dirección particular/)
  assert.doesNotMatch(body, /Dirección comercial/)
  assert.doesNotMatch(body, /Dirección del tomador/)
  assert.match(body, /City · Tel\./)
  assert.match(
    body,
    /<span class="section-num">03<\/span><span class="section-name">Descripción del riesgo<\/span>/
  )
  assert.match(body, /<p class="body-text" data-block>First paragraph\.<\/p>/)
  assert.match(body, /<p class="body-text" data-block>Second &lt;b&gt;paragraph&lt;\/b&gt;\.<\/p>/)
  assert.match(body, /<strong>Ubicación del riesgo:<\/strong> Risk &lt;St&gt;, Asunción/)
  assert.match(body, /Suma asegurada total/i)
  assert.match(body, /<span class="band-value">Gs\. 540\.500\.000<\/span>/)
  assert.match(body, /<span class="band-value">Gs\. 2\.351\.250<\/span>/)
})

test('v4 location grid separates its rows so a third box does not touch the first', () => {
  assert.match(build(), /\.location-grid\s*\{[^}]*row-gap:\s*[\d.]+mm/)
})

test('v4 total band uses the light wash gray of the document palette, not a dark slate', () => {
  const html = build()

  assert.match(html, /\.total-band\s*\{[^}]*background:\s*var\(--v4-wash\)/)
  assert.doesNotMatch(html, /\.total-band\s*\{[^}]*background:\s*var\(--v4-slate\)/)
  assert.match(html, /\.band-value\s*\{[^}]*color:\s*var\(--v4-ink\)/)
  assert.match(html, /\.band-label\s*\{[^}]*color:\s*var\(--v4-ink\)/)
})

test('v4 page 1 shows "No disponible" for missing coverages and prima instead of throwing', () => {
  const base = fixture()
  const html = build({
    carta: { ...base.carta, coberturas: [] },
    commercial: { variante: {}, plan_pago: {} },
  })

  assert.match(pageBody(html, 'cover'), /<span class="band-value">No disponible<\/span>/)
})

test('v4 page 1 body children are all atomic data-block elements', () => {
  assertAllBlocks(build(), 'cover')
  assertAllBlocks(build({ draft: { ...fixture().draft, numero_poliza: 'P-1' } }), 'cover')
})

// ---------------------------------------------------------------- T4: page 2

const COBERTURAS_REAL = `Coberturas Principales:
Incendio, Rayo y Explosión;

Incendio y daños materiales por Huracán, Vendaval, Ciclón o Tornados;
Incendio y daños materiales por Tumulto y/o Alboroto Popular y/o Huelga que revista tales caracteres, siempre que no sean por motivos políticos;
Daños materiales por Caída de Aeronaves y/o de sus partes componentes;

Robo y/o Asalto del Contenido.-
Responsabilidad Civil.-

Distribución del Capital Asegurado:
Incendio
Mercadería | Muebles, Equipos y Enseres
50% | 50%

Sublímite para Circuito Cerrado de televisión (Cámaras de Seguridad): Gs. 5.000.000.-
Sublímite para Daños por agua: Gs. 2.000.000.-

Robo
Mercadería | Equipos | Mueble
60% | 10% | 30%`

function withCoberturas(contenido, extra = {}) {
  const base = fixture()
  return build({
    texts: { ...base.texts, coberturas_principales: { contenido } },
    ...extra,
  })
}

test('v4 page 2 intro uses the mockup copy and no mockup artifacts', () => {
  const body = pageBody(build(), 'coverage')

  assert.match(body, /Cobertura \/ Artículo 1/)
  assert.match(body, /Protección del<span>riesgo declarado\.<\/span>/)
  assert.match(
    body,
    /Detalle de sumas aseguradas para la modalidad 1020 — Riesgos varios \/ Multirriesgo comercio\./
  )
})

test('v4 page 2 sums table lists numbered coverages, amounts and the total row', () => {
  const base = fixture()
  const body = pageBody(
    build({
      carta: {
        ...base.carta,
        coberturas: [
          { nombre_snapshot: 'Incendio <edificio>', monto: 100000000 },
          { nombre_snapshot: 'Robo contenido', monto: 440500000 },
        ],
      },
    }),
    'coverage'
  )

  assert.match(
    body,
    /<span class="section-num">04<\/span><span class="section-name">Detalle de sumas aseguradas<\/span>/
  )
  assert.match(
    body,
    /<span class="sum-col-name">Cobertura<\/span><span class="sum-col-amount">Suma asegurada \(Gs\.\)<\/span>/
  )
  assert.match(
    body,
    /<div class="sum-row" data-block><span class="sum-index">01<\/span><span class="sum-name">Incendio &lt;edificio&gt;<\/span><span class="sum-amount">100\.000\.000<\/span><\/div>/
  )
  assert.match(
    body,
    /<span class="sum-index">02<\/span><span class="sum-name">Robo contenido<\/span><span class="sum-amount">440\.500\.000<\/span>/
  )
  assert.match(
    body,
    /<div class="sum-row sum-row--total" data-block><span class="sum-name">Total suma asegurada<\/span><span class="sum-amount">540\.500\.000<\/span><\/div>/
  )
  assert.doesNotMatch(body, /Incendio <edificio>/)
})

test('v4 page 2 sums table degrades to "No disponible" without coverages', () => {
  const base = fixture()
  const body = pageBody(build({ carta: { ...base.carta, coberturas: [] } }), 'coverage')

  assert.match(
    body,
    /<div class="sum-row sum-row--total" data-block><span class="sum-name">Total suma asegurada<\/span><span class="sum-amount">No disponible<\/span>/
  )
})

test('v4 page 2 parses coberturas principales into bullets without dropping any line', () => {
  const body = pageBody(withCoberturas(COBERTURAS_REAL), 'coverage')

  assert.match(
    body,
    /<span class="section-num">05<\/span><span class="section-name">Coberturas principales<\/span>/
  )
  const list = body.match(/<ul class="bullet-list" data-block>[\s\S]*?<\/ul>/)?.[0] ?? ''
  assert.equal((list.match(/<li>/g) ?? []).length, 6)
  for (const line of [
    'Incendio, Rayo y Explosión;',
    'Incendio y daños materiales por Tumulto y/o Alboroto Popular y/o Huelga que revista tales caracteres, siempre que no sean por motivos políticos;',
    'Responsabilidad Civil.-',
  ]) {
    assert.ok(list.includes(line), `bullet kept in full: ${line}`)
  }
  assert.doesNotMatch(list, /Coberturas Principales:/)
})

test('v4 page 2 renders the capital distribution as proportional bars from the official text', () => {
  const body = pageBody(withCoberturas(COBERTURAS_REAL), 'coverage')

  assert.match(
    body,
    /<span class="section-num">06<\/span><span class="section-name">Distribución del capital asegurado<\/span>/
  )
  const dists = body.match(/<div class="dist" data-block>[\s\S]*?<\/div><\/div>/g) ?? []
  assert.equal(dists.length, 2)
  assert.match(dists[0], /<span class="dist-title">Incendio<\/span>/)
  assert.match(dists[0], /style="grid-template-columns:50fr 50fr"/)
  assert.match(dists[0], /<span class="dist-label">Mercadería <b>50%<\/b><\/span>/)
  assert.match(dists[0], /<span class="dist-label">Muebles, Equipos y Enseres <b>50%<\/b><\/span>/)
  assert.match(dists[0], /<i class="seg seg--red"><\/i><i class="seg seg--light"><\/i>/)
  assert.match(dists[1], /<span class="dist-title">Robo<\/span>/)
  assert.match(dists[1], /style="grid-template-columns:60fr 10fr 30fr"/)
  assert.match(
    dists[1],
    /<i class="seg seg--red"><\/i><i class="seg seg--dark"><\/i><i class="seg seg--light"><\/i>/
  )
})

test('v4 page 2 renders sublimits with the value emphasized', () => {
  const body = pageBody(withCoberturas(COBERTURAS_REAL), 'coverage')

  assert.match(body, /<div class="sublimits" data-block>/)
  assert.match(body, /<span class="sublimits-label">Sublímites<\/span>/)
  assert.match(
    body,
    /<p>Circuito Cerrado de televisión \(Cámaras de Seguridad\): <b>Gs\. 5\.000\.000<\/b><\/p>/
  )
  assert.match(body, /<p>Daños por agua: <b>Gs\. 2\.000\.000<\/b><\/p>/)
})

test('v4 page 2 falls back to plain text when the distribution cannot be parsed', () => {
  const broken = `Coberturas Principales:
Incendio, Rayo y Explosión;

Distribución del Capital Asegurado:
Incendio
Mercadería | Equipos
50% | 25% | 25%
Texto libre que debe conservarse <íntegro>.`
  const body = pageBody(withCoberturas(broken), 'coverage')

  assert.doesNotMatch(body, /class="dist"/)
  assert.match(body, /Mercadería \| Equipos/)
  assert.match(body, /50% \| 25% \| 25%/)
  assert.match(body, /Texto libre que debe conservarse &lt;íntegro&gt;\./)
})

test('v4 page 2 handles free-form or missing coberturas text without throwing', () => {
  const plain = pageBody(withCoberturas('Coberturas Principales:\n\nCoverage marker.'), 'coverage')
  assert.match(plain, /Coverage marker\./)
  assert.doesNotMatch(plain, /class="dist"/)

  const missing = pageBody(withCoberturas(null), 'coverage')
  assert.match(missing, /<p class="body-text" data-block>No disponible<\/p>/)
})

test('v4 page 2 body children are all atomic data-block elements', () => {
  assertAllBlocks(build(), 'coverage')
  assertAllBlocks(withCoberturas(COBERTURAS_REAL), 'coverage')
  assertAllBlocks(withCoberturas('Coberturas Principales:\n\nCoverage marker.'), 'coverage')
})

// ---------------------------------------------------------------- T5: pages 3-4

const DECLARACIONES_REAL = `DECLARACIONES:

Declaro que el propósito del presente acuerdo es expresa y específicamente para asegurar el(los) bien(es) detallado(s) en esta propuesta de seguros.

Declaro bajo fe de juramento que todos los datos e informaciones son ciertos <y> exactos.`

const FONDOS_REAL = `Declaración Jurada de Origen de Fondos

Declaro bajo fe de juramento que el dinero utilizado para el pago de la prima proviene de fuente lícita.

* Que SI ( ) NO ( ) poseo procesos o condenas por la comisión de los hechos punibles de lavado de activos. -

* Que SI ( ) NO ( ) me encuentro afectado/a como PEPs. En caso afirmativo indicar detalladamente el motivo: ______. -

La firma que aparece estampada al pie de este documento fue realizada en presencia del funcionario. -

Electrónica c/Firma Digital Impresa c/Firma Facsimilar Impresa c/Firma Manuscrita`

const AUTORIZACIONES_REAL = `1. Autorizaciones del Tomador y/o Representante Legal - En caso de opción Póliza Digital.

1.1 Mecanismos de Entrega (puede seleccionar más de una opción)

Correo Electrónico Vía Teléfono Móvil Usuario Web

1.2 Autorizo a Aseguradora Tajy Prop. Coop. S.A., a enviar por los medios electrónicos indicados.

1.2.1 Comunicaciones y documentos relativos a la presente solicitud de seguro.`

const CONDICIONES_REAL = `Sub-límites de coberturas para daños o pérdidas como consecuencia de un riesgo cubierto, a primer riesgo absoluto para:

Daños a murallas, cercos perimetrales y rejas: hasta la suma máxima de Gs. 1.000.000.- para cada vigencia.

Franquicias:
Comercios ubicados en los departamentos de Itapúa y Alto Paraná posee 10% sobre todo y cada siniestro.

Robo del contenido, valores en tránsito de 10% sobre todo y cada siniestro, mínimo de Gs. 500.000.-

Exclusiones:
Los riesgos que posean proceso de modificación de materia prima y que manejen materiales altamente combustible. Ejemplo: Panaderías, talleres mecánicos, supermercados, imprentas, carpinterías, mueblerías, gomerías entre otros.
Se excluye además los carteles.
Joyas, metales preciosos, títulos y papeles, obras de arte, entre otros.`

function withTexts(texts) {
  return build({ texts: { ...fixture().texts, ...texts } })
}

test('v4 page 3 intro and numbered declaration sections', () => {
  const body = pageBody(build(), 'declarations')

  assert.match(body, /Declaraciones del tomador/)
  assert.match(body, /Condiciones de<span>aceptación\.<\/span>/)
  assert.match(
    body,
    /<span class="section-num">07<\/span><span class="section-name">Declaraciones<\/span>/
  )
  assert.match(
    body,
    /<span class="section-num">08<\/span><span class="section-name">Declaración jurada de origen de fondos<\/span>/
  )
  assert.match(body, /Declaration marker\./)
  assert.match(body, /Funds marker\./)
  assert.doesNotMatch(body, /<h3/)
})

test('v4 page 3 splits each declaration paragraph into its own escaped data-block', () => {
  const body = pageBody(
    withTexts({
      declaraciones_generales: { contenido: DECLARACIONES_REAL },
      declaracion_jurada_origen_fondos: { contenido: FONDOS_REAL },
    }),
    'declarations'
  )

  assert.doesNotMatch(body, />DECLARACIONES:?</)
  assert.match(
    body,
    /<p class="declaration-paragraph declaration-paragraph--lead legal-text" data-block>Declaro que el propósito/
  )
  assert.match(body, /son ciertos &lt;y&gt; exactos\./)
  assert.doesNotMatch(body, /<y>/)
  // The embedded source heading is replaced by the numbered section title.
  assert.equal((body.match(/Declaración Jurada de Origen de Fondos/gi) ?? []).length, 1)
  assert.match(body, /proviene de fuente lícita\./)
})

test('v4 page 3 renders SI/NO declarations as accent blocks without the source asterisk', () => {
  const body = pageBody(
    withTexts({ declaracion_jurada_origen_fondos: { contenido: FONDOS_REAL } }),
    'declarations'
  )

  assert.match(
    body,
    /<p class="declaration-paragraph declaration-paragraph--choice legal-text" data-block>Que SI \( \) NO \( \) poseo procesos/
  )
  assert.doesNotMatch(body, /data-block>\*/)
  assert.match(body, /<span class="motive-writing-line" aria-hidden="true"><\/span>/)
})

test('v4 page 3 renders the signature mode row with only the digital and handwritten options', () => {
  const body = pageBody(
    withTexts({ declaracion_jurada_origen_fondos: { contenido: FONDOS_REAL } }),
    'declarations'
  )

  const row =
    body.match(/<div class="choice-row choice-row--signatures" data-block>[\s\S]*?<\/div>/)?.[0] ??
    ''
  assert.match(row, /<b class="choice-row-label">Modalidad de firma<\/b>/)
  assert.match(row, /<span>Electrónica c\/Firma Digital<\/span>/)
  assert.doesNotMatch(row, /Facsimilar/i)
  assert.match(row, /<span>Impresa c\/Firma Manuscrita<\/span>/)
  assert.equal((row.match(/<span>/g) ?? []).length, 2)
})

test('v4 titles pair the ink first line with a red second line', () => {
  assert.match(PROPUESTA_FORMAL_V4_STYLE, /\.cover-title span \{[^}]*color: var\(--v4-red\)/)
  assert.match(PROPUESTA_FORMAL_V4_STYLE, /\.topic-title span \{[^}]*color: var\(--v4-red\)/)
  assert.doesNotMatch(PROPUESTA_FORMAL_V4_STYLE, /\.topic-title span \{[^}]*#8b929a/)
})

test('v4 checked checkbox draws a crisp vector X instead of rasterized gradients', () => {
  const rule = PROPUESTA_FORMAL_V4_STYLE.match(/\.cb\.on::after \{[^}]*\}/)?.[0] ?? ''
  assert.match(rule, /data:image\/svg\+xml/)
  assert.doesNotMatch(rule, /linear-gradient/)
})

test('v4 page 4 digital policy authorizations keep numbering emphasis and delivery options', () => {
  const body = pageBody(
    withTexts({ autorizaciones_tomador_poliza_digital: { contenido: AUTORIZACIONES_REAL } }),
    'conditions'
  )

  assert.match(body, /Condiciones y autorizaciones/)
  assert.match(body, /Disposiciones<span>complementarias\.<\/span>/)
  assert.match(
    body,
    /<span class="section-num">09<\/span><span class="section-name">Póliza digital: autorizaciones del tomador<\/span>/
  )
  assert.match(
    body,
    /declaration-paragraph--numbered-1 legal-text" data-block>1\. Autorizaciones del Tomador/
  )
  assert.match(
    body,
    /declaration-paragraph--numbered-1-1 legal-text" data-block>1\.1 Mecanismos de Entrega/
  )
  const row =
    body.match(/<div class="choice-row choice-row--delivery" data-block>[\s\S]*?<\/div>/)?.[0] ?? ''
  assert.match(row, /<span>Correo Electrónico<\/span>/)
  assert.match(row, /<span>Vía Teléfono Móvil<\/span>/)
  assert.match(row, /<span>Usuario Web<\/span>/)
  assert.match(body, /1\.2\.1 Comunicaciones y documentos/)
})

test('v4 page 4 splits condiciones particulares into sub-limits, franchises and exclusion bullets', () => {
  const body = pageBody(
    withTexts({ condiciones_mrc: { contenido: CONDICIONES_REAL } }),
    'conditions'
  )

  assert.match(
    body,
    /<span class="section-num">10<\/span><span class="section-name">Condiciones particulares<\/span>/
  )
  for (const heading of ['Sub-límites de coberturas', 'Franquicias', 'Exclusiones']) {
    assert.match(
      body,
      new RegExp(`<h3 class="sub-heading" data-block data-keep-with-next>${heading}</h3>`)
    )
  }
  assert.match(
    body,
    /<p class="legal-text" data-block>Sub-límites de coberturas para daños o pérdidas como consecuencia de un riesgo cubierto, a primer riesgo absoluto para:<\/p>/
  )
  assert.match(
    body,
    /<p class="legal-text" data-block>Comercios ubicados en los departamentos de Itapúa y Alto Paraná posee 10% sobre todo y cada siniestro\.<\/p>/
  )
  assert.equal((body.match(/<div class="bullet-item" data-block>/g) ?? []).length, 3)
  assert.ok(
    body.includes(
      'Los riesgos que posean proceso de modificación de materia prima y que manejen materiales altamente combustible. Ejemplo: Panaderías, talleres mecánicos, supermercados, imprentas, carpinterías, mueblerías, gomerías entre otros.'
    ),
    'long exclusion kept in full'
  )
})

test('v4 page 4 falls back to plain paragraphs when condiciones has no known structure', () => {
  const plain = pageBody(
    withTexts({ condiciones_mrc: { contenido: 'Conditions <marker>.' } }),
    'conditions'
  )
  assert.match(plain, /<p class="legal-text" data-block>Conditions &lt;marker&gt;\.<\/p>/)
  assert.doesNotMatch(plain, /class="sub-heading"/)

  const missing = pageBody(withTexts({ condiciones_mrc: null }), 'conditions')
  assert.match(missing, /<p class="legal-text" data-block>No disponible<\/p>/)
})

test('v4 pages 3-4 body children are all atomic data-block elements', () => {
  const rich = withTexts({
    declaraciones_generales: { contenido: DECLARACIONES_REAL },
    declaracion_jurada_origen_fondos: { contenido: FONDOS_REAL },
    autorizaciones_tomador_poliza_digital: { contenido: AUTORIZACIONES_REAL },
    condiciones_mrc: { contenido: CONDICIONES_REAL },
  })
  for (const html of [build(), rich]) {
    assertAllBlocks(html, 'declarations')
    assertAllBlocks(html, 'conditions')
  }
  assertAllBlocks(build({ texts: {} }), 'declarations')
  assertAllBlocks(build({ texts: {} }), 'conditions')
})

// ---------------------------------------------------------------- T6: page 5

function paymentFixture(planPago, extra = {}) {
  const base = fixture()
  return build({
    commercial: { variante: { prima: 2351250 }, plan_pago: planPago },
    ...extra,
    ...(extra.draft ? { draft: { ...base.draft, ...extra.draft } } : {}),
  })
}

const CUOTAS = {
  formas_pago: { codigo: 'credito', nombre_display: 'Crédito (Cobrador) <x>' },
  rpf_monto: 224000,
  iva_monto: 257525,
  premio_total: 2832000,
  monto_inicial: 236000,
  monto_cuota: 236000,
  cantidad_cuotas: 11,
}

test('v4 page 5 intro and economic detail with the amount-only total card', () => {
  const body = pageBody(paymentFixture(CUOTAS), 'payment')

  assert.match(body, /Condiciones económicas/)
  assert.match(body, /Costo y forma<span>de pago\.<\/span>/)
  assert.match(
    body,
    /<span class="section-num">11<\/span><span class="section-name">Detalle económico<\/span>/
  )
  assert.match(
    body,
    /<span class="econ-label">Prima<\/span><span class="econ-value">Gs\. 2\.351\.250<\/span>/
  )
  assert.match(
    body,
    /<span class="econ-label">R\.P\.F\.<\/span><span class="econ-value">Gs\. 224\.000<\/span>/
  )
  assert.match(
    body,
    /<span class="econ-label">Sub-Total<\/span><span class="econ-value">Gs\. 2\.575\.250<\/span>/
  )
  assert.match(
    body,
    /<span class="econ-label">I\.V\.A\.<\/span><span class="econ-value">Gs\. 257\.525<\/span>/
  )
  assert.match(
    body,
    /<div class="cost-card"><span class="cost-card-label">Costo total<\/span><span class="cost-card-value">Gs\. 2\.832\.000<\/span><\/div>/
  )
  assert.doesNotMatch(body, /NOTA|Importe conservado|Verificar la regla/)
})

test('v4 page 5 Sub-Total is "No disponible" when prima or R.P.F. is missing', () => {
  const body = pageBody(paymentFixture({ premio_total: 110000 }), 'payment')

  assert.match(
    body,
    /<span class="econ-label">Sub-Total<\/span><span class="econ-value">No disponible<\/span>/
  )
})

test('v4 page 5 payment method, installments and the debit authorization', () => {
  const body = pageBody(paymentFixture(CUOTAS), 'payment')

  assert.match(
    body,
    /<span class="section-num">12<\/span><span class="section-name">Forma de pago y autorización de débito<\/span>/
  )
  assert.match(
    body,
    /<span class="econ-label">Modalidad<\/span><span class="econ-value">Crédito \(Cobrador\) &lt;x&gt;<\/span>/
  )
  assert.match(
    body,
    /<span class="econ-label">Inicial<\/span><span class="econ-value">Gs\. 236\.000<\/span>/
  )
  assert.match(
    body,
    /<span class="econ-label">Cuotas<\/span><span class="econ-value">11 cuotas de Gs\. 236\.000<\/span>/
  )
  assert.match(
    body,
    /En mi carácter de titular de cuenta autorizo irrevocablemente a debitar de mi Tarjeta de Crédito indicada más abajo el importe correspondiente a las cuotas de la póliza emitida por ASEGURADORA TAJY a mi favor, según la opción indicada más arriba\./
  )
  assert.match(body, /<i class="cb"><\/i> Visa/)
  assert.match(body, /<i class="cb"><\/i> Mastercard/)
  assert.match(body, /<i class="cb"><\/i> Cuenta Corriente/)
  // The cardholder fills the card number in by hand on the printed sheet, so it stays blank.
  assert.match(body, /<span class="debit-label">Número<\/span><span class="debit-value"><\/span>/)
  const debitBlock =
    body.match(/<div class="debit-line">[\s\S]*?Vencimiento[\s\S]*?<\/div>/)?.[0] ?? ''
  assert.doesNotMatch(debitBlock, /No disponible/)
  assert.match(
    body,
    /<span class="debit-label">Vencimiento<\/span><span class="debit-value"><\/span>/
  )
})

test('v4 page 5 shows "Contado" when there are no installments', () => {
  const body = pageBody(
    paymentFixture({
      formas_pago: { nombre_display: 'Contado' },
      premio_total: 110000,
      monto_inicial: 110000,
    }),
    'payment'
  )

  assert.match(
    body,
    /<span class="econ-label">Cuotas<\/span><span class="econ-value">Contado<\/span>/
  )
})

test('v4 page 5 collection clause drops its own title and keeps every paragraph', () => {
  const clause = `CLÁUSULA ADICIONAL DE COBRANZAS

Queda expresamente convenido y el asegurado acepta <y> entiende que, una vez que haya acusado recibo.

Segundo párrafo íntegro.`
  const base = fixture()
  const body = pageBody(
    build({ texts: { ...base.texts, clausula_adicional_cobranzas: { contenido: clause } } }),
    'payment'
  )

  assert.match(
    body,
    /<span class="section-num">13<\/span><span class="section-name">Cláusula adicional de cobranzas<\/span>/
  )
  assert.doesNotMatch(
    body,
    /<p class="legal-text"[^>]*>(?:<strong[^>]*>)?CL[ÁA]USULA ADICIONAL DE COBRANZAS/i
  )
  assert.match(
    body,
    /<p class="legal-text" data-block>Queda expresamente convenido y el asegurado acepta &lt;y&gt; entiende/
  )
  assert.match(body, /<p class="legal-text" data-block>Segundo párrafo íntegro\.<\/p>/)
})

test('v4 page 5 observations show the escaped text over dashed writing lines', () => {
  const body = pageBody(
    paymentFixture(CUOTAS, { draft: { observaciones: 'Obs <b>marker</b>' } }),
    'payment'
  )

  assert.match(
    body,
    /<span class="section-num">14<\/span><span class="section-name">Observaciones<\/span>/
  )
  assert.match(body, /<p class="obs-text">Obs &lt;b&gt;marker&lt;\/b&gt;<\/p>/)
  assert.equal((body.match(/<i class="obs-line"><\/i>/g) ?? []).length, 3)

  const empty = pageBody(paymentFixture(CUOTAS, { draft: { observaciones: '' } }), 'payment')
  assert.doesNotMatch(empty, /obs-text/)
  assert.equal((empty.match(/<i class="obs-line"><\/i>/g) ?? []).length, 3)
})

test('v4 page 5 renders the three signatures with escaped details', () => {
  const base = fixture()
  const body = pageBody(
    build({
      proposal: {
        ...base.proposal,
        agente: { nombre: 'Agent <A>', email: 'agent@example.com' },
      },
      draft: {
        ...base.draft,
        partes: {
          ...base.draft.partes,
          titular_tarjeta: { nombre_razon_social: 'Holder & Sons', documento: '777' },
        },
      },
    }),
    'payment'
  )

  assert.match(
    body,
    /<span class="section-num">15<\/span><span class="section-name">Conformidad y firmas<\/span>/
  )
  const labels = [...body.matchAll(/<span class="signature-label">([^<]+)<\/span>/g)].map(
    (match) => match[1]
  )
  assert.deepEqual(labels, [
    'Firma del Agente',
    'Firma del Titular de la Tarjeta',
    'Firma del Titular del Seguro',
  ])
  assert.match(body, /Aclaración: Agent &lt;A&gt;/)
  assert.match(body, /agent@example\.com/)
  assert.match(body, /Fecha: 01\/09\/2026/)
  assert.match(body, /Aclaración: Holder &amp; Sons/)
  assert.match(body, /Nro\. de C\.I\.: 777/)
  assert.match(body, /Aclaración: &lt;Client &amp; Co\. &quot;quoted&quot;&gt;/)
  assert.match(body, /Nro\. de C\.I\.: 1</)
})

test('v4 page 5 signatures fall back to "No disponible" without cardholder data', () => {
  const body = pageBody(build(), 'payment')

  assert.match(body, /Aclaración: No disponible/)
  assert.match(body, /Nro\. de C\.I\.: No disponible/)
})

test('v4 page 5 closes with the ecological row and the insured e-mail', () => {
  const body = pageBody(build(), 'payment')

  assert.match(body, /<div class="eco-row" data-block>/)
  assert.match(body, /En apoyo a la ecología deseo recibir mi póliza en formato digital:/)
  assert.match(body, /SI <i class="cb"><\/i> NO <i class="cb"><\/i>/)
  assert.match(body, /E-mail: <span class="eco-email">client@example\.com<\/span>/)
})

test('v4 page 5 body children are all atomic data-block elements', () => {
  assertAllBlocks(build(), 'payment')
  assertAllBlocks(paymentFixture(CUOTAS), 'payment')
  assertAllBlocks(build({ texts: {} }), 'payment')
})

// ---------------------------------------------------------------- T7: pagination contract

test('v4 starts in the pending pagination state and re-exports the pure planner', () => {
  const html = build()

  assert.match(html, /<html lang="es" data-proposal-design="v4" data-proposal-pagination="pending"/)
  assert.equal(typeof planPagination, 'function')
})

test('v4 embeds a single pagination script after the last page, serialized from the pure planner', () => {
  const html = build()
  const script = /<script>([\s\S]*?)<\/script\s*>/i.exec(html)?.[1]

  assert.ok(script, 'inline script present')
  assert.ok(html.indexOf('<script>') > html.lastIndexOf('</article>'))
  assert.ok(script.includes(planPagination.toString()))
  assert.doesNotThrow(() => new Function(script))
  assert.match(script, /__proposalPaginationMetrics/)
  assert.match(script, /document\.fonts/)
  assert.doesNotMatch(script, /data-fit-|V3_LAYOUTS/)
})

test('v4 pagination script carries the continuation header of every topic as inert JSON', () => {
  const html = build()
  const script = /<script>([\s\S]*?)<\/script\s*>/i.exec(html)[1]
  const headers = JSON.parse(/var HEADERS = (\{.*?\});$/ms.exec(script)[1])

  assert.deepEqual(Object.keys(headers), [
    'cover',
    'coverage',
    'declarations',
    'conditions',
    'payment',
  ])
  for (const topic of Object.keys(headers)) {
    assert.equal(headers[topic], renderContinuationHeader({ topic, number: 17, logo: LOGO }))
  }
  assert.doesNotMatch(script, /<header/)
})

test('v4 continuation headers carry the continuation marker next to the topic label', () => {
  const header = renderContinuationHeader({ topic: 'payment', number: 17, logo: LOGO })
  const regular = build()

  assert.match(header, /Resumen económico · Aceptación · continuación/)
  assert.doesNotMatch(regular.slice(0, regular.indexOf('<script>')), /continuación/)
})

test('v4 continuation pages have no big title: the header helper never renders one', () => {
  const header = renderContinuationHeader({ topic: 'conditions', number: 17, logo: LOGO })

  assert.doesNotMatch(header, /topic-title|cover-title|<h1/)
})

test('v4 page footers keep numbered placeholders for the paginator', () => {
  const html = build()

  assert.equal((html.match(/<span data-page-number>/g) ?? []).length, 5)
  assert.equal((html.match(/<span data-page-total>/g) ?? []).length, 5)
})

test('v4 styles give continuation pages breathing room under the compact header', () => {
  assert.match(
    PROPUESTA_FORMAL_V4_STYLE,
    /\.proposal-page\[data-continuation\] \.page-body\s*\{[^}]*padding-top:\s*6mm/
  )
})
