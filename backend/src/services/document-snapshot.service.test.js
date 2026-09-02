import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCartaOfertaSnapshot,
  buildCartaOfertaRenderInput,
  buildCotizacionFuenteSnapshot,
  canonicalStringify,
  hashSnapshot,
} from './document-snapshot.service.js'

test('canonicalStringify and hashSnapshot are stable when object key order differs', () => {
  const first = { z: [{ b: 2, a: 1 }], a: true }
  const second = { a: true, z: [{ a: 1, b: 2 }] }

  assert.equal(canonicalStringify(first), canonicalStringify(second))
  assert.equal(hashSnapshot(first), hashSnapshot(second))
})

test('buildCotizacionFuenteSnapshot includes every field watched by recotization invalidation', () => {
  assert.deepEqual(
    buildCotizacionFuenteSnapshot({
      plan_id: 3,
      agente_id: 7,
      fecha: '2026-08-25',
      vigencia_dias: 30,
      cliente_nombre: 'Client',
      cliente_contacto: 'contact@example.com',
      riesgo_datos: { address: 'Main' },
      capital_asegurado: 100,
      moneda: 'PYG',
      tipo_cambio_snapshot: 7300,
      tipo_cambio_fuente: 'manual',
      tipo_cambio_fecha: '2026-08-25T00:00:00Z',
      usuario: null,
      plan: null,
      ramo: null,
      plan_coberturas: [],
      cotizacion_coberturas: [],
      cotizacion_servicios: [],
      cotizacion_clausulas: [],
      cotizacion_variantes: [],
    }),
    {
      plan_id: 3,
      agente_id: 7,
      fecha: '2026-08-25',
      vigencia_dias: 30,
      cliente_nombre: 'Client',
      cliente_contacto: 'contact@example.com',
      riesgo_datos: { address: 'Main' },
      capital_asegurado: 100,
      moneda: 'PYG',
      tipo_cambio_snapshot: 7300,
      tipo_cambio_fuente: 'manual',
      tipo_cambio_fecha: '2026-08-25T00:00:00Z',
      usuario: null,
      plan: null,
      ramo: null,
      plan_coberturas: [],
      cotizacion_coberturas: [],
      cotizacion_servicios: [],
      cotizacion_clausulas: [],
      cotizacion_variantes: [],
    }
  )
})

test('buildCotizacionFuenteSnapshot changes for direct agent, date, or validity changes', () => {
  const cotizacion = {
    plan_id: 3,
    agente_id: 7,
    fecha: '2026-08-25',
    vigencia_dias: 30,
  }
  const fuenteOriginal = buildCotizacionFuenteSnapshot(cotizacion)

  for (const cambio of [{ agente_id: 8 }, { fecha: '2026-08-26' }, { vigencia_dias: 45 }]) {
    const fuenteModificada = buildCotizacionFuenteSnapshot({ ...cotizacion, ...cambio })
    assert.notEqual(hashSnapshot(fuenteModificada), hashSnapshot(fuenteOriginal))
  }
})

