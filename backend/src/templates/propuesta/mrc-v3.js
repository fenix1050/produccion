import { escapeHtml, fmtFecha } from '../oferta/layout.js'

import { UNAVAILABLE, brandMark, booleanChoice, declarationFlow, money, text } from './mrc.js'

// v3-only variant of mrc.js's legalFlow(): preserves each source line as its own
// <br>-separated line within the same paragraph instead of collapsing them into one
// flowing sentence. Kept local (not shared with v1/v2) so their approved rendering of
// the same condiciones_mrc/clausula_adicional_cobranzas text stays untouched. Needed
// because the "Exclusiones" list is ten single-newline-separated sentences: joining
// them with a space (v1/v2 behavior) merges them into one unreadable block, while a
// blank line between each (a full paragraph with margin) overflows the v3 fit box.
function legalFlowV3(value) {
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

      const firstLineIsHeading = lines[0].length <= 100 && lines[0].endsWith(':')
      if (firstLineIsHeading) {
        const body = lines
          .slice(1)
          .map((line) => escapeHtml(line))
          .join('<br>')
        return `<p class="legal-paragraph"><strong class="legal-subheading">${escapeHtml(lines[0])}</strong>${body ? `<span>${body}</span>` : ''}</p>`
      }

      return `<p class="legal-paragraph">${lines.map((line) => escapeHtml(line)).join('<br>')}</p>`
    })
    .join('')
}

// v3-only renderer for "Coberturas principales": mrc.js's coverageFlow()/compactDistribution()
// target a different fixed shape (v1's roomier legal-content layout) and silently strip a
// leading "Coberturas Principales:" line assuming the card header already shows it — v3's
// approved reference keeps that line, plus a bold "Incendio, Rayo y Explosión;" primary item,
// visible inside the card body. Kept local so it can also read the "label | label" /
// "value | value" table rows the approved Distribución del Capital Asegurado text uses.
function principalCoveragesFlowV3(value) {
  if (value == null || value === '') return `<p class="legal-paragraph">${UNAVAILABLE}</p>`

  const blocks = String(value)
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
  if (!blocks.length) return `<p class="legal-paragraph">${UNAVAILABLE}</p>`

  return blocks
    .map((lines, blockIndex) => {
      const firstTableLineIndex = lines.findIndex((line) => line.includes('|'))
      if (firstTableLineIndex >= 0) {
        const headingLines = lines.slice(0, firstTableLineIndex)
        const [labelsRow = '', valuesRow = ''] = lines.slice(firstTableLineIndex)
        const labels = labelsRow.split('|').map((cell) => cell.trim())
        const values = valuesRow.split('|').map((cell) => cell.trim())
        return `<div class="coverage-table-block">${headingLines.map((line) => `<strong class="coverage-subheading">${escapeHtml(line)}</strong>`).join('')}<div class="coverage-table" style="--coverage-table-columns:${labels.length}">${labels.map((cell) => `<strong>${escapeHtml(cell)}</strong>`).join('')}${values.map((cell) => `<span>${escapeHtml(cell)}</span>`).join('')}</div></div>`
      }

      if (blockIndex === 0 && lines.length === 2) {
        return `<p class="coverage-title-block"><strong>${escapeHtml(lines[0])}</strong><strong class="coverage-primary">${escapeHtml(lines[1])}</strong></p>`
      }

      if (lines.length === 1 && lines[0].length <= 100 && lines[0].endsWith(':')) {
        return `<p class="coverage-title-block"><strong>${escapeHtml(lines[0])}</strong></p>`
      }

      return `<p class="coverage-list-block">${lines.map((line) => escapeHtml(line)).join('<br>')}</p>`
    })
    .join('')
}

