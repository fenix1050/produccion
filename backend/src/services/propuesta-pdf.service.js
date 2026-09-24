import { readFile } from 'node:fs/promises'

import { getBrowser } from '../templates/oferta/pdf-utils.js'
import { buildMrcPropuestaV2Html } from '../templates/propuesta/mrc-v2.js'
import { buildMrcPropuestaV3Html } from '../templates/propuesta/mrc-v3.js'
import { buildMrcPropuestaHtml } from '../templates/propuesta/mrc.js'

import {
  PROPUESTA_FORMAL_V1_RENDERER_REVISION,
  PROPUESTA_FORMAL_V2_RENDERER_REVISION,
  PROPUESTA_FORMAL_V3_RENDERER_REVISION,
} from './document-snapshot.service.js'

const TAJY_LOGO_PATH = new URL('../assets/tajy-logo.svg', import.meta.url)
const TAJY_LOGO_LOCAL_DEV_FALLBACK_PATH = new URL(
  '../../../frontend/login/assets/logo-rojo-con-negro.svg',
  import.meta.url
)
const PROPOSAL_HEADER_BACKGROUND_PATH = new URL(
  '../assets/propuesta-header-bg.png',
  import.meta.url
)
const PROPOSAL_HEADER_BACKGROUND_LOCAL_DEV_FALLBACK_PATH = new URL(
  '../../../frontend/shared/assets/propuesta-header-bg.png',
  import.meta.url
)
const PROPOSAL_FOOTER_SLOGAN_PATH = new URL('../assets/footer-slogan.png', import.meta.url)
const PROPOSAL_FOOTER_SLOGAN_LOCAL_DEV_FALLBACK_PATH = new URL(
  '../../../frontend/shared/assets/footer-slogan.png',
  import.meta.url
)
let tajyLogoDataUriPromise
let proposalHeaderBackgroundDataUriPromise
let proposalFooterSloganDataUriPromise

const FIT_SECTION_IDS = [
  'risk-description',
  'declarations',
  'principal-coverages',
  'conditions',
  'collection-clause',
]
const FIT_STATES = Object.freeze({
  TARGET: 'target',
  REDUCED: 'reduced',
  OVERFLOW: 'overflow',
})
const FIT_SIZE_EPSILON = 0.001

function boundedFitSize(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export class ProposalFitError extends Error {
  constructor(state) {
    super(`MRC proposal fit did not complete safely (${state})`)
    this.name = 'ProposalFitError'
    this.code = 'PF_PDF_FIT_FAILED'
    this.fitState = state
  }
}

export class ProposalFitOverflowError extends Error {
  constructor(fitEvidence) {
    super(
      `MRC proposal fit overflow: ${fitEvidence
        .map(({ section, final }) => `${section}@${final}px`)
        .join(', ')}`
    )
    this.name = 'ProposalFitOverflowError'
    this.code = 'PF_PDF_FIT_OVERFLOW'
    this.fitState = 'overflow'
    this.fitEvidence = fitEvidence
  }
}

export class ProposalRendererRevisionError extends Error {
  constructor(revision) {
    super(`Unknown proposal renderer revision: ${String(revision)}`)
    this.name = 'ProposalRendererRevisionError'
    this.code = 'PF_RENDERER_UNKNOWN_REVISION'
    this.revision = revision
  }
}

export function getTajyLogoDataUri() {
  if (!tajyLogoDataUriPromise) {
    tajyLogoDataUriPromise = readFile(TAJY_LOGO_PATH)
      .catch((error) => {
        if (error?.code !== 'ENOENT' || process.env.NODE_ENV === 'production') throw error
        return readFile(TAJY_LOGO_LOCAL_DEV_FALLBACK_PATH)
      })
      .then((file) => `data:image/svg+xml;base64,${file.toString('base64')}`)
      .catch(() => null)
  }
  return tajyLogoDataUriPromise
}

export function getProposalHeaderBackgroundDataUri() {
  if (!proposalHeaderBackgroundDataUriPromise) {
    proposalHeaderBackgroundDataUriPromise = readFile(PROPOSAL_HEADER_BACKGROUND_PATH)
      .catch((error) => {
        if (error?.code !== 'ENOENT' || process.env.NODE_ENV === 'production') throw error
        return readFile(PROPOSAL_HEADER_BACKGROUND_LOCAL_DEV_FALLBACK_PATH)
      })
      .then((file) => `data:image/png;base64,${file.toString('base64')}`)
      .catch((error) => {
        if (process.env.NODE_ENV === 'production') throw error
        return null
      })
  }
  return proposalHeaderBackgroundDataUriPromise
}

export function getProposalFooterSloganDataUri() {
  if (!proposalFooterSloganDataUriPromise) {
    proposalFooterSloganDataUriPromise = readFile(PROPOSAL_FOOTER_SLOGAN_PATH)
      .catch((error) => {
        if (error?.code !== 'ENOENT' || process.env.NODE_ENV === 'production') throw error
        return readFile(PROPOSAL_FOOTER_SLOGAN_LOCAL_DEV_FALLBACK_PATH)
      })
      .then((file) => `data:image/png;base64,${file.toString('base64')}`)
      .catch((error) => {
        if (process.env.NODE_ENV === 'production') throw error
        return null
      })
  }
  return proposalFooterSloganDataUriPromise
}

export async function waitForProposalFit(page) {
  try {
    await page.waitForFunction(
      () => globalThis.document.documentElement.dataset.proposalFit !== 'pending',
      {
        timeout: 5000,
      }
    )
  } catch {
    throw new ProposalFitError('timeout')
  }
  const status = await page.evaluate(() => ({
    status: globalThis.document.documentElement.dataset.proposalFit,
    fitMetrics: globalThis.__proposalFitMetrics ?? null,
  }))
  if (status.status !== 'complete') {
    throw new ProposalFitError(status.status === 'error' ? 'error' : 'invalid-state')
  }

  if (!Array.isArray(status.fitMetrics)) throw new ProposalFitError('missing-metrics')
  const metrics = new Map(status.fitMetrics.map((metric) => [metric?.section, metric]))
  if (FIT_SECTION_IDS.some((section) => !metrics.has(section))) {
    throw new ProposalFitError('incomplete-metrics')
  }

  const fitResults = FIT_SECTION_IDS.map((section) => {
    const metric = metrics.get(section)
    const result = {
      section,
      status: metric.status,
      target: boundedFitSize(metric.target),
      minimum: boundedFitSize(metric.minimum),
      final: boundedFitSize(metric.final),
    }
    const hasValidSizes =
      ![result.target, result.minimum, result.final].includes(null) &&
      result.minimum > 0 &&
      result.minimum <= result.target &&
      result.final >= result.minimum - FIT_SIZE_EPSILON &&
      result.final <= result.target + FIT_SIZE_EPSILON
    const hasValidState = Object.values(FIT_STATES).includes(result.status)
    const hasConsistentOverflowFlag =
      (result.status === FIT_STATES.OVERFLOW) === (metric.overflow === true)
    const hasValidStateSize =
      (result.status === FIT_STATES.TARGET &&
        Math.abs(result.final - result.target) <= FIT_SIZE_EPSILON) ||
      (result.status === FIT_STATES.REDUCED && result.final < result.target - FIT_SIZE_EPSILON) ||
      (result.status === FIT_STATES.OVERFLOW &&
        Math.abs(result.final - result.minimum) <= FIT_SIZE_EPSILON)
    if (!hasValidSizes || !hasValidState || !hasConsistentOverflowFlag || !hasValidStateSize) {
      throw new ProposalFitError('invalid-metrics')
    }
    return result
  })
  const fitEvidence = fitResults.filter(({ status }) => status === FIT_STATES.OVERFLOW)
  if (fitEvidence.length > 0) throw new ProposalFitOverflowError(fitEvidence)

  return fitResults
}

export async function waitForProposalV2Ready(page) {
  try {
    await page.waitForFunction(
      () => globalThis.document.documentElement.dataset.proposalFit !== 'pending',
      {
        timeout: 5000,
      }
    )
  } catch {
    throw new ProposalFitError('timeout')
  }

  const status = await page.evaluate(() => globalThis.document.documentElement.dataset.proposalFit)
  if (status !== 'complete') {
    throw new ProposalFitError(status === 'error' ? 'error' : 'invalid-state')
  }
}

export async function printFittedProposalPdf(page) {
  await waitForProposalFit(page)
  return Buffer.from(
    await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    })
  )
}

