import { cotizarAutoSchema } from './auto.schema.js';
export { filaTasaCapitalSchema } from './tasas.schema.js';

// La clave coincide con la columna `ramos.calculador`. Se completa a medida que
// se implementan los demás ramos (Fase 6 y 7).
const REGISTRO = {
  auto: cotizarAutoSchema,
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
