import { renderOferta } from './layout.js';
import { buildMrcOfertaPages } from './mrc.js';

// Un builder de páginas por ramo (calculador). Incendio y Vida-AP quedan pendientes: todavía
// no tienen texto oficial de Carta Oferta confirmado (ver CLAUDE.md, pendientes activos).
const BUILDERS_POR_CALCULADOR = {
  mrc: buildMrcOfertaPages,
};

export function ofertaDisponibleParaRamo(ramo) {
  return Boolean(BUILDERS_POR_CALCULADOR[ramo.calculador]);
}

export function buildOfertaHtml({ cotizacion, plan, ramo }) {
  const builder = BUILDERS_POR_CALCULADOR[ramo.calculador];
  if (!builder) {
    const err = new Error(`Carta Oferta no implementada todavía para el ramo "${ramo.nombre}".`);
    err.status = 422;
    err.publicMessage = `La Carta Oferta de ${ramo.nombre_display ?? ramo.nombre} todavía no está disponible.`;
    throw err;
  }

  const pages = builder({ cotizacion, plan, ramo });
  return renderOferta({ ramoLabel: ramo.nombre_display ?? ramo.nombre, pages });
}
