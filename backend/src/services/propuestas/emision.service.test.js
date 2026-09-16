import assert from 'node:assert/strict'
import { test } from 'node:test'

function proposalContext() {
  return {
    id: 15,
    estado: 'borrador',
    revision: 3,
    carta_oferta_id: 7,
    cotizacion_variante_id: 10,
    cotizacion_plan_pago_id: 20,
    draft_json: {
      partes: {
        asegurado: {
          tipo_persona: 'juridica',
          nombre_razon_social: 'Client SA',
          documento: '80012345-6',
          direccion: 'Address',
          ciudad: 'Asunción',
          telefono: '021000000',
          email: 'client@example.com',
          actividad_economica: 'Commerce',
        },
        tomador_igual_asegurado: true,
        representante_legal: { nombre: 'Representative', documento: '123', cargo: 'Director' },
      },
      tipo_firma: 'manual',
    },
    cartas_oferta: {
      id: 7,
      cotizaciones: { agente_id: 4 },
      snapshot_json: {
        cotizacion: {
          cotizacion_variantes: [
            { id: 10, cotizacion_plan_pago: [{ id: 20, premio_total: 1000 }] },
          ],
        },
      },
    },
  }
}

function configureDependencies(t, overrides = {}) {
  const calls = {
    start: [],
    snapshots: [],
    render: [],
    uploads: [],
    confirms: [],
    errors: [],
    downloads: [],
    removes: [],
  }
  const proposal = overrides.proposal ?? proposalContext()
  t.mock.module('../../repositories/propuestas.repository.js', {
    namedExports: {
      findPropuestaContextById: async () => proposal,
      findPublishedTexts: async () => [
        { id: 1, clave: 'declaraciones', contenido: 'Text', version: 1 },
      ],
      iniciarEmision: async (payload) => {
        calls.start.push(payload)
        return {
          ...proposal,
          estado: 'generando_pdf',
          numero_propuesta: 44,
          snapshot_json: payload.p_snapshot_json,
        }
      },
      actualizarSnapshotEmision: async (payload) => {
        calls.snapshots.push(payload)
        return {
          ...proposal,
          estado: 'generando_pdf',
          numero_propuesta: 44,
          snapshot_json: payload.p_snapshot_json,
        }
      },
      uploadProposalPdf: async (...args) => calls.uploads.push(args),
      confirmarEmision: async (payload) => {
        calls.confirms.push(payload)
        return { ...proposal, estado: 'emitida', numero_propuesta: 44 }
      },
      removeProposalPdf: async (...args) => calls.removes.push(args),
      registrarErrorEmision: async (payload) => calls.errors.push(payload),
      downloadProposalPdf: async (storagePath) => {
        calls.downloads.push(storagePath)
        return Buffer.from('stored-pdf')
      },
      ...overrides.repository,
    },
  })
  t.mock.module('../propuesta-pdf.service.js', {
    namedExports: {
      renderPropuestaMrcPdf:
        overrides.renderPropuestaMrcPdf ??
        (async (snapshot) => {
          calls.render.push(snapshot)
          return Buffer.from('proposal-pdf')
        }),
    },
  })
  t.mock.module('./elegibilidad.service.js', {
    namedExports: { motivoIneligibilidadCarta: async () => null, asegurarCartaApta: () => {} },
  })
  t.mock.module('./readiness.service.js', {
    namedExports: {
      asegurarReadinessEmision: () => ({ readiness: { listo: true }, error: null }),
      MRC_REQUIRED_TEXT_KEYS: ['declaraciones_generales'],
    },
  })
  t.mock.module('./borradores.service.js', {
    namedExports: {
      traducirErrorRpc: overrides.traducirErrorRpc ?? ((error) => error),
    },
  })
  return calls
}

function emittedCartaConflict() {
  return Object.assign(new Error('La Carta Oferta ya tiene una Propuesta Formal emitida'), {
    status: 409,
    code: 'PF_CARTA_YA_TIENE_PROPUESTA_EMITIDA',
    publicMessage: 'La Carta Oferta ya tiene una Propuesta Formal emitida',
  })
}