export const PROPUESTA_FORMAL_V3_STYLE = `
  @page { size: A4; margin: 0; }
  :root {
    --v3-red: #d8112d;
    --v3-red-dark: #b20d24;
    --v3-pink: #fff0f2;
    --v3-ink: #273447;
    --v3-muted: #667287;
    --v3-line: #dbe1e8;
    --v3-soft: #f1f4f7;
    --v3-paper: #fff;
    --v3-radius: 2.2mm;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #eef2f5; }
  body {
    color: var(--v3-ink);
    font-family: Arial, Helvetica, sans-serif;
    font-size: 7.1px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .proposal-page {
    position: relative;
    width: 210mm;
    height: 297mm;
    padding: 5mm 5.5mm 6.5mm;
    display: flex;
    flex-direction: column;
    gap: 2.5mm;
    overflow: hidden;
    background: var(--v3-paper);
    page-break-after: always;
    break-after: page;
  }
  .proposal-page:last-child { page-break-after: auto; break-after: auto; }
  .proposal-header {
    position: relative;
    height: 23mm;
    flex: 0 0 23mm;
    margin: -5mm -5.5mm 0;
    padding: 0 8mm;
    display: grid;
    grid-template-columns: 39mm 1fr 27mm;
    align-items: center;
    color: #fff;
    background-image:
      linear-gradient(115deg, rgba(255, 255, 255, .08) 0 28%, transparent 28% 56%, rgba(0, 0, 0, .13) 56% 100%),
      linear-gradient(90deg, var(--v3-red) 0 50%, rgba(202, 15, 41, .55) 60%, rgba(202, 15, 41, 0) 76%),
      var(--v3-header-photo, none),
      linear-gradient(105deg, var(--v3-red) 0%, #ca0f29 58%, #8f0b1c 100%);
    background-position: center, center, right center, center;
    background-repeat: no-repeat;
    background-size: 100% 100%, 100% 100%, 44% 100%, 100% 100%;
    border-radius: 0 0 1.5mm 1.5mm;
    overflow: hidden;
  }
  .proposal-header::after {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(124deg, transparent 0 26mm, rgba(255,255,255,.035) 26mm 27mm);
    pointer-events: none;
  }
  .brand, .proposal-title, .header-page { position: relative; z-index: 1; }
  .brand { display: flex; align-items: center; height: 100%; }
  .tajy-logo { max-width: 27mm; max-height: 18mm; filter: brightness(0) invert(1); object-fit: contain; object-position: left center; }
  .tajy-logo-fallback { display: grid; color: #fff; line-height: .9; }
  .tajy-logo-fallback small, .tajy-logo-fallback span { color: rgba(255,255,255,.82); }
  .tajy-logo-fallback strong { font-family: cursive; font-size: 27px; font-style: italic; }
  .proposal-title { display: grid; gap: 2mm; text-align: center; text-transform: uppercase; line-height: 1; }
  .proposal-title strong { font-size: 13.2px; letter-spacing: .05mm; }
  .proposal-title span { font-size: 9px; font-weight: 700; letter-spacing: .12mm; }
  .header-page { justify-self: end; padding: 1.3mm 2mm; border: .7px solid rgba(255,255,255,.95); border-radius: 5mm; font-size: 7.8px; font-weight: 700; white-space: nowrap; }
  .header-meta {
    min-height: 21mm;
    margin-top: -1mm;
    padding: 2mm 2.5mm;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(8mm, auto));
    gap: 1.5mm;
    border: .7px solid var(--v3-line);
    border-radius: var(--v3-radius);
    background: var(--v3-soft);
  }
  .header-cell { min-width: 0; min-height: 8mm; padding: .7mm 2.1mm; display: grid; grid-template-columns: 5mm 1fr; align-items: center; column-gap: 1.2mm; border-right: .6px solid var(--v3-line); }
  .header-cell:last-child { border-right: 0; }
  .header-cell--proposal { grid-column: 1; grid-row: 1; }
  .header-cell--issue-date { grid-column: 2; grid-row: 1; }
  .header-cell--validity { grid-column: 3; grid-row: 1; }
  .header-cell--until { grid-column: 4; grid-row: 1; }
  .header-cell--renewal { grid-column: 1; grid-row: 2; }
  .header-cell--start { grid-column: 2; grid-row: 2; }
  .header-cell--end { grid-column: 3; grid-row: 2; }
  .header-cell--policy { grid-column: 4; grid-row: 2; }
  .header-cell .icon { width: 5mm; height: 5mm; padding: 1mm; border-radius: 1mm; }
  .header-cell .header-copy { min-width: 0; display: block; }
  .header-cell b { display: block; font-size: 7px; }
  .header-cell .header-copy > span { display: block; margin-top: .7mm; color: var(--v3-muted); font-size: 7.4px; line-height: 1.15; overflow-wrap: anywhere; white-space: normal; }
  .card { border: .7px solid var(--v3-line); border-radius: var(--v3-radius); background: #fff; overflow: hidden; }
  .section-heading { min-height: 8mm; margin: 0; padding: 1.7mm 2.4mm; display: flex; align-items: center; gap: 2.2mm; color: var(--v3-ink); background: linear-gradient(90deg, var(--v3-soft), #fff); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08mm; }
  .section-heading .icon { flex: none; }
  .icon { width: 7mm; height: 7mm; padding: 1.45mm; display: inline-grid; place-items: center; border-radius: 1.3mm; color: #fff; background: var(--v3-red); }
  .icon svg { width: 100%; height: 100%; fill: currentColor; stroke: currentColor; stroke-width: 1.5; }
  .insured-card { flex: 0 0 auto; height: auto; min-height: 55mm; overflow: visible; }
  .insured-body { padding: 2.5mm; display: grid; grid-template-columns: 1fr 1fr; gap: 2.5mm; }
  .insured-column { min-width: 0; padding: 1.4mm 1.8mm; border-radius: 1.2mm; background: linear-gradient(90deg, #f5f7f9, #edf1f5); }
  .datum { min-height: 5.5mm; padding: 1mm 0; display: grid; grid-template-columns: 44% 56%; border-bottom: .45px solid rgba(219,225,232,.7); }
  .datum:last-child { border-bottom: 0; }
  .datum b { font-size: 7.4px; line-height: 1.2; font-weight: 700; }
  .datum span { min-width: 0; color: var(--v3-ink); font-size: 7.6px; line-height: 1.2; overflow-wrap: anywhere; white-space: normal; }
  .insured-annex { min-height: 10mm; padding: 1.4mm 1.8mm; color: var(--v3-muted); font-size: 7.2px; line-height: 1.3; }
  .address-row { padding: 0 2.5mm 2.5mm; display: grid; grid-template-columns: 1fr 1fr; gap: 2.5mm; }
  .address-card { min-height: 19mm; padding: 1.8mm 2.2mm; border-radius: 1.2mm; background: linear-gradient(90deg, #f5f7f9, #edf1f5); }
  .address-card strong { display: flex; align-items: center; gap: 1.4mm; font-size: 8.2px; }
  .address-card strong .icon { width: 4.7mm; height: 4.7mm; padding: 1mm; border-radius: 1mm; }
  .address-card p { margin: 1.6mm 0 0 6.2mm; color: var(--v3-muted); font-size: 7.5px; line-height: 1.35; overflow-wrap: anywhere; white-space: normal; }
  .pep-row { margin: 0 2.5mm 2.5mm; padding: 2.2mm 2.2mm; display: grid; grid-template-columns: 1fr 23mm 25mm 23mm 23mm; align-items: center; gap: 1.8mm; border-radius: 1.2mm; background: linear-gradient(90deg, #f5f7f9, #edf1f5); }
  .pep-row .pep-label { display: flex; align-items: center; gap: 1.4mm; font-size: 7.3px; line-height: 1.25; }
  .pep-row .datum { border: 0; display: block; }
  .pep-row .datum span { display: block; margin-top: .5mm; color: var(--v3-muted); }
  .check-box { display: inline-grid; width: 3mm; height: 3mm; margin: 0 .4mm; place-items: center; border: .7px solid var(--v3-muted); vertical-align: middle; font-size: 6px; }
  .check-box.checked { border-color: var(--v3-red); color: var(--v3-red); }
  .modality { min-height: 15.5mm; padding: 2.5mm 2.8mm; display: flex; align-items: center; gap: 2.8mm; border-radius: var(--v3-radius); color: var(--v3-red); background: linear-gradient(90deg, #fff0f2, #ffe5e9); font-size: 11.4px; line-height: 1.25; }
  .modality .icon { width: 8mm; height: 8mm; }
  .modality small { display: block; margin-top: 1mm; font-size: 8.6px; line-height: 1.2; font-weight: 700; }
  .coverage-card { flex: none; height: auto; min-height: 60mm; overflow: visible; }
  .risk-table { margin: 0 2mm 2mm; border: .7px solid var(--v3-line); border-radius: 1.2mm; overflow: visible; }
  .coverage-summary { margin: .5mm 0 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 1mm; row-gap: .1mm; list-style: none; font-size: 5.4px; line-height: 1; }
  .coverage-summary-item { min-width: 0; padding: .1mm 0; display: block; border-bottom: .35px solid rgba(219,225,232,.7); }
  .coverage-summary-item:last-child { border-bottom: 0; }
  .coverage-summary-inline { min-width: 0; display: block; overflow-wrap: anywhere; }
  .risk-columns { display: grid; grid-template-columns: 12mm 1fr 29mm 24mm; }
  .risk-columns > * { min-width: 0; padding: 1.4mm; border-right: .6px solid var(--v3-line); }
  .risk-columns > *:last-child { border-right: 0; }
  .risk-columns--head { min-height: 7mm; padding: 1mm; align-items: center; text-align: center; color: var(--v3-ink); background: var(--v3-soft); font-size: 7px; font-weight: 700; }
  .risk-columns--body { min-height: 35mm; }
  .risk-columns--body > * { padding: 1mm; }
  .risk-columns--body > span, .risk-columns--body > b { display: flex; justify-content: center; align-items: center; }
  .risk-columns--body > b { color: var(--v3-red); text-align: right; }
  .risk-description { min-width: 0; overflow: visible; white-space: pre-line; font-family: Arial, Helvetica, sans-serif; font-size: 9px; line-height: 1.35; overflow-wrap: anywhere; }
  .risk-description p { margin: 0 0 2mm; }
  .risk-columns--total { min-height: 6.5mm; padding: 1mm; align-items: center; background: var(--v3-soft); font-size: 7px; font-weight: 700; }
  .risk-columns--total b:not(:nth-child(2)) { text-align: right; }
  .coverage-bottom { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 2mm; overflow: hidden; }
  .declarations-box { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
  .declarations-box > .section-heading { flex: none; min-height: 6.5mm; padding: 1mm 2.4mm; }
  [data-fit-section].fit-flex { flex: 1 1 auto; min-height: 0; overflow: hidden; }
  .coverage-title-block { margin: 0 0 .6mm; }
  .coverage-title-block strong { display: block; }
  .coverage-list-block { margin: 0 0 .6mm; }
  .coverage-subheading { display: block; margin-bottom: .2mm; }
  .coverage-table-block { margin: 0 0 .6mm; }
  .coverage-table { display: grid; grid-template-columns: repeat(var(--coverage-table-columns), max-content); column-gap: 3mm; row-gap: .2mm; width: max-content; }
  .coverage-table strong { text-align: left; }
  .coverage-table span { text-align: center; }
  .declaration-flow p { margin: 0 0 .25mm; }
  .declaration-flow--general .declaration-paragraph--lead { font-style: normal; }
  .declaration-choice-group { display: flex; gap: 2mm; flex-wrap: wrap; font-weight: 700; }
  .motive-writing-line { display: inline-block; width: 18mm; border-bottom: .6px solid var(--v3-muted); }
  .page-two-content { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: .6mm; overflow: hidden; }
  .conditions-box, .principal-coverages-box, .collection-clause { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
  .conditions-box > .section-heading, .principal-coverages-box > .section-heading, .collection-clause > .section-heading { flex: none; min-height: 6.5mm; padding: 1mm 2.4mm; }
  .conditions-box { padding-bottom: 1mm; }
  .conditions-box .fit-box-inner, .collection-clause .fit-box-inner { padding: 2mm; }
  .conditions-flow { margin: 0 .6mm .6mm; padding: .6mm 1mm; border: .7px solid var(--v3-line); border-radius: 1.5mm; background: #fff; font-size: 7px; line-height: 1.05; overflow: visible; overflow-wrap: anywhere; }
  .conditions-flow p { margin: 0 0 .5mm; }
  .conditions-flow .legal-subheading { display: block; margin-bottom: .3mm; }
  .conditions-section { margin-top: .8mm; }
  .conditions-section h3 { margin: 0 0 .8mm; font-size: inherit; }
  .payment-row-shell { min-height: 0; padding: 1mm; border: .7px solid var(--v3-line); border-radius: var(--v3-radius); }
  .payment-row { min-height: 0; display: grid; grid-template-columns: 1fr 1fr 1.55fr; gap: 1.5mm; }
  .finance-card { min-width: 0; border: .7px solid var(--v3-line); border-radius: 1.7mm; overflow: hidden; }
  .finance-card h2 { min-height: 7mm; margin: 0; padding: 1mm 1.5mm; display: flex; align-items: center; gap: 2mm; color: var(--v3-red); background: linear-gradient(90deg, var(--v3-pink), #fff); font-size: 8px; text-transform: uppercase; }
  .finance-card h2 .icon { width: 6.5mm; height: 6.5mm; padding: 1.25mm; }
  .payment-lines { padding: 1.5mm 2.2mm; }
  .payment-line { min-height: 6mm; padding: .8mm 0; display: grid; grid-template-columns: 45% 55%; align-items: center; border-bottom: .5px solid var(--v3-line); font-size: 7.2px; line-height: 1.25; }
  .payment-line:last-child { border-bottom: 0; }
  .payment-line span { color: var(--v3-red); text-align: right; font-size: 7.4px; font-weight: 700; }
  .cost-total { margin: 0 -1mm; padding: 1.8mm 1mm; border-radius: 1mm; background: var(--v3-pink); font-size: 8.8px; }
  .debit-copy { min-height: 12mm; padding: 1.5mm; font-size: 7px; line-height: 1.15; overflow-wrap: anywhere; }
  .debit-type { min-height: 5mm; padding: 0 1.5mm; display: flex; align-items: center; gap: 1mm; white-space: nowrap; font-size: 6.8px; }
  .debit-box { width: 3.3mm; height: 3.3mm; border: .65px solid var(--v3-muted); }
  .debit-bank { margin: .8mm 1.5mm; padding: .8mm 0; min-height: 4mm; border-bottom: .65px solid var(--v3-line); text-align: right; color: var(--v3-muted); }
  .debit-line { min-height: 4.5mm; padding: 0 1.5mm; display: grid; grid-template-columns: 15mm 1fr; align-items: center; font-size: 6.8px; }
  .debit-line i { height: 4mm; border: .65px solid var(--v3-muted); border-radius: .7mm; }
  .collection-clause .section-heading { color: var(--v3-red); background: linear-gradient(90deg, var(--v3-pink), #fff); }
  .collection-clause .legal-paragraph { margin: 0; font-size: 7px; line-height: 1.15; overflow-wrap: anywhere; }
  .observations { min-height: 0; }
  .observation-value { min-height: 4mm; padding: 1mm; font-size: 8px; line-height: 1.3; overflow-wrap: anywhere; white-space: normal; }
  .writing-line { height: 2.5mm; margin: 0 2.5mm; border-top: .6px dashed var(--v3-muted); }
  .signatures { min-height: 0; }
  .signature-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; padding: 1mm; }
  .signature { min-width: 0; padding: 1mm 1.5mm; border-right: .6px solid var(--v3-line); font-size: 7.4px; line-height: 1.25; }
  .signature:last-child { border-right: 0; }
  .signature-space { height: 8mm; }
  .signature-line { border-top: .8px solid var(--v3-ink); }
  .signature-label { margin-top: 1mm; text-align: center; font-weight: 700; }
  .signature-detail { margin-top: .9mm; overflow-wrap: anywhere; white-space: normal; }
  .digital-delivery { min-height: 12mm; padding: 2.2mm 2.8mm; display: grid; grid-template-columns: 1fr auto; align-items: center; border-top: .6px solid var(--v3-line); font-size: 7.4px; line-height: 1.25; }
  .digital-choice { display: inline-flex; align-items: center; gap: 1mm; white-space: nowrap; }
  .digital-choice i { width: 3.5mm; height: 3.5mm; border: .65px solid var(--v3-muted); }
  .digital-delivery-row--email { grid-column: 1 / -1; display: grid; grid-template-columns: auto 1fr; gap: 1mm; }
  .digital-email-value { min-width: 0; overflow-wrap: anywhere; white-space: normal; border-bottom: .6px dotted var(--v3-muted); }
  .proposal-eco-row { min-height: 10mm; padding: 1.5mm 2mm; display: grid; grid-template-columns: minmax(0, 1.55fr) auto .6px minmax(30mm, .95fr); align-items: center; column-gap: 2.2mm; border-top: .6px solid var(--v3-line); font-size: 7.4px; line-height: 1.25; break-inside: avoid; page-break-inside: avoid; }
  .proposal-eco-message { min-width: 0; display: flex; align-items: center; gap: 1.5mm; }
  .proposal-eco-icon { flex: none; width: 6mm; height: 6mm; display: inline-grid; place-items: center; color: var(--v3-red); }
  .proposal-eco-icon svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
  .proposal-eco-text { min-width: 0; overflow-wrap: anywhere; }
  .proposal-eco-options { display: flex; align-items: center; justify-content: center; gap: 1.8mm; white-space: nowrap; }
  .proposal-eco-option { display: inline-flex; align-items: center; gap: .9mm; white-space: nowrap; }
  .proposal-checkbox { flex: none; width: 3.5mm; height: 3.5mm; border: .65px solid var(--v3-muted); }
  .proposal-eco-divider { width: .6px; height: 8mm; background: var(--v3-line); }
  .proposal-eco-email { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: baseline; column-gap: 1mm; }
  .proposal-eco-email-label { white-space: nowrap; }
  .proposal-eco-email-value { min-width: 0; overflow-wrap: anywhere; white-space: normal; }
  .proposal-eco-email-line { grid-column: 2; min-width: 0; border-bottom: .6px dotted var(--v3-muted); }
  .proposal-footer { margin-top: auto; min-height: 13mm; padding: 0 2mm; display: flex; align-items: flex-end; justify-content: space-between; border: 0; color: var(--v3-red); font-size: 7.8px; font-weight: 700; }
  .proposal-footer .footer-brand { display: flex; flex-direction: column; align-items: flex-start; }
  .proposal-footer small { display: block; margin-top: .9mm; color: var(--v3-muted); font-size: 7px; font-weight: 400; }
  .footer-version { color: var(--v3-muted); font-size: 7px; font-weight: 400; align-self: flex-end; }
  .footer-slogan { display: block; width: 34mm; height: 13mm; margin-right: 1mm; object-fit: contain; }
  [data-fit-section] { overflow: visible; }
  .fit-box--overflow { outline: 1px solid var(--v3-red); }
`

