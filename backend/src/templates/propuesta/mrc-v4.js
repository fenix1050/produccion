import { escapeHtml, fmtFecha, fmtGs } from '../oferta/layout.js'

import { UNAVAILABLE, brandMark, declarationFlow, money, text } from './mrc.js'

// ---------------------------------------------------------------------------------------
// Propuesta Formal MRC, renderer v4 ("minimalist" redesign).
//
// Page contract consumed by the pagination step (task T7, written separately):
//   * Each topic is `<article class="proposal-page" data-topic="<id>">`, fixed 210mm x 297mm
//     with `overflow: hidden`. Topic ids, in order: cover, coverage, declarations,
//     conditions, payment.
//   * Inside every page: a header, `<div class="page-body">`, and the footer.
//   * Every DIRECT child of `.page-body` is an atomic block marked `data-block`. Long flowing
//     content (paragraphs, table rows, list items) is emitted as separate sibling blocks so a
//     continuation page can pick up between blocks without cutting a paragraph. Headings carry
//     `data-keep-with-next` so the paginator can avoid stranding them at the bottom.
//   * Continuation header: use the pure helper `renderContinuationHeader({ topic, number,
//     logo })`. It returns the same compact header markup pages 2-5 use, marked with
//     `data-continuation`. (A `<template>` is intentionally NOT embedded in the document.)
//   * Footer page numbers are `<span data-page-number>` / `<span data-page-total>` pre-filled
//     with static defaults (index within the 5 base pages / 5); the paginator recomputes them.
// ---------------------------------------------------------------------------------------

export const MRC_V4_TOPICS = ['cover', 'coverage', 'declarations', 'conditions', 'payment']

const TOPIC_TAGS = {
  cover: 'Identificación · Riesgo',
  coverage: 'Coberturas · Detalle',
  declarations: 'Marco contractual · Declaraciones',
  conditions: 'Marco contractual · Condiciones',
  payment: 'Resumen económico · Aceptación',
}

