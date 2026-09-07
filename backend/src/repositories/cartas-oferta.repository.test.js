import assert from 'node:assert/strict'
import { test } from 'node:test'

test('iniciarCartaOfertaGeneracion delegates the immutable document payload to one RPC', async (t) => {
  const calls = []
  t.mock.module('../config/supabase.js', {
    namedExports: {
      supabase: {
        rpc: (name, payload) => {
          calls.push({ name, payload })
          return Promise.resolve({
            data: [
              {
                id: 17,
                version: 1,
                estado: 'generando',
                snapshot_json: { document_type: 'carta_oferta' },
              },
            ],
            error: null,
          })
        },
      },
    },
  })

  const { iniciarCartaOfertaGeneracion } =
    await import('./cartas-oferta.repository.js?case=start-document')
  const payload = { p_cotizacion_id: 7, p_snapshot_hash: 'a'.repeat(64) }

  const carta = await iniciarCartaOfertaGeneracion(payload)

  assert.deepEqual(calls, [{ name: 'iniciar_carta_oferta_generacion', payload }])
  assert.equal(carta.id, 17)
  assert.deepEqual(carta.snapshot_json, { document_type: 'carta_oferta' })
})

test('subirPdfCartaOferta uses the private bucket without producing a public URL', async (t) => {
  const uploads = []
  t.mock.module('../config/supabase.js', {
    namedExports: {
      supabase: {
        storage: {
          from: (bucket) => ({
            upload: (path, body, options) => {
              uploads.push({ bucket, path, body, options })
              return Promise.resolve({ error: null })
            },
          }),
        },
      },
    },
  })

  const { subirPdfCartaOferta } = await import('./cartas-oferta.repository.js?case=private-upload')
  const pdf = Buffer.from('pdf')

  await subirPdfCartaOferta('7/v1.pdf', pdf)

  assert.equal(uploads[0].bucket, 'cartas-oferta-privadas')
  assert.equal(uploads[0].options.upsert, false)
  assert.equal(uploads[0].options.contentType, 'application/pdf')
})
