import { escapeHtml, fmtFecha, fmtGs } from '../oferta/layout.js'

const UNAVAILABLE = 'No disponible'

const TEXT_SECTION_TITLES = {
  coberturas_principales: 'Coberturas Principales:',
  declaraciones_generales: 'DECLARACIONES:',
  declaracion_jurada_origen_fondos: 'Declaración Jurada de Origen de Fondos',
  autorizaciones_tomador_poliza_digital: 'Autorizaciones del Tomador y/o Representante Legal',
  clausula_adicional_cobranzas: 'CLÁUSULA ADICIONAL DE COBRANZAS',
}
const COLLECTION_CLAUSE_TITLE_PATTERN = /CL[ÁA]USULA[\s._-]*ADICIONAL[\s._-]*DE[\s._-]*COBRANZAS/giu
const EMBEDDED_LEGAL_HEADINGS = new Set([
  TEXT_SECTION_TITLES.declaracion_jurada_origen_fondos,
  TEXT_SECTION_TITLES.autorizaciones_tomador_poliza_digital,
])
const DECLARATION_TITLE_PATTERN = /^DECLARACIONES:?$/iu
const COVERAGE_TITLE_PATTERN = /^Coberturas Principales:?$/iu
const DISTRIBUTION_TITLE_PATTERN = /^Distribuci[oó]n del Capital Asegurado:?$/iu
const FRANCHISE_TITLE_PATTERN = /^Franquicias:?$/iu
const EXCLUSION_TITLE_PATTERN = /^Exclusiones:?$/iu
const SIGNATURE_MODE_LABELS = [
  'Electrónica c/Firma Digital',
  'Impresa c/Firma Facsimilar',
  'Impresa c/Firma Manuscrita',
]
const DELIVERY_MODE_LABELS = ['Correo Electrónico', 'Vía Teléfono Móvil', 'Usuario Web']
const LEGACY_DELIVERY_MODE_LABEL_PATTERN = /Vía Teléfono Móvi(?=\s*\()/gu

function text(value, fallback = UNAVAILABLE) {
  if (value === true) return 'Sí'
  if (value === false) return 'No'
  return value == null || value === '' ? fallback : escapeHtml(value)
}

function money(value) {
  return isFiniteValue(value) ? `Gs. ${fmtGs(value)}` : UNAVAILABLE
}

function isFiniteValue(value) {
  return value != null && value !== '' && Number.isFinite(Number(value))
}

function sumMoney(...values) {
  return values.every(isFiniteValue)
    ? money(values.reduce((total, value) => total + Number(value), 0))
    : UNAVAILABLE
}

function booleanChoice(value) {
  return `Sí <span class="check-box ${value === true ? 'checked' : ''}">${value === true ? 'X' : ''}</span> No <span class="check-box ${value === false ? 'checked' : ''}">${value === false ? 'X' : ''}</span>`
}

function brandMark(logoSrc) {
  return logoSrc
    ? `<img class="tajy-logo" src="${escapeHtml(logoSrc)}" alt="Aseguradora Tajy" />`
    : '<div class="tajy-logo-fallback"><small>ASEGURADORA</small><strong>Tajy</strong><span>Viví seguro, viví mejor.</span></div>'
}

function headerCell(label, value) {
  return `<div class="header-cell"><b>${escapeHtml(label)}:</b><span>${value}</span></div>`
}

function header(snapshot, pageNumber, logoSrc) {
  const { proposal, carta } = snapshot
  return `
    <header class="proposal-header">
      <div class="brand">${brandMark(logoSrc)}</div>
      <div class="proposal-title"><strong>ASEGURADORA TAJY PROP.COOP. S.A.</strong><span>PROPUESTA PARA SEGURO</span></div>
      <div class="header-page">Página ${pageNumber}</div>
    </header>
    <div class="header-rule"></div>
    <div class="header-meta">
      <div class="header-meta-row header-meta-row--primary">
        ${headerCell('Propuesta', text(proposal.numero_propuesta))}
        ${headerCell('Fecha de Emisión', text(fmtFecha(proposal.emitida_at, carta.render_context)))}
        ${headerCell('Vigencia', UNAVAILABLE)}
        ${headerCell('Hasta', UNAVAILABLE)}
        ${headerCell('Hora Inicio', UNAVAILABLE)}
        ${headerCell('Hora Fin', UNAVAILABLE)}
      </div>
      <div class="header-meta-row header-meta-row--secondary">
        ${headerCell('Propuesta de Renovación a la Póliza', UNAVAILABLE)}
        ${headerCell('Póliza Nro.', UNAVAILABLE)}
      </div>
    </div>
    <div class="header-dash"></div>
  `
}

function field(label, value, className = '') {
  return fieldMarkup(label, text(value), className)
}

function fieldMarkup(label, content, className = '') {
  return `<div class="insured-field ${className}"><b>${escapeHtml(label)}:</b> <span>${content}</span></div>`
}

function insuredPanel(insured, proposer, draft) {
  return `
    <section class="insured-panel">
      <h1>DATOS DEL ASEGURADO</h1>
      <div class="insured-grid">
        ${field('Nombre', insured.nombre_razon_social, 'span-7')}
        ${field('Sexo', insured.sexo, 'span-2')}
        ${field('Fec. Nac.', insured.fecha_nacimiento, 'span-2')}
        ${field('C.I. / Documento', insured.documento, 'span-3')}
        ${field('R.U.C.', insured.ruc, 'span-2')}
        ${field('Nacionalidad', insured.nacionalidad, 'span-4')}
        ${field('Estado civil', insured.estado_civil, 'span-3')}
        ${field('E-mail', insured.email, 'span-5')}
        ${field('Ocupación', insured.ocupacion, 'span-4')}
         ${field('Monto ingreso mensual', money(insured.ingreso_mensual), 'span-4')}
         ${fieldMarkup('Proveedor del Estado', booleanChoice(draft.pla_ft?.proveedor_estado), 'span-4')}
         ${field('Lugar de trabajo', insured.lugar_trabajo, 'span-6')}
         ${field('Celular', insured.telefono, 'span-2')}
         <div class="insured-annex span-16">(En caso que el asegurado sea distinto al tomador, completar el anexo 1)</div>
         ${field('Dir. Comercial', proposer.direccion, 'span-10')}
        ${field('Ciudad', proposer.ciudad, 'span-3')}
        ${field('Tel.', proposer.telefono ?? insured.telefono, 'span-3')}
        ${field('Dir. Particular', insured.direccion, 'span-10')}
        ${field('Ciudad', insured.ciudad, 'span-3')}
        ${field('Tel.', insured.telefono, 'span-3')}
        ${fieldMarkup('Ha desempeñado cargo público nacional o extranjero', booleanChoice(draft.pla_ft?.es_pep), 'span-8')}
        ${field('Institución', draft.pla_ft?.pep_institucion, 'span-4')}
        ${field('Cargo', draft.pla_ft?.pep_cargo, 'span-2')}
        ${field('Período', draft.pla_ft?.pep_periodo, 'span-2')}
      </div>
    </section>`
}

function coverageSummary(coverages) {
  if (!coverages.length) return UNAVAILABLE
  return coverages
    .map(
      (coverage) =>
        `- ${text(coverage.nombre_snapshot)}, hasta la suma de ${money(coverage.monto)}. Franquicia: ${coverage.franquicia == null ? 'Sin deducible' : money(coverage.franquicia)}.`
    )
    .join('<br />')
}

function legalFlow(value) {
  if (value == null || value === '') return `<p class="legal-paragraph">${UNAVAILABLE}</p>`

  return String(value)
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n\s*\n+/)
    .map((paragraph) => {
      const lines = paragraph
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      if (!lines.length) return ''

      const firstLineIsHeading =
        EMBEDDED_LEGAL_HEADINGS.has(lines[0]) || (lines[0].length <= 100 && lines[0].endsWith(':'))
      if (firstLineIsHeading) {
        const body = lines.slice(1).join(' ')
        return `<p class="legal-paragraph"><strong class="legal-subheading">${escapeHtml(lines[0])}</strong>${body ? `<span>${escapeHtml(body)}</span>` : ''}</p>`
      }

      return `<p class="legal-paragraph">${escapeHtml(lines.join(' '))}</p>`
    })
    .join('')
}

