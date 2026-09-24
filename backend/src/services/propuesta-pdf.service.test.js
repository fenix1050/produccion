import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import {
  getProposalFooterSloganDataUri,
  getProposalHeaderBackgroundDataUri,
  getTajyLogoDataUri,
  printFittedProposalPdf,
  printV2ProposalPdf,
  printV3ProposalPdf,
  printV3ProposalWithLayoutFallback,
  ProposalFitError,
  ProposalFitOverflowError,
  ProposalRendererRevisionError,
  renderPropuestaMrcPdf,
  waitForProposalFit,
  waitForProposalV2Ready,
} from './propuesta-pdf.service.js'

test('proposal PDF renderer rejects unknown revisions with a bounded error shape', async () => {
  await assert.rejects(
    () => renderPropuestaMrcPdf({ renderer_identity: { revision: 'pf3-unknown' } }),
    (error) => {
      assert.ok(error instanceof ProposalRendererRevisionError)
      assert.equal(error.name, 'ProposalRendererRevisionError')
      assert.equal(error.code, 'PF_RENDERER_UNKNOWN_REVISION')
      assert.equal(error.revision, 'pf3-unknown')
      assert.equal(error.message, 'Unknown proposal renderer revision: pf3-unknown')
      return true
    }
  )
})

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

test('proposal PDF renderer loads the local header background PNG as a data URI', async () => {
  const headerBackgroundDataUri = await getProposalHeaderBackgroundDataUri()

  assert.match(headerBackgroundDataUri, /^data:image\/png;base64,/)
  assert.deepEqual(
    Buffer.from(headerBackgroundDataUri.split(',')[1], 'base64').subarray(0, 8),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  )
})

test('proposal PDF renderer loads the footer slogan PNG as a data URI', async () => {
  const footerSloganDataUri = await getProposalFooterSloganDataUri()

  assert.match(footerSloganDataUri, /^data:image\/png;base64,/)
  assert.deepEqual(
    Buffer.from(footerSloganDataUri.split(',')[1], 'base64').subarray(0, 8),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  )
})

