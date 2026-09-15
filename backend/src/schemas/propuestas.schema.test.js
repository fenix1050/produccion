import assert from 'node:assert/strict'
import { test } from 'node:test'

import { actualizarBorradorSchema, draftPropuestaSchema } from './propuestas.schema.js'

function borradorPf3Valido() {
  return {
    partes: {
      asegurado: {
        tipo_persona: 'fisica',
        nombre_razon_social: 'Ana Gómez',
        documento: '1234567',
        telefono: '0981123456',
        email: 'ana@example.com',
        direccion: 'Asunción',
        ciudad: 'Asunción',
        actividad_economica: 'Comercio',
        fecha_nacimiento: '1990-01-15',
        nacionalidad: 'Paraguaya',
        estado_civil: 'soltera',
        ocupacion: 'Comerciante',
        ingreso_mensual: 5000000,
        lugar_trabajo: 'Comercio Gómez',
      },
      tomador_igual_asegurado: false,
      tomador: {
        tipo_persona: 'juridica',
        nombre_razon_social: 'Tomador SA',
        documento: '80000000-1',
        telefono: '021000000',
        email: 'tomador@example.com',
        direccion: 'Asunción',
        ciudad: 'Asunción',
        actividad_economica: 'Servicios',
      },
      representante_legal: {
        nombre: 'María Pérez',
        documento: '2345678',
        cargo: 'Directora',
      },
    },
    pla_ft: {
      es_pep: false,
      sujeto_obligado: false,
      origen_fondos_descripcion: 'Ingresos comerciales',
      proveedor_estado: false,
    },
    descripcion_detallada: 'Riesgo comercial declarado.',
    observaciones: 'Sin observaciones.',
    tipo_firma: 'digital',
  }
}

test('PF-3 draft schema accepts a complete valid draft', () => {
  const borrador = borradorPf3Valido()

  const resultado = draftPropuestaSchema.parse(borrador)
  const actualizacion = actualizarBorradorSchema.parse({
    revision: 1,
    cotizacion_variante_id: 10,
    cotizacion_plan_pago_id: 20,
    draft_json: borrador,
  })

  assert.equal(resultado.tipo_firma, 'digital')
  assert.equal(resultado.partes.tomador.ciudad, 'Asunción')
  assert.equal(actualizacion.revision, 1)
})

test('PF-3 draft schema rejects an unsupported signature type', () => {
  const resultado = draftPropuestaSchema.safeParse({
    ...borradorPf3Valido(),
    tipo_firma: 'electronica',
  })

  assert.equal(resultado.success, false)
})