function sourceBlocks(value) {
  if (value == null || value === '') return []
  return String(value)
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n\s*\n+/)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    )
    .filter((block) => block.length > 0)
}

function escapedFormText(value) {
  return String(value)
    .split(/(_{6,})/g)
    .map((part) =>
      /^_{6,}$/.test(part)
        ? `<span class="motive-writing-line" aria-hidden="true"></span>`
        : escapeHtml(part)
    )
    .join('')
}

function extractChoiceGroups(value, labels, className) {
  const source = String(value)
  const starts = labels
    .map((label) => ({ label, index: source.indexOf(label) }))
    .filter(({ index }) => index >= 0)
    .sort((left, right) => left.index - right.index)
  if (starts.length !== labels.length) return null

  return `<div class="${className}">${starts
    .map(({ index }, position) => {
      const end = starts[position + 1]?.index ?? source.length
      return `<span>${escapedFormText(source.slice(index, end).trim())}</span>`
    })
    .join('')}</div>`
}

function normalizeDeliveryModeLabels(value) {
  const source = String(value)
  const firstLabelIndex = source.indexOf(DELIVERY_MODE_LABELS[0])
  const lastLabelIndex = source.indexOf(DELIVERY_MODE_LABELS[2], firstLabelIndex)
  if (firstLabelIndex < 0 || lastLabelIndex < 0) return source

  return `${source.slice(0, firstLabelIndex)}${source
    .slice(firstLabelIndex, lastLabelIndex)
    .replace(
      LEGACY_DELIVERY_MODE_LABEL_PATTERN,
      DELIVERY_MODE_LABELS[1]
    )}${source.slice(lastLabelIndex)}`
}

function declarationFlow(value, { lead = false } = {}) {
  const blocks = sourceBlocks(value)
  if (!blocks.length) return `<p class="legal-paragraph">${UNAVAILABLE}</p>`
  let paragraphIndex = 0

  return blocks
    .map((sourceBlock) => {
      const lines = [...sourceBlock]
      if (DECLARATION_TITLE_PATTERN.test(lines[0])) lines.shift()
      if (!lines.length) return ''

      const joined = lines.join(' ')
      const signatureModes = extractChoiceGroups(
        joined,
        SIGNATURE_MODE_LABELS,
        'declaration-choice-group declaration-choice-group--signatures'
      )
      if (signatureModes) return signatureModes

      const deliveryModes = extractChoiceGroups(
        normalizeDeliveryModeLabels(joined),
        DELIVERY_MODE_LABELS,
        'declaration-choice-group declaration-choice-group--delivery'
      )
      if (deliveryModes) return deliveryModes

      if (EMBEDDED_LEGAL_HEADINGS.has(lines[0])) {
        const body = lines.slice(1).join(' ')
        return `<div class="declaration-subsection"><h3>${escapeHtml(lines[0])}</h3>${body ? `<p>${escapedFormText(body)}</p>` : ''}</div>`
      }

      const numbered = /^(1(?:\.\d+){0,2})\b/u.exec(joined)?.[1]
      const classNames = ['declaration-paragraph']
      if (lead && paragraphIndex === 0) classNames.push('declaration-paragraph--lead')
      if (/^\*/u.test(joined) && /\bSI\s*\([^)]*\)\s*NO\s*\([^)]*\)/u.test(joined)) {
        classNames.push('declaration-paragraph--choice')
      }
      if (numbered)
        classNames.push(`declaration-paragraph--numbered-${numbered.replaceAll('.', '-')}`)
      paragraphIndex += 1
      return `<p class="${classNames.join(' ')}">${escapedFormText(joined)}</p>`
    })
    .join('')
}