test('buildCotizacionFuenteSnapshot changes for every persisted Carta commercial relation', () => {
  const cotizacion = {
    plan_id: 3,
    cotizacion_coberturas: [
      {
        id: 10,
        cotizacion_id: 7,
        cobertura_id: 4,
        nombre_snapshot: 'Fire',
        monto: 100,
        franquicia: 0,
        tipo_aplicacion: 'cobertura',
        incluida: true,
        coberturas_catalogo: { codigo: 'fire', incluye_en_suma_asegurada_total: true },
      },
    ],
    cotizacion_servicios: [
      {
        id: 11,
        cotizacion_id: 7,
        servicio_id: 5,
        nombre_snapshot: 'Vehicle assistance',
        texto_legal_snapshot: 'Roadside assistance',
        incluido: true,
      },
    ],
    cotizacion_clausulas: [
      {
        id: 12,
        cotizacion_id: 7,
        clausula_id: 6,
        texto_legal_snapshot: 'Contractual clause',
      },
    ],
    cotizacion_variantes: [
      {
        id: 20,
        cotizacion_id: 7,
        numero_variante: 'MRC-1',
        tipo_franquicia: 'sin_franquicia',
        franquicia_monto: 0,
        prima: 50,
        cotizacion_plan_pago: [
          {
            id: 30,
            variante_id: 20,
            forma_pago_id: 1,
            cantidad_cuotas: 0,
            rpf_porcentaje: 0,
            rpf_monto: 0,
            iva_monto: 5,
            premio_total: 55,
            monto_inicial: 55,
            monto_cuota: 0,
          },
        ],
        cotizacion_ajustes: [
          {
            id: 31,
            variante_id: 20,
            tipo: 'descuento',
            catalogo_id: null,
            descripcion: 'Commercial discount',
            porcentaje: 5,
            monto: 2.5,
          },
        ],
      },
    ],
  }
  const fuenteOriginal = buildCotizacionFuenteSnapshot(cotizacion)
  const fuenteConCoberturaModificada = buildCotizacionFuenteSnapshot({
    ...cotizacion,
    cotizacion_coberturas: [{ ...cotizacion.cotizacion_coberturas[0], monto: 200 }],
  })
  const fuenteConVarianteModificada = buildCotizacionFuenteSnapshot({
    ...cotizacion,
    cotizacion_variantes: [{ ...cotizacion.cotizacion_variantes[0], prima: 60 }],
  })
  const fuenteConPagoModificado = buildCotizacionFuenteSnapshot({
    ...cotizacion,
    cotizacion_variantes: [
      {
        ...cotizacion.cotizacion_variantes[0],
        cotizacion_plan_pago: [
          { ...cotizacion.cotizacion_variantes[0].cotizacion_plan_pago[0], premio_total: 60 },
        ],
      },
    ],
  })
  const fuenteConAjusteModificado = buildCotizacionFuenteSnapshot({
    ...cotizacion,
    cotizacion_variantes: [
      {
        ...cotizacion.cotizacion_variantes[0],
        cotizacion_ajustes: [
          { ...cotizacion.cotizacion_variantes[0].cotizacion_ajustes[0], monto: 5 },
        ],
      },
    ],
  })
  const fuenteConServicioModificado = buildCotizacionFuenteSnapshot({
    ...cotizacion,
    cotizacion_servicios: [{ ...cotizacion.cotizacion_servicios[0], incluido: false }],
  })
  const fuenteConClausulaModificada = buildCotizacionFuenteSnapshot({
    ...cotizacion,
    cotizacion_clausulas: [
      { ...cotizacion.cotizacion_clausulas[0], texto_legal_snapshot: 'Updated clause' },
    ],
  })

  assert.notDeepEqual(fuenteConCoberturaModificada, fuenteOriginal)
  assert.notEqual(hashSnapshot(fuenteConCoberturaModificada), hashSnapshot(fuenteOriginal))
  assert.notDeepEqual(fuenteConVarianteModificada, fuenteOriginal)
  assert.notEqual(hashSnapshot(fuenteConVarianteModificada), hashSnapshot(fuenteOriginal))
  assert.notDeepEqual(fuenteConPagoModificado, fuenteOriginal)
  assert.notEqual(hashSnapshot(fuenteConPagoModificado), hashSnapshot(fuenteOriginal))
  assert.notDeepEqual(fuenteConAjusteModificado, fuenteOriginal)
  assert.notEqual(hashSnapshot(fuenteConAjusteModificado), hashSnapshot(fuenteOriginal))
  assert.notDeepEqual(fuenteConServicioModificado, fuenteOriginal)
  assert.notEqual(hashSnapshot(fuenteConServicioModificado), hashSnapshot(fuenteOriginal))
  assert.notDeepEqual(fuenteConClausulaModificada, fuenteOriginal)
  assert.notEqual(hashSnapshot(fuenteConClausulaModificada), hashSnapshot(fuenteOriginal))
})