const ICON_PATHS = {
  document:
    '<path d="M5 2.5h8l4 4V21H5z" fill="none"/><path d="M13 2.5V7h4M8 11h6M8 14h6M8 17h4" fill="none"/>',
  calendar:
    '<rect x="3" y="4.5" width="18" height="16" rx="2" fill="none"/><path d="M7 2.5v4M17 2.5v4M3 9h18M7 12h3M12 12h3M7 16h3" fill="none"/>',
  clock: '<circle cx="12" cy="12" r="8.5" fill="none"/><path d="M12 7v5l3.5 2" fill="none"/>',
  edit: '<path d="m4 16.8-.8 4 4-.8L19.5 7.7l-3.2-3.2z" fill="none"/><path d="m14.8 5.8 3.2 3.2" fill="none"/>',
  play: '<circle cx="12" cy="12" r="8.5"/><path d="m10 8 6 4-6 4z" fill="#fff" stroke="none"/>',
  square: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
  badge:
    '<rect x="4" y="3" width="16" height="18" rx="2" fill="none"/><path d="M8 8h8M8 12h8M8 16h5" fill="none"/>',
  person: '<circle cx="12" cy="8" r="3.2"/><path d="M5 20c.7-4 3-6 7-6s6.3 2 7 6" fill="none"/>',
  pin: '<path d="M12 21s6-5.6 6-11a6 6 0 1 0-12 0c0 5.4 6 11 6 11z" fill="none"/><circle cx="12" cy="10" r="2"/>',
  home: '<path d="m3 11 9-8 9 8v9H3z" fill="none"/><path d="M9 20v-5h6v5" fill="none"/>',
  briefcase:
    '<rect x="3" y="7" width="18" height="13" rx="2" fill="none"/><path d="M8 7V5h8v2M3 12h18M10 12v2h4v-2" fill="none"/>',
  shield:
    '<path d="M12 3 19 6v5c0 4.8-3 8.2-7 10-4-1.8-7-5.2-7-10V6z" fill="none"/><path d="m9 12 2 2 4-4" fill="none"/>',
  coins:
    '<ellipse cx="12" cy="7" rx="7" ry="3" fill="none"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" fill="none"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2" fill="none"/><path d="M3 10h18M7 15h4" fill="none"/>',
  comment: '<path d="M4 5h16v11H9l-5 4z" fill="none"/><path d="M8 9h8M8 12h5" fill="none"/>',
  pen: '<path d="m4 20 1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z" fill="none"/><path d="m14.5 6.5 3 3" fill="none"/>',
  leaf: '<path d="M20 4C9 4 4 9 4 16c0 2 1 4 1 4s2-1 4-1c7 0 11-5 11-15z" fill="none"/><path d="M5 20 16 9" fill="none"/>',
}

