import { z } from 'zod'

// Núcleo puro del importador de tasas de Incendio por rubro de actividad
// (~207 rubros del pivot "Tasa sistema Incendio.xlsx"). Sin I/O: ni lee archivos,
// ni toca Supabase — el CLI (backend/scripts/generar-migracion-tasas-incendio.js)
// es la única cáscara que hace eso. Igual criterio que tasas.service.js de Auto:
// separar el núcleo permite testearlo sin conexión real y sin filesystem, y lo
// deja bajo cobertura de `npm test` (que corre src/**/*.test.js, no scripts/**).

/**
 * Clave de cruce SOLO — nunca se usa como valor a insertar. Colapsa espacios,
 * sube a mayúsculas y quita acentos (NFD + strip de diacríticos).
 *
 * @param {string} nombre
 * @returns {string}
 */
export function normalizarNombreRubro(nombre) {
  return nombre
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

const filaPivotSchema = z.object({
  nombre: z.string().trim().min(1, 'nombre de rubro vacío tras trim'),
  tasaGlobal: z.number().finite().gt(0, 'tasa_global debe ser numérica y > 0'),
  tasaMinima: z.number().finite(),
  tasaMaxima: z.number().finite(),
  fila: z.number().int().positive(),
})

/**
 * Parsea y valida (Zod) el rango de filas del pivot de un workbook ya leído.
 * Layout fijo (mismo que "Tasa sistema Incendio.xlsx", Hoja1): columna A = nombre
 * de rubro, B = tasa global (promedio), C = tasa mínima, D = tasa máxima.
 *
 * Lanza (nunca devuelve parcial) ante: hoja inexistente, rango vacío, nombre
 * vacío tras trim, o `tasa_global` no numérica/nula/<=0 — nombrando siempre la
 * fila culpable en el mensaje.
 *
 * @param {import('exceljs').Workbook} workbook
 * @param {{hoja?: string, filaDesde?: number, filaHasta?: number}} [opciones]
 * @returns {Array<{nombre:string, tasaGlobal:number, tasaMinima:number, tasaMaxima:number, fila:number}>}
 */
export function parsearPivotIncendio(
  workbook,
  { hoja = 'Hoja1', filaDesde = 5, filaHasta = 211 } = {}
) {
  const worksheet = workbook.getWorksheet(hoja)
  if (!worksheet) {
    throw new Error(`No se encontró la hoja "${hoja}" en el archivo de tasas de Incendio`)
  }
  if (filaHasta < filaDesde) {
    throw new Error(
      `Rango vacío: filaDesde=${filaDesde} > filaHasta=${filaHasta} en la hoja "${hoja}"`
    )
  }

  const filas = []
  for (let fila = filaDesde; fila <= filaHasta; fila++) {
    const row = worksheet.getRow(fila)
    const nombreCrudo = row.getCell(1).value
    const tasaGlobal = row.getCell(2).value
    const tasaMinima = row.getCell(3).value
    const tasaMaxima = row.getCell(4).value

    const nombreTrim =
      typeof nombreCrudo === 'string' ? nombreCrudo.trim().replace(/\s+/g, ' ') : ''

    const parseo = filaPivotSchema.safeParse({
      nombre: nombreTrim,
      tasaGlobal,
      tasaMinima,
      tasaMaxima,
      fila,
    })
    if (!parseo.success) {
      throw new Error(
        `Fila ${fila} ("${nombreCrudo ?? ''}"): ${parseo.error.issues.map((i) => i.message).join('; ')}`
      )
    }
    filas.push(parseo.data)
  }

  if (filas.length === 0) {
    throw new Error(`Rango vacío: filas ${filaDesde}-${filaHasta} de la hoja "${hoja}"`)
  }

  return filas
}

// Redondeo half-up (nunca "banker's rounding"): un epsilon minúsculo compensa el
// error de representación binaria de floats (ej. 1.005*100 = 100.49999999999999
// en JS), sin afectar valores que ya caen limpio en el borde .xx5.
function redondearHalfUp(numero, decimales = 2) {
  const factor = 10 ** decimales
  return Math.round(numero * factor + Number.EPSILON * factor * 10) / factor
}

const PORCENTAJES_POR_OBJETO = {
  edificio: 0.4,
  instalaciones: 0.4,
  contenido_mueble_equipos: 0.6,
  contenido_mercaderia: 0.6,
}

/**
 * Deriva las 4 tasas por objeto de riesgo a partir de la tasa global de un tipo
 * de riesgo, con el mismo criterio 40/40/60/60 confirmado en migración 038
 * (`derivarTasasPorObjeto(2.24)` DEBE dar 0.90/0.90/1.34/1.34 — es la regresión
 * que el CLI verifica antes de generar nada).
 *
 * @param {number} tasaGlobal
 * @returns {{edificio:number, instalaciones:number, contenido_mueble_equipos:number, contenido_mercaderia:number}}
 */
export function derivarTasasPorObjeto(tasaGlobal) {
  const resultado = {}
  for (const [objeto, porcentaje] of Object.entries(PORCENTAJES_POR_OBJETO)) {
    resultado[objeto] = redondearHalfUp(tasaGlobal * porcentaje, 2)
  }
  return resultado
}

/**
 * Cruza las filas del pivot contra el catálogo existente (`rubros_actividad`) y
 * contra los tipos de riesgo ya sembrados (`tipos_riesgo_incendio`). NO lanza —
 * el CLI decide si aborta según lo que encuentre en `ambiguos`.
 *
 * @param {Array<{nombre:string, tasaGlobal:number, tasaMinima:number, tasaMaxima:number, fila:number}>} filasPivot
 * @param {Array<{id:number, nombre:string}>} rubrosExistentes
 * @param {string[]} tiposRiesgoExistentes - nombres ya presentes en tipos_riesgo_incendio
 */
export function cruzarContraCatalogo(filasPivot, rubrosExistentes, tiposRiesgoExistentes) {
  const reutilizados = []
  const nuevos = []
  const yaSembrados = []
  const ambiguos = []
  const warnings = []

  const tiposExistentesSet = new Set(tiposRiesgoExistentes)
  const rubrosPorNormalizado = new Map()
  for (const rubro of rubrosExistentes) {
    const clave = normalizarNombreRubro(rubro.nombre)
    if (!rubrosPorNormalizado.has(clave)) rubrosPorNormalizado.set(clave, [])
    rubrosPorNormalizado.get(clave).push(rubro)
  }

  // Ambigüedad pivot-pivot: dos filas del pivot que normalizan igual. Se agrupan
  // primero para nunca "quedarse con la última" fila silenciosamente.
  const pivotPorNormalizado = new Map()
  for (const fila of filasPivot) {
    const clave = normalizarNombreRubro(fila.nombre)
    if (!pivotPorNormalizado.has(clave)) pivotPorNormalizado.set(clave, [])
    pivotPorNormalizado.get(clave).push(fila)
  }

  const clavesAmbiguasPivot = new Set()
  for (const [clave, filas] of pivotPorNormalizado) {
    if (filas.length > 1) {
      clavesAmbiguasPivot.add(clave)
      ambiguos.push({ tipo: 'pivot-pivot', nombreNormalizado: clave, filas })
    }
  }

  for (const fila of filasPivot) {
    const clave = normalizarNombreRubro(fila.nombre)
    if (clavesAmbiguasPivot.has(clave)) continue // ya reportado arriba, no se procesa más

    const candidatos = rubrosPorNormalizado.get(clave) ?? []

    if (candidatos.length > 1) {
      ambiguos.push({ tipo: 'pivot-catalogo', nombreNormalizado: clave, fila, candidatos })
      continue
    }

    let nombreCanonico
    let rubroId
    const nombrePivotLimpio = fila.nombre.trim().replace(/\s+/g, ' ')

    if (candidatos.length === 1) {
      nombreCanonico = candidatos[0].nombre
      rubroId = candidatos[0].id
      if (nombreCanonico !== nombrePivotLimpio) {
        warnings.push(
          `Fila ${fila.fila}: "${fila.nombre}" cruza por normalización con grafía distinta a la existente "${nombreCanonico}" — se reutiliza el nombre existente.`
        )
      }
    } else {
      nombreCanonico = nombrePivotLimpio
    }

    if (fila.tasaMinima > fila.tasaMaxima) {
      warnings.push(
        `Fila ${fila.fila} ("${nombreCanonico}"): tasa_minima (${fila.tasaMinima}) > tasa_maxima (${fila.tasaMaxima}).`
      )
    }
    if (fila.tasaGlobal < fila.tasaMinima || fila.tasaGlobal > fila.tasaMaxima) {
      warnings.push(
        `Fila ${fila.fila} ("${nombreCanonico}"): tasa_global (${fila.tasaGlobal}) fuera de [${fila.tasaMinima}, ${fila.tasaMaxima}].`
      )
    }
    if (0.4 * fila.tasaGlobal < fila.tasaMinima) {
      warnings.push(
        `Fila ${fila.fila} ("${nombreCanonico}"): 0.4*tasa_global (${redondearHalfUp(0.4 * fila.tasaGlobal, 4)}) < tasa_minima (${fila.tasaMinima}) — activaría el clamp del calculador en toda cotización de este rubro.`
      )
    }

    if (tiposExistentesSet.has(nombreCanonico)) {
      yaSembrados.push({ fila, nombreCanonico })
      warnings.push(
        `Fila ${fila.fila}: "${nombreCanonico}" ya existe en tipos_riesgo_incendio — se omite del bloque de tasas.`
      )
      continue
    }

    if (candidatos.length === 1) {
      reutilizados.push({ fila, nombreCanonico, rubroId })
    } else {
      nuevos.push({ fila, nombreCanonico })
    }
  }

  const rubrosCruzadosIds = new Set(
    [...reutilizados, ...yaSembrados].map((entrada) => entrada.rubroId).filter((id) => id != null)
  )
  // yaSembrados no siempre trae rubroId explícito (viene de candidatos length===1);
  // recomputar sinPivot por nombre normalizado también cubre ese caso.
  const nombresCruzados = new Set(
    [...reutilizados, ...yaSembrados].map((entrada) =>
      normalizarNombreRubro(entrada.nombreCanonico)
    )
  )
  const sinPivot = rubrosExistentes.filter(
    (rubro) =>
      !rubrosCruzadosIds.has(rubro.id) && !nombresCruzados.has(normalizarNombreRubro(rubro.nombre))
  )

  return { reutilizados, nuevos, yaSembrados, ambiguos, sinPivot, warnings }
}

function escaparSql(valor) {
  return String(valor).replace(/'/g, "''")
}

function numeroSql(valor) {
  return Number(valor).toFixed(4)
}

/**
 * Genera el SQL determinista (mismo orden que el pivot) de la migración
 * `044_seed_tasas_incendio_rubros.sql` a partir del resultado de
 * `cruzarContraCatalogo`. NUNCA se llama si `cruce.ambiguos.length > 0` — esa
 * decisión de abortar es del CLI, no de esta función.
 *
 * @param {ReturnType<typeof cruzarContraCatalogo>} cruce
 * @param {{fuente:string, hoja:string, fechaGeneracion:string, filaDesde?:number, filaHasta?:number}} metadatos
 * @returns {string}
 */
export function generarSqlSeed(cruce, metadatos) {
  const { reutilizados, nuevos, yaSembrados, warnings } = cruce
  const lineas = []

  lineas.push('-- 044_seed_tasas_incendio_rubros.sql')
  lineas.push(`-- Generado por backend/scripts/generar-migracion-tasas-incendio.js`)
  lineas.push(`-- Fuente: ${metadatos.fuente} (hoja "${metadatos.hoja}")`)
  lineas.push(`-- Fecha de generación: ${metadatos.fechaGeneracion}`)
  lineas.push(
    `-- Rubros reutilizados: ${reutilizados.length} | nuevos: ${nuevos.length} | ya sembrados (omitidos): ${yaSembrados.length}`
  )
  if (warnings.length) {
    lineas.push('-- WARNINGS (no abortan, revisar antes de aplicar):')
    for (const warning of warnings) lineas.push(`--   - ${warning}`)
  }
  lineas.push('')
  lineas.push('BEGIN;')
  lineas.push('')

  // Orden del pivot preservado en todos los bloques: se usa el orden del array tal
  // cual llega (el CLI ya lo entrega en orden de fila del pivot) — nunca se reordena
  // por nombre ni por número de fila acá.
  const entradasConRubroNuevo = [...nuevos]

  if (entradasConRubroNuevo.length) {
    lineas.push('-- 1) Rubros nuevos (rubros_actividad.grupo queda NULL a propósito, legacy)')
    for (const entrada of entradasConRubroNuevo) {
      lineas.push(
        `INSERT INTO rubros_actividad (nombre) SELECT '${escaparSql(entrada.nombreCanonico)}' WHERE NOT EXISTS (SELECT 1 FROM rubros_actividad WHERE nombre = '${escaparSql(entrada.nombreCanonico)}');`
      )
    }
    lineas.push('')
  }

  const todasLasEntradasDePivot = [...reutilizados, ...entradasConRubroNuevo, ...yaSembrados]

  if (todasLasEntradasDePivot.length) {
    lineas.push('-- 2) Pertenencia rubro_actividad_ramo -> incendio (todos los rubros del pivot)')
    for (const entrada of todasLasEntradasDePivot) {
      lineas.push(
        `INSERT INTO rubro_actividad_ramo (rubro_id, ramo_id) SELECT ra.id, r.id FROM rubros_actividad ra, ramos r WHERE ra.nombre = '${escaparSql(entrada.nombreCanonico)}' AND r.nombre = 'incendio' ON CONFLICT DO NOTHING;`
      )
    }
    lineas.push('')
  }

  const entradasTasas = [...reutilizados, ...entradasConRubroNuevo]

  if (entradasTasas.length) {
    lineas.push('-- 3) tipos_riesgo_incendio (tasa global + minima/maxima tal cual el pivot)')
    for (const entrada of entradasTasas) {
      const { tasaGlobal, tasaMinima, tasaMaxima } = entrada.fila
      lineas.push(
        `INSERT INTO tipos_riesgo_incendio (ramo_id, nombre, tasa_global, tasa_minima, tasa_maxima, unidad, activo) SELECT id, '${escaparSql(entrada.nombreCanonico)}', ${numeroSql(tasaGlobal)}, ${numeroSql(tasaMinima)}, ${numeroSql(tasaMaxima)}, 'porcentaje', TRUE FROM ramos WHERE nombre = 'incendio' AND NOT EXISTS (SELECT 1 FROM tipos_riesgo_incendio WHERE nombre = '${escaparSql(entrada.nombreCanonico)}');`
      )
    }
    lineas.push('')

    lineas.push('-- 4) tasas_riesgo_objeto: 4 filas genéricas derivadas 40/40/60/60 por tipo')
    for (const entrada of entradasTasas) {
      const tasas = derivarTasasPorObjeto(entrada.fila.tasaGlobal)
      for (const [objeto, tasaValor] of Object.entries(tasas)) {
        lineas.push(
          `INSERT INTO tasas_riesgo_objeto (tipo_riesgo_id, plan_id, objeto_riesgo, tasa_valor, unidad, activo) SELECT tri.id, NULL, '${objeto}', ${numeroSql(tasaValor)}, 'porcentaje', TRUE FROM tipos_riesgo_incendio tri WHERE tri.nombre = '${escaparSql(entrada.nombreCanonico)}' AND NOT EXISTS (SELECT 1 FROM tasas_riesgo_objeto t2 WHERE t2.tipo_riesgo_id = tri.id AND t2.objeto_riesgo = '${objeto}' AND t2.plan_id IS NULL);`
        )
      }
    }
    lineas.push('')
  }

  lineas.push('-- ASSERTS')
  lineas.push(`DO $$
DECLARE huerfanos INT;
BEGIN
  SELECT count(*) INTO huerfanos FROM tipos_riesgo_incendio tri
    WHERE NOT EXISTS (SELECT 1 FROM rubros_actividad ra WHERE ra.nombre = tri.nombre);
  IF huerfanos > 0 THEN
    RAISE EXCEPTION '% tipos_riesgo_incendio sin rubro homónimo', huerfanos;
  END IF;
END $$;`)
  lineas.push('')
  lineas.push(`DO $$
DECLARE sin_cuatro INT;
BEGIN
  SELECT count(*) INTO sin_cuatro FROM (
    SELECT tipo_riesgo_id FROM tasas_riesgo_objeto WHERE plan_id IS NULL
    GROUP BY tipo_riesgo_id HAVING count(*) <> 4
  ) t;
  IF sin_cuatro > 0 THEN
    RAISE EXCEPTION '% tipos de riesgo sin exactamente 4 tasas genéricas', sin_cuatro;
  END IF;
END $$;`)
  lineas.push('')
  lineas.push(`DO $$
DECLARE vivienda_edificio NUMERIC;
BEGIN
  SELECT tro.tasa_valor INTO vivienda_edificio
    FROM tasas_riesgo_objeto tro
    JOIN tipos_riesgo_incendio tri ON tri.id = tro.tipo_riesgo_id
    WHERE tri.nombre = 'VIVIENDA' AND tro.objeto_riesgo = 'edificio' AND tro.plan_id IS NULL;
  IF vivienda_edificio IS DISTINCT FROM 0.9000 THEN
    RAISE EXCEPTION 'VIVIENDA.edificio esperado 0.90, encontrado %', vivienda_edificio;
  END IF;
END $$;`)
  lineas.push('')
  lineas.push('COMMIT;')
  lineas.push('')

  return lineas.join('\n')
}