test('emission persists and renders the numbered immutable snapshot', async (t) => {
  const calls = configureDependencies(t)
  const { emitirPropuesta } = await import('./emision.service.js?case=emit-snapshot')

  const result = await emitirPropuesta(
    15,
    { revision: 3 },
    { id: 4, rol: 'agente', nombre: 'Agent' }
  )

  assert.equal(result.estado, 'emitida')
  assert.equal(calls.start[0].p_revision_esperada, 3)
  assert.equal(calls.snapshots.length, 1)
  assert.equal(calls.render[0].proposal.numero_propuesta, 44)
  assert.deepEqual(calls.uploads[0], ['mrc/44.pdf', Buffer.from('proposal-pdf')])
  assert.equal(calls.confirms[0].p_pdf_storage_path, 'mrc/44.pdf')
  assert.deepEqual(calls.errors, [])
})

test('emission records a sanitized failure when PDF rendering fails', async (t) => {
  const calls = configureDependencies(t, {
    renderPropuestaMrcPdf: async () => {
      const error = new Error('renderer unavailable')
      error.code = 'PUPPETEER_UNAVAILABLE'
      throw error
    },
  })
  const { emitirPropuesta } = await import('./emision.service.js?case=render-failure')

  await assert.rejects(
    () => emitirPropuesta(15, { revision: 3 }, { id: 4, rol: 'agente', nombre: 'Agent' }),
    /renderer unavailable/
  )
  assert.deepEqual(calls.errors, [
    { p_propuesta_id: 15, p_error_codigo: 'PUPPETEER_UNAVAILABLE', p_actor_id: 4 },
  ])
  assert.deepEqual(calls.uploads, [])
  assert.deepEqual(calls.confirms, [])
})

test('emission rejects unresolved fit overflow before uploading PDF bytes', async (t) => {
  const overflow = Object.assign(new Error('MRC proposal fit overflow: conditions@9.2px'), {
    code: 'PF_PDF_FIT_OVERFLOW',
    fitState: 'overflow',
    fitEvidence: [
      { section: 'conditions', status: 'overflow', target: 10.6, minimum: 9.2, final: 9.2 },
    ],
  })
  const calls = configureDependencies(t, {
    renderPropuestaMrcPdf: async () => {
      throw overflow
    },
  })
  const { emitirPropuesta } = await import('./emision.service.js?case=fit-overflow')

  await assert.rejects(
    () => emitirPropuesta(15, { revision: 3 }, { id: 4, rol: 'agente', nombre: 'Agent' }),
    (error) => error === overflow
  )
  assert.deepEqual(calls.uploads, [])
  assert.deepEqual(calls.confirms, [])
  assert.deepEqual(calls.errors, [
    { p_propuesta_id: 15, p_error_codigo: 'PF_PDF_FIT_OVERFLOW', p_actor_id: 4 },
  ])
})

test('an emitted Carta is rejected as a conflict before rendering or uploading another PDF', async (t) => {
  const conflict = Object.assign(new Error('PF_CARTA_YA_TIENE_PROPUESTA_EMITIDA'), {
    code: 'P0001',
  })
  const calls = configureDependencies(t, {
    traducirErrorRpc: emittedCartaConflict,
    repository: {
      iniciarEmision: async () => {
        throw conflict
      },
    },
  })
  const { emitirPropuesta } = await import('./emision.service.js?case=emitted-carta-conflict')

  await assert.rejects(
    () => emitirPropuesta(15, { revision: 3 }, { id: 4, rol: 'agente', nombre: 'Agent' }),
    (error) =>
      error.status === 409 &&
      error.code === 'PF_CARTA_YA_TIENE_PROPUESTA_EMITIDA' &&
      error.publicMessage === 'La Carta Oferta ya tiene una Propuesta Formal emitida'
  )

  assert.deepEqual(calls.render, [])
  assert.deepEqual(calls.uploads, [])
  assert.deepEqual(calls.confirms, [])
  assert.deepEqual(calls.errors, [])
})

test('a native emitted-Carta unique conflict uses the same API conflict contract', async (t) => {
  const calls = configureDependencies(t, {
    traducirErrorRpc: emittedCartaConflict,
    repository: {
      iniciarEmision: async () => {
        const error = new Error('duplicate key value violates unique constraint')
        error.code = '23505'
        throw error
      },
    },
  })
  const { emitirPropuesta } =
    await import('./emision.service.js?case=native-emitted-carta-conflict')

  await assert.rejects(
    () => emitirPropuesta(15, { revision: 3 }, { id: 4, rol: 'agente', nombre: 'Agent' }),
    (error) => error.status === 409 && error.code === 'PF_CARTA_YA_TIENE_PROPUESTA_EMITIDA'
  )

  assert.deepEqual(calls.render, [])
  assert.deepEqual(calls.uploads, [])
})

