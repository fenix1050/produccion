import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  PROPUESTA_FORMAL_V3_RENDERER_REVISION,
  PROPUESTA_FORMAL_V4_RENDERER_REVISION,
} from './document-snapshot.service.js'

// The service is imported AFTER mocking the shared browser, so no Chromium is launched: the
// fake page records which builder produced the HTML it was given.
function fakeBrowserModule(contents) {
  const page = {
    setContent: async (html) => {
      contents.push(html)
    },
    waitForFunction: async () => {},
    evaluate: async () => {
      const html = contents.at(-1) ?? ''
      if (html.includes('data-proposal-design="v4"')) {
        return {
          status: 'complete',
          error: null,
          metrics: {
            pages: 5,
            continuationPages: 0,
            topics: ['cover', 'coverage', 'declarations', 'conditions', 'payment'].map((topic) => ({
              topic,
              pages: 1,
            })),
          },
        }
      }
      return {
        status: 'complete',
        fitMetrics: [
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
        })),
      }
    },
    pdf: async () => Buffer.from('pdf'),
    close: async () => {},
  }
  return { newPage: async () => page }
}

function snapshotFor(revision) {
  return {
    renderer_identity: { revision },
    proposal: { numero_propuesta: 7, emitida_at: '2026-09-01T12:00:00.000Z' },
    carta: { render_context: { timezone: 'America/Asuncion', locale: 'es-PY' }, coberturas: [] },
    commercial: {},
    draft: { partes: { asegurado: {} } },
    texts: {},
  }
}

async function loadService(t, contents) {
  t.mock.module('../templates/oferta/pdf-utils.js', {
    namedExports: {
      getBrowser: async () => fakeBrowserModule(contents),
      closeBrowser: async () => {},
    },
  })
  return import(`./propuesta-pdf.service.js?dispatch=${Math.random()}`)
}

test('a snapshot with the v4 renderer revision is routed to the v4 builder and its pagination gate', async (t) => {
  const contents = []
  const { renderPropuestaMrcPdf } = await loadService(t, contents)

  const pdf = await renderPropuestaMrcPdf(snapshotFor(PROPUESTA_FORMAL_V4_RENDERER_REVISION))

  assert.deepEqual(pdf, Buffer.from('pdf'))
  assert.equal(contents.length, 1)
  assert.match(contents[0], /data-proposal-design="v4"/)
  assert.match(contents[0], /data-proposal-pagination="pending"/)
})

test('a snapshot with the v3 renderer revision keeps using the v3 builder', async (t) => {
  const contents = []
  const { renderPropuestaMrcPdf } = await loadService(t, contents)

  await renderPropuestaMrcPdf(snapshotFor(PROPUESTA_FORMAL_V3_RENDERER_REVISION))

  assert.equal(contents.length, 1)
  assert.match(contents[0], /data-proposal-design="v3"/)
  assert.doesNotMatch(contents[0], /data-proposal-design="v4"/)
})

test('an unknown renderer revision is still rejected', async (t) => {
  const { renderPropuestaMrcPdf, ProposalRendererRevisionError } = await loadService(t, [])

  await assert.rejects(
    () => renderPropuestaMrcPdf(snapshotFor('pf3-unknown')),
    (error) => error instanceof ProposalRendererRevisionError
  )
})