function icon(name) {
  return `<span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24">${ICON_PATHS[name] ?? ICON_PATHS.document}</svg></span>`
}

function headerCell(iconName, label, value, placement) {
  return `<div class="header-cell header-cell--${placement}">${icon(iconName)}<span class="header-copy"><b>${label}</b><span>${value}</span></span></div>`
}

function pageHeader(snapshot, pageNumber, logoSrc, headerBackgroundDataUri) {
  const { proposal, carta } = snapshot
  const headerStyle = headerBackgroundDataUri
    ? ` style="--v3-header-photo: url(data:image/png;base64,${headerBackgroundDataUri.split(',')[1] ?? ''})"`
    : ''
  return `
    <header class="proposal-header"${headerStyle}>
      <div class="brand">${brandMark(logoSrc)}</div>
      <div class="proposal-title"><strong>Propuesta para seguro</strong><span>Aseguradora Tajy Prop.Coop. S.A.</span></div>
      <div class="header-page">Página ${pageNumber} de 2</div>
    </header>
    <section class="header-meta">
      ${headerCell('document', 'Propuesta N.°', text(proposal.numero_propuesta), 'proposal')}
      ${headerCell('calendar', 'Fecha de Emisión', text(fmtFecha(proposal.emitida_at, carta.render_context)), 'issue-date')}
      ${headerCell('clock', 'Vigencia', UNAVAILABLE, 'validity')}
      ${headerCell('clock', 'Hasta', UNAVAILABLE, 'until')}
      ${headerCell('edit', 'Propuesta de Renovación a la Póliza', UNAVAILABLE, 'renewal')}
      ${headerCell('play', 'Hora Inicio', UNAVAILABLE, 'start')}
      ${headerCell('square', 'Hora Fin', UNAVAILABLE, 'end')}
      ${headerCell('badge', 'Póliza Nro.', UNAVAILABLE, 'policy')}
    </section>`
}