test('download permits the originating agent and rejects an unrelated agent', async (t) => {
  const storedPdf = Buffer.from('stored-pdf')
  const calls = configureDependencies(t, {
    proposal: {
      ...proposalContext(),
      estado: 'emitida',
      pdf_storage_path: 'mrc/44.pdf',
      pdf_hash: '96ba548377fcbffcb0b640d90f5f430851e05e595406b1abb494616e601561e6',
    },
    repository: { downloadProposalPdf: async (path) => (calls.downloads.push(path), storedPdf) },
  })
  const { descargarPropuesta } = await import('./emision.service.js?case=download-authorization')

  const downloaded = await descargarPropuesta(15, { id: 4, rol: 'agente' })
  assert.deepEqual(downloaded.pdf, storedPdf)
  assert.deepEqual(calls.downloads, ['mrc/44.pdf'])
  await assert.rejects(
    () => descargarPropuesta(15, { id: 5, rol: 'agente' }),
    (error) => error.status === 403
  )
})

test('text listing reports when the complete approved source set enables issuance', async (t) => {
  const requiredKeys = ['declaraciones_generales']
  configureDependencies(t, {
    repository: {
      findPublishedTexts: async () => requiredKeys.map((clave) => ({ clave })),
    },
  })
  const { listarTextos } = await import('./emision.service.js?case=list-approved-texts')

  const result = await listarTextos({ id: 4, rol: 'agente' })

  assert.deepEqual(result.claves_requeridas, requiredKeys)
  assert.deepEqual(result.faltantes, [])
  assert.equal(result.emision_habilitada, true)
})

