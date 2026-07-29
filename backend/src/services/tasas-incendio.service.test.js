import assert from 'node:assert/strict'
import { test } from 'node:test'

import ExcelJS from 'exceljs'

import {
  cruzarContraCatalogo,
  derivarTasasPorObjeto,
  generarSqlSeed,
  normalizarNombreRubro,
  parsearPivotIncendio,
} from './tasas-incendio.service.js'

// Helper: construye un workbook en memoria con la misma forma que
// "Tasa sistema Incendio.xlsx" (Hoja1): fila 4 = encabezado, filas 5+ = datos,
// columna A=nombre, B=tasa global, C=tasa minima, D=tasa maxima.
function construirWorkbookPivot(filas, { hoja = 'Hoja1' } = {}) {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet(hoja)
  ws.addRow([]) // 1
  ws.addRow([]) // 2
  ws.addRow([]) // 3
  ws.addRow(['Etiquetas de fila', 'Promedio de Tasa', 'Mín. de Tasa', 'Máx. de Tasa']) // 4
  for (const fila of filas) {
    ws.addRow([fila.nombre, fila.tasaGlobal, fila.tasaMinima, fila.tasaMaxima])
  }
  return workbook
}

// ---- normalizarNombreRubro ----

test('normalizarNombreRubro: trim, colapsa espacios dobles, upper, sin acentos', () => {
  assert.equal(normalizarNombreRubro('  consultorio   médico  '), 'CONSULTORIO MEDICO')
  assert.equal(normalizarNombreRubro('Vivienda'), 'VIVIENDA')
  assert.equal(normalizarNombreRubro('Panadería'), 'PANADERIA')
})

// ---- parsearPivotIncendio ----

test('parsearPivotIncendio: hoja inexistente lanza', () => {
  const workbook = construirWorkbookPivot([
    { nombre: 'VIVIENDA', tasaGlobal: 2.24, tasaMinima: 0.6, tasaMaxima: 35.48 },
  ])
  assert.throws(() =>
    parsearPivotIncendio(workbook, { hoja: 'NoExiste', filaDesde: 5, filaHasta: 5 })
  )
})

test('parsearPivotIncendio: rango vacío lanza', () => {
  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet('Hoja1')
  assert.throws(() => parsearPivotIncendio(workbook, { hoja: 'Hoja1', filaDesde: 5, filaHasta: 4 }))
})

test('parsearPivotIncendio: nombre vacío tras trim lanza nombrando la fila', () => {
  const workbook = construirWorkbookPivot([
    { nombre: 'VIVIENDA', tasaGlobal: 2.24, tasaMinima: 0.6, tasaMaxima: 35.48 },
    { nombre: '   ', tasaGlobal: 1, tasaMinima: 1, tasaMaxima: 1 },
  ])
  assert.throws(() => parsearPivotIncendio(workbook, { filaDesde: 5, filaHasta: 6 }), /fila 6/i)
})

test('parsearPivotIncendio: parsea filas válidas', () => {
  const workbook = construirWorkbookPivot([
    { nombre: 'VIVIENDA', tasaGlobal: 2.24, tasaMinima: 0.6, tasaMaxima: 35.48 },
    { nombre: 'SILOS', tasaGlobal: 1.5, tasaMinima: 1, tasaMaxima: 2 },
  ])
  const filas = parsearPivotIncendio(workbook, { filaDesde: 5, filaHasta: 6 })
  assert.equal(filas.length, 2)
  assert.equal(filas[0].nombre, 'VIVIENDA')
  assert.equal(filas[0].tasaGlobal, 2.24)
  assert.equal(filas[0].fila, 5)
  assert.equal(filas[1].nombre, 'SILOS')
})

// ---- derivarTasasPorObjeto ----

test('derivarTasasPorObjeto(2.24) reproduce exactamente la regresión de migración 038', () => {
  const tasas = derivarTasasPorObjeto(2.24)
  assert.equal(tasas.edificio, 0.9)
  assert.equal(tasas.instalaciones, 0.9)
  assert.equal(tasas.contenido_mueble_equipos, 1.34)
  assert.equal(tasas.contenido_mercaderia, 1.34)
})

test('derivarTasasPorObjeto: redondeo half-up en un valor x.xx5', () => {
  // 1.0625 * 0.4 = 0.425 -> half-up debe subir a 0.43, no truncar a 0.42
  const tasas = derivarTasasPorObjeto(1.0625)
  assert.equal(tasas.edificio, 0.43)
  assert.equal(tasas.instalaciones, 0.43)
})

// ---- cruzarContraCatalogo ----

test('cruzarContraCatalogo: dos filas del pivot que normalizan igual quedan en ambiguos (nunca "se queda con la última")', () => {
  const filasPivot = [
    { nombre: 'Panadería', tasaGlobal: 2, tasaMinima: 1, tasaMaxima: 3, fila: 5 },
    { nombre: 'PANADERIA', tasaGlobal: 3, tasaMinima: 1, tasaMaxima: 3, fila: 6 },
  ]
  const resultado = cruzarContraCatalogo(filasPivot, [], [])
  assert.equal(resultado.reutilizados.length, 0)
  assert.equal(resultado.nuevos.length, 0)
  assert.equal(resultado.ambiguos.length, 1)
  assert.equal(resultado.ambiguos[0].filas.length, 2)
})