function structuredDeclarations(texts) {
  return `
    <section class="contract-section contract-section--declarations">
      <h2>${TEXT_SECTION_TITLES.declaraciones_generales}</h2>
      <div class="declaration-flow declaration-flow--general">${declarationFlow(texts.declaraciones_generales?.contenido, { lead: true })}</div>
      <div class="declaration-flow declaration-flow--funds">${declarationFlow(texts.declaracion_jurada_origen_fondos?.contenido)}</div>
      <div class="declaration-flow declaration-flow--authorizations">${declarationFlow(texts.autorizaciones_tomador_poliza_digital?.contenido)}</div>
    </section>`
}

function compactDistribution(title, category, labels, values, variant) {
  if (!category || labels.length === 0 || labels.length !== values.length) return ''
  return `
    <section class="coverage-distribution coverage-distribution--${variant}">
      ${title ? `<h3>${escapeHtml(title)}</h3>` : ''}
      <strong class="coverage-distribution__category">${escapeHtml(category)}</strong>
      <div class="coverage-distribution__grid coverage-distribution__grid--${variant}">
        ${labels.map((label) => `<strong>${escapeHtml(label)}</strong>`).join('')}
        ${values.map((value) => `<span>${escapeHtml(value)}</span>`).join('')}
      </div>
    </section>`
}

function coverageFlow(value) {
  const lines = sourceBlocks(value).flat()
  if (!lines.length) return `<p class="legal-paragraph">${UNAVAILABLE}</p>`
  if (COVERAGE_TITLE_PATTERN.test(lines[0])) lines.shift()

  const distributionIndex = lines.findIndex((line) => DISTRIBUTION_TITLE_PATTERN.test(line))
  if (distributionIndex < 0) return legalFlow(value)

  const coverageLines = lines.slice(0, distributionIndex)
  const theftIndex = coverageLines.findIndex((line) => /^Robo y\/o Asalto/iu.test(line))
  const fireLines = theftIndex < 0 ? coverageLines : coverageLines.slice(0, theftIndex)
  const theftLines = theftIndex < 0 ? [] : coverageLines.slice(theftIndex)
  const distributionLines = lines.slice(distributionIndex + 1)
  const sublimitIndex = distributionLines.findIndex((line) => /^Subl[ií]mite/iu.test(line))
  const theftDistributionIndex = distributionLines.findIndex(
    (line, index) => index > 0 && /^Robo$/iu.test(line)
  )
  const fireDistributionLines = distributionLines.slice(0, sublimitIndex)
  const sublimitLines = distributionLines.slice(sublimitIndex, theftDistributionIndex)
  const theftDistributionLines = distributionLines.slice(theftDistributionIndex)
  const splitDistribution = (items) => {
    const firstValue = items.findIndex((line) => /^\d+(?:[.,]\d+)?%$/u.test(line))
    return {
      category: items[0],
      labels: firstValue > 1 ? items.slice(1, firstValue) : [],
      values: firstValue >= 0 ? items.slice(firstValue) : [],
    }
  }
  const fireDistribution = splitDistribution(fireDistributionLines)
  const theftDistribution = splitDistribution(theftDistributionLines)

  return `
    <div class="coverage-flow">
      <div class="coverage-list coverage-list--fire">${fireLines
        .map(
          (line, index) =>
            `<p class="${index === 0 ? 'coverage-primary' : ''}">${index === 0 ? `<strong>${escapeHtml(line)}</strong>` : escapeHtml(line)}</p>`
        )
        .join('')}</div>
      <div class="coverage-list coverage-list--theft">${theftLines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}</div>
      ${compactDistribution(
        lines[distributionIndex],
        fireDistribution.category,
        fireDistribution.labels,
        fireDistribution.values,
        'fire'
      )}
      <div class="coverage-sublimits">${sublimitLines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}</div>
      ${compactDistribution(
        '',
        theftDistribution.category,
        theftDistribution.labels,
        theftDistribution.values,
        'theft'
      )}
    </div>`
}

function conditionsFlow(value) {
  const blocks = sourceBlocks(value)
  if (!blocks.length) return `<p class="legal-paragraph">${UNAVAILABLE}</p>`
  const normalized = blocks.map((lines) => lines.join(' '))
  const franchiseIndex = normalized.findIndex((line) => FRANCHISE_TITLE_PATTERN.test(line))
  const exclusionIndex = normalized.findIndex((line) => EXCLUSION_TITLE_PATTERN.test(line))
  if (franchiseIndex < 0 || exclusionIndex <= franchiseIndex) return legalFlow(value)

  const renderParagraphs = (items, className = '') =>
    items
      .map((line) => `<p${className ? ` class="${className}"` : ''}>${escapeHtml(line)}</p>`)
      .join('')
  const exclusionBlocks = normalized.slice(exclusionIndex + 1)
  const finalIndex = exclusionBlocks.findIndex((line) => /^La asegurada dar[aá] aviso/iu.test(line))
  const exclusions = finalIndex < 0 ? exclusionBlocks : exclusionBlocks.slice(0, finalIndex)
  const finalParagraphs = finalIndex < 0 ? [] : exclusionBlocks.slice(finalIndex)

  return `
    <div class="conditions-flow">
      <section class="conditions-intro">${renderParagraphs(normalized.slice(0, franchiseIndex))}</section>
      <section class="conditions-section conditions-section--franchises"><h3>${escapeHtml(normalized[franchiseIndex])}</h3>${renderParagraphs(normalized.slice(franchiseIndex + 1, exclusionIndex))}</section>
      <section class="conditions-section conditions-section--exclusions"><h3>${escapeHtml(normalized[exclusionIndex])}</h3>${renderParagraphs(exclusions)}</section>
      ${finalParagraphs.length ? `<section class="conditions-final">${renderParagraphs(finalParagraphs)}</section>` : ''}
    </div>`
}