test('buildCartaOfertaSnapshot captures canonical render data without live references', () => {
  const result = buildCartaOfertaSnapshot({
    cotizacion: {
      id: 7,
      numero_cotizacion: 'MRC-7',
      agente_id: 1,
      fecha: '2026-08-25',
      vigencia_dias: 30,
      moneda: 'PYG',
      usuarios: {
        nombre: 'Agent',
        email: 'agent@example.com',
        telefono: '123',
        roles: { nombre: 'agente' },
      },
      cotizacion_coberturas: [{ nombre_snapshot: 'Fire', monto: 100 }],
      cotizacion_servicios: [
        {
          id: 11,
          cotizacion_id: 7,
          servicio_id: 4,
          nombre_snapshot: 'Vehicle assistance',
          texto_legal_snapshot: 'Assistance terms',
          incluido: true,
        },
      ],
      cotizacion_clausulas: [
        {
          id: 12,
          cotizacion_id: 7,
          clausula_id: 5,
          texto_legal_snapshot: 'Contractual clause',
        },
      ],
      cotizacion_variantes: [
        {
          prima: 50,
          cotizacion_plan_pago: [
            { premio_total: 55, formas_pago: { codigo: 'contado', nombre_display: 'Cash' } },
          ],
        },
      ],
    },
    plan: { id: 3, nombre: 'Comercio' },
    ramo: { id: 2, calculador: 'mrc' },
    planCoberturas: [
      {
        id: 9,
        plan_id: 3,
        cobertura_id: 10,
        monto: 100,
        incluida_por_defecto: true,
        coberturas_catalogo: { codigo: 'fire', incluye_en_suma_asegurada_total: true },
      },
    ],
    renderTimestamp: '2026-08-25T03:00:00.000Z',
  })

  assert.equal(result.schemaVersion, '2')
  assert.match(result.templateVersion, /^mrc:manual-source-revision:/)
  assert.equal(result.snapshot.product_code, 'mrc')
  assert.equal(result.snapshot.cotizacion.agente_id, 1)
  assert.equal(result.snapshot.cotizacion.fecha, '2026-08-25')
  assert.equal(result.snapshot.cotizacion.vigencia_dias, 30)
  assert.deepEqual(result.snapshot.cotizacion.cotizacion_servicios, [
    {
      id: 11,
      cotizacion_id: 7,
      servicio_id: 4,
      nombre_snapshot: 'Vehicle assistance',
      texto_legal_snapshot: 'Assistance terms',
      incluido: true,
    },
  ])
  assert.deepEqual(result.snapshot.cotizacion.cotizacion_clausulas, [
    { id: 12, cotizacion_id: 7, clausula_id: 5, texto_legal_snapshot: 'Contractual clause' },
  ])
  assert.deepEqual(result.snapshot.cotizacion.usuarios, {
    nombre: 'Agent',
    email: 'agent@example.com',
    telefono: '123',
    roles: { nombre: 'agente' },
  })
  assert.equal(
    result.snapshot.cotizacion.cotizacion_variantes[0].cotizacion_plan_pago[0].premio_total,
    55
  )
  assert.deepEqual(
    result.snapshot.cotizacion.cotizacion_variantes[0].cotizacion_plan_pago[0].formas_pago,
    { codigo: 'contado', nombre_display: 'Cash' }
  )
  assert.deepEqual(buildCartaOfertaRenderInput(result.snapshot), {
    cotizacion: result.snapshot.cotizacion,
    plan: result.snapshot.plan,
    ramo: result.snapshot.ramo,
    planCoberturas: result.snapshot.plan_coberturas,
    renderContext: {
      timestamp: '2026-08-25T03:00:00.000Z',
      timezone: 'America/Asuncion',
      locale: 'es-PY',
    },
  })
  assert.match(result.snapshotHash, /^[a-f0-9]{64}$/)
})

test('buildCotizacionFuenteSnapshot changes for every mutable active render dependency', () => {
  const cotizacion = {
    plan_id: 3,
    agente_id: 7,
    usuarios: {
      nombre: 'Agent',
      email: 'agent@example.com',
      telefono: '123',
      roles: { nombre: 'agente' },
    },
    cotizacion_variantes: [
      {
        id: 20,
        cotizacion_plan_pago: [
          { id: 30, formas_pago: { codigo: 'contado', nombre_display: 'Cash' } },
        ],
      },
    ],
  }
  const context = {
    plan: { id: 3, nombre: 'Plan A' },
    ramo: { id: 2, nombre: 'mrc', nombre_display: 'MRC', calculador: 'mrc' },
    planCoberturas: [
      {
        id: 9,
        plan_id: 3,
        cobertura_id: 10,
        monto: 100,
        incluida_por_defecto: true,
        coberturas_catalogo: { codigo: 'fire', incluye_en_suma_asegurada_total: true },
      },
    ],
  }
  const original = buildCotizacionFuenteSnapshot(cotizacion, context)
  const candidates = [
    buildCotizacionFuenteSnapshot(
      { ...cotizacion, usuarios: { ...cotizacion.usuarios, email: 'new@example.com' } },
      context
    ),
    buildCotizacionFuenteSnapshot(cotizacion, {
      ...context,
      plan: { ...context.plan, nombre: 'Plan B' },
    }),
    buildCotizacionFuenteSnapshot(cotizacion, {
      ...context,
      ramo: { ...context.ramo, nombre_display: 'New MRC' },
    }),
    buildCotizacionFuenteSnapshot(cotizacion, {
      ...context,
      planCoberturas: [{ ...context.planCoberturas[0], monto: 200 }],
    }),
    buildCotizacionFuenteSnapshot(
      {
        ...cotizacion,
        cotizacion_variantes: [
          {
            ...cotizacion.cotizacion_variantes[0],
            cotizacion_plan_pago: [
              {
                ...cotizacion.cotizacion_variantes[0].cotizacion_plan_pago[0],
                formas_pago: { codigo: 'cobrador', nombre_display: 'Credit' },
              },
            ],
          },
        ],
      },
      context
    ),
  ]

  for (const candidate of candidates) {
    assert.notEqual(hashSnapshot(candidate), hashSnapshot(original))
  }
})
