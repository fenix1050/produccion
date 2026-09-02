import assert from 'node:assert/strict'
import { test } from 'node:test'

import { hashPdf } from './document-snapshot.service.js'

function mockDependencies(t, overrides = {}) {
  const calls = {
    start: [],
    render: [],
    upload: [],
    emit: [],
    errors: [],
    removals: [],
    downloads: 0,
  }
  t.mock.module('../templates/oferta/index.js', {
    namedExports: { ofertaDisponibleParaRamo: () => true },
  })
  t.mock.module('./pdf.service.js', {
    namedExports: {
      renderOfertaPdf:
        overrides.renderOfertaPdf ??
        (async (renderInput) => {
          calls.render.push(renderInput)
          return Buffer.from('pdf')
        }),
    },
  })
  t.mock.module('../repositories/cartas-oferta.repository.js', {
    namedExports: {
      iniciarCartaOfertaGeneracion: async (payload) => {
        calls.start.push(payload)
        const carta = overrides.carta ?? {
          id: 11,
          version: 1,
          estado: 'generando',
          puede_generar: true,
          snapshot_vigente: true,
        }
        return { ...carta, snapshot_json: carta.snapshot_json ?? payload.p_snapshot_json }
      },
      subirPdfCartaOferta: async (...args) => calls.upload.push(args),
      emitirCartaOferta: async (payload) => {
        calls.emit.push(payload)
        return overrides.emitir ?? true
      },
      registrarErrorCartaOferta: async (payload) => calls.errors.push(payload),
      eliminarPdfCartaOferta: async (storagePath) => calls.removals.push(storagePath),
      descargarPdfCartaOferta: async () => {
        calls.downloads += 1
        return Buffer.from('stored')
      },
    },
  })
  return calls
}

function input() {
  return {
    cotizacion: {
      id: 7,
      numero_cotizacion: 'MRC-7',
      cotizacion_variantes: [],
      usuarios: {
        nombre: 'Original agent',
        email: 'agent@example.com',
        roles: { nombre: 'agente' },
      },
      transient_live_field: 'must-not-reach-renderer',
    },
    plan: { id: 2, nombre: 'MRC' },
    ramo: { id: 5, nombre: 'mrc', nombre_display: 'MRC', calculador: 'mrc' },
    planCoberturas: [],
    usuario: { id: 1 },
  }
}

test('generarCartaOfertaPersistida snapshots, stores privately, and emits one immutable record', async (t) => {
  const calls = mockDependencies(t)
  const { generarCartaOfertaPersistida } = await import('./carta-oferta.service.js?case=emit')

  const pdf = await generarCartaOfertaPersistida(input())

  assert.deepEqual(pdf, Buffer.from('pdf'))
  assert.equal(calls.start.length, 1)
  assert.equal(calls.start[0].p_cotizacion_id, 7)
  assert.match(calls.start[0].p_snapshot_hash, /^[a-f0-9]{64}$/)
  assert.deepEqual(calls.upload[0][0], '7/v1.pdf')
  assert.equal(calls.emit[0].p_pdf_storage_path, '7/v1.pdf')
  assert.match(calls.emit[0].p_pdf_hash, /^[a-f0-9]{64}$/)
  assert.deepEqual(calls.render[0].cotizacion, calls.start[0].p_snapshot_json.cotizacion)
  assert.deepEqual(calls.render[0].plan, calls.start[0].p_snapshot_json.plan)
  assert.deepEqual(calls.render[0].ramo, calls.start[0].p_snapshot_json.ramo)
  assert.equal(calls.render[0].cotizacion.transient_live_field, undefined)
  assert.equal(
    calls.render[0].renderContext.timestamp,
    calls.start[0].p_snapshot_json.render_context.timestamp
  )
})