function contractSection(title, content, className = '', attributes = '') {
  return `<section class="contract-section ${className}"${attributes ? ` ${attributes}` : ''}><h2>${title}</h2><div>${content}</div></section>`
}

function contractParagraph(content, className = '') {
  return `<section class="contract-section ${className}"><div>${content}</div></section>`
}

function paymentLine(label, value) {
  return `<div class="payment-line"><b>${escapeHtml(label)}:</b><span>${value}</span></div>`
}

function debitAuthorization() {
  return `
    <section class="debit-authorization">
      <p>En mi carácter de titular de cuenta autorizo irrevocablemente a debitar de mi Tarjeta de Crédito indicada más abajo el importe correspondiente a las cuotas de la póliza emitida por ASEGURADORA TAJY a mi favor, según la opción indicada más arriba.</p>
      <div class="debit-type">Tipo:<span class="debit-box"></span>Visa<span class="debit-box"></span>Mastercard<span class="debit-box"></span>Cuenta Corriente</div>
      <div class="debit-bank">${UNAVAILABLE}</div>
      <div class="debit-line"><span>Número:</span><i></i></div>
      <div class="debit-line"><span>Vencimiento:</span><i></i></div>
    </section>`
}

function signature(label, name, details) {
  return `
    <div class="signature">
      <div class="signature-space"></div>
      <div class="signature-line"></div>
      <div class="signature-label">${escapeHtml(label)}</div>
      <div class="signature-detail">Aclaración: ${text(name)}</div>
      ${details.map((detail) => `<div class="signature-detail">${escapeHtml(detail)}</div>`).join('')}
    </div>`
}

function digitalPolicyForm(email) {
  return `
    <section class="digital-delivery">
      <div class="digital-delivery-row digital-delivery-row--choice">
        <span class="digital-delivery-copy">En apoyo a la ecología deseo recibir mi póliza en formato digital:</span>
        <span class="digital-choice"><span>SI</span><i></i><span>NO</span><i></i></span>
      </div>
      <div class="digital-delivery-row digital-delivery-row--email"><span class="digital-email-label">E-mail:</span><span class="digital-email-value">${text(email)}</span></div>
    </section>`
}