// The mockup uses Inter; it is not available to the renderer (no external assets), so the
// stack falls back to the same Arial/Helvetica family the other renderers already rely on.
export const PROPUESTA_FORMAL_V4_STYLE = `
  @page { size: A4; margin: 0; }
  :root {
    --v4-red: #b31432;
    --v4-ink: #1f2b38;
    --v4-body: #3b4652;
    --v4-muted: #6b7681;
    --v4-faint: #98a1aa;
    --v4-rule: #dcdfe3;
    --v4-hairline: #eceef0;
    --v4-wash: #f5f4f1;
    --v4-slate: #243240;
    --v4-slate-mid: #5a6670;
    --v4-bar-light: #c5c9cc;
    --v4-side: 18mm;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e9ebee; }
  body {
    color: var(--v4-body);
    font-family: Arial, Helvetica, 'Liberation Sans', sans-serif;
    font-size: 8pt;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .proposal-page {
    position: relative;
    width: 210mm;
    height: 297mm;
    padding: 0 var(--v4-side);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #fff;
    page-break-after: always;
    break-after: page;
  }
  .proposal-page:last-child { page-break-after: auto; break-after: auto; }
  .proposal-page::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3mm;
    background: var(--v4-red);
  }
  .page-body { flex: 1 1 auto; min-height: 0; padding-bottom: 20mm; }

  /* Logo: always shown as supplied (red/black), never inverted. */
  .tajy-logo { display: block; width: 100%; height: auto; object-fit: contain; object-position: left top; }
  .tajy-logo-fallback { display: grid; line-height: .9; color: var(--v4-red); }
  .tajy-logo-fallback small { font-size: 6pt; font-weight: 700; letter-spacing: .12em; }
  .tajy-logo-fallback strong { font-family: cursive; font-size: 20pt; font-style: italic; }
  .tajy-logo-fallback span { display: none; }

  /* Cover header (page 1). */
  .cover-header {
    margin-top: 17mm;
    height: 34.5mm;
    display: grid;
    grid-template-columns: 29mm minmax(0, 1fr) 31.6mm;
    column-gap: 7mm;
    border-bottom: .3mm solid var(--v4-rule);
  }
  .cover-logo { width: 29mm; }
  .cover-title-block { min-width: 0; }
  .cover-eyebrow { margin: 1.6mm 0 0; font-size: 5.8pt; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; color: var(--v4-red); }
  .cover-title { margin: 2.6mm 0 0; font-size: 19.5pt; line-height: 1.2; font-weight: 700; letter-spacing: -.03em; color: var(--v4-ink); }
  .cover-title span { display: block; color: var(--v4-slate-mid); }
  .cover-subtitle { margin: 2.4mm 0 0; font-size: 6.9pt; color: var(--v4-muted); }
  .cover-number-block { padding-left: 5mm; border-left: .3mm solid var(--v4-rule); align-self: start; height: 22.2mm; display: flex; flex-direction: column; justify-content: space-between; }
  .cover-number-label { font-size: 5.1pt; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--v4-muted); }
  .cover-number { display: block; font-size: 33pt; line-height: 1; font-weight: 700; letter-spacing: -.04em; color: var(--v4-red); }
  .cover-date { font-size: 5.4pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--v4-muted); }

  /* Compact header (pages 2-5 and continuation pages). */
  .page-header {
    margin-top: 14.5mm;
    height: 14mm;
    flex: 0 0 14mm;
    display: flex;
    align-items: center;
    gap: 3.5mm;
    border-bottom: .3mm solid var(--v4-rule);
    padding-bottom: 1.5mm;
  }
  .page-header .header-logo { width: 12mm; flex: none; }
  .page-header .header-label { font-size: 6pt; letter-spacing: .16em; text-transform: uppercase; color: var(--v4-muted); }
  .page-header .header-tag { margin-left: auto; font-size: 5.8pt; letter-spacing: .16em; text-transform: uppercase; color: var(--v4-faint); }

  /* Footer. */
  .proposal-footer {
    position: absolute;
    left: var(--v4-side); right: var(--v4-side); bottom: 0;
    height: 14.6mm;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding-top: 3.3mm;
    border-top: .3mm solid var(--v4-rule);
    font-size: 5.8pt;
    letter-spacing: .06em;
    color: var(--v4-muted);
  }

  /* Meta row (vigencia / póliza / modalidad). */
  .meta-row { display: flex; padding: 4.8mm 0 5.2mm; border-bottom: .3mm solid var(--v4-rule); }
  .meta-cell { flex: 1 1 0; min-width: 0; padding-left: 4mm; border-left: .3mm solid var(--v4-rule); display: flex; flex-direction: column; gap: .9mm; }
  .meta-cell:first-child { padding-left: 0; border-left: 0; }
  .meta-label { font-size: 5.2pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--v4-muted); }
  .meta-value { font-size: 9.2pt; font-weight: 700; line-height: 1.25; color: var(--v4-ink); overflow-wrap: anywhere; }
  .meta-sub { font-size: 6pt; color: var(--v4-muted); }

  /* Numbered section headings. */
  .section-title { margin: 6.5mm 0 3mm; display: flex; align-items: center; gap: 2.8mm; font-size: 9.2pt; line-height: 1.2; font-weight: 700; color: var(--v4-ink); letter-spacing: -.01em; }
  .section-title::after { content: ''; flex: 1 1 auto; height: .3mm; margin-left: 3mm; background: var(--v4-rule); }
  .section-num { font-size: 5.8pt; font-weight: 700; letter-spacing: .06em; color: var(--v4-red); }
  .meta-row + .section-title { margin-top: 8mm; }

  /* Identification. */
  .datum-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 9mm; }
  .datum { min-height: 8.1mm; display: grid; grid-template-columns: 37.4mm minmax(0, 1fr); align-items: center; border-bottom: .3mm solid var(--v4-hairline); }
  .datum-label { font-size: 6.2pt; color: var(--v4-muted); }
  .datum-value { font-size: 7.1pt; font-weight: 700; color: var(--v4-ink); overflow-wrap: anywhere; }
  .choice-band { margin-top: 3.2mm; padding: 2.2mm 2.6mm; display: flex; align-items: center; gap: 3mm; background: var(--v4-wash); font-size: 6.4pt; color: var(--v4-body); }
  .choice-dot { width: .9mm; height: .9mm; border-radius: 50%; background: var(--v4-bar-light); }
  .cb { display: inline-block; width: 2.1mm; height: 2.1mm; margin: 0 .6mm; border: .25mm solid var(--v4-muted); vertical-align: -.3mm; position: relative; }
  .cb.on::after { content: ''; position: absolute; inset: .2mm; background: linear-gradient(to top right, transparent calc(50% - .2mm), var(--v4-ink) calc(50% - .2mm) calc(50% + .2mm), transparent calc(50% + .2mm)), linear-gradient(to bottom right, transparent calc(50% - .2mm), var(--v4-ink) calc(50% - .2mm) calc(50% + .2mm), transparent calc(50% + .2mm)); }
  .fine-print { margin: 2.2mm 0 0; font-size: 5.6pt; line-height: 1.4; color: var(--v4-faint); }

  /* Locations. */
  .location-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 9mm; }
  .location { padding: .3mm 0 .3mm 3.6mm; border-left: .6mm solid var(--v4-red); display: flex; flex-direction: column; gap: 1.2mm; }
  .location-label { font-size: 5.2pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--v4-muted); }
  .location-address { font-size: 7.1pt; color: var(--v4-ink); overflow-wrap: anywhere; }
  .location-sub { font-size: 6.2pt; color: var(--v4-muted); }

  /* Flowing body text. */
  .body-text { margin: 0 0 2.4mm; font-size: 7.1pt; line-height: 1.4; color: var(--v4-body); white-space: pre-line; overflow-wrap: anywhere; }
  .body-text strong { color: var(--v4-ink); }

  /* Dark Suma Asegurada / Prima band. */
  .total-band { margin-top: 5.5mm; display: grid; grid-template-columns: 1fr 1fr; background: var(--v4-slate); color: #fff; }
  .band-cell { padding: 5.2mm 6mm; display: flex; flex-direction: column; gap: 2mm; }
  .band-cell + .band-cell { border-left: .3mm solid var(--v4-slate-mid); }
  .band-label { font-size: 5.6pt; letter-spacing: .14em; text-transform: uppercase; color: #d7dde3; }
  .band-value { font-size: 15pt; font-weight: 700; letter-spacing: -.02em; line-height: 1.1; }

  /* Topic intro (pages 2-5). */
  .topic-intro { padding-top: 9.5mm; }
  .topic-eyebrow { margin: 0; font-size: 5.4pt; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--v4-red); }
  .topic-title { margin: 2.8mm 0 0; font-size: 19.5pt; line-height: 1.2; font-weight: 700; letter-spacing: -.03em; color: var(--v4-ink); }
  .topic-title span { display: block; color: #8b929a; }
  .topic-subtitle { margin: 3mm 0 0; font-size: 6.6pt; color: var(--v4-muted); }

  .topic-intro + .section-title { margin-top: 5.5mm; }
  .section-title + .sum-row--head { margin-top: -1.4mm; }

  /* Sums table (rows are sibling blocks so long tables can continue on another page). */
  .sum-row { display: grid; grid-template-columns: 10mm minmax(0, 1fr) auto; align-items: center; min-height: 6.4mm; padding: 0 2mm; border-bottom: .3mm solid var(--v4-hairline); font-size: 7pt; color: var(--v4-ink); }
  .sum-row--head { grid-template-columns: minmax(0, 1fr) auto; min-height: 8mm; padding: 0 2mm; border-top: .3mm solid var(--v4-slate-mid); border-bottom: .3mm solid var(--v4-rule); font-size: 5.4pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--v4-muted); }
  .sum-index { font-size: 5.8pt; color: var(--v4-faint); }
  .sum-amount, .sum-col-amount { justify-self: end; font-weight: 700; }
  .sum-row--total { grid-template-columns: minmax(0, 1fr) auto; min-height: 8.8mm; border-top: .3mm solid var(--v4-slate-mid); border-bottom: 0; background: var(--v4-wash); color: var(--v4-red); font-size: 6.6pt; font-weight: 700; text-transform: uppercase; }

  /* Bullets, distribution bars, sublimits. */
  .bullet-list { margin: 0 0 -1mm; padding: 0; list-style: none; column-count: 2; column-gap: 7mm; font-size: 6.6pt; line-height: 1.45; color: var(--v4-body); }
  .bullet-list li { position: relative; margin: 0 0 1mm; padding-left: 3mm; break-inside: avoid; overflow-wrap: anywhere; }
  .bullet-list li::before { content: ''; position: absolute; left: .3mm; top: 1.2mm; width: .9mm; height: .9mm; border-radius: 50%; background: var(--v4-red); }
  .dist { margin-top: 2mm; }
  .dist-title { display: block; font-size: 5.6pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--v4-muted); }
  .dist-labels { display: grid; margin-top: .8mm; font-size: 6.2pt; color: var(--v4-muted); }
  .dist-label:first-child { text-align: left; }
  .dist-label:last-child { text-align: right; }
  .dist-label:not(:first-child):not(:last-child) { text-align: center; }
  .dist-label b { color: var(--v4-ink); }
  .dist-bar { display: grid; height: 3.2mm; margin-top: 1.4mm; margin-bottom: 3mm; }
  .seg--red { background: var(--v4-red); }
  .seg--dark { background: var(--v4-slate-mid); }
  .seg--light { background: var(--v4-bar-light); }
  .sublimits { margin-top: 1mm; padding-top: 3mm; display: grid; grid-template-columns: 30mm minmax(0, 1fr); border-top: .3mm solid var(--v4-hairline); font-size: 6.6pt; color: var(--v4-body); }
  .sublimits-label { font-size: 5.6pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--v4-red); }
  .sublimits-list p { margin: 0 0 1.6mm; overflow-wrap: anywhere; }
  .sublimits-list b { color: var(--v4-ink); }

  /* Contract text (pages 3-5). */
  .legal-text { margin: 0 0 1.9mm; font-size: 7.8pt; line-height: 1.42; color: var(--v4-body); overflow-wrap: anywhere; hyphens: auto; }
  .legal-subheading { color: var(--v4-ink); }
  .declaration-paragraph--numbered-1, .declaration-paragraph--numbered-1-1 { margin-bottom: 2mm; font-weight: 700; color: var(--v4-ink); }
  .declaration-paragraph--numbered-1 { font-size: 6.8pt; }
  .declaration-paragraph--numbered-1-1 { font-size: 6.4pt; color: var(--v4-body); }
  .declaration-paragraph--choice { padding-left: 3.2mm; border-left: .5mm solid var(--v4-bar-light); }
  .motive-writing-line { display: inline-block; width: 18mm; border-bottom: .25mm solid var(--v4-muted); }
  .sub-heading { margin: 3.2mm 0 1.4mm; font-size: 6.8pt; line-height: 1.3; font-weight: 700; color: var(--v4-ink); }
  .bullet-item { position: relative; margin: 0 0 .5mm; padding-left: 4mm; font-size: 7.6pt; line-height: 1.4; color: var(--v4-body); overflow-wrap: anywhere; }
  .bullet-item::before { content: '•'; position: absolute; left: 1mm; top: 0; color: var(--v4-body); }
  .choice-row { margin: .5mm 0 2.4mm; padding: 2.1mm 0; display: flex; align-items: center; justify-content: space-between; gap: 4mm; border-top: .3mm solid var(--v4-rule); border-bottom: .3mm solid var(--v4-rule); font-size: 6.2pt; color: var(--v4-ink); }
  .choice-row > span::before { content: ''; display: inline-block; width: 2.1mm; height: 2.1mm; margin-right: 1.2mm; border: .25mm solid var(--v4-muted); vertical-align: -.3mm; }
  .choice-row-label { font-size: 5.4pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--v4-red); }
  .choice-row--delivery { justify-content: flex-start; gap: 10mm; }

  /* Economic summary. */
  .econ { display: grid; grid-template-columns: minmax(0, 1fr) 73.7mm; column-gap: 10.2mm; align-items: stretch; }
  .econ-row { min-height: 10mm; display: flex; align-items: center; justify-content: space-between; gap: 4mm; border-bottom: .3mm solid var(--v4-hairline); font-size: 7pt; color: var(--v4-muted); }
  .econ-value { font-weight: 700; color: var(--v4-ink); text-align: right; overflow-wrap: anywhere; }
  .cost-card { padding: 0 5mm; display: flex; flex-direction: column; justify-content: center; gap: 3mm; background: var(--v4-red); color: #fff; }
  .cost-card-label { font-size: 5.6pt; letter-spacing: .14em; text-transform: uppercase; }
  .cost-card-value { font-size: 17pt; font-weight: 700; letter-spacing: -.02em; line-height: 1.1; }
  .pay-form { display: grid; grid-template-columns: 74.6mm minmax(0, 1fr); column-gap: 5mm; align-items: start; }
  .pay-rows .econ-row { min-height: 7.2mm; }
  .debit-copy { margin: 0; font-size: 6.2pt; line-height: 1.45; color: var(--v4-body); }
  .debit-types { margin-top: 2.6mm; display: flex; gap: 4mm; font-size: 6.2pt; color: var(--v4-body); }
  .debit-line { margin-top: 2mm; min-height: 6mm; display: grid; grid-template-columns: 23mm minmax(0, 1fr); align-items: center; border-bottom: .3mm solid var(--v4-rule); font-size: 6.4pt; }
  .debit-label { font-size: 5.2pt; color: var(--v4-muted); }
  .observations { padding-top: 1mm; }
  .obs-text { margin: 0 0 1mm; font-size: 6.9pt; line-height: 1.5; color: var(--v4-body); white-space: pre-line; overflow-wrap: anywhere; }
  .obs-line { display: block; height: 4.4mm; border-bottom: .3mm dashed var(--v4-bar-light); }
  .signature-grid { margin-top: 1mm; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 6mm; }
  .signature { padding-top: 9mm; display: flex; flex-direction: column; gap: 1.1mm; }
  .signature-rule { display: block; height: .5mm; background: #a3acb4; margin-bottom: 2mm; }
  .signature-label { text-align: center; font-size: 6.4pt; font-weight: 700; color: var(--v4-ink); margin-bottom: 1.2mm; }
  .signature-detail { font-size: 5.8pt; color: var(--v4-muted); overflow-wrap: anywhere; }
  [data-topic="payment"] .legal-text { margin-bottom: 0; font-size: 6.9pt; line-height: 1.5; }
  .eco-row { margin-top: 3mm; padding-top: 3mm; display: flex; align-items: center; gap: 4mm; border-top: .3mm solid var(--v4-rule); font-size: 6.4pt; color: var(--v4-ink); }
  .eco-row .eco-email { color: var(--v4-muted); overflow-wrap: anywhere; }
`

