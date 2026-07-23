import * as auto from './auto.calculator.js';
import * as autoFlota from './auto-flota.calculator.js';
import * as incendio from './incendio.calculator.js';
import * as hogar from './hogar.calculator.js';
import * as mrc from './mrc.calculator.js';
import * as tro from './tro.calculator.js';
import * as transporte from './transporte.calculator.js';
import * as vidaAp from './vida-ap.calculator.js';

// La clave coincide con la columna `ramos.calculador` en la base de datos.
export const REGISTRO = {
  auto,
  'auto-flota': autoFlota,
  incendio,
  hogar,
  mrc,
  tro,
  transporte,
  'vida-ap': vidaAp,
};

/** @returns {import('./ramo-calculator.interface.js')} */
export function getCalculador(codigoRamo) {
  const calculador = REGISTRO[codigoRamo];
  if (!calculador) {
    const err = new Error(`No hay calculador registrado para el ramo "${codigoRamo}"`);
    err.status = 400;
    throw err;
  }
  return calculador;
}