function datum(label, value) {
  return `<div class="datum"><b>${label}</b><span>${value}</span></div>`
}

// El "+595" del formulario es solo el prefijo decorativo del input — nunca se persiste
// en draft_json.telefono (ver phoneField() en frontend/propuestas/propuestas.js). Acá
// se antepone el "0" de la numeración local paraguaya para el documento impreso.
function celular(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  const local = digits.length > 9 ? digits.slice(-9) : digits
  if (!local) return null
  const grouped = [local.slice(0, 3), local.slice(3, 6), local.slice(6, 9)]
    .filter(Boolean)
    .join('-')
  return `0${grouped}`
}

function insuredPanel(insured, proposer, draft) {
  return `
    <section class="card insured-card">
      <h1 class="section-heading">${icon('person')}Datos del asegurado</h1>
      <div class="insured-body">
        <div class="insured-column">
          ${datum('Nombre / Razón Social', text(insured.nombre_razon_social))}
          ${datum('Nacionalidad', text(insured.nacionalidad))}
          ${datum('Estado civil', text(insured.estado_civil))}
          ${datum('Monto ingreso mensual', money(insured.ingreso_mensual))}
          ${datum('Proveedor del Estado', booleanChoice(draft.pla_ft?.proveedor_estado))}
          <div class="insured-annex">(En caso que el asegurado sea distinto al tomador, completar el anexo 1)</div>
        </div>
        <div class="insured-column">
          ${datum('Sexo', text(insured.sexo))}
          ${datum('Fec. Nac.', text(insured.fecha_nacimiento))}
          ${datum('C.I. / Documento', text(insured.documento))}
          ${datum('R.U.C.', text(insured.ruc))}
          ${datum('E-mail', text(insured.email))}
          ${datum('Ocupación', text(insured.ocupacion))}
          ${datum('Lugar de trabajo', text(insured.lugar_trabajo))}
          ${datum('Celular', text(celular(insured.telefono)))}
        </div>
      </div>
      <div class="address-row">
        <div class="address-card"><strong>${icon('briefcase')}Dirección Comercial</strong><p>${text(proposer.direccion)}<br />Ciudad: ${text(proposer.ciudad)} &nbsp;&nbsp; Tel.: ${text(celular(proposer.telefono ?? insured.telefono))}</p></div>
        <div class="address-card"><strong>${icon('pin')}Dirección Particular</strong><p>${text(insured.direccion)}<br />Ciudad: ${text(insured.ciudad)} &nbsp;&nbsp; Tel.: ${text(celular(insured.telefono))}</p></div>
      </div>
      <div class="pep-row">
        <strong class="pep-label">${icon('briefcase')}<span>Ha desempeñado cargo público nacional o extranjero</span></strong>
        <span>${booleanChoice(draft.pla_ft?.es_pep)}</span>
        ${datum('Institución', text(draft.pla_ft?.pep_institucion))}
        ${datum('Cargo', text(draft.pla_ft?.pep_cargo))}
        ${datum('Período', text(draft.pla_ft?.pep_periodo))}
      </div>
    </section>`
}