function fmtNumero(value) {
  return value == null || value === '' ? UNAVAILABLE : value
}

const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']

// Calendar day of the emission instant in the render time zone (same approach as v3's
// vigencia logic: resolve the local calendar date first, then do pure date arithmetic).
function fechaCalendarioLocal(value, renderContext) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: renderContext?.timezone ?? 'America/Asuncion',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const obtener = (tipo) => Number(partes.find((parte) => parte.type === tipo)?.value)
  return new Date(Date.UTC(obtener('year'), obtener('month') - 1, obtener('day')))
}

function fmtFechaCover(value, renderContext) {
  const fecha = fechaCalendarioLocal(value, renderContext)
  const day = String(fecha.getUTCDate()).padStart(2, '0')
  return `${day} ${MONTHS[fecha.getUTCMonth()]} ${fecha.getUTCFullYear()}`
}

function coverHeader(snapshot, logoSrc) {
  const { proposal, carta } = snapshot
  return `<header class="cover-header">
      <div class="cover-logo">${brandMark(logoSrc)}</div>
      <div class="cover-title-block">
        <p class="cover-eyebrow">ASEGURADORA TAJY PROP. COOP. S.A.</p>
        <h1 class="cover-title">Propuesta formal<span>de seguro</span></h1>
        <p class="cover-subtitle">Riesgos varios / Multirriesgo comercio</p>
      </div>
      <div class="cover-number-block">
        <span class="cover-number-label">Propuesta N.º</span>
        <span class="cover-number">${text(fmtNumero(proposal.numero_propuesta))}</span>
        <span class="cover-date">${escapeHtml(fmtFechaCover(proposal.emitida_at, carta.render_context))}</span>
      </div>
    </header>`
}