export function buildMrcPropuestaHtml(snapshot, { tajyLogoDataUri = null } = {}) {
  const { proposal, carta, commercial, draft, texts = {} } = snapshot
  const insured = draft.partes?.asegurado ?? {}
  const proposer = draft.partes?.tomador_igual_asegurado ? insured : (draft.partes?.tomador ?? {})
  const risk = carta.riesgo_datos ?? {}
  const payment = commercial.plan_pago ?? {}
  const coverages = carta.coberturas ?? []
  const totalCoverage = coverages.length
    ? coverages.reduce((total, coverage) => total + (Number(coverage.monto) || 0), 0)
    : null

  const declarations = structuredDeclarations(texts)

  const pageOne = `
    <article class="proposal-page proposal-page--one">
      ${header(snapshot, 1, tajyLogoDataUri)}
      ${insuredPanel(insured, proposer, draft)}
      <section class="modality"><b>Modalidad de la Cobertura Solicitada : 1020 (RIESGOS VARIOS / MULTIRRIESGO COMERCIO)</b></section>
      <section class="risk-table">
        <div class="risk-columns risk-columns--head"><span>Art.</span><span>Descripción</span><span class="risk-heading--numeric">Suma Asegurada Gs.</span><span class="risk-heading--numeric">Prima Gs.</span></div>
        <div class="risk-columns risk-columns--body"><span>1</span><div class="risk-description fit-box" data-fit-section="risk-description" data-fit-target="9.2" data-fit-minimum="8" data-fit-step="0.2"><p>${text(draft.descripcion_detallada)}</p><b>UBICACIÓN DEL RIESGO:</b><br />${text(risk.direccion)}${risk.ciudad ? `, ${text(risk.ciudad)}` : ''}<br /><br /><b>DETALLE DE SUMAS ASEGURADAS:</b><br />${coverageSummary(coverages)}</div><b>${money(totalCoverage)}</b><b>${money(commercial.variante?.prima)}</b></div>
        <div class="risk-columns risk-columns--total"><span></span><b>TOTAL SUMA ASEGURADA</b><b>${money(totalCoverage)}</b><b>${money(commercial.variante?.prima)}</b></div>
      </section>
      <section class="contract-stack">
        <div class="declarations-stack fit-box" data-fit-section="declarations" data-fit-target="6.8" data-fit-minimum="5.9" data-fit-step="0.1">${declarations}</div>
        ${contractSection(TEXT_SECTION_TITLES.coberturas_principales, coverageFlow(texts.coberturas_principales?.contenido), 'contract-section--coverage fit-box', 'data-fit-section="principal-coverages" data-fit-target="10.6" data-fit-minimum="9.2" data-fit-step="0.2"')}
      </section>
      <footer class="proposal-footer"><span>Operador: ${UNAVAILABLE}</span><span>Página: 1</span></footer>
    </article>`

  const pageTwo = `
    <article class="proposal-page proposal-page--two">
      ${header(snapshot, 2, tajyLogoDataUri)}
      <section class="conditions-box fit-box" data-fit-section="conditions" data-fit-target="10.6" data-fit-minimum="9.2" data-fit-step="0.2">${conditionsFlow(texts.condiciones_mrc?.contenido)}</section>
      <div class="payment-row-shell">
        <div class="payment-row">
          <section class="cost-box"><h2>COSTO DEL SEGURO</h2><div>${paymentLine('Prima', money(commercial.variante?.prima))}${paymentLine('R.P.F.', money(payment.rpf_monto))}${paymentLine('Sub-Total', sumMoney(commercial.variante?.prima, payment.rpf_monto))}${paymentLine('I.V.A.', money(payment.iva_monto))}${paymentLine('Costo Total', money(payment.premio_total))}</div></section>
          <section class="payment-box"><h2>FORMA DE PAGO</h2><div>${paymentLine('Modalidad', text(payment.formas_pago?.nombre_display))}${paymentLine('Inicial', money(payment.monto_inicial))}${paymentLine('Cuotas', payment.monto_cuota ? `${text(payment.cantidad_cuotas)} cuotas de ${money(payment.monto_cuota)}` : 'Contado')}</div></section>
          ${debitAuthorization()}
        </div>
      </div>
      ${contractSection(
        TEXT_SECTION_TITLES.clausula_adicional_cobranzas,
        legalFlow(
          String(texts.clausula_adicional_cobranzas?.contenido ?? '')
            .replace(COLLECTION_CLAUSE_TITLE_PATTERN, '')
            .trimStart()
        ),
        'collection-clause fit-box',
        'data-fit-section="collection-clause" data-fit-target="8.1" data-fit-minimum="7" data-fit-step="0.1"'
      )}
      <section class="observations"><h2>Observaciones</h2><div class="observation-value">${text(draft.observaciones, ' ')}</div><div class="writing-line"></div><div class="writing-line"></div><div class="writing-line"></div></section>
      <section class="signatures">
        ${signature('Firma del Agente', proposal.agente?.nombre, [`Matrícula Nro.: ${text(proposal.agente?.matricula)}`, 'Lugar y Fecha:'])}
        ${signature('Firma del Titular de la Tarjeta', null, ['Nro de C.I.:'])}
        ${signature('Firma del Titular del Seguro', proposer.nombre_razon_social, ['Nro de C.I.:'])}
      </section>
      ${digitalPolicyForm(insured.email)}
      <footer class="proposal-footer"><span>Operador: ${UNAVAILABLE}</span><span>Página: 2</span></footer>
    </article>`

  return `<!doctype html>
<html lang="es" data-proposal-fit="pending">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  :root {
    --rule: #000;
    --shade: #e9e9e9;
    --type-a-family: Arial, Helvetica, sans-serif; --type-a-size: 6.8667px; --type-a-line: 1.1;
    --type-b-family: Arial, Helvetica, sans-serif; --type-b-size: 6.1167px; --type-b-line: 1.05;
    --type-c-family: Arial, Helvetica, sans-serif; --type-c-size: 11.8px; --type-c-line: 1;
    --type-d-family: Arial, Helvetica, sans-serif; --type-d-size: 9.2px; --type-d-line: 1;
    --type-e-family: "Courier New", Courier, monospace; --type-e-size: 9.2px; --type-e-line: 1.08;
    --type-f-family: Arial, Helvetica, sans-serif; --type-f-size: 6.8px; --type-f-line: 1.1;
    --type-g-family: Arial, Helvetica, sans-serif; --type-g-size: 10.6px; --type-g-line: 1.12;
    --type-h-family: Arial, Helvetica, sans-serif; --type-h-size: 10.6px; --type-h-line: 1.12;
    --type-i-family: Arial, Helvetica, sans-serif; --type-i-size: 9.8667px; --type-i-line: 1.04;
    --type-j-family: Arial, Helvetica, sans-serif; --type-j-size: 8px; --type-j-line: 1.12;
    --type-k-family: Calibri, Arial, sans-serif; --type-k-size: 8.1px; --type-k-line: 1.12;
    --type-l-family: Arial, Helvetica, sans-serif; --type-l-size: 7.4667px; --type-l-line: 1.08;
    --type-m-family: Arial, Helvetica, sans-serif; --type-m-size: 7.55px; --type-m-line: 1;
    --type-n-family: Arial, Helvetica, sans-serif; --type-n-size: 8.8px; --type-n-line: 1.1;
  }
  body { margin: 0; color: #000; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 7px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .proposal-page { width: 210mm; height: 297mm; padding: 4.2mm 7.1mm 2.9mm 10mm; display: flex; flex-direction: column; overflow: hidden; page-break-after: always; break-after: page; }
  .proposal-page:last-child { page-break-after: auto; break-after: auto; }
  .proposal-header { height: 19.8mm; display: grid; grid-template-columns: 31mm 1fr 20mm; align-items: center; }
  .brand { height: 100%; padding-left: 2.4mm; display: flex; align-items: center; transform: translateY(-1mm); }
  .tajy-logo { display: block; max-width: 21mm; max-height: 17.5mm; object-fit: contain; object-position: left center; }
  .tajy-logo-fallback { display: grid; color: #000; line-height: 1; }
  .tajy-logo-fallback small { color: #111; font-size: 5px; font-weight: 700; }
  .tajy-logo-fallback strong { font-family: cursive; font-size: 20px; font-style: italic; }
  .tajy-logo-fallback span { color: #333; font-size: 4px; }
  .proposal-title { display: grid; gap: 1mm; transform: translate(-13.1mm, 3.15mm) scaleX(1.217); transform-origin: center; text-align: center; font-size: 11.8px; line-height: 1; letter-spacing: .08mm; }
  .proposal-title span { color: #000; transform: translateY(1.2mm); font-size: 10.3px; font-weight: 700; letter-spacing: .15mm; }
  .header-page { justify-self: end; align-self: start; margin-right: -1.9mm; padding-top: 5.8mm; font-size: 8.8px; }
  .header-rule { border-top: 1.15px solid var(--rule); }
  .header-meta { height: 7.8mm; font-family: var(--type-a-family); font-size: var(--type-a-size); line-height: var(--type-a-line); }
  .header-meta-row { display: grid; align-items: stretch; }
  .header-meta-row--primary { height: 3.8mm; }
  .header-meta-row--secondary { height: 4mm; }
  .header-meta-row--primary { grid-template-columns: 25% 17.5% 12% 20% 12.75% 12.75%; }
  .header-meta-row--secondary { grid-template-columns: 85% 15%; }
  .header-cell { min-width: 0; display: flex; align-items: center; gap: .55mm; padding: .4mm 1mm; border-right: .55px solid var(--rule); border-bottom: .55px solid var(--rule); line-height: 1.1; overflow: hidden; white-space: nowrap; }
  .header-meta-row--secondary .header-cell { padding-left: 1.3mm; padding-right: 1.3mm; }
  .header-cell:last-child { border-right: 0; }
  .header-dash { margin-top: .45mm; border-top: .65px dashed var(--rule); }
  .insured-panel { margin-top: 1.55mm; font-family: var(--type-b-family); font-size: var(--type-b-size); line-height: var(--type-b-line); }
  .insured-panel h1 { height: 3.4mm; margin: 0; padding: .55mm 1.3mm; font-size: 7.8667px; line-height: 1; }
  .insured-grid { display: grid; grid-template-columns: repeat(16, minmax(0, 1fr)); grid-auto-rows: 4.65mm; border: .65px solid var(--rule); }
  .insured-field { min-width: 0; padding: .55mm .7mm; border: 0; font: inherit; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .insured-annex { min-width: 0; padding: .55mm .7mm; border-bottom: .5px solid var(--rule); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .insured-field:nth-child(15), .insured-field:nth-child(16), .insured-field:nth-child(17), .insured-field:nth-child(18), .insured-field:nth-child(19), .insured-field:nth-child(20) { border-bottom: .5px solid var(--rule); }
  .insured-field b { font-size: inherit; }
  .span-2 { grid-column: span 2; }
  .span-3 { grid-column: span 3; }
  .span-4 { grid-column: span 4; }
  .span-5 { grid-column: span 5; }
  .span-6 { grid-column: span 6; }
  .span-7 { grid-column: span 7; }
  .span-8 { grid-column: span 8; }
  .span-10 { grid-column: span 10; }
  .span-16 { grid-column: span 16; }
  .check-box { display: inline-grid; width: 3mm; height: 3mm; margin: 0 .55mm; border: .8px solid var(--rule); place-items: center; font-size: 6px; vertical-align: middle; }
  .modality { height: 5.72mm; padding: .75mm 1.3mm; border: .65px solid var(--rule); background: var(--shade); font-family: var(--type-c-family); font-size: var(--type-c-size); line-height: var(--type-c-line); letter-spacing: .01mm; }
  .risk-table { flex: none; border: .65px solid var(--rule); border-top: 0; }
  .risk-columns { display: grid; grid-template-columns: 8.3mm 1fr 25.3mm 17.7mm; }
  .risk-columns > * { min-width: 0; padding: 1mm; border-right: .65px solid var(--rule); overflow-wrap: anywhere; }
  .risk-columns > *:last-child { border-right: 0; }
  .risk-columns--head { height: 4.45mm; color: #000; background: var(--shade); text-align: center; font-family: var(--type-d-family); font-size: var(--type-d-size); line-height: var(--type-d-line); font-weight: 700; letter-spacing: 0; }
  .risk-columns--head > * { display: flex; align-items: center; justify-content: center; }
  .risk-columns--head > .risk-heading--numeric { padding-left: .35mm; padding-right: .35mm; white-space: nowrap; overflow-wrap: normal; }
  .risk-columns--body { height: 43.9mm; border-top: .65px solid var(--rule); }
  .risk-description { width: 100%; max-width: none; height: 100%; min-height: 0; overflow: hidden; font-family: var(--type-e-family); font-size: var(--type-e-size); line-height: var(--type-e-line); white-space: normal; overflow-wrap: break-word; word-break: normal; }
   .risk-columns--body > b { display: flex; align-items: center; justify-content: flex-end; text-align: right; }
  .risk-columns--body p { margin: 0 0 1mm; }
  .risk-columns--total { height: 5.8mm; border-top: .65px solid var(--rule); background: var(--shade); font-family: var(--type-d-family); font-size: var(--type-d-size); line-height: var(--type-d-line); }
  .risk-columns--total b:not(:nth-child(2)) { text-align: right; }
  .contract-stack { flex: 0 0 164.8mm; height: 164.8mm; border: .65px solid var(--rule); border-top: 0; display: flex; flex-direction: column; }
  .declarations-stack { height: 74.2mm; padding: .85mm 1.2mm; border-bottom: .65px solid var(--rule); font-family: var(--type-f-family); font-size: var(--type-f-size); line-height: var(--type-f-line); overflow: hidden; }
  .contract-section { min-width: 0; }
  .contract-section h2 { margin: 0; font-size: inherit; font-weight: 700; }
  .contract-section > div { white-space: normal; overflow-wrap: break-word; word-break: normal; }
  .legal-paragraph { margin: 0 0 .7mm; }
  .legal-paragraph:last-child { margin-bottom: 0; }
  .legal-subheading { display: block; }
  .contract-section--declarations h2 { margin-bottom: .45mm; }
  .declaration-flow p { margin: 0; }
  .declaration-flow--general .declaration-paragraph--lead { font-style: italic; }
  .declaration-flow--funds { margin-top: .15mm; font-style: italic; }
  .declaration-flow--funds h3 { margin: 0; font-size: inherit; font-style: italic; }
  .declaration-flow--authorizations { margin-top: .35mm; }
  .declaration-subsection h3 { margin: 0; font-size: inherit; }
  .declaration-choice-group { display: grid; align-items: baseline; font-weight: 700; }
  .declaration-choice-group--signatures { grid-template-columns: repeat(3, max-content); column-gap: 8mm; margin-top: .6mm; }
  .declaration-choice-group--delivery { grid-template-columns: repeat(3, max-content); column-gap: 8mm; }
  .declaration-paragraph--numbered-1, .declaration-paragraph--numbered-1-1 { font-weight: 700; }
  .motive-writing-line { display: inline-block; width: 27mm; height: .9em; border-bottom: .65px solid var(--rule); vertical-align: baseline; }
  .contract-section--coverage { flex: 1; padding: 1mm 1.2mm; font-family: var(--type-g-family); font-size: var(--type-g-size); line-height: var(--type-g-line); overflow: hidden; }
  .contract-section--coverage h2 { margin-bottom: .35mm; }
  .coverage-flow p { margin: 0; }
  .coverage-primary { margin-bottom: 2.4mm !important; }
  .coverage-list--theft { margin-top: 2.4mm; }
  .coverage-distribution { margin-top: 2.4mm; }
  .coverage-distribution h3 { margin: 0; font-size: inherit; }
  .coverage-distribution__category { display: block; }
  .coverage-distribution__grid { display: grid; width: max-content; }
  .coverage-distribution__grid strong { text-align: left; }
  .coverage-distribution__grid span { text-align: center; }
  .coverage-distribution__grid--fire { grid-template-columns: 18mm 42mm; }
  .coverage-distribution__grid--theft { grid-template-columns: repeat(3, 18mm); }
  .coverage-sublimits { margin-top: 2.4mm; }
  .coverage-distribution--theft { margin-top: 2.4mm; }
  .proposal-footer { margin-top: auto; padding: .65mm 2.2mm 0; border-top: 1.15px solid var(--rule); display: flex; justify-content: space-between; font-family: var(--type-n-family); font-size: var(--type-n-size); line-height: var(--type-n-line); }
  .proposal-page--two .proposal-footer { transform: translateY(.7mm); }
  .proposal-footer span:first-child { transform: scaleX(1.21); transform-origin: left; }
  .proposal-footer span:last-child { transform: scaleX(1.21); transform-origin: right; }
  .conditions-box { height: 87.3mm; margin-top: 2.35mm; padding: 1.2mm; border: .65px solid var(--rule); border-bottom: 0; font-family: var(--type-h-family); font-size: var(--type-h-size); line-height: var(--type-h-line); overflow: hidden; white-space: normal; overflow-wrap: break-word; word-break: normal; }
  .conditions-flow p { margin: 0; }
  .conditions-intro p + p { margin-top: 2.4mm; }
  .conditions-section { margin-top: 2.4mm; }
  .conditions-section h3 { margin: 0; font-size: inherit; }
  .conditions-section p + p { margin-top: 2.4mm; }
  .conditions-section--exclusions p + p { margin-top: 0; }
  .conditions-final { margin-top: 0; }
  .payment-row-shell { height: 27.25mm; border: .65px solid var(--rule); }
  .payment-row { height: 100%; display: grid; grid-template-columns: 53mm 3.9mm 46mm 1fr; margin: 0 3.5mm; font-family: var(--type-i-family); font-size: var(--type-i-size); line-height: var(--type-i-line); }
  .cost-box, .payment-box { height: 100%; display: grid; grid-template-rows: 4.4mm 1fr; border-left: .65px solid var(--rule); border-right: .65px solid var(--rule); }
  .cost-box > div, .payment-box > div { min-height: 0; display: grid; }
  .cost-box > div { grid-template-rows: repeat(5, 1fr); }
  .payment-box { grid-column: 3; }
  .payment-box > div { grid-template-rows: repeat(3, 1fr); }
  .cost-box h2, .payment-box h2 { height: 4.4mm; margin: 0; padding: .75mm 1.3mm; background: var(--shade); border-bottom: .65px solid var(--rule); text-align: center; font: inherit; font-weight: 700; letter-spacing: .02mm; }
  .payment-line { min-height: 0; display: grid; grid-template-columns: 44% 1fr; align-items: center; padding: .35mm 1.1mm; border-top: .5px solid var(--rule); font: inherit; }
  .cost-box .payment-line:first-child, .payment-box .payment-line:first-child { border-top: 0; }
  .cost-box .payment-line { border-top: 0; }
  .cost-box .payment-line:last-child { border-top: .5px solid var(--rule); }
  .payment-box .payment-line { border-top: 0; }
  .payment-box .payment-line:nth-child(2), .payment-box .payment-line:nth-child(3) { border-top: .5px solid var(--rule); }
  .payment-line span { text-align: right; }
  .debit-authorization { grid-column: 4; height: 100%; padding: .8mm 1.2mm .45mm; border-left: 0; font-family: var(--type-j-family); font-size: var(--type-j-size); line-height: var(--type-j-line); }
  .debit-authorization p { height: 8.7mm; margin: 0; }
  .debit-type { height: 4.2mm; display: flex; align-items: center; gap: .8mm; white-space: nowrap; }
  .debit-box { width: 3.2mm; height: 3.2mm; border: .65px solid var(--rule); }
  .debit-bank { height: 4.2mm; border-bottom: .65px solid var(--rule); text-align: right; }
  .debit-line { height: 3.4mm; display: grid; grid-template-columns: 17mm 1fr; align-items: center; }
  .debit-line i { height: 3.1mm; border: .65px solid var(--rule); }
  .collection-clause { height: 16.95mm; padding: .8mm 1.2mm; border: .65px solid var(--rule); border-top: 0; font-family: var(--type-k-family); font-size: var(--type-k-size); line-height: var(--type-k-line); overflow: hidden; }
  .collection-clause h2 { margin-bottom: .45mm; }
  .observations { height: 15.9mm; border: .65px solid var(--rule); overflow: hidden; font-family: var(--type-l-family); font-size: var(--type-l-size); line-height: var(--type-l-line); }
  .observations h2 { height: 3.2mm; margin: 0; padding: .55mm 1.2mm; background: var(--shade); border-bottom: .65px solid var(--rule); text-align: left; font-size: 7.4667px; }
  .observation-value { height: 3.2mm; padding: .58mm 1.2mm; font-size: 6.6667px; overflow: hidden; white-space: nowrap; }
  .writing-line { height: 3.3mm; margin: 0 1.2mm; border-top: .65px dashed var(--rule); }
  .signatures { height: 19.15mm; display: grid; grid-template-columns: 40% 36.8% 23.2%; border: .65px solid var(--rule); border-top: 0; font-family: var(--type-m-family); font-size: var(--type-m-size); line-height: var(--type-m-line); }
  .signature { min-width: 0; padding: 3.8mm 1mm 0; text-align: center; font: inherit; overflow: hidden; }
  .signature:nth-child(1) .signature-line { width: 74.5%; margin-left: -.2mm; }
  .signature:nth-child(1) .signature-label { transform: translate(-9.9mm, -.5mm); }
  .signature:nth-child(1) .signature-detail { line-height: .88; transform: translateY(-.5mm); }
  .signature:nth-child(2) .signature-line { margin: 0 -1mm .7mm 17.7mm; }
  .signature:nth-child(2) .signature-label { transform: translateX(6.8mm); }
  .signature:nth-child(2) .signature-detail { transform: translateX(17.4mm); }
  .signature:nth-child(3) { position: relative; }
  .signature:nth-child(3) .signature-line { margin: 0 -.4mm .7mm -.7mm; }
  .signature:nth-child(3) .signature-label { transform: translateX(1.9mm); }
  .signature:nth-child(3)::before { content: ''; position: absolute; top: 3.8mm; bottom: 0; left: 0; border-left: .65px solid var(--rule); }
  .signature-space { height: 6.1mm; }
  .signature-line { border-top: .8px solid var(--rule); margin: 0 0 .7mm; }
  .signature-label { margin-bottom: 1mm; font-size: inherit; }
  .signature-detail { text-align: left; line-height: .88; white-space: nowrap; }
  .digital-delivery { height: 7.65mm; padding: .8mm 1.2mm .35mm; border: .65px solid var(--rule); border-top: 0; display: grid; grid-template-rows: 4.3mm 1.7mm; row-gap: .15mm; font-size: 6.9667px; line-height: 1.05; }
  .digital-delivery-row { min-width: 0; }
  .digital-delivery-row--choice { display: flex; align-items: center; }
  .digital-delivery-copy { white-space: nowrap; }
  .digital-choice { display: inline-flex; align-items: center; margin-left: 4mm; white-space: nowrap; }
  .digital-choice i { display: inline-block; flex: none; width: 4.3mm; height: 4.3mm; margin: 0 2.2mm 0 .6mm; border: .65px solid var(--rule); }
  .digital-delivery-row--email { display: grid; grid-template-columns: auto minmax(78mm, 1fr); column-gap: .65mm; align-items: baseline; }
  .digital-email-value { min-width: 0; height: 1.7mm; line-height: 1.7mm; overflow: hidden; white-space: nowrap; border-bottom: .65px dotted var(--rule); }
</style>
</head>
<body>${pageOne}${pageTwo}</body>
<script>
  (() => {
    const isOverflowing = (element) =>
      element.scrollHeight > element.clientHeight + 0.5 ||
      element.scrollWidth > element.clientWidth + 0.5

    const fitSections = async () => {
      await document.fonts.ready
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const metrics = []

      for (const element of document.querySelectorAll('[data-fit-section]')) {
        const target = Number(element.dataset.fitTarget)
        const minimum = Number(element.dataset.fitMinimum)
        const step = Number(element.dataset.fitStep)
        let size = target
        element.style.fontSize = size + 'px'
        const targetMeasurement = {
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        }

        while (isOverflowing(element) && size > minimum) {
          size = Math.max(minimum, Number((size - step).toFixed(2)))
          element.style.fontSize = size + 'px'
        }

        const overflow = isOverflowing(element)
        element.dataset.fitStatus = overflow ? 'overflow' : size < target ? 'reduced' : 'target'
        element.dataset.fitOverflow = String(overflow)
        element.dataset.fitFinal = size.toFixed(2)
        if (overflow) element.classList.add('fit-box--overflow')
        metrics.push({
          section: element.dataset.fitSection,
          target,
          minimum,
          step,
          final: size,
          status: element.dataset.fitStatus,
          overflow,
          targetMeasurement,
          finalMeasurement: {
            scrollHeight: element.scrollHeight,
            clientHeight: element.clientHeight,
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
          },
        })
      }

      window.__proposalFitMetrics = metrics
      window.__proposalFitComplete = true
      document.documentElement.dataset.proposalFit = 'complete'
    }

    window.__proposalFitPromise = fitSections().catch((error) => {
      window.__proposalFitError = String(error && error.message ? error.message : error)
      document.documentElement.dataset.proposalFit = 'error'
    })
  })()
</script>
</html>`
}
