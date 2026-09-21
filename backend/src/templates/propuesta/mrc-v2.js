import { buildMrcPropuestaHtml } from './mrc.js'

// V2 keeps the approved proposal content and form semantics intact while moving the visual
// language to the Carta Oferta system: Tajy red bars, neutral table rows and compact cards.
export const PROPUESTA_FORMAL_V2_STYLE = `
  @page { size: Legal; margin: 0; }
  :root {
    --v2-red: #d8132e;
    --v2-deep-red: #7a0f11;
    --v2-ink: #1a1a1a;
    --v2-muted: #6f6f6f;
    --v2-line: #dedede;
    --v2-soft: #f4f3f1;
    --v2-soft-red: #fbeaea;
  }
  body {
    color: var(--v2-ink);
    background: #fff;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 8.2px;
  }
  .proposal-page {
    position: relative;
    width: 215.9mm;
    height: 355.6mm;
    padding: 0 10mm 12mm;
    background: #fff;
  }
  .proposal-page::before {
    content: '';
    display: block;
    height: 20mm;
    margin: 0 -10mm 5mm;
    background: var(--v2-red);
  }
  .proposal-header {
    position: absolute;
    top: 0;
    left: 10mm;
    right: 10mm;
    height: 20mm;
    display: grid;
    grid-template-columns: 34mm 1fr 24mm;
    align-items: center;
    color: #fff;
  }
  .brand { padding-left: 0; transform: none; }
  .tajy-logo { max-width: 24mm; max-height: 15mm; filter: brightness(0) invert(1); }
  .tajy-logo-fallback { color: #fff; }
  .tajy-logo-fallback small,
  .tajy-logo-fallback span { color: rgba(255, 255, 255, .78); }
  .tajy-logo-fallback strong { font-size: 21px; }
  .proposal-title {
    display: grid;
    gap: 1.3mm;
    transform: none;
    text-align: center;
    font-size: 13px;
    letter-spacing: .08mm;
  }
  .proposal-title strong { font-weight: 700; }
  .proposal-title span { color: #fff; font-size: 9px; letter-spacing: .3mm; }
  .header-page {
    justify-self: end;
    align-self: center;
    margin: 0;
    padding: 0;
    color: #fff;
    font-size: 8.5px;
    font-weight: 700;
  }
  .header-rule,
  .header-dash { display: none; }
  .header-meta {
    height: auto;
    margin-bottom: 3mm;
    padding: 2mm 2.5mm;
    border: 1px solid var(--v2-line);
    border-left: 3px solid var(--v2-red);
    background: var(--v2-soft);
    color: var(--v2-ink);
    font-size: 7px;
  }
  .header-meta-row--primary,
  .header-meta-row--secondary { height: 4mm; }
  .header-cell {
    border-right: 1px solid var(--v2-line);
    border-bottom: 0;
    padding: .5mm 1.5mm;
  }
  .header-cell:last-child { border-right: 0; }
  .header-cell b { color: var(--v2-red); font-weight: 700; }
  .insured-panel { margin-top: 0; font-size: 7.2px; }
  .insured-panel h1,
  .contract-section h2,
  .observations h2,
  .cost-box h2,
  .payment-box h2 {
    background: var(--v2-red);
    color: #fff;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .12mm;
  }
  .insured-panel h1 {
    height: 6mm;
    padding: 1.5mm 2.2mm;
    font-size: 8.5px;
  }
  .insured-grid {
    border: 1px solid var(--v2-line);
    border-top: 0;
    background: #fff;
  }
  .insured-field,
  .insured-annex { padding: .8mm 1mm; }
  .insured-field b { color: var(--v2-muted); }
  .check-box { border-color: var(--v2-red); color: var(--v2-red); }
  .modality {
    height: auto;
    min-height: 8mm;
    margin-top: 3mm;
    padding: 2mm 2.2mm;
    border: 0;
    background: var(--v2-soft-red);
    color: var(--v2-deep-red);
    font-size: 9px;
    line-height: 1.2;
  }
  .risk-table,
  .contract-stack,
  .conditions-box,
  .payment-row-shell,
  .collection-clause,
  .observations,
  .signatures,
  .digital-delivery {
    border-color: var(--v2-line);
  }
  .risk-table { margin-top: 2mm; border-top: 1px solid var(--v2-line); }
  .risk-columns--head,
  .risk-columns--total { background: var(--v2-soft); color: var(--v2-ink); }
  .risk-columns--head { height: 7mm; font-size: 8px; }
  .risk-columns--body { height: 46mm; border-top-color: var(--v2-line); }
  .risk-columns--total { height: 8mm; border-top-color: var(--v2-line); }
  .risk-columns > * { border-right-color: var(--v2-line); }
  .risk-columns--body > b { color: var(--v2-deep-red); }
  .risk-description { font-family: Arial, Helvetica, sans-serif; font-size: 8px; line-height: 1.2; }
  .contract-stack {
    flex: 0 0 175mm;
    height: 175mm;
    margin-top: 3mm;
    border: 1px solid var(--v2-line);
    border-radius: 2mm;
    overflow: hidden;
  }
  .declarations-stack {
    height: 77mm;
    padding: 2mm 2.5mm;
    background: #fff;
    font-size: 7.2px;
    line-height: 1.2;
  }
  .contract-section--coverage {
    padding: 0 2.5mm 2mm;
    font-size: 8px;
    line-height: 1.25;
  }
  .contract-section--coverage h2 {
    margin: 0 -2.5mm 2mm;
    padding: 1.5mm 2.5mm;
  }
  .conditions-box {
    height: 100mm;
    margin-top: 3mm;
    padding: 3mm;
    border: 1px solid var(--v2-line);
    border-radius: 2mm;
    background: #fff;
    font-size: 8.2px;
    line-height: 1.3;
  }
  .payment-row-shell {
    height: 31mm;
    margin-top: 3mm;
    border: 1px solid var(--v2-line);
    border-radius: 2mm;
  }
  .cost-box h2,
  .payment-box h2 { border-bottom-color: var(--v2-line); }
  .payment-line { border-top-color: var(--v2-line); }
  .payment-line span { color: var(--v2-deep-red); font-weight: 700; }
  .collection-clause {
    height: 19mm;
    margin-top: 3mm;
    padding: 2mm 2.5mm;
    border: 1px solid var(--v2-line);
    border-radius: 2mm;
    font-size: 7.5px;
  }
  .collection-clause h2 { color: #fff; }
  .observations { height: 18mm; margin-top: 3mm; border-radius: 2mm; }
  .observations h2 { height: 6mm; padding: 1.5mm 2.5mm; }
  .signatures { height: 22mm; margin-top: 3mm; border-radius: 2mm; }
  .digital-delivery { height: 9mm; border-radius: 0 0 2mm 2mm; }
  .proposal-footer {
    margin: 4mm -10mm -12mm;
    margin-top: auto;
    padding: 2.5mm 10mm;
    border: 0;
    background: var(--v2-red);
    color: #fff;
    font-size: 8px;
  }
  .proposal-page--two .proposal-footer { transform: none; }
  .proposal-footer span:first-child,
  .proposal-footer span:last-child { transform: none; }
  .header-cell,
  .risk-columns > *,
  .payment-line,
  .writing-line,
  .signature-line,
  .signature:nth-child(3)::before,
  .debit-box,
  .debit-bank,
  .debit-line i,
  .motive-writing-line { border-color: var(--v2-line); }
`

export function buildMrcPropuestaV2Html(snapshot, options = {}) {
  const html = buildMrcPropuestaHtml(snapshot, options)
  const withPageSize = html.replace(
    '@page { size: A4; margin: 0; }',
    '@page { size: Legal; margin: 0; }'
  )
  return withPageSize
    .replace('</style>', `${PROPUESTA_FORMAL_V2_STYLE}\n</style>`)
    .replace(
      '<html lang="es" data-proposal-fit="pending">',
      '<html lang="es" data-proposal-design="v2" data-proposal-fit="pending">'
    )
}
