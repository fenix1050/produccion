#!/usr/bin/env node
// Cambio "incendio-tasas-por-rubro" — cáscara CLI que rodea el núcleo puro
// backend/src/services/tasas-incendio.service.js. CERO escrituras a la base:
// solo lee (rubros_actividad, tipos_riesgo_incendio) y emite un .sql versionado
// por stdout/archivo. La migración generada ES el entregable auditable — este
// script NO se corre en producción, es un one-off de importación del pivot
// "Tasa sistema Incendio.xlsx" (ver proposal.md / design.md).
//
// Uso:
//   node scripts/generar-migracion-tasas-incendio.js \
//     --input "../docs/insumos/Tasa sistema Incendio.xlsx" \
//     --hoja Hoja1 --desde 5 --hasta 210 \
//     --out migrations/044_seed_tasas_incendio_rubros.sql
//
// Flag --catalogo <archivo.json> permite correr offline contra un catálogo
// fijado a mano (fixture), sin tocar la base real — útil para depurar el
// reporte de warnings sin gastar cupo de conexión. Forma esperada del JSON:
//   { "rubrosExistentes": [{"id":1,"nombre":"BAZAR"}, ...],
//     "tiposRiesgoExistentes": ["VIVIENDA", ...] }

import fs from 'node:fs/promises'
import path from 'node:path'

import ExcelJS from 'exceljs'

import {
  cruzarContraCatalogo,
  derivarTasasPorObjeto,
  generarSqlSeed,
  parsearPivotIncendio,
} from '../src/services/tasas-incendio.service.js'

function parsearArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const clave = token.slice(2)
    const siguiente = argv[i + 1]
    if (siguiente === undefined || siguiente.startsWith('--')) {
      args[clave] = true
    } else {
      args[clave] = siguiente
      i++
    }
  }
  return args
}

function abortar(mensaje) {
  console.error(`ABORTADO: ${mensaje}`)
  process.exitCode = 1
  return null
}

// Regresión directa de migración 038: si esto no da 0.90/0.90/1.34/1.34, el
// criterio de redondeo del núcleo puro divergió y NO se debe generar nada.
function verificarRegresionVivienda() {
  const tasas = derivarTasasPorObjeto(2.24)
  const esperado = {
    edificio: 0.9,
    instalaciones: 0.9,
    contenido_mueble_equipos: 1.34,
    contenido_mercaderia: 1.34,
  }
  for (const [objeto, valor] of Object.entries(esperado)) {
    if (tasas[objeto] !== valor) {
      return `derivarTasasPorObjeto(2.24) esperaba ${objeto}=${valor}, obtuvo ${tasas[objeto]} — el redondeo divergió de la migración 038.`
    }
  }
  return null
}

async function leerCatalogoDesdeDB() {
  // Import perezoso: si se usa --catalogo (offline), este módulo (y sus
  // credenciales de Supabase) nunca se carga.
  const { supabase } = await import('../src/config/supabase.js')

  const { data: rubros, error: errorRubros } = await supabase
    .from('rubros_actividad')
    .select('id, nombre')
  if (errorRubros) throw errorRubros

  const { data: tipos, error: errorTipos } = await supabase
    .from('tipos_riesgo_incendio')
    .select('nombre')
  if (errorTipos) throw errorTipos

  return {
    rubrosExistentes: rubros ?? [],
    tiposRiesgoExistentes: (tipos ?? []).map((fila) => fila.nombre),
  }
}

async function leerCatalogoDesdeArchivo(rutaJson) {
  const contenido = await fs.readFile(rutaJson, 'utf-8')
  const json = JSON.parse(contenido)
  return {
    rubrosExistentes: json.rubrosExistentes ?? [],
    tiposRiesgoExistentes: json.tiposRiesgoExistentes ?? [],
  }
}

function formatearAmbiguo(ambiguo) {
  if (ambiguo.tipo === 'pivot-pivot') {
    const filas = ambiguo.filas.map((f) => `fila ${f.fila} ("${f.nombre}")`).join(', ')
    return `Ambigüedad pivot-pivot: ${filas} normalizan al mismo nombre ("${ambiguo.nombreNormalizado}").`
  }
  const candidatos = ambiguo.candidatos.map((c) => `id=${c.id} "${c.nombre}"`).join(', ')
  return `Ambigüedad pivot-catálogo: fila ${ambiguo.fila.fila} ("${ambiguo.fila.nombre}") cruza con más de un rubro existente: ${candidatos}.`
}

export async function ejecutar(argv) {
  const args = parsearArgs(argv)

  const regresion = verificarRegresionVivienda()
  if (regresion) return abortar(regresion)

  const input = args.input
  if (!input) return abortar('falta --input <archivo.xlsx>')

  const hoja = args.hoja ?? 'Hoja1'
  const filaDesde = Number(args.desde ?? 5)
  const filaHasta = Number(args.hasta ?? 211)
  const out = args.out ?? 'migrations/044_seed_tasas_incendio_rubros.sql'

  let workbook
  try {
    workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(input)
  } catch (err) {
    return abortar(`no se pudo leer "${input}": ${err.message}`)
  }

  let filasPivot
  try {
    filasPivot = parsearPivotIncendio(workbook, { hoja, filaDesde, filaHasta })
  } catch (err) {
    return abortar(err.message)
  }

  let catalogo
  try {
    catalogo = args.catalogo
      ? await leerCatalogoDesdeArchivo(args.catalogo)
      : await leerCatalogoDesdeDB()
  } catch (err) {
    return abortar(`no se pudo leer el catálogo existente: ${err.message}`)
  }

  const cruce = cruzarContraCatalogo(
    filasPivot,
    catalogo.rubrosExistentes,
    catalogo.tiposRiesgoExistentes
  )

  if (cruce.ambiguos.length > 0) {
    console.error(
      `ABORTADO: ${cruce.ambiguos.length} ambigüedad(es) de cruce — ninguna se resuelve automáticamente:`
    )
    for (const ambiguo of cruce.ambiguos) console.error(`  - ${formatearAmbiguo(ambiguo)}`)
    process.exitCode = 1
    return null
  }

  const metadatos = {
    fuente: path.basename(input),
    hoja,
    filaDesde,
    filaHasta,
    fechaGeneracion: new Date().toISOString().slice(0, 10),
  }
  const sql = generarSqlSeed(cruce, metadatos)

  await fs.mkdir(path.dirname(out), { recursive: true })
  await fs.writeFile(out, sql, 'utf-8')

  console.log(`OK: migración generada en "${out}".`)
  console.log(
    `Resumen: ${filasPivot.length} filas del pivot | reutilizados=${cruce.reutilizados.length} | nuevos=${cruce.nuevos.length} | ya sembrados (omitidos)=${cruce.yaSembrados.length} | sin cruce con el pivot=${cruce.sinPivot.length}`
  )
  if (cruce.warnings.length) {
    console.log(
      `\nREPORTE DE WARNINGS (${cruce.warnings.length}) — no abortan, revisar antes de aplicar:`
    )
    for (const warning of cruce.warnings) console.log(`  - ${warning}`)
  } else {
    console.log('\nSin warnings.')
  }

  return { sql, cruce, filasPivot }
}

const esEjecucionDirecta =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)

if (esEjecucionDirecta) {
  ejecutar(process.argv.slice(2)).catch((err) => {
    console.error('ABORTADO (error inesperado):', err)
    process.exitCode = 1
  })
}
