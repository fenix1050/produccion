import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DRAFT_JSON_MAX_CARACTERES,
  draftPropuestaSchema,
  listarPropuestasQuerySchema,
} from './propuestas.schema.js'

test('draftPropuestaSchema: acepta documento_tipo (ci/ruc) y el campo ruc por separado', () => {
  const conCi = draftPropuestaSchema.safeParse({
    partes: { asegurado: { documento_tipo: 'ci', documento: '5592751' } },
  })
  const conRuc = draftPropuestaSchema.safeParse({
    partes: { asegurado: { documento_tipo: 'ruc', ruc: '80028528-9' } },
  })
  const invalido = draftPropuestaSchema.safeParse({
    partes: { asegurado: { documento_tipo: 'pasaporte' } },
  })

  assert.equal(conCi.success, true)
  assert.equal(conRuc.success, true)
  assert.equal(invalido.success, false)
})

test('draftPropuestaSchema: acepta sexo Femenino/Masculino y rechaza otros valores', () => {
  const conFemenino = draftPropuestaSchema.safeParse({
    partes: { asegurado: { sexo: 'Femenino' } },
  })
  const conMasculino = draftPropuestaSchema.safeParse({
    partes: { asegurado: { sexo: 'Masculino' } },
  })
  const invalido = draftPropuestaSchema.safeParse({ partes: { asegurado: { sexo: 'otro' } } })

  assert.equal(conFemenino.success, true)
  assert.equal(conMasculino.success, true)
  assert.equal(invalido.success, false)
})

// QA adversarial 2026-10-01: un JSON extra de 1 MB en draft_json pasaba `.catchall(jsonValue)` y
// reventaba el check constraint de la DB (`23514` -> 500); `2999-01-01` se aceptaba como fecha
// de nacimiento.
test('draftPropuestaSchema: rechaza un draft_json que supera el tope de tamaño', () => {
  const grande = draftPropuestaSchema.safeParse({ extra: 'x'.repeat(1_000_000) })
  assert.equal(grande.success, false)
  assert.match(grande.error.issues[0].message, /demasiado grande/)

  const justoAlLimite = { extra: 'x'.repeat(DRAFT_JSON_MAX_CARACTERES - '{"extra":""}'.length) }
  assert.equal(JSON.stringify(justoAlLimite).length, DRAFT_JSON_MAX_CARACTERES)
  assert.equal(draftPropuestaSchema.safeParse(justoAlLimite).success, true)

  const unoMas = { extra: 'x'.repeat(DRAFT_JSON_MAX_CARACTERES - '{"extra":""}'.length + 1) }
  assert.equal(draftPropuestaSchema.safeParse(unoMas).success, false)
})

test('draftPropuestaSchema: un borrador normal sigue pasando', () => {
  const resultado = draftPropuestaSchema.safeParse({
    partes: { asegurado: { nombre_razon_social: 'Ana Gómez', fecha_nacimiento: '1985-03-12' } },
    observaciones: 'Sin observaciones',
  })
  assert.equal(resultado.success, true)
})

test('draftPropuestaSchema: fecha_nacimiento futura se rechaza', () => {
  for (const fecha of ['2999-01-01', '9999-12-31']) {
    const resultado = draftPropuestaSchema.safeParse({
      partes: { asegurado: { fecha_nacimiento: fecha } },
    })
    assert.equal(resultado.success, false, fecha)
    assert.match(resultado.error.issues[0].message, /fecha de nacimiento/i)
  }
})

test('draftPropuestaSchema: fecha_nacimiento anterior a 1900-01-01 se rechaza', () => {
  const resultado = draftPropuestaSchema.safeParse({
    partes: { tomador: { fecha_nacimiento: '1899-12-31' } },
  })
  assert.equal(resultado.success, false)
})

test('draftPropuestaSchema: fecha_nacimiento en los bordes válidos (1900-01-01 y hoy) pasa', () => {
  const hoy = new Date().toISOString().slice(0, 10)
  for (const fecha of ['1900-01-01', hoy]) {
    const resultado = draftPropuestaSchema.safeParse({
      partes: { asegurado: { fecha_nacimiento: fecha } },
    })
    assert.equal(resultado.success, true, fecha)
  }
})

test('listarPropuestasQuerySchema: defaults limit=20 and offset=0 when omitted', () => {
  const result = listarPropuestasQuerySchema.parse({})
  assert.equal(result.limit, 20)
  assert.equal(result.offset, 0)
})

test('listarPropuestasQuerySchema: rejects limit=0', () => {
  const result = listarPropuestasQuerySchema.safeParse({ limit: 0 })
  assert.equal(result.success, false)
})

test('listarPropuestasQuerySchema: rejects limit=101', () => {
  const result = listarPropuestasQuerySchema.safeParse({ limit: 101 })
  assert.equal(result.success, false)
})

