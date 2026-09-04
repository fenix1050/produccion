import { getBrowser } from '../templates/oferta/pdf-utils.js'
import { buildMrcPropuestaHtml } from '../templates/propuesta/mrc.js'
import { readFile } from 'node:fs/promises'

const TAJY_LOGO_PATH = new URL('../assets/tajy-logo.svg', import.meta.url)
const TAJY_LOGO_LOCAL_DEV_FALLBACK_PATH = new URL(
  '../../../frontend/login/assets/logo-rojo-con-negro.svg',
  import.meta.url
)
let tajyLogoDataUriPromise

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

export async function renderPropuestaMrcPdf(snapshot) {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setContent(
      buildMrcPropuestaHtml(snapshot, { tajyLogoDataUri: await getTajyLogoDataUri() }),
      { waitUntil: 'load' }
    )
    return await printFittedProposalPdf(page)
  } finally {
    await page.close()
  }
}