function coverageSummaryV3(coverages) {
  if (!coverages.length) {
    return `<ul class="coverage-summary"><li class="coverage-summary-item"><span class="coverage-summary-inline">${UNAVAILABLE}</span></li></ul>`
  }

  return `<ul class="coverage-summary">${coverages
    .map((coverage) => {
      const name =
        coverage.nombre_snapshot == null || coverage.nombre_snapshot === ''
          ? UNAVAILABLE
          : coverage.nombre_snapshot
      const franchise = coverage.franquicia == null ? 'Sin deducible' : money(coverage.franquicia)
      return `<li class="coverage-summary-item"><span class="coverage-summary-inline">${text(`- ${name}: Hasta ${money(coverage.monto)} · Franquicia: ${franchise}`)}</span></li>`
    })
    .join('')}</ul>`
}

function riskTable(draft, risk, coverages, totalCoverage, premium) {
  return `
    <section class="card coverage-card">
      <h2 class="section-heading">${icon('document')}Detalle de cobertura</h2>
      <div class="risk-table">
        <div class="risk-columns risk-columns--head"><span>Art.</span><span>Descripción</span><span>Suma Asegurada Gs.</span><span>Prima Gs.</span></div>
        <div class="risk-columns risk-columns--body"><span>1</span><div class="risk-description fit-box" data-fit-section="risk-description" data-fit-target="8" data-fit-minimum="6.4" data-fit-step="0.2"><p>${text(draft.descripcion_detallada)}</p><b>UBICACIÓN DEL RIESGO:</b><br />${text(risk.direccion)}${risk.ciudad ? `, ${text(risk.ciudad)}` : ''}<br /><b>DETALLE DE SUMAS ASEGURADAS:</b>${coverageSummaryV3(coverages)}</div><b>${money(totalCoverage)}</b><b>${money(premium)}</b></div>
        <div class="risk-columns risk-columns--total"><span></span><b>TOTAL SUMA ASEGURADA</b><b>${money(totalCoverage)}</b><b>${money(premium)}</b></div>
      </div>
    </section>`
}

function paymentLine(label, value, className = '') {
  return `<div class="payment-line ${className}"><b>${label}</b><span>${value}</span></div>`
}

function debitAuthorization() {
  return `<section class="finance-card debit-card"><h2>${icon('card')}Autorización de débito</h2><div class="debit-copy">En mi carácter de titular de cuenta autorizo irrevocablemente a debitar de mi Tarjeta de Crédito indicada más abajo el importe correspondiente a las cuotas de la póliza emitida por ASEGURADORA TAJY a mi favor, según la opción indicada más arriba.</div><div class="debit-type">Tipo: <i class="debit-box"></i> Visa <i class="debit-box"></i> Mastercard <i class="debit-box"></i> Cuenta Corriente</div><div class="debit-bank">${UNAVAILABLE}</div><div class="debit-line"><span>Número:</span><i></i></div><div class="debit-line"><span>Vencimiento:</span><i></i></div></section>`
}

function signature(label, name, details) {
  const detailMarkup = details
    .map((detail) => {
      if (typeof detail === 'string') return `<div class="signature-detail">${text(detail)}</div>`
      return `<div class="signature-detail">${text(detail.label)}: ${text(detail.value)}</div>`
    })
    .join('')
  return `<div class="signature"><div class="signature-space"></div><div class="signature-line"></div><div class="signature-label">${text(label)}</div><div class="signature-detail">Aclaración: ${text(name)}</div>${detailMarkup}</div>`
}

