import { cotizarAutoSchema } from './auto.schema.js';
import { cotizarMrcSchema } from './mrc.schema.js';
import { cotizarIncendioSchema } from './incendio.schema.js';
import { cotizarVidaApSchema } from './vida-ap.schema.js';
export { filaTasaCapitalSchema } from './tasas.schema.js';

// La clave coincide con la columna `ramos.calculador`. Se completa a medida que
// se implementan los demás ramos (Fase 6 y 7).
const REGISTRO = {
  auto: cotizarAutoSchema,
  mrc: cotizarMrcSchema,
  incendio: cotizarIncendioSchema,
  'vida-ap': cotizarVidaApSchema,
};

export function getSchemaCotizar(codigoRamo) {
  const schema = REGISTRO[codigoRamo];
  if (!schema) {
    const err = new Error(`No hay schema de validación para el ramo "${codigoRamo}"`);
    err.status = 400;
    throw err;
  }
  return schema;
}