function pageHeader({ topic, number, logo, continuation = false }) {
  const tag = TOPIC_TAGS[topic] ?? ''
  return `<header class="page-header"${continuation ? ' data-continuation' : ''}>
      <div class="header-logo">${brandMark(logo)}</div>
      <span class="header-label">Propuesta para seguro / Nº ${text(fmtNumero(number))}</span>
      <span class="header-tag">${escapeHtml(tag)}</span>
    </header>`
}

// Pure helper for the pagination step: the compact header placed on top of a continuation
// page. Same markup as the pages 2-5 header, flagged with `data-continuation`.
export function renderContinuationHeader({ topic, number, logo = null }) {
  return pageHeader({ topic, number, logo, continuation: true })
}

function footer(number, pageIndex, totalPages) {
  return `<footer class="proposal-footer"><span>TAJY • Aseguradora Tajy Prop. Coop. S.A.</span><span>Propuesta N.º ${text(fmtNumero(number))} · Página <span data-page-number>${pageIndex}</span> de <span data-page-total>${totalPages}</span></span></footer>`
}

// ----------------------------------------------------------------- shared data helpers

// Hora Inicio/Fin: taken from the emission instant, same source as the emission date.
function fmtHora(value, renderContext) {
  return new Date(value).toLocaleTimeString(renderContext?.locale ?? 'es-PY', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: renderContext?.timezone ?? 'America/Asuncion',
  })
}

function sumarDias(fecha, dias) {
  const resultado = new Date(fecha)
  resultado.setUTCDate(resultado.getUTCDate() + dias)
  return resultado
}

function sumarAnios(fecha, anios) {
  const resultado = new Date(fecha)
  resultado.setUTCFullYear(resultado.getUTCFullYear() + anios)
  return resultado
}

