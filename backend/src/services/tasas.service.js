import fs from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { filaTasaCapitalSchema } from '../schemas/tasas.schema.js';
import * as tasasRepository from '../repositories/tasas.repository.js';
import { httpError } from '../utils/http-error.js';

// Códigos de pestaña del Excel de tasas que corresponden a los 4 planes reales
// de Auto (ver 010_planes_codigo_tasa.sql). El resto de las pestañas del archivo
// (Hoja1, SEGUCOOP, Plataforma, etc.) se ignoran a propósito.
const CODIGOS_TASA_SOPORTADOS = ['107', '103', '102', '101'];

// Convierte una fila de exceljs (Row#values: array 1-indexed y sparse) al array
// 0-indexed con null en los huecos que esperaba el parseo original basado en
// xlsx.utils.sheet_to_json({ header: 1, defval: null }).
function filaAArrayPlano(row) {
  const fila = [];
  for (let i = 1; i < row.values.length; i++) {
    const valor = row.values[i];
    fila.push(valor === undefined ? null : valor);
  }
  return fila;
}

/**
 * Parsea y valida las filas de tasas por capital de las 4 pestañas soportadas
 * de un workbook ya leído. No toca Supabase — función pura, testeable sin
 * conexión real, y reutilizada por `importarTasasAuto` con el resto del flujo.
 *
 * @param {import('exceljs').Workbook} workbook
 * @returns {Record<string, Array<{capital_min:number, capital_max:number, tasa_porcentaje:number}>>}
 *   filas parseadas y validadas, indexadas por código de tasa ('107', '103', ...)
 */
export function parsearYValidarTasasAuto(workbook) {
  const resultado = {};

  for (const codigo of CODIGOS_TASA_SOPORTADOS) {
    const hoja = workbook.getWorksheet(codigo);
    if (!hoja) {
      throw httpError(400, `No se encontró la pestaña "${codigo}" en el archivo de tasas`);
    }

    // La hoja no tiene encabezados: cada fila es [capital_min, capital_max, tasa_porcentaje].
    const filasCrudas = [];
    hoja.eachRow((row) => filasCrudas.push(filaAArrayPlano(row)));

    const filasValidadas = filasCrudas
      .filter((fila) => fila.length > 0 && fila.some((valor) => valor !== null && valor !== ''))
      .map((fila, index) => {
        const [capital_min, capital_max, tasa_porcentaje] = fila;
        const parseo = filaTasaCapitalSchema.safeParse({ capital_min, capital_max, tasa_porcentaje });
        if (!parseo.success) {
          throw httpError(
            400,
            `Pestaña "${codigo}", fila ${index + 1}: ${parseo.error.issues.map((i) => i.message).join('; ')}`
          );
        }
        return parseo.data;
      });

    resultado[codigo] = filasValidadas;
  }

  return resultado;
}

/**
 * Importa las tasas de Auto desde el archivo Excel indicado: parsea y valida
 * las 4 pestañas soportadas y reemplaza las tasas vigentes de cada plan.
 * Si cualquier fila de cualquier pestaña no valida, se aborta ANTES de tocar
 * la base de datos — nunca se hace un import parcial.
 *
 * @param {string} filePath ruta al archivo .xlsx
 * @returns {Promise<Record<string, number>>} cantidad de filas importadas por plan
 */
export async function importarTasasAuto(filePath) {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const filasPorCodigo = parsearYValidarTasasAuto(workbook);

    const resumen = {};

    for (const [codigo, filas] of Object.entries(filasPorCodigo)) {
      const plan = await tasasRepository.findPlanByCodigoTasa(codigo);
      if (!plan) {
        throw httpError(400, `No hay ningún plan con codigo_tasa = "${codigo}"`);
      }

      await tasasRepository.reemplazarTasasCapitalDePlan(plan.id, filas);
      resumen[plan.nombre] = filas.length;
    }

    return resumen;
  } finally {
    await fs.unlink(filePath).catch(() => {});
  }
}