export async function printV3ProposalPdf(page) {
  await waitForProposalFit(page)
  return Buffer.from(
    await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    })
  )
}

function isV3LayoutOverflow(error) {
  return (
    error instanceof ProposalFitOverflowError ||
    (error instanceof ProposalFitError && error.fitState === 'error')
  )
}

const V3_LAYOUTS = ['two-page', 'three-page', 'three-page-tall', 'four-page']

// Tries the approved two-page layout first; only when a layout overflows even at minimum font
// sizes (fit overflow or page overflow) it re-renders with the next fixed layout, which moves
// whole sections instead of splitting cards. Any other fit failure, or an overflow of the last
// layout, propagates untouched.
export async function printV3ProposalWithLayoutFallback(page, buildHtml) {
  for (const [index, layout] of V3_LAYOUTS.entries()) {
    await page.setContent(buildHtml(layout), { waitUntil: 'load' })
    try {
      return await printV3ProposalPdf(page)
    } catch (error) {
      if (index === V3_LAYOUTS.length - 1 || !isV3LayoutOverflow(error)) throw error
    }
  }
}

export async function printV2ProposalPdf(page) {
  await waitForProposalV2Ready(page)
  return Buffer.from(
    await page.pdf({
      format: 'Legal',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    })
  )
}

export async function renderPropuestaMrcPdf(snapshot) {
  const rendererIdentity = snapshot?.renderer_identity
  const revision = rendererIdentity?.revision
  const usesV1Renderer = !rendererIdentity || revision === PROPUESTA_FORMAL_V1_RENDERER_REVISION
  const usesV2Renderer = revision === PROPUESTA_FORMAL_V2_RENDERER_REVISION
  const usesV3Renderer = revision === PROPUESTA_FORMAL_V3_RENDERER_REVISION

  if (!usesV1Renderer && !usesV2Renderer && !usesV3Renderer) {
    throw new ProposalRendererRevisionError(revision)
  }

  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    const logoDataUri = await getTajyLogoDataUri()
    if (usesV3Renderer) {
      const headerBackgroundDataUri = await getProposalHeaderBackgroundDataUri()
      const footerSloganDataUri = await getProposalFooterSloganDataUri()
      return await printV3ProposalWithLayoutFallback(page, (layout) =>
        buildMrcPropuestaV3Html(snapshot, {
          tajyLogoDataUri: logoDataUri,
          headerBackgroundDataUri,
          footerSloganDataUri,
          layout,
        })
      )
    }

    const html = usesV2Renderer
      ? buildMrcPropuestaV2Html(snapshot, { tajyLogoDataUri: logoDataUri })
      : buildMrcPropuestaHtml(snapshot, { tajyLogoDataUri: logoDataUri })
    await page.setContent(html, { waitUntil: 'load' })

    if (usesV2Renderer) return await printV2ProposalPdf(page)

    return await printFittedProposalPdf(page)
  } finally {
    await page.close()
  }
}