function fmtFechaCalendario(fecha) {
  return fecha.toLocaleDateString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// Business rule carried over from v3: the policy starts 6 calendar days after the emission day
// and lasts one year.
const DIAS_HASTA_INICIO_VIGENCIA = 6
const ANIOS_VIGENCIA = 1

function calcularVigencia(emitidaAt, renderContext) {
  const inicio = sumarDias(
    fechaCalendarioLocal(emitidaAt, renderContext),
    DIAS_HASTA_INICIO_VIGENCIA
  )
  const fin = sumarAnios(inicio, ANIOS_VIGENCIA)
  return { inicio: fmtFechaCalendario(inicio), fin: fmtFechaCalendario(fin) }
}

// The form's "+595" is only a decorative input prefix and is never persisted; the printed
// document shows the local Paraguayan format with the leading "0".
function celular(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  const local = digits.length > 9 ? digits.slice(-9) : digits
  if (!local) return null
  const grouped = [local.slice(0, 3), local.slice(3, 6), local.slice(6, 9)]
    .filter(Boolean)
    .join('-')
  return `0${grouped}`
}

function sumaAsegurada(coverages) {
  return coverages.length
    ? coverages.reduce((total, coverage) => total + (Number(coverage.monto) || 0), 0)
    : null
}

// Splits free text into trimmed non-empty paragraphs (blank-line separated).
function paragraphsOf(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

function sectionTitle(number, title) {
  return `<h2 class="section-title" data-block data-keep-with-next><span class="section-num">${number}</span><span class="section-name">${escapeHtml(title)}</span></h2>`
}

function checkChoice(value) {
  return `Sí <i class="cb${value === true ? ' on' : ''}"></i> No <i class="cb${value === false ? ' on' : ''}"></i>`
}

// ----------------------------------------------------------------- page 1 (cover)

function metaCell(label, valueMarkup, subMarkup) {
  return `<div class="meta-cell"><span class="meta-label">${escapeHtml(label)}</span><span class="meta-value">${valueMarkup}</span>${subMarkup ? `<span class="meta-sub">${subMarkup}</span>` : ''}</div>`
}

function metaRow(proposal, carta, draft) {
  const vigencia = calcularVigencia(proposal.emitida_at, carta.render_context)
  const hora = text(fmtHora(proposal.emitida_at, carta.render_context))
  const policyNumber = typeof draft.numero_poliza === 'string' ? draft.numero_poliza.trim() : ''
  const cells = [
    metaCell('Vigencia desde', text(vigencia.inicio), hora),
    metaCell('Vigencia hasta', text(vigencia.fin), hora),
    ...(policyNumber ? [metaCell('Póliza N.º', escapeHtml(policyNumber), '')] : []),
    metaCell('Modalidad', '1020', 'Multirriesgo comercio'),
  ]
  return `<section class="meta-row meta-row--${cells.length}" data-block>${cells.join('')}</section>`
}

function datum(label, valueMarkup) {
  return `<div class="datum"><span class="datum-label">${escapeHtml(label)}</span><span class="datum-value">${valueMarkup}</span></div>`
}

function identificationBlocks(insured, draft) {
  const plaFt = draft.pla_ft ?? {}
  return [
    sectionTitle('01', 'Identificación del asegurado'),
    `<div class="datum-grid" data-block>
      <div class="datum-column">
        ${datum('Nombre / Razón Social', text(insured.nombre_razon_social))}
        ${datum('Nacionalidad', text(insured.nacionalidad))}
        ${datum('Estado civil', text(insured.estado_civil))}
        ${datum('Ocupación', text(insured.ocupacion))}
        ${datum('Ingreso mensual', money(insured.ingreso_mensual))}
        ${datum('Correo electrónico', text(insured.email))}
      </div>
      <div class="datum-column">
        ${datum('C.I. / Documento', text(insured.documento))}
        ${datum('Sexo', text(insured.sexo))}
        ${datum('Fecha de nacimiento', text(insured.fecha_nacimiento))}
        ${datum('R.U.C.', text(insured.ruc))}
        ${datum('Lugar de trabajo', text(insured.lugar_trabajo))}
        ${datum('Celular', text(celular(insured.telefono)))}
      </div>
    </div>`,
    `<div class="choice-band" data-block><span>Proveedor del Estado: ${checkChoice(plaFt.proveedor_estado)}</span><span class="choice-dot" aria-hidden="true"></span><span>Cargo público nacional o extranjero: ${checkChoice(plaFt.es_pep)}</span></div>`,
    `<p class="fine-print" data-block>Institución: ${text(plaFt.pep_institucion)} / Cargo: ${text(plaFt.pep_cargo)} / Período: ${text(plaFt.pep_periodo)}. Si el asegurado es distinto al tomador, completar el anexo 1.</p>`,
  ]
}

function locationBlocks(insured, proposer) {
  return [
    sectionTitle('02', 'Ubicaciones declaradas'),
    `<div class="location-grid" data-block>
      <div class="location"><span class="location-label">Dirección comercial</span><strong class="location-address">${text(proposer.direccion)}</strong><span class="location-sub">${text(proposer.ciudad)} · Tel.: ${text(celular(proposer.telefono ?? insured.telefono))}</span></div>
      <div class="location"><span class="location-label">Dirección particular</span><strong class="location-address">${text(insured.direccion)}</strong><span class="location-sub">${text(insured.ciudad)} · Tel.: ${text(celular(insured.telefono))}</span></div>
    </div>`,
  ]
}

function riskBlocks(draft, risk) {
  const paragraphs = paragraphsOf(draft.descripcion_detallada)
  const description = paragraphs.length
    ? paragraphs.map((paragraph) => `<p class="body-text" data-block>${escapeHtml(paragraph)}</p>`)
    : [`<p class="body-text" data-block>${UNAVAILABLE}</p>`]
  return [
    sectionTitle('03', 'Descripción del riesgo'),
    ...description,
    `<p class="body-text risk-location" data-block><strong>Ubicación del riesgo:</strong> ${text(risk.direccion)}${risk.ciudad ? `, ${text(risk.ciudad)}` : ''}</p>`,
  ]
}

function totalBand(totalCoverage, prima) {
  return `<section class="total-band" data-block><div class="band-cell"><span class="band-label">Suma asegurada total</span><span class="band-value">${money(totalCoverage)}</span></div><div class="band-cell"><span class="band-label">Prima</span><span class="band-value">${money(prima)}</span></div></section>`
}

function coverBody(snapshot) {
  const { proposal, carta, commercial, draft } = snapshot
  const insured = draft.partes?.asegurado ?? {}
  const proposer = draft.partes?.tomador_igual_asegurado ? insured : (draft.partes?.tomador ?? {})
  const risk = carta.riesgo_datos ?? {}
  return [
    metaRow(proposal, carta, draft),
    ...identificationBlocks(insured, draft),
    ...locationBlocks(insured, proposer),
    ...riskBlocks(draft, risk),
    totalBand(sumaAsegurada(carta.coberturas ?? []), commercial.variante?.prima),
  ].join('')
}

// ----------------------------------------------------------------- page 2 (coverage)

function topicIntro({ eyebrow, title, titleAccent, subtitle }) {
  return `<div class="topic-intro" data-block><p class="topic-eyebrow">${escapeHtml(eyebrow)}</p><h1 class="topic-title">${escapeHtml(title)}<span>${escapeHtml(titleAccent)}</span></h1>${subtitle ? `<p class="topic-subtitle">${escapeHtml(subtitle)}</p>` : ''}</div>`
}

function amount(value) {
  return value != null && value !== '' && Number.isFinite(Number(value))
    ? fmtGs(value)
    : UNAVAILABLE
}

function sumsTableBlocks(coverages, totalCoverage) {
  const rows = coverages.length
    ? coverages.map(
        (coverage, index) =>
          `<div class="sum-row" data-block><span class="sum-index">${String(index + 1).padStart(2, '0')}</span><span class="sum-name">${text(coverage.nombre_snapshot)}</span><span class="sum-amount">${amount(coverage.monto)}</span></div>`
      )
    : [
        `<div class="sum-row" data-block><span class="sum-index"></span><span class="sum-name">${UNAVAILABLE}</span><span class="sum-amount"></span></div>`,
      ]
  return [
    sectionTitle('04', 'Detalle de sumas aseguradas'),
    `<div class="sum-row sum-row--head" data-block><span class="sum-col-name">Cobertura</span><span class="sum-col-amount">Suma asegurada (Gs.)</span></div>`,
    ...rows,
    `<div class="sum-row sum-row--total" data-block><span class="sum-name">Total suma asegurada</span><span class="sum-amount">${amount(totalCoverage)}</span></div>`,
  ]
}

const COVERAGE_TITLE_PATTERN = /^Coberturas Principales:?$/iu
const DISTRIBUTION_HEADING_PATTERN = /^Distribuci[oó]n del Capital Asegurado:?$/iu
const SUBLIMIT_PATTERN = /^Subl[ií]mite/iu
const PERCENT_PATTERN = /^(\d+(?:[.,]\d+)?)\s*%$/u

function textBlocks(value) {
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
    .filter((lines) => lines.length > 0)
}

// "Category / label | label | ... / 50% | 25% | ..." -> bar segments, or null when the block
// does not have exactly that shape (the caller then keeps the raw lines as plain text).
function parseDistributionBlock(lines) {
  const firstPipe = lines.findIndex((line) => line.includes('|'))
  if (firstPipe < 0) return null
  const rows = lines.slice(firstPipe)
  if (rows.length !== 2) return null
  const labels = rows[0].split('|').map((cell) => cell.trim())
  const values = rows[1].split('|').map((cell) => cell.trim())
  if (labels.length !== values.length || labels.some((label) => !label)) return null
  const percents = values.map((value) => PERCENT_PATTERN.exec(value))
  if (percents.some((match) => !match)) return null
  const numbers = percents.map((match) => Number.parseFloat(match[1].replace(',', '.')))
  if (!(numbers.reduce((total, value) => total + value, 0) > 0)) return null
  return {
    title: lines.slice(0, firstPipe).join(' '),
    segments: labels.map((label, index) => ({
      label,
      display: values[index],
      weight: numbers[index],
    })),
  }
}

// Official "coberturas_principales" text -> bullets, distribution bars, sublimits and any
// lines that could not be structured (rendered as plain text so nothing is ever dropped).
function parseCoberturasPrincipales(value) {
  const result = { bullets: [], distributions: [], sublimits: [], leftovers: [] }
  let inDistribution = false
  textBlocks(value).forEach((lines, blockIndex) => {
    let work = [...lines]
    if (blockIndex === 0 && COVERAGE_TITLE_PATTERN.test(work[0])) work.shift()
    if (!inDistribution) {
      const headingIndex = work.findIndex((line) => DISTRIBUTION_HEADING_PATTERN.test(line))
      if (headingIndex < 0) {
        result.bullets.push(...work)
        return
      }
      result.bullets.push(...work.slice(0, headingIndex))
      inDistribution = true
      work = work.slice(headingIndex + 1)
    }
    const rest = work.filter((line) => !SUBLIMIT_PATTERN.test(line))
    result.sublimits.push(...work.filter((line) => SUBLIMIT_PATTERN.test(line)))
    if (!rest.length) return
    const distribution = parseDistributionBlock(rest)
    if (distribution) result.distributions.push(distribution)
    else result.leftovers.push(rest)
  })
  return result
}

function bulletList(items) {
  return `<ul class="bullet-list" data-block>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
}

function segmentClasses(count) {
  if (count === 2) return ['red', 'light']
  const palette = ['red', 'dark', 'light']
  return Array.from({ length: count }, (_, index) => palette[index % palette.length])
}

function distributionBlock(distribution) {
  const columns = distribution.segments.map((segment) => `${segment.weight}fr`).join(' ')
  const classes = segmentClasses(distribution.segments.length)
  return `<div class="dist" data-block>${distribution.title ? `<span class="dist-title">${escapeHtml(distribution.title)}</span>` : ''}<div class="dist-labels" style="grid-template-columns:${columns}">${distribution.segments.map((segment) => `<span class="dist-label">${escapeHtml(segment.label)} <b>${escapeHtml(segment.display)}</b></span>`).join('')}</div><div class="dist-bar" style="grid-template-columns:${columns}">${classes.map((name) => `<i class="seg seg--${name}"></i>`).join('')}</div></div>`
}

// "Sublímite para Daños por agua: Gs. 2.000.000.-" -> "Daños por agua: <b>Gs. 2.000.000</b>"
function sublimitLine(line) {
  const cleaned = line.replace(/^Subl[ií]mite\s+para\s+/iu, '').replace(/[.\-\s]+$/u, '')
  const split = cleaned.lastIndexOf(': ')
  if (split < 0) return `<p>${escapeHtml(cleaned)}</p>`
  return `<p>${escapeHtml(cleaned.slice(0, split))}: <b>${escapeHtml(cleaned.slice(split + 2))}</b></p>`
}

function principalCoverageBlocks(value) {
  const parsed = parseCoberturasPrincipales(value)
  const blocks = [sectionTitle('05', 'Coberturas principales')]
  if (parsed.bullets.length) blocks.push(bulletList(parsed.bullets))
  else if (!parsed.distributions.length && !parsed.sublimits.length && !parsed.leftovers.length) {
    blocks.push(`<p class="body-text" data-block>${UNAVAILABLE}</p>`)
  }
  const leftovers = parsed.leftovers.map(
    (lines) =>
      `<p class="body-text" data-block>${lines.map((line) => escapeHtml(line)).join('<br>')}</p>`
  )
  if (parsed.distributions.length) {
    blocks.push(sectionTitle('06', 'Distribución del capital asegurado'))
    blocks.push(...parsed.distributions.map(distributionBlock))
  }
  blocks.push(...leftovers)
  if (parsed.sublimits.length) {
    blocks.push(
      `<div class="sublimits" data-block><span class="sublimits-label">Sublímites</span><div class="sublimits-list">${parsed.sublimits.map(sublimitLine).join('')}</div></div>`
    )
  }
  return blocks
}

function coverageBody(snapshot) {
  const { carta, texts = {} } = snapshot
  const coverages = carta.coberturas ?? []
  return [
    topicIntro({
      eyebrow: 'Cobertura / Artículo 1',
      title: 'Protección del',
      titleAccent: 'riesgo declarado.',
      subtitle:
        'Detalle de sumas aseguradas para la modalidad 1020 — Riesgos varios / Multirriesgo comercio.',
    }),
    ...sumsTableBlocks(coverages, sumaAsegurada(coverages)),
    ...principalCoverageBlocks(texts.coberturas_principales?.contenido),
  ].join('')
}

// ----------------------------------------------------------------- pages 3-4 (contract text)

// Section titles replace the first-line headings embedded in the source texts, so a block
// holding only that heading is not repeated.
const REPLACED_SOURCE_HEADINGS = new Set([
  'declaración jurada de origen de fondos',
  'autorizaciones del tomador y/o representante legal',
])

function declarationBlock(element) {
  if (element.startsWith('<div class="declaration-choice-group')) {
    const options = element.match(/<span>[\s\S]*?<\/span>/g) ?? []
    const signatures = element.includes('declaration-choice-group--signatures')
    return [
      `<div class="choice-row choice-row--${signatures ? 'signatures' : 'delivery'}" data-block>${signatures ? '<b class="choice-row-label">Modalidad de firma</b>' : ''}${options.join('')}</div>`,
    ]
  }
  if (element.startsWith('<div class="declaration-subsection">')) {
    const body = /<p>([\s\S]*?)<\/p>/.exec(element)?.[1]
    return body ? [`<p class="declaration-paragraph legal-text" data-block>${body}</p>`] : []
  }
  const match = /^<p class="([^"]*)">([\s\S]*)<\/p>$/.exec(element)
  if (!match) return []
  const [, classes, content] = match
  if (REPLACED_SOURCE_HEADINGS.has(content.trim().toLowerCase())) return []
  const cleaned = classes.includes('declaration-paragraph--choice')
    ? content.replace(/^\*\s*/, '')
    : content
  return [`<p class="${classes} legal-text" data-block>${cleaned}</p>`]
}

// v3's declarationFlow() already escapes and classifies every paragraph; here its output is
// split into one atomic block per top-level element (its markup never nests <div>/<p>).
function declarationBlocks(value, options) {
  const elements = declarationFlow(value, options).match(/<(p|div)\b[^>]*>[\s\S]*?<\/\1>/g) ?? []
  return elements.flatMap(declarationBlock)
}

function declarationsBody(snapshot) {
  const { texts = {} } = snapshot
  return [
    topicIntro({
      eyebrow: 'Declaraciones del tomador',
      title: 'Condiciones de',
      titleAccent: 'aceptación.',
      subtitle: 'Texto de declaraciones conservado conforme a la propuesta de origen.',
    }),
    sectionTitle('07', 'Declaraciones'),
    ...declarationBlocks(texts.declaraciones_generales?.contenido, { lead: true }),
    sectionTitle('08', 'Declaración jurada de origen de fondos'),
    ...declarationBlocks(texts.declaracion_jurada_origen_fondos?.contenido),
  ].join('')
}

function subHeading(label) {
  return `<h3 class="sub-heading" data-block data-keep-with-next>${escapeHtml(label)}</h3>`
}

function legalParagraph(lines) {
  return `<p class="legal-text" data-block>${lines.map((line) => escapeHtml(line)).join('<br>')}</p>`
}

const CONDITION_HEADING_PATTERN = /^(Franquicias|Exclusiones):?$/iu
const SUBLIMIT_INTRO_PATTERN = /^Sub-?l[ií]mites/iu

// condiciones_mrc: sub-limits intro, "Franquicias:" and "Exclusiones:" headings, exclusions as
// bullets. Text without that structure is rendered as plain paragraphs, line for line.
function conditionBlocks(value) {
  const blocks = textBlocks(value)
  if (!blocks.length) return [`<p class="legal-text" data-block>${UNAVAILABLE}</p>`]
  const output = []
  let mode = 'prose'
  blocks.forEach((lines, index) => {
    let work = [...lines]
    const heading = CONDITION_HEADING_PATTERN.exec(work[0])
    if (heading) {
      mode = heading[1].toLowerCase() === 'exclusiones' ? 'bullets' : 'prose'
      output.push(subHeading(heading[1][0].toUpperCase() + heading[1].slice(1).toLowerCase()))
      work = work.slice(1)
    } else if (index === 0 && SUBLIMIT_INTRO_PATTERN.test(work[0])) {
      output.push(subHeading('Sub-límites de coberturas'))
    }
    if (!work.length) return
    if (mode === 'bullets') {
      output.push(
        ...work.map((line) => `<div class="bullet-item" data-block>${escapeHtml(line)}</div>`)
      )
    } else {
      output.push(legalParagraph(work))
    }
  })
  return output
}

function conditionsBody(snapshot) {
  const { texts = {} } = snapshot
  return [
    topicIntro({
      eyebrow: 'Condiciones y autorizaciones',
      title: 'Disposiciones',
      titleAccent: 'complementarias.',
    }),
    sectionTitle('09', 'Póliza digital: autorizaciones del tomador'),
    ...declarationBlocks(texts.autorizaciones_tomador_poliza_digital?.contenido),
    sectionTitle('10', 'Condiciones particulares'),
    ...conditionBlocks(texts.condiciones_mrc?.contenido),
  ].join('')
}

// ----------------------------------------------------------------- page 5 (payment)

const COLLECTION_TITLE_PATTERN = /CL[ÁA]USULA[\s._-]*ADICIONAL[\s._-]*DE[\s._-]*COBRANZAS/giu

function econRow(label, valueMarkup) {
  return `<div class="econ-row"><span class="econ-label">${escapeHtml(label)}</span><span class="econ-value">${valueMarkup}</span></div>`
}

function isAmount(value) {
  return value != null && value !== '' && Number.isFinite(Number(value))
}

function economicBlocks(commercial) {
  const payment = commercial.plan_pago ?? {}
  const prima = commercial.variante?.prima
  const subtotal = [prima, payment.rpf_monto].every(isAmount)
    ? money(Number(prima) + Number(payment.rpf_monto))
    : UNAVAILABLE
  return [
    sectionTitle('11', 'Detalle económico'),
    `<div class="econ" data-block>
      <div class="econ-rows">${econRow('Prima', money(prima))}${econRow('R.P.F.', money(payment.rpf_monto))}${econRow('Sub-Total', subtotal)}${econRow('I.V.A.', money(payment.iva_monto))}</div>
      <div class="cost-card"><span class="cost-card-label">Costo total</span><span class="cost-card-value">${money(payment.premio_total)}</span></div>
    </div>`,
  ]
}

function paymentFormBlocks(commercial) {
  const payment = commercial.plan_pago ?? {}
  const installments = payment.monto_cuota
    ? `${text(payment.cantidad_cuotas)} cuotas de ${money(payment.monto_cuota)}`
    : 'Contado'
  return [
    sectionTitle('12', 'Forma de pago y autorización de débito'),
    `<div class="pay-form" data-block>
      <div class="pay-rows">${econRow('Modalidad', text(payment.formas_pago?.nombre_display))}${econRow('Inicial', money(payment.monto_inicial))}${econRow('Cuotas', installments)}</div>
      <div class="debit">
        <p class="debit-copy">En mi carácter de titular de cuenta autorizo irrevocablemente a debitar de mi Tarjeta de Crédito indicada más abajo el importe correspondiente a las cuotas de la póliza emitida por ASEGURADORA TAJY a mi favor, según la opción indicada más arriba.</p>
        <div class="debit-types"><span><i class="cb"></i> Visa</span><span><i class="cb"></i> Mastercard</span><span><i class="cb"></i> Cuenta Corriente</span></div>
        <div class="debit-line"><span class="debit-label">Número</span><span class="debit-value">${UNAVAILABLE}</span></div>
        <div class="debit-line"><span class="debit-label">Vencimiento</span><span class="debit-value"></span></div>
      </div>
    </div>`,
  ]
}

// Free text -> one block per paragraph. A first line of <= 100 characters ending in ":" is a
// heading (same rule as v3's legal flow); remaining lines keep their own line breaks.
function legalBlocks(value) {
  const blocks = textBlocks(value)
  if (!blocks.length) return [`<p class="legal-text" data-block>${UNAVAILABLE}</p>`]
  return blocks.map((lines) => {
    const isHeading = lines[0].length <= 100 && lines[0].endsWith(':')
    if (!isHeading) return legalParagraph(lines)
    const body = lines.slice(1).map((line) => escapeHtml(line))
    return `<p class="legal-text" data-block><strong class="legal-subheading">${escapeHtml(lines[0])}</strong>${body.length ? `<br>${body.join('<br>')}` : ''}</p>`
  })
}

function collectionBlocks(texts) {
  const clause = String(texts.clausula_adicional_cobranzas?.contenido ?? '')
    .replace(COLLECTION_TITLE_PATTERN, '')
    .trimStart()
  return [sectionTitle('13', 'Cláusula adicional de cobranzas'), ...legalBlocks(clause)]
}

function observationBlocks(draft) {
  const observations = String(draft.observaciones ?? '').trim()
  return [
    sectionTitle('14', 'Observaciones'),
    `<div class="observations" data-block>${observations ? `<p class="obs-text">${escapeHtml(observations)}</p>` : ''}<i class="obs-line"></i><i class="obs-line"></i><i class="obs-line"></i></div>`,
  ]
}

function signature(label, name, details) {
  return `<div class="signature"><i class="signature-rule"></i><span class="signature-label">${escapeHtml(label)}</span><span class="signature-detail">Aclaración: ${text(name)}</span>${details.map((detail) => `<span class="signature-detail">${detail}</span>`).join('')}</div>`
}

function signatureBlocks({ proposal, carta, draft, insured, proposer }) {
  const cardholder = draft.partes?.titular_tarjeta ?? draft.titular_tarjeta ?? null
  const insuredName = insured.nombre_razon_social ?? proposer.nombre_razon_social
  const insuredDocument = insured.documento ?? proposer.documento
  const agentDetails = [
    ...(proposal.agente?.email ? [text(proposal.agente.email)] : []),
    `Fecha: ${text(fmtFecha(proposal.emitida_at, carta.render_context))}`,
  ]
  return [
    sectionTitle('15', 'Conformidad y firmas'),
    `<div class="signature-grid" data-block>${signature('Firma del Agente', proposal.agente?.nombre, agentDetails)}${signature('Firma del Titular de la Tarjeta', cardholder?.nombre_razon_social, [`Nro. de C.I.: ${text(cardholder?.documento)}`])}${signature('Firma del Titular del Seguro', insuredName, [`Nro. de C.I.: ${text(insuredDocument)}`])}</div>`,
    `<div class="eco-row" data-block><span>En apoyo a la ecología deseo recibir mi póliza en formato digital:</span><span class="eco-options">SI <i class="cb"></i> NO <i class="cb"></i></span><span>E-mail: <span class="eco-email">${text(insured.email)}</span></span></div>`,
  ]
}

function paymentBody(snapshot) {
  const { proposal, carta, commercial, draft, texts = {} } = snapshot
  const insured = draft.partes?.asegurado ?? {}
  const proposer = draft.partes?.tomador_igual_asegurado ? insured : (draft.partes?.tomador ?? {})
  return [
    topicIntro({
      eyebrow: 'Condiciones económicas',
      title: 'Costo y forma',
      titleAccent: 'de pago.',
    }),
    ...economicBlocks(commercial),
    ...paymentFormBlocks(commercial),
    ...collectionBlocks(texts),
    ...observationBlocks(draft),
    ...signatureBlocks({ proposal, carta, draft, insured, proposer }),
  ].join('')
}

function topicPage(topic, index, { header, body, number }) {
  return `<article class="proposal-page" data-topic="${topic}">${header}<div class="page-body">${body}</div>${footer(number, index + 1, MRC_V4_TOPICS.length)}</article>`
}

export function buildMrcPropuestaV4Html(snapshot, { tajyLogoDataUri = null } = {}) {
  const { proposal } = snapshot
  const number = proposal.numero_propuesta
  const bodies = {
    cover: coverBody(snapshot),
    coverage: coverageBody(snapshot),
    declarations: declarationsBody(snapshot),
    conditions: conditionsBody(snapshot),
    payment: paymentBody(snapshot),
  }

  const pages = MRC_V4_TOPICS.map((topic, index) =>
    topicPage(topic, index, {
      number,
      body: bodies[topic],
      header:
        topic === 'cover'
          ? coverHeader(snapshot, tajyLogoDataUri)
          : pageHeader({ topic, number, logo: tajyLogoDataUri }),
    })
  )

  return `<!doctype html>
<html lang="es" data-proposal-design="v4">
<head><meta charset="utf-8" /><style>${PROPUESTA_FORMAL_V4_STYLE}</style></head>
<body>${pages.join('')}</body>
</html>`
}