function digitalPolicyForm(email) {
  return `<section class="proposal-eco-row"><div class="proposal-eco-message"><span class="proposal-eco-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 4C9 4 4 9 4 16c0 2 1 4 1 4s2-1 4-1c7 0 11-5 11-15z"></path><path d="M5 20 16 9"></path></svg></span><span class="proposal-eco-text">En apoyo a la ecología deseo recibir mi póliza en formato digital:</span></div><div class="proposal-eco-options"><span class="proposal-eco-option"><span>SI</span><i class="proposal-checkbox"></i></span><span class="proposal-eco-option"><span>NO</span><i class="proposal-checkbox"></i></span></div><span class="proposal-eco-divider" aria-hidden="true"></span><div class="proposal-eco-email"><span class="proposal-eco-email-label">E-mail:</span><span class="proposal-eco-email-value">${text(email)}</span><span class="proposal-eco-email-line" aria-hidden="true"></span></div></section>`
}

// Document template version, not the business proposal record's own numero_propuesta.
// Bump this by hand whenever the approved v3 layout/content structure changes.
const PROPOSAL_DOCUMENT_VERSION = '1.0.1'

function footer(footerSloganDataUri) {
  const slogan = footerSloganDataUri
    ? `<img class="footer-slogan" src="${footerSloganDataUri}" alt="Seguros para un mejor mañana" />`
    : ''
  return `<footer class="proposal-footer"><span class="footer-brand">ASEGURADORA TAJY PROP.COOP. S.A.<small>Protegemos lo que te importa</small></span><span class="footer-version">Ver.: ${escapeHtml(PROPOSAL_DOCUMENT_VERSION)}</span>${slogan}</footer>`
}