test('listarPropuestasQuerySchema: accepts limit=100 (upper bound)', () => {
  const result = listarPropuestasQuerySchema.safeParse({ limit: 100 })
  assert.equal(result.success, true)
  assert.equal(result.data.limit, 100)
})

test('listarPropuestasQuerySchema: rejects invalid estado', () => {
  const result = listarPropuestasQuerySchema.safeParse({ estado: 'no-existe' })
  assert.equal(result.success, false)
})

test('listarPropuestasQuerySchema: accepts estado=activa (synthetic state)', () => {
  const result = listarPropuestasQuerySchema.safeParse({ estado: 'activa' })
  assert.equal(result.success, true)
  assert.equal(result.data.estado, 'activa')
})

test('listarPropuestasQuerySchema: accepts each of the 7 real estado values', () => {
  const estados = [
    'borrador',
    'en_revision',
    'generando_pdf',
    'emitida',
    'error_pdf',
    'reemplazada',
    'anulada',
  ]
  for (const estado of estados) {
    const result = listarPropuestasQuerySchema.safeParse({ estado })
    assert.equal(result.success, true, `estado=${estado} should be valid`)
  }
})

test('listarPropuestasQuerySchema: rejects negative offset', () => {
  const result = listarPropuestasQuerySchema.safeParse({ offset: -1 })
  assert.equal(result.success, false)
})

test('listarPropuestasQuerySchema: coerces carta_oferta_id from query string and rejects non-positive', () => {
  const ok = listarPropuestasQuerySchema.safeParse({ carta_oferta_id: '7' })
  assert.equal(ok.success, true)
  assert.equal(ok.data.carta_oferta_id, 7)

  const bad = listarPropuestasQuerySchema.safeParse({ carta_oferta_id: '0' })
  assert.equal(bad.success, false)
})

test('listarPropuestasQuerySchema: busqueda is optional and trimmed', () => {
  const result = listarPropuestasQuerySchema.safeParse({ busqueda: '  cliente  ' })
  assert.equal(result.success, true)
  assert.equal(result.data.busqueda, 'cliente')
})

test('draftPropuestaSchema: descripcion_detallada acepta hasta el límite de caracteres y líneas', async () => {
  const { DESCRIPCION_DETALLADA_MAX_CARACTERES, DESCRIPCION_DETALLADA_MAX_LINEAS } =
    await import('./propuestas.schema.js')
  const enLimiteCaracteres = 'a'.repeat(DESCRIPCION_DETALLADA_MAX_CARACTERES)
  const enLimiteLineas = Array.from({ length: DESCRIPCION_DETALLADA_MAX_LINEAS }, () => 'x').join(
    '\n'
  )

  assert.equal(
    draftPropuestaSchema.safeParse({ descripcion_detallada: enLimiteCaracteres }).success,
    true
  )
  assert.equal(
    draftPropuestaSchema.safeParse({ descripcion_detallada: enLimiteLineas }).success,
    true
  )
})

test('draftPropuestaSchema: descripcion_detallada rechaza un carácter o una línea de más con mensaje claro', async () => {
  const { DESCRIPCION_DETALLADA_MAX_CARACTERES, DESCRIPCION_DETALLADA_MAX_LINEAS } =
    await import('./propuestas.schema.js')
  const caracterDeMas = draftPropuestaSchema.safeParse({
    descripcion_detallada: 'a'.repeat(DESCRIPCION_DETALLADA_MAX_CARACTERES + 1),
  })
  const lineaDeMas = draftPropuestaSchema.safeParse({
    descripcion_detallada: Array.from(
      { length: DESCRIPCION_DETALLADA_MAX_LINEAS + 1 },
      () => 'x'
    ).join('\n'),
  })

  assert.equal(caracterDeMas.success, false)
  assert.match(
    caracterDeMas.error.issues[0].message,
    new RegExp(`descripción detallada.*${DESCRIPCION_DETALLADA_MAX_CARACTERES} caracteres`, 'i')
  )
  assert.equal(lineaDeMas.success, false)
  assert.match(
    lineaDeMas.error.issues[0].message,
    new RegExp(`descripción detallada.*${DESCRIPCION_DETALLADA_MAX_LINEAS} líneas`, 'i')
  )
})

test('draftPropuestaSchema: descripcion_detallada cuenta un salto CRLF como un solo carácter', async () => {
  const { DESCRIPCION_DETALLADA_MAX_CARACTERES } = await import('./propuestas.schema.js')
  const conCrlf = `${'a'.repeat(DESCRIPCION_DETALLADA_MAX_CARACTERES - 2)}\r\nb`

  assert.equal(draftPropuestaSchema.safeParse({ descripcion_detallada: conCrlf }).success, true)
})