test('production Docker build packages the proposal assets at the renderer runtime paths', async () => {
  const [dockerfile, dockerignore] = await Promise.all([
    readFile(new URL('../../Dockerfile', import.meta.url), 'utf8'),
    readFile(new URL('../../../.dockerignore', import.meta.url), 'utf8'),
  ])

  assert.match(dockerfile, /^FROM node:24-slim$/m)
  assert.match(
    dockerfile,
    /COPY frontend\/login\/assets\/logo-rojo-con-negro\.svg \.\/backend\/src\/assets\/tajy-logo\.svg/
  )
  assert.match(
    dockerfile,
    /COPY frontend\/shared\/assets\/propuesta-header-bg\.png \.\/backend\/src\/assets\/propuesta-header-bg\.png/
  )
  assert.match(
    dockerfile,
    /COPY frontend\/shared\/assets\/footer-slogan\.png \.\/backend\/src\/assets\/footer-slogan\.png/
  )
  assert.match(dockerfile, /COPY backend \.\/backend/)
  assert.match(dockerignore, /^frontend\/\*$/m)
  assert.match(dockerignore, /^!frontend\/login\/assets\/logo-rojo-con-negro\.svg$/m)
  assert.match(dockerignore, /^!frontend\/shared\/$/m)
  assert.match(dockerignore, /^!frontend\/shared\/assets\/$/m)
  assert.match(dockerignore, /^!frontend\/shared\/assets\/propuesta-header-bg\.png$/m)
  assert.match(dockerignore, /^!frontend\/shared\/assets\/footer-slogan\.png$/m)
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

test('proposal PDF renderer waits for v2 readiness without validating v1 metrics', async () => {
  let predicate
  let options
  const page = {
    waitForFunction: async (receivedPredicate, receivedOptions) => {
      predicate = receivedPredicate
      options = receivedOptions
    },
    evaluate: async () => 'complete',
  }

  await waitForProposalV2Ready(page)

  assert.match(String(predicate), /dataset\.proposalFit !== 'pending'/)
  assert.deepEqual(options, { timeout: 5000 })
})

test('proposal PDF renderer bounds v2 readiness timeout and script errors', async () => {
  await assert.rejects(
    () =>
      waitForProposalV2Ready({
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

  await assert.rejects(
    () =>
      waitForProposalV2Ready({
        waitForFunction: async () => {},
        evaluate: async () => 'error',
      }),
    (error) =>
      error instanceof ProposalFitError &&
      error.code === 'PF_PDF_FIT_FAILED' &&
      error.fitState === 'error'
  )
})

test('proposal PDF renderer prints v2 Legal content after the readiness gate', async () => {
  let pdfOptions
  const page = {
    waitForFunction: async () => {},
    evaluate: async () => 'complete',
    pdf: async (receivedOptions) => {
      pdfOptions = receivedOptions
      return Buffer.from('v2-pdf')
    },
  }

  assert.deepEqual(await printV2ProposalPdf(page), Buffer.from('v2-pdf'))
  assert.deepEqual(pdfOptions, {
    format: 'Legal',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  })
})

test('proposal PDF renderer prints v3 content on A4 after the completion gate', async () => {
  let pdfOptions
  const page = {
    waitForFunction: async () => {},
    evaluate: async () => ({ status: 'complete', fitMetrics: normalFitMetrics() }),
    pdf: async (receivedOptions) => {
      pdfOptions = receivedOptions
      return Buffer.from('v3-pdf')
    },
  }

  assert.deepEqual(await printV3ProposalPdf(page), Buffer.from('v3-pdf'))
  assert.deepEqual(pdfOptions, {
    format: 'A4',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  })
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

function layoutFallbackPage(statusByLayout) {
  const setContents = []
  let current = null
  return {
    setContents,
    setContent: async (html) => {
      setContents.push(html)
      current = html
    },
    waitForFunction: async () => {},
    evaluate: async () => statusByLayout[current],
    pdf: async () => Buffer.from(`pdf:${current}`),
  }
}

const overflowFitMetrics = () => {
  const metrics = normalFitMetrics()
  metrics[1] = { ...metrics[1], final: metrics[1].minimum, status: 'overflow', overflow: true }
  return metrics
}

const buildLayoutHtml = (layout) => layout

test('v3 layout fallback keeps the two-page layout when it fits', async () => {
  const page = layoutFallbackPage({
    'two-page': { status: 'complete', fitMetrics: normalFitMetrics() },
  })

  assert.deepEqual(
    await printV3ProposalWithLayoutFallback(page, buildLayoutHtml),
    Buffer.from('pdf:two-page')
  )
  assert.deepEqual(page.setContents, ['two-page'])
})

test('v3 layout fallback re-renders with three fixed pages when two pages overflow', async () => {
  const page = layoutFallbackPage({
    'two-page': { status: 'complete', fitMetrics: overflowFitMetrics() },
    'three-page': { status: 'complete', fitMetrics: normalFitMetrics() },
  })

  assert.deepEqual(
    await printV3ProposalWithLayoutFallback(page, buildLayoutHtml),
    Buffer.from('pdf:three-page')
  )
  assert.deepEqual(page.setContents, ['two-page', 'three-page'])
})

test('v3 layout fallback also retries when the two-page layout reports page overflow', async () => {
  const page = layoutFallbackPage({
    'two-page': { status: 'error', fitMetrics: null },
    'three-page': { status: 'complete', fitMetrics: normalFitMetrics() },
  })

  assert.deepEqual(
    await printV3ProposalWithLayoutFallback(page, buildLayoutHtml),
    Buffer.from('pdf:three-page')
  )
})

test('v3 layout fallback re-renders with the tall three-page layout when three pages overflow', async () => {
  const page = layoutFallbackPage({
    'two-page': { status: 'complete', fitMetrics: overflowFitMetrics() },
    'three-page': { status: 'error', fitMetrics: null },
    'three-page-tall': { status: 'complete', fitMetrics: normalFitMetrics() },
  })

  assert.deepEqual(
    await printV3ProposalWithLayoutFallback(page, buildLayoutHtml),
    Buffer.from('pdf:three-page-tall')
  )
  assert.deepEqual(page.setContents, ['two-page', 'three-page', 'three-page-tall'])
})

test('v3 layout fallback uses four fixed pages only when the tall three-page layout overflows', async () => {
  const page = layoutFallbackPage({
    'two-page': { status: 'complete', fitMetrics: overflowFitMetrics() },
    'three-page': { status: 'error', fitMetrics: null },
    'three-page-tall': { status: 'error', fitMetrics: null },
    'four-page': { status: 'complete', fitMetrics: normalFitMetrics() },
  })

  assert.deepEqual(
    await printV3ProposalWithLayoutFallback(page, buildLayoutHtml),
    Buffer.from('pdf:four-page')
  )
  assert.deepEqual(page.setContents, ['two-page', 'three-page', 'three-page-tall', 'four-page'])
})

test('v3 layout fallback propagates overflow when four pages still do not fit', async () => {
  const page = layoutFallbackPage({
    'two-page': { status: 'complete', fitMetrics: overflowFitMetrics() },
    'three-page': { status: 'complete', fitMetrics: overflowFitMetrics() },
    'three-page-tall': { status: 'complete', fitMetrics: overflowFitMetrics() },
    'four-page': { status: 'complete', fitMetrics: overflowFitMetrics() },
  })

  await assert.rejects(
    () => printV3ProposalWithLayoutFallback(page, buildLayoutHtml),
    (error) => error instanceof ProposalFitOverflowError
  )
  assert.deepEqual(page.setContents, ['two-page', 'three-page', 'three-page-tall', 'four-page'])
})

test('v3 layout fallback does not retry a non-overflow failure of the three-page layout', async () => {
  const page = layoutFallbackPage({
    'two-page': { status: 'complete', fitMetrics: overflowFitMetrics() },
    'three-page': { status: 'complete', fitMetrics: null },
  })

  await assert.rejects(
    () => printV3ProposalWithLayoutFallback(page, buildLayoutHtml),
    (error) => error instanceof ProposalFitError && error.fitState === 'missing-metrics'
  )
  assert.deepEqual(page.setContents, ['two-page', 'three-page'])
})

test('v3 layout fallback does not retry non-overflow fit failures', async () => {
  const page = layoutFallbackPage({
    'two-page': { status: 'complete', fitMetrics: null },
  })

  await assert.rejects(
    () => printV3ProposalWithLayoutFallback(page, buildLayoutHtml),
    (error) => error instanceof ProposalFitError && error.fitState === 'missing-metrics'
  )
  assert.deepEqual(page.setContents, ['two-page'])
})
