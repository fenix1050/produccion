import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import {
  getTajyLogoDataUri,
  printFittedProposalPdf,
  ProposalFitError,
  ProposalFitOverflowError,
  waitForProposalFit,
} from './propuesta-pdf.service.js'

const normalFitMetrics = () =>
  [
    ['risk-description', 9.2, 8],
    ['declarations', 6.8, 5.9],
    ['principal-coverages', 10.6, 9.2],
    ['conditions', 10.6, 9.2],
    ['collection-clause', 8.1, 7],
  ].map(([section, target, minimum]) => ({
    section,
    target,
    minimum,
    final: target,
    status: 'target',
    overflow: false,
  }))

test('proposal PDF renderer loads the official SVG logo as a data URI', async () => {
  const logoDataUri = await getTajyLogoDataUri()

  assert.match(logoDataUri, /^data:image\/svg\+xml;base64,/)
  assert.match(Buffer.from(logoDataUri.split(',')[1], 'base64').toString('utf8'), /<svg\b/)
})

test('production Docker build packages the logo at the renderer runtime path', async () => {
  const [dockerfile, dockerignore] = await Promise.all([
    readFile(new URL('../../Dockerfile', import.meta.url), 'utf8'),
    readFile(new URL('../../../.dockerignore', import.meta.url), 'utf8'),
  ])

  assert.match(dockerfile, /^FROM node:24-slim$/m)
  assert.match(
    dockerfile,
    /COPY frontend\/login\/assets\/logo-rojo-con-negro\.svg \.\/backend\/src\/assets\/tajy-logo\.svg/
  )
  assert.match(dockerfile, /COPY backend \.\/backend/)
  assert.match(dockerignore, /^frontend\/\*$/m)
  assert.match(dockerignore, /^!frontend\/login\/assets\/logo-rojo-con-negro\.svg$/m)
})

test('proposal PDF renderer waits for deterministic fit completion before printing', async () => {
  let predicate
  let options
  const page = {
    waitForFunction: async (receivedPredicate, receivedOptions) => {
      predicate = receivedPredicate
      options = receivedOptions
    },
    evaluate: async () => ({ status: 'complete', fitMetrics: normalFitMetrics() }),
  }

  await waitForProposalFit(page)

  assert.match(String(predicate), /dataset\.proposalFit !== 'pending'/)
  assert.deepEqual(options, { timeout: 5000 })
})

test('proposal PDF renderer prints normal fitted content after the completion gate', async () => {
  let pdfCalls = 0
  const page = {
    waitForFunction: async () => {},
    evaluate: async () => ({ status: 'complete', fitMetrics: normalFitMetrics() }),
    pdf: async () => {
      pdfCalls += 1
      return Buffer.from('normal-pdf')
    },
  }

  assert.deepEqual(await printFittedProposalPdf(page), Buffer.from('normal-pdf'))
  assert.equal(pdfCalls, 1)
})

test('proposal PDF renderer accepts valid reduced content within its bounded range', async () => {
  let pdfCalls = 0
  const fitMetrics = normalFitMetrics()
  fitMetrics[2] = {
    ...fitMetrics[2],
    final: 9.8,
    status: 'reduced',
  }
  const page = {
    waitForFunction: async () => {},
    evaluate: async () => ({ status: 'complete', fitMetrics }),
    pdf: async () => {
      pdfCalls += 1
      return Buffer.from('reduced-pdf')
    },
  }

  assert.deepEqual(await printFittedProposalPdf(page), Buffer.from('reduced-pdf'))
  assert.equal(pdfCalls, 1)
})

test('proposal PDF renderer rejects invalid reduced sizes before producing PDF bytes', async () => {
  for (const [final, overflow] of [
    [10.6, false],
    [9.1, false],
    [10.7, false],
    [9.8, true],
  ]) {
    let pdfCalls = 0
    const fitMetrics = normalFitMetrics()
    fitMetrics[2] = {
      ...fitMetrics[2],
      final,
      status: 'reduced',
      overflow,
    }
    const page = {
      waitForFunction: async () => {},
      evaluate: async () => ({ status: 'complete', fitMetrics }),
      pdf: async () => {
        pdfCalls += 1
        return Buffer.from('invalid-reduced-pdf')
      },
    }

    await assert.rejects(
      () => printFittedProposalPdf(page),
      (error) =>
        error instanceof ProposalFitError &&
        error.code === 'PF_PDF_FIT_FAILED' &&
        error.fitState === 'invalid-metrics'
    )
    assert.equal(pdfCalls, 0)
  }
})

test('proposal PDF renderer rejects terminal overflow before producing PDF bytes', async () => {
  let pdfCalls = 0
  const fitMetrics = normalFitMetrics()
  fitMetrics[0] = {
    ...fitMetrics[0],
    final: 8,
    status: 'overflow',
    overflow: true,
    content: 'CONFIDENTIAL LEGAL TEXT',
  }
  fitMetrics.push({
    section: 'CONFIDENTIAL LEGAL TEXT',
    status: 'overflow',
    target: 999,
    minimum: 1,
    final: 1,
  })
  const page = {
    waitForFunction: async () => {},
    evaluate: async () => ({ status: 'complete', fitMetrics }),
    pdf: async () => {
      pdfCalls += 1
      return Buffer.from('clipped-pdf')
    },
  }

  await assert.rejects(
    () => printFittedProposalPdf(page),
    (error) => {
      assert.ok(error instanceof ProposalFitOverflowError)
      assert.equal(error.code, 'PF_PDF_FIT_OVERFLOW')
      assert.deepEqual(error.fitEvidence, [
        {
          section: 'risk-description',
          status: 'overflow',
          target: 9.2,
          minimum: 8,
          final: 8,
        },
      ])
      assert.doesNotMatch(
        JSON.stringify({ message: error.message, evidence: error.fitEvidence }),
        /CONFIDENTIAL LEGAL TEXT/
      )
      return true
    }
  )
  assert.equal(pdfCalls, 0)
})

test('proposal PDF renderer rejects failed and timed-out fitting with bounded errors', async () => {
  const page = {
    waitForFunction: async () => {},
    evaluate: async () => ({
      status: 'error',
      error: 'CONFIDENTIAL LEGAL TEXT',
      fitMetrics: null,
    }),
  }

  await assert.rejects(
    () => waitForProposalFit(page),
    (error) =>
      error instanceof ProposalFitError &&
      error.code === 'PF_PDF_FIT_FAILED' &&
      error.fitState === 'error' &&
      !error.message.includes('CONFIDENTIAL LEGAL TEXT')
  )

  await assert.rejects(
    () =>
      waitForProposalFit({
        waitForFunction: async () => {
          throw new Error('CONFIDENTIAL LEGAL TEXT')
        },
      }),
    (error) =>
      error instanceof ProposalFitError &&
      error.code === 'PF_PDF_FIT_FAILED' &&
      error.fitState === 'timeout' &&
      !error.message.includes('CONFIDENTIAL LEGAL TEXT')
  )
})
