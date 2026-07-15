import { renderOferta, buildHeaderTemplate, buildFooterTemplate, OFERTA_MARGIN, OFERTA_PAGE_HEIGHT_MM, BASE_CSS } from './layout.js';
import { buildMrcOfertaPages } from './mrc.js';
import { measureContentHeightMm } from '../../services/pdf.service.js';

// Un builder de páginas por ramo (calculador). Incendio y Vida-AP quedan pendientes: todavía
// no tienen texto oficial de Carta Oferta confirmado (ver CLAUDE.md, pendientes activos).
const BUILDERS_POR_CALCULADOR = {
  mrc: buildMrcOfertaPages,
};

// Margen de seguridad contra la medición aproximada de measureContentHeightMm (viewport normal,
// no el motor de impresión real de Puppeteer) — evita elegir el layout flex "al límite" y que
// termine desbordando igual en el PDF final.
const MARGEN_SEGURIDAD_MM = 5;

export function ofertaDisponibleParaRamo(ramo) {
  return Boolean(BUILDERS_POR_CALCULADOR[ramo.calculador]);
}

export async function buildOfertaHtml({ cotizacion, plan, ramo }) {
  const builder = BUILDERS_POR_CALCULADOR[ramo.calculador];
  if (!builder) {
    const err = new Error(`Carta Oferta no implementada todavía para el ramo "${ramo.nombre}".`);
    err.status = 422;
    err.publicMessage = `La Carta Oferta de ${ramo.nombre_display ?? ramo.nombre} todavía no está disponible.`;
    throw err;
  }

  const ramoLabel = ramo.nombre_display ?? ramo.nombre;
  const { paginaUno, paginaDosFlex, paginaDosBalanceada } = builder({ cotizacion, plan, ramo });

  // El layout flex (3 bloques fijos por columna) no puede fragmentarse entre hojas — solo se
  // usa si entra en una sola página; si no, se cae al balanceado por column-count, que sí sabe
  // paginar (ver mrc.js).
  const alturaFlexMm = await measureContentHeightMm(paginaDosFlex, BASE_CSS);
  const entraEnUnaHoja = alturaFlexMm <= OFERTA_PAGE_HEIGHT_MM - MARGEN_SEGURIDAD_MM;

  if (!entraEnUnaHoja) {
    console.warn(
      `[oferta] Cotización ${cotizacion.numero_cotizacion ?? cotizacion.id}: el layout de columnas 3/3 (${Math.round(alturaFlexMm)}mm) no entra en una hoja (${OFERTA_PAGE_HEIGHT_MM}mm) — se usa el layout balanceado.`
    );
  }

  const paginaDos = entraEnUnaHoja ? paginaDosFlex : paginaDosBalanceada;
  const pages = [paginaUno, paginaDos];

  return {
    html: renderOferta({ ramoLabel, pages }),
    headerTemplate: buildHeaderTemplate(ramoLabel),
    footerTemplate: buildFooterTemplate(),
    margin: OFERTA_MARGIN,
  };
}