test('cruzarContraCatalogo: un nombre del pivot que cruza con más de un rubro existente lista los candidatos', () => {
  const filasPivot = [{ nombre: 'BAZAR', tasaGlobal: 2, tasaMinima: 1, tasaMaxima: 3, fila: 5 }]
  const rubrosExistentes = [
    { id: 1, nombre: 'BAZAR' },
    { id: 2, nombre: 'Bazar' }, // grafía distinta, normaliza igual -> ambiguo contra catálogo
  ]
  const resultado = cruzarContraCatalogo(filasPivot, rubrosExistentes, [])
  assert.equal(resultado.ambiguos.length, 1)
  assert.equal(resultado.ambiguos[0].candidatos.length, 2)
})

test('cruzarContraCatalogo: nombre ya presente en tipos_riesgo_incendio va a yaSembrados, no a nuevos', () => {
  const filasPivot = [
    { nombre: 'VIVIENDA', tasaGlobal: 2.6265, tasaMinima: 0.65, tasaMaxima: 16, fila: 5 },
  ]
  const rubrosExistentes = [{ id: 10, nombre: 'VIVIENDA' }]
  const tiposRiesgoExistentes = ['VIVIENDA']
  const resultado = cruzarContraCatalogo(filasPivot, rubrosExistentes, tiposRiesgoExistentes)
  assert.equal(resultado.yaSembrados.length, 1)
  assert.equal(resultado.nuevos.length, 0)
  assert.equal(resultado.reutilizados.length, 0)
  assert.equal(resultado.yaSembrados[0].nombreCanonico, 'VIVIENDA')
})

test('cruzarContraCatalogo: rubro reutilizado emite el nombre EXISTENTE de rubros_actividad', () => {
  const filasPivot = [{ nombre: 'silos', tasaGlobal: 1.5, tasaMinima: 1, tasaMaxima: 2, fila: 5 }]
  const rubrosExistentes = [{ id: 20, nombre: 'SILOS' }]
  const resultado = cruzarContraCatalogo(filasPivot, rubrosExistentes, [])
  assert.equal(resultado.reutilizados.length, 1)
  assert.equal(resultado.reutilizados[0].nombreCanonico, 'SILOS')
  assert.equal(resultado.reutilizados[0].rubroId, 20)
})

test('cruzarContraCatalogo: rubro sin match en catálogo va a nuevos con el nombre del pivot (trim + colapso, sin tocar mayúsculas/acentos)', () => {
  const filasPivot = [
    { nombre: '  Aire   Acondicionado  ', tasaGlobal: 2, tasaMinima: 1, tasaMaxima: 3, fila: 5 },
  ]
  const resultado = cruzarContraCatalogo(filasPivot, [], [])
  assert.equal(resultado.nuevos.length, 1)
  assert.equal(resultado.nuevos[0].nombreCanonico, 'Aire Acondicionado')
})

test('cruzarContraCatalogo: warnings incluyen 0.4*global < tasa_minima', () => {
  const filasPivot = [{ nombre: 'SILOS', tasaGlobal: 1, tasaMinima: 0.9, tasaMaxima: 2, fila: 5 }]
  const resultado = cruzarContraCatalogo(filasPivot, [], [])
  assert.ok(resultado.warnings.some((w) => /0\.4.*tasa_minima|clamp/i.test(w)))
})

// ---- generarSqlSeed ----

test('generarSqlSeed: escapa comillas simples duplicándolas', () => {
  const cruce = {
    reutilizados: [],
    nuevos: [
      {
        nombreCanonico: "D'ANGELO NEGOCIO",
        fila: { tasaGlobal: 2, tasaMinima: 1, tasaMaxima: 3, fila: 5 },
      },
    ],
    yaSembrados: [],
    ambiguos: [],
    sinPivot: [],
    warnings: [],
  }
  const sql = generarSqlSeed(cruce, {
    fuente: 'test.xlsx',
    hoja: 'Hoja1',
    fechaGeneracion: '2026-07-29',
  })
  assert.match(sql, /D''ANGELO NEGOCIO/)
})

test('generarSqlSeed: es determinista (mismo orden que el pivot)', () => {
  const cruce = {
    reutilizados: [],
    nuevos: [
      { nombreCanonico: 'ZETA', fila: { tasaGlobal: 2, tasaMinima: 1, tasaMaxima: 3, fila: 6 } },
      { nombreCanonico: 'ALFA', fila: { tasaGlobal: 2, tasaMinima: 1, tasaMaxima: 3, fila: 5 } },
    ],
    yaSembrados: [],
    ambiguos: [],
    sinPivot: [],
    warnings: [],
  }
  const metadatos = { fuente: 'test.xlsx', hoja: 'Hoja1', fechaGeneracion: '2026-07-29' }
  const sql1 = generarSqlSeed(cruce, metadatos)
  const sql2 = generarSqlSeed(cruce, metadatos)
  assert.equal(sql1, sql2)
  // Orden del pivot preservado (ZETA antes que ALFA en la lista de entrada), no alfabético.
  assert.ok(sql1.indexOf('ZETA') < sql1.indexOf('ALFA'))
})

test('generarSqlSeed: para un rubro reutilizado emite el nombre EXISTENTE, nunca el string crudo del pivot', () => {
  const cruce = {
    reutilizados: [
      {
        nombreCanonico: 'SILOS',
        rubroId: 20,
        fila: { nombre: 'silos', tasaGlobal: 1.5, tasaMinima: 1, tasaMaxima: 2, fila: 5 },
      },
    ],
    nuevos: [],
    yaSembrados: [],
    ambiguos: [],
    sinPivot: [],
    warnings: [],
  }
  const sql = generarSqlSeed(cruce, {
    fuente: 'test.xlsx',
    hoja: 'Hoja1',
    fechaGeneracion: '2026-07-29',
  })
  assert.match(sql, /'SILOS'/)
  assert.doesNotMatch(sql, /'silos'/)
})