test('generarCartaOfertaPersistida renders the snapshot JSON returned by the create RPC', async (t) => {
  const persistedSnapshot = {
    cotizacion: { id: 7, cliente_nombre: 'Persisted client', cotizacion_variantes: [] },
    plan: { id: 2, nombre: 'Persisted plan' },
    ramo: { id: 5, nombre: 'mrc', nombre_display: 'Persisted MRC', calculador: 'mrc' },
    plan_coberturas: [],
    render_context: {
      timestamp: '2026-08-25T03:00:00.000Z',
      timezone: 'America/Asuncion',
      locale: 'es-PY',
    },
  }
  const calls = mockDependencies(t, {
    carta: {
      id: 11,
      version: 1,
      estado: 'generando',
      puede_generar: true,
      snapshot_vigente: true,
      snapshot_json: persistedSnapshot,
    },
  })
  const { generarCartaOfertaPersistida } =
    await import('./carta-oferta.service.js?case=persisted-snapshot')

  await generarCartaOfertaPersistida(input())

  assert.notDeepEqual(calls.start[0].p_snapshot_json, persistedSnapshot)
  assert.equal(calls.render[0].cotizacion.cliente_nombre, 'Persisted client')
  assert.equal(calls.render[0].plan.nombre, 'Persisted plan')
  assert.equal(calls.render[0].renderContext.timestamp, '2026-08-25T03:00:00.000Z')
})

test('generarCartaOfertaPersistida reuses the stored PDF for the same emitted snapshot', async (t) => {
  const calls = mockDependencies(t, {
    carta: {
      id: 11,
      version: 1,
      estado: 'emitida',
      pdf_hash: hashPdf(Buffer.from('stored')),
      puede_generar: false,
      snapshot_vigente: true,
    },
  })
  const { generarCartaOfertaPersistida } = await import('./carta-oferta.service.js?case=reuse')

  const pdf = await generarCartaOfertaPersistida(input())

  assert.deepEqual(pdf, Buffer.from('stored'))
  assert.equal(calls.downloads, 1)
  assert.equal(calls.upload.length, 0)
  assert.equal(calls.emit.length, 0)
})

test('generarCartaOfertaPersistida rejects a stored PDF with a mismatched hash', async (t) => {
  mockDependencies(t, {
    carta: {
      id: 11,
      version: 1,
      estado: 'emitida',
      pdf_hash: 'a'.repeat(64),
      puede_generar: false,
      snapshot_vigente: true,
    },
  })
  const { generarCartaOfertaPersistida } =
    await import('./carta-oferta.service.js?case=bad-stored-hash')

  await assert.rejects(
    () => generarCartaOfertaPersistida(input()),
    (error) => error.status === 409
  )
})

test('generarCartaOfertaPersistida records a sanitized failure after rendering fails', async (t) => {
  const calls = mockDependencies(t, {
    renderOfertaPdf: async () => {
      const error = new Error('renderer unavailable')
      error.code = 'PUPPETEER_UNAVAILABLE'
      throw error
    },
  })
  const { generarCartaOfertaPersistida } = await import('./carta-oferta.service.js?case=error')

  await assert.rejects(() => generarCartaOfertaPersistida(input()), /renderer unavailable/)
  assert.deepEqual(calls.errors, [{ p_carta_id: 11, p_error_codigo: 'PUPPETEER_UNAVAILABLE' }])
})

test('generarCartaOfertaPersistida rejects a snapshot that changed before the RPC lock', async (t) => {
  const calls = mockDependencies(t, {
    carta: { snapshot_vigente: false },
  })
  const { generarCartaOfertaPersistida } =
    await import('./carta-oferta.service.js?case=stale-before-lock')

  await assert.rejects(
    () => generarCartaOfertaPersistida(input()),
    (error) => error.code === 'CARTA_OFERTA_SNAPSHOT_OBSOLETO'
  )
  assert.equal(calls.upload.length, 0)
  assert.equal(calls.emit.length, 0)
})

test('generarCartaOfertaPersistida discards the PDF when recotization replaces it before emission', async (t) => {
  const calls = mockDependencies(t, { emitir: false })
  const { generarCartaOfertaPersistida } =
    await import('./carta-oferta.service.js?case=replaced-before-emit')

  await assert.rejects(
    () => generarCartaOfertaPersistida(input()),
    (error) => error.code === 'CARTA_OFERTA_SNAPSHOT_OBSOLETO'
  )
  assert.equal(calls.upload.length, 1)
  assert.deepEqual(calls.removals, ['7/v1.pdf'])
  assert.deepEqual(calls.errors, [
    { p_carta_id: 11, p_error_codigo: 'CARTA_OFERTA_SNAPSHOT_OBSOLETO' },
  ])
})