export function buildMrcPropuestaV3Html(
  snapshot,
  { tajyLogoDataUri = null, headerBackgroundDataUri = null, footerSloganDataUri = null } = {}
) {
  const { proposal, carta, commercial, draft, texts = {} } = snapshot
  const insured = draft.partes?.asegurado ?? {}
  const proposer = draft.partes?.tomador_igual_asegurado ? insured : (draft.partes?.tomador ?? {})
  const cardholder = draft.partes?.titular_tarjeta ?? draft.titular_tarjeta ?? null
  const cardholderName = cardholder?.nombre_razon_social
  const cardholderDocument = cardholder?.documento
  const insuredName = insured.nombre_razon_social ?? proposer.nombre_razon_social
  const insuredDocument = insured.documento ?? proposer.documento
  const risk = carta.riesgo_datos ?? {}
  const payment = commercial.plan_pago ?? {}
  const coverages = carta.coberturas ?? []
  const totalCoverage = coverages.length
    ? coverages.reduce((total, coverage) => total + (Number(coverage.monto) || 0), 0)
    : null
  const declarations = declarationFlow(texts.declaraciones_generales?.contenido, { lead: true })
  const funds = declarationFlow(texts.declaracion_jurada_origen_fondos?.contenido)
  const authorizations = declarationFlow(texts.autorizaciones_tomador_poliza_digital?.contenido)
  const collectionText = String(texts.clausula_adicional_cobranzas?.contenido ?? '')
    .replace(/CL[ÁA]USULA[\s._-]*ADICIONAL[\s._-]*DE[\s._-]*COBRANZAS/giu, '')
    .trimStart()

  const pageOne = `<article class="proposal-page proposal-page--one">
    ${pageHeader(snapshot, 1, tajyLogoDataUri, headerBackgroundDataUri)}
    ${insuredPanel(insured, proposer, draft)}
    <section class="modality">${icon('shield')}<div><b>Modalidad de la Cobertura Solicitada : 1020</b><small>RIESGOS VARIOS / MULTIRRIESGO COMERCIO</small></div></section>
    ${riskTable(draft, risk, coverages, totalCoverage, commercial.variante?.prima)}
    <div class="coverage-bottom">
      <section class="card declarations-box"><h2 class="section-heading">${icon('document')}Declaraciones</h2><div class="conditions-flow fit-flex fit-box" data-fit-section="declarations" data-fit-target="8" data-fit-minimum="6" data-fit-step="0.2">${declarations}${funds}${authorizations}</div></section>
    </div>
    ${footer(footerSloganDataUri)}
  </article>`

  const pageTwo = `<article class="proposal-page proposal-page--two">
    ${pageHeader(snapshot, 2, tajyLogoDataUri, headerBackgroundDataUri)}
    <div class="page-two-content">
      <section class="card conditions-box"><h2 class="section-heading">${icon('document')}Condiciones</h2><div class="conditions-flow fit-flex fit-box" data-fit-section="conditions" data-fit-target="8" data-fit-minimum="4.6" data-fit-step="0.2">${legalFlowV3(texts.condiciones_mrc?.contenido)}</div></section>
      <section class="card principal-coverages-box"><h2 class="section-heading">${icon('shield')}Coberturas principales</h2><div class="conditions-flow fit-flex fit-box" data-fit-section="principal-coverages" data-fit-target="8" data-fit-minimum="4.8" data-fit-step="0.2">${principalCoveragesFlowV3(texts.coberturas_principales?.contenido)}</div></section>
      <div class="payment-row-shell"><div class="payment-row">
        <section class="finance-card"><h2>${icon('coins')}Costo del seguro</h2><div class="payment-lines">${paymentLine('Prima:', money(commercial.variante?.prima))}${paymentLine('R.P.F.:', money(payment.rpf_monto))}${paymentLine('Sub-Total:', [commercial.variante?.prima, payment.rpf_monto].every((value) => value != null && value !== '' && Number.isFinite(Number(value))) ? money(Number(commercial.variante.prima) + Number(payment.rpf_monto)) : UNAVAILABLE)}${paymentLine('I.V.A.:', money(payment.iva_monto))}${paymentLine('Costo Total:', money(payment.premio_total), 'cost-total')}</div></section>
        <section class="finance-card"><h2>${icon('card')}Forma de pago</h2><div class="payment-lines">${paymentLine('Modalidad:', text(payment.formas_pago?.nombre_display))}${paymentLine('Inicial:', money(payment.monto_inicial))}${paymentLine('Cuotas:', payment.monto_cuota ? `${text(payment.cantidad_cuotas)} cuotas de ${money(payment.monto_cuota)}` : 'Contado')}</div></section>
        ${debitAuthorization()}
      </div></div>
      <section class="card collection-clause"><h2 class="section-heading">${icon('document')}Cláusula adicional de cobranzas</h2><div class="conditions-flow fit-flex fit-box" data-fit-section="collection-clause" data-fit-target="7.5" data-fit-minimum="4.8" data-fit-step="0.1">${legalFlowV3(collectionText)}</div></section>
      <section class="card observations"><h2 class="section-heading">${icon('comment')}Observaciones</h2><div class="observation-value">${text(draft.observaciones, ' ')}</div><div class="writing-line"></div><div class="writing-line"></div><div class="writing-line"></div></section>
      <section class="card signatures"><h2 class="section-heading">${icon('pen')}Firmas</h2><div class="signature-grid">${signature('Firma del Agente', proposal.agente?.nombre, [{ label: 'Matrícula Nro.', value: proposal.agente?.matricula }, 'Lugar y Fecha:'])}${signature('Firma del Titular de la Tarjeta', cardholderName, [{ label: 'Nro de C.I.', value: cardholderDocument }])}${signature('Firma del Titular del Seguro', insuredName, [{ label: 'Nro de C.I.', value: insuredDocument }])}</div>${digitalPolicyForm(insured.email)}</section>
    </div>
    ${footer(footerSloganDataUri)}
  </article>`

  return `<!doctype html>
<html lang="es" data-proposal-design="v3" data-proposal-fit="pending">
<head><meta charset="utf-8" /><style>${PROPUESTA_FORMAL_V3_STYLE}</style></head>
<body>${pageOne}${pageTwo}</body>
<script>
  (() => {
    const isOverflowing = (element) => element.scrollHeight > element.clientHeight + 0.5 || element.scrollWidth > element.clientWidth + 0.5
    const hasCoverageVisualOverflow = () => {
      const coverageCard = document.querySelector('.coverage-card')
      const coverageBottom = document.querySelector('.coverage-bottom')
      if (!coverageCard || !coverageBottom) return false

      const coverageRect = coverageCard.getBoundingClientRect()
      const followingRect = coverageBottom.getBoundingClientRect()
      return [...coverageCard.querySelectorAll('*')].some((descendant) => {
        const rect = descendant.getBoundingClientRect()
        const extendsBeyondCard =
          rect.top < coverageRect.top - 0.5 ||
          rect.right > coverageRect.right + 0.5 ||
          rect.bottom > coverageRect.bottom + 0.5 ||
          rect.left < coverageRect.left - 0.5
        const extendsIntoFollowingContent = rect.bottom > followingRect.top + 0.5 && rect.top < followingRect.bottom
        return extendsBeyondCard || extendsIntoFollowingContent
      })
    }
    const fitSections = async () => {
      await document.fonts.ready
      await new Promise((resolve) => requestAnimationFrame(resolve))
      // Two passes: sibling fit-flex boxes share one flex-allocated budget, so shrinking
      // the first box measured in pass 1 frees space for the next ones (DOM order bias).
      // Pass 2 re-measures every box from its target size now that every sibling's pass-1
      // final size is already locked in, so a box that was measured first (and therefore
      // squeezed against still-full-size neighbors) can claim the space they gave back.
      let metrics = []
      for (let pass = 1; pass <= 2; pass += 1) {
        metrics = []
        for (const element of document.querySelectorAll('[data-fit-section]')) {
          const target = Number(element.dataset.fitTarget)
          const minimum = Number(element.dataset.fitMinimum)
          const step = Number(element.dataset.fitStep)
          let size = target
          element.style.fontSize = size + 'px'
          const targetMeasurement = { scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }
          while (isOverflowing(element) && size > minimum) {
            size = Math.max(minimum, Number((size - step).toFixed(2)))
            element.style.fontSize = size + 'px'
          }
          const overflow = isOverflowing(element)
          element.dataset.fitStatus = overflow ? 'overflow' : size < target ? 'reduced' : 'target'
          element.dataset.fitOverflow = String(overflow)
          element.dataset.fitFinal = size.toFixed(2)
          element.classList.toggle('fit-box--overflow', overflow)
          metrics.push({ section: element.dataset.fitSection, target, minimum, step, final: size, status: element.dataset.fitStatus, overflow, targetMeasurement, finalMeasurement: { scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth } })
        }
      }
      window.__proposalFitMetrics = metrics
      let pageOverflow = hasCoverageVisualOverflow()
      for (const page of document.querySelectorAll('.proposal-page')) {
        if (isOverflowing(page)) pageOverflow = true
      }
      if (pageOverflow) {
        window.__proposalFitError = 'page-overflow'
        document.documentElement.dataset.proposalFit = 'error'
        return
      }
      document.documentElement.dataset.proposalFit = 'complete'
    }
    window.__proposalFitPromise = fitSections().catch((error) => { window.__proposalFitError = String(error && error.message ? error.message : error); document.documentElement.dataset.proposalFit = 'error' })
  })()
</script>
</html>`
}