async function withRenderProbeEnvironment(environment, callback) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    PF3_TEST_RENDER_PROBE_ENABLED: process.env.PF3_TEST_RENDER_PROBE_ENABLED,
  }
  Object.assign(process.env, environment)
  try {
    await callback()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('test render probe capability is server-derived and requires every authorization condition', async (t) => {
  configureDependencies(t)
  const { puedeProbarRenderErrorPdf } =
    await import('./emision.service.js?case=test-render-probe-capability')
  const proposal = { estado: 'error_pdf', snapshot_json: { proposal: { numero_propuesta: 44 } } }
  const admin = { id: 99, rol: 'admin' }

  await withRenderProbeEnvironment(
    { NODE_ENV: 'test', PF3_TEST_RENDER_PROBE_ENABLED: 'true' },
    () => {
      assert.equal(puedeProbarRenderErrorPdf(proposal, admin), true)
      assert.equal(puedeProbarRenderErrorPdf(proposal, { id: 4, rol: 'agente' }), false)
      assert.equal(puedeProbarRenderErrorPdf({ ...proposal, estado: 'borrador' }, admin), false)
      assert.equal(puedeProbarRenderErrorPdf({ ...proposal, snapshot_json: null }, admin), false)
    }
  )

  await withRenderProbeEnvironment(
    { NODE_ENV: 'production', PF3_TEST_RENDER_PROBE_ENABLED: 'true' },
    () => assert.equal(puedeProbarRenderErrorPdf(proposal, admin), false)
  )
  await withRenderProbeEnvironment(
    { NODE_ENV: 'test', PF3_TEST_RENDER_PROBE_ENABLED: 'false' },
    () => assert.equal(puedeProbarRenderErrorPdf(proposal, admin), false)
  )
})

test('test render probe renders only the persisted error PDF snapshot without emission side effects', async (t) => {
  const snapshot = { proposal: { numero_propuesta: 44 } }
  const calls = configureDependencies(t, {
    proposal: { ...proposalContext(), estado: 'error_pdf', snapshot_json: snapshot },
  })
  const { probarRenderErrorPdf } =
    await import('./emision.service.js?case=test-render-probe-success')

  await withRenderProbeEnvironment(
    { NODE_ENV: 'test', PF3_TEST_RENDER_PROBE_ENABLED: 'true' },
    () => probarRenderErrorPdf(15, { id: 99, rol: 'admin' })
  )

  assert.deepEqual(calls.render, [snapshot])
  assert.deepEqual(calls.start, [])
  assert.deepEqual(calls.snapshots, [])
  assert.deepEqual(calls.uploads, [])
  assert.deepEqual(calls.downloads, [])
  assert.deepEqual(calls.removes, [])
  assert.deepEqual(calls.confirms, [])
  assert.deepEqual(calls.errors, [])
})

test('test render probe is unavailable in production even when the flag is enabled', async (t) => {
  const calls = configureDependencies(t)
  const { probarRenderErrorPdf } =
    await import('./emision.service.js?case=test-render-probe-production')

  await assert.rejects(
    () =>
      withRenderProbeEnvironment(
        { NODE_ENV: 'production', PF3_TEST_RENDER_PROBE_ENABLED: 'true' },
        () => probarRenderErrorPdf(15, { id: 99, rol: 'admin' })
      ),
    (error) => error.status === 404
  )
  assert.deepEqual(calls.render, [])
})

test('test render probe is unavailable when the explicit non-production flag is absent', async (t) => {
  const calls = configureDependencies(t)
  const { probarRenderErrorPdf } =
    await import('./emision.service.js?case=test-render-probe-flag-disabled')

  await assert.rejects(
    () =>
      withRenderProbeEnvironment({ NODE_ENV: 'test', PF3_TEST_RENDER_PROBE_ENABLED: 'false' }, () =>
        probarRenderErrorPdf(15, { id: 99, rol: 'admin' })
      ),
    (error) => error.status === 404
  )
  assert.deepEqual(calls.render, [])
})

test('test render probe rejects non-admins before reading or rendering a proposal', async (t) => {
  const calls = configureDependencies(t)
  const { probarRenderErrorPdf } =
    await import('./emision.service.js?case=test-render-probe-non-admin')

  await assert.rejects(
    () =>
      withRenderProbeEnvironment({ NODE_ENV: 'test', PF3_TEST_RENDER_PROBE_ENABLED: 'true' }, () =>
        probarRenderErrorPdf(15, { id: 4, rol: 'agente' })
      ),
    (error) => error.status === 403
  )
  assert.deepEqual(calls.render, [])
})

test('test render probe rejects proposals outside error_pdf and without snapshots before rendering', async (t) => {
  const calls = configureDependencies(t)
  const { probarRenderErrorPdf } =
    await import('./emision.service.js?case=test-render-probe-invalid-state')

  await assert.rejects(
    () =>
      withRenderProbeEnvironment({ NODE_ENV: 'test', PF3_TEST_RENDER_PROBE_ENABLED: 'true' }, () =>
        probarRenderErrorPdf(15, { id: 99, rol: 'admin' })
      ),
    (error) => error.status === 409
  )
  assert.deepEqual(calls.render, [])
})

test('test render probe rejects error_pdf proposals without a snapshot before rendering', async (t) => {
  const calls = configureDependencies(t, {
    proposal: { ...proposalContext(), estado: 'error_pdf', snapshot_json: null },
  })
  const { probarRenderErrorPdf } =
    await import('./emision.service.js?case=test-render-probe-missing-snapshot')

  await assert.rejects(
    () =>
      withRenderProbeEnvironment({ NODE_ENV: 'test', PF3_TEST_RENDER_PROBE_ENABLED: 'true' }, () =>
        probarRenderErrorPdf(15, { id: 99, rol: 'admin' })
      ),
    (error) => error.status === 409
  )
  assert.deepEqual(calls.render, [])
})

test('test render probe returns only a sanitized error when the renderer fails', async (t) => {
  const calls = configureDependencies(t, {
    proposal: {
      ...proposalContext(),
      estado: 'error_pdf',
      snapshot_json: { proposal: { numero_propuesta: 44 } },
    },
    renderPropuestaMrcPdf: async () => {
      throw new Error('renderer internal detail must not reach the client')
    },
  })
  const { probarRenderErrorPdf } =
    await import('./emision.service.js?case=test-render-probe-sanitized-error')

  await withRenderProbeEnvironment(
    { NODE_ENV: 'test', PF3_TEST_RENDER_PROBE_ENABLED: 'true' },
    async () => {
      await assert.rejects(
        () => probarRenderErrorPdf(15, { id: 99, rol: 'admin' }),
        (error) =>
          error.status === 500 &&
          error.publicMessage === 'No fue posible generar el PDF de prueba' &&
          !error.message.includes('renderer internal detail')
      )
    }
  )

  assert.deepEqual(calls.uploads, [])
  assert.deepEqual(calls.downloads, [])
  assert.deepEqual(calls.removes, [])
  assert.deepEqual(calls.confirms, [])
  assert.deepEqual(calls.errors, [])
})
