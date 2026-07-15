import { escapeHtml, fmtGs, fmtFecha } from './layout.js';

const ORDEN_FORMAS_PAGO = ['contado', 'cobrador', 'boca_cobranza', 'tarjeta_credito'];

// Sub-límites fijos de MRC (frontend/cotizar/cotizar.js: SUBLIMITES_FIJOS_MRC) — van siempre
// incluidos con monto fijo, sin franquicia elegible, así que no muestran texto de franquicia
// en la Carta Oferta (a pedido de Kevin, 2026-07-15): solo los sub-límites cargados
// manualmente por el agente (ej. "Robo valores ventanilla") muestran su franquicia.
const SUBLIMITES_FIJOS_MRC = ['sublimite_danos_agua', 'sublimite_equipos_electronicos', 'sublimite_granizo'];

// `cotizacion_coberturas` no tiene columna `codigo` propia (solo `cobertura_id`) — el código
// del catálogo viene de la relación `coberturas_catalogo` que trae findCotizacionById.
const codigoDe = (cobertura) => cobertura.coberturas_catalogo?.codigo;

const TEXTO_COBERTURAS_PRINCIPALES = [
  'Incendio, Rayo y Explosión',
  'Incendio y daños materiales por Huracán, Vendaval, Ciclón o Tornados',
  'Incendio y daños materiales por Tumulto y/o Alboroto Popular y/o Huelga que revista tales caracteres, siempre que no sean por motivos políticos',
  'Daños materiales por Caída de Aeronaves y/o de sus partes componentes',
  'Daños materiales por Impacto de vehículos terrestres de terceros',
  'Daños materiales por Humo y Hollín',
  'Robo y/o Asalto del Contenido',
  'Robo (Caja registradora)',
  'Robo (Tránsito)',
  'Rotura de Cristales, Vidrios o Espejos',
  'Responsabilidad Civil',
  'Equipos Electrónicos',
];

const TEXTO_DISTRIBUCION_CAPITAL = `Incendio: Mercaderías 50% / Contenido General 50%
Robo: Mercaderías 50% / Contenido General 50%
Equipos Electrónicos: Gs. 5.000.000
Daños por agua: Gs. 2.500.000
Daños a murallas/cercos/rejas: Gs. 1.000.000 por vigencia | Daños por granizo: Gs. 5.000.000 por vigencia (edificio)`;

const TEXTO_FRANQUICIAS_ESTANDAR = `Itapúa/Alto Paraná: 10% mín. Gs. 500.000 (Caída de Rayo)
Robo contenido/tránsito/caja fuerte/RC: 10% mín. Gs. 500.000
Equipos Electrónicos: 10% mín. Gs. 300.000`;

const TEXTO_EXCLUSIONES = `Modificación de materia prima / material combustible (panaderías, talleres, supermercados, imprentas, carpinterías, mueblerías, gomerías); se excluyen carteles.
Joyas, metales preciosos, títulos, papeles, obras de arte.
Variación de Tensión, Arcos Voltaicos.
Sin 4 costados cerrados: se excluye Huracán/Vendaval/Ciclón/Tornado; sin rejas: se excluye Robo fuera de horario.
Robo Caja fuerte: solo cubre dinero circulante en horario habitual.
Demás exclusiones del texto de Póliza en la Web.
Aviso fehaciente de cambios que agraven el riesgo (Cláusula 10, art. 1580 C.Civil); la propuesta y el informe de inspección forman parte del contrato.`;

const TEXTO_CLAUSULAS_CONTRATO = `Cláusula de adecuación al código penal.
Endoso de garantía (solo pólizas financiadas vía Cooperativas Socias, modalidad Segucoop).
Cláusula de cobranza (todas las formas de pago excepto Segucoop).`;

/**
 * Arma el contenido HTML (páginas 1 y 2) de la Carta Oferta de MRC. `cotizacion` viene con
 * `cotizacion_variantes(*, cotizacion_plan_pago(*, formas_pago(*)))` y `cotizacion_coberturas(*)`
 * ya resueltos por findCotizacionById.
 */
export function buildMrcOfertaPages({ cotizacion, plan, ramo }) {
  const riesgo = cotizacion.riesgo_datos || {};
  // Orden fijo (a pedido de Kevin, 2026-07-15): Incendio Edificio y Contenido siempre primero
  // (en ese orden), después el resto de coberturas, y por último los sub-límites. Dentro de los
  // sub-límites, los cargados manualmente por el agente (con franquicia elegida) van antes que
  // los 3 fijos por defecto (agua/equipos electrónicos/granizo, que no muestran franquicia —
  // ver SUBLIMITES_FIJOS_MRC y textoFranquicia).
  const ordenPrioridad = (codigo) => {
    if (codigo === 'incendio_edificio') return 0;
    if (codigo === 'incendio_contenido') return 1;
    return 2;
  };
  const coberturasCotizadas = [...(cotizacion.cotizacion_coberturas || [])].sort((a, b) => {
    const tipoA = a.tipo_aplicacion === 'sublimite' ? 1 : 0;
    const tipoB = b.tipo_aplicacion === 'sublimite' ? 1 : 0;
    if (tipoA !== tipoB) return tipoA - tipoB;
    if (tipoA === 1) {
      const conFranquiciaA = a.franquicia != null ? 0 : 1;
      const conFranquiciaB = b.franquicia != null ? 0 : 1;
      if (conFranquiciaA !== conFranquiciaB) return conFranquiciaA - conFranquiciaB;
    }
    return ordenPrioridad(codigoDe(a)) - ordenPrioridad(codigoDe(b));
  });

  // Misma cuenta que "Suma Asegurada total" en el panel del cotizador (cotizar.js): suma solo
  // coberturas (nunca sub-límites, a pedido de Kevin, 2026-07-15), salvo las marcadas
  // incluye_en_suma_asegurada_total = false (hoy "Robo valores ventanilla", que tampoco suma).
  const sumaAseguradaTotal = coberturasCotizadas.reduce((acc, c) => {
    const esSublimite = c.tipo_aplicacion === 'sublimite';
    const cuentaParaTotal = !esSublimite && c.coberturas_catalogo?.incluye_en_suma_asegurada_total !== false;
    return acc + (cuentaParaTotal ? Number(c.monto) || 0 : 0);
  }, 0);

  const paginaUno = `
    <div class="meta-row">
      <div>Fecha: ${fmtFecha(cotizacion.fecha || cotizacion.created_at)}</div>
      <div class="plan-name">${escapeHtml(plan.nombre)}</div>
    </div>
    <div class="cliente-banner">Sr/a ${escapeHtml(cotizacion.cliente_nombre || 'Asegurado')} — Cotización Nro: ${escapeHtml(cotizacion.numero_cotizacion)}</div>
    <h1 class="title">CARTA <strong>OFERTA</strong></h1>

    <table class="data-table">
      <tr><td>Tipo de Riesgo</td><td>${escapeHtml(riesgo.rubro_actividad || '—')}</td></tr>
      <tr><td>Dirección</td><td>${escapeHtml(riesgo.direccion || '—')}</td></tr>
      <tr><td>Ciudad</td><td>${escapeHtml(riesgo.ciudad || '—')}</td></tr>
    </table>

    <h2 class="section-title">SUMAS ASEGURADAS <strong>POR COBERTURA</strong></h2>
    <table class="sumas-table">
      <tr>
        <th>Cobertura</th>
        <th>Suma Asegurada</th>
        <th>Franquicia</th>
      </tr>
      <!-- Los 3 sub-límites fijos (agua/equipos electrónicos/granizo) no van en esta tabla: ya
      figuran con su monto en "Distribución del capital asegurado" (a pedido de Kevin, 2026-07-15). -->
      ${coberturasCotizadas
        .filter((c) => !SUBLIMITES_FIJOS_MRC.includes(codigoDe(c)))
        .map(renderFilaSumaAsegurada)
        .join('')}
      <tr class="sumas-table__total">
        <td>Suma Asegurada Total, Gs.</td>
        <td>${fmtGs(sumaAseguradaTotal)}</td>
        <td></td>
      </tr>
    </table>

    <h2 class="section-title">PLAN <strong>DE PAGO</strong></h2>
    ${(cotizacion.cotizacion_variantes || []).map(renderVariantePlanPago).join('')}

    <div class="agente-box">
      <div>AGENTE</div>
      <div style="margin-top:2mm;font-weight:700;">Aseguradora Tajy</div>
    </div>
    <div class="footer-legal">
      Esta cotización no implica aceptación del riesgo, ni el consentimiento de cobertura alguna por parte del
Asegurado. <br>
      La compañía se reserva el derecho de realizar la inspección para el seguro, y la exigencia de medidas
de seguridad y adecuaciones que surjan de la misma. <br>
      Este presupuesto es válido por ${cotizacion.vigencia_dias || 30} días.
    </div>
  `;

  // Orden pedido por Kevin (2026-07-15): 1) Coberturas principales incluidas, 2) Coberturas
  // cotizadas, 3) Distribución del capital asegurado, 4) Franquicias, 5) Exclusiones,
  // 6) Forman parte del contrato.
  const bloques = [
    {
      titulo: 'Coberturas principales incluidas',
      contenido: `<div class="legal-block">${TEXTO_COBERTURAS_PRINCIPALES.map(escapeHtml).join('.\n')}.</div>`,
    },
    {
      titulo: 'Coberturas cotizadas',
      contenido:
        coberturasCotizadas.map(renderCoberturaItem).join('') ||
        '<div class="cobertura-item">Sin coberturas adicionales cotizadas.</div>',
      // A diferencia de los demás bloques, este puede ser largo y variable — se deja fluir a
      // la columna siguiente en vez de saltar entero y dejar hueco en blanco (ver .card-block--flow).
      flow: true,
    },
    {
      titulo: 'Distribución del capital asegurado',
      contenido: `<div class="legal-block">${escapeHtml(TEXTO_DISTRIBUCION_CAPITAL)}</div>`,
    },
    {
      titulo: 'Franquicias',
      contenido: `<div class="legal-block">${TEXTO_FRANQUICIAS_ESTANDAR
        .split('\n')
        .map((linea) => escapeHtml(linea))
        .join('\n')}</div>`,
    },
    {
      titulo: 'Exclusiones',
      contenido: `<div class="legal-block">${escapeHtml(TEXTO_EXCLUSIONES)}</div>`,
    },
    {
      titulo: 'Forman parte del contrato',
      contenido: `<div class="legal-block">${escapeHtml(TEXTO_CLAUSULAS_CONTRATO)}</div>`,
    },
  ];

  const tituloPaginaDos = '<h2 class="section-title">COBERTURAS <strong>Y CONDICIONES</strong></h2>';

  // Dos candidatos para la página de "Coberturas y condiciones":
  // - Flex (3 bloques fijos por columna): se ve prolija (orden 1-2-3 izquierda, 4-5-6 derecha)
  //   pero NO puede fragmentarse entre hojas — si el contenido no entra en una sola página,
  //   Chrome no reparte las columnas y deja contenido varado (ver measureContentHeightMm).
  // - Balanceada (column-count con auto-balance): SIEMPRE pagina bien porque el motor de
  //   impresión sabe fragmentar multi-columna entre hojas, pero el corte entre columna
  //   izquierda/derecha varía según la altura del texto en cada cotización.
  // El caller (templates/oferta/index.js) mide con Puppeteer si el candidato flex entra en una
  // sola hoja y usa el balanceado como fallback si no.
  const paginaDosFlex = `
    ${tituloPaginaDos}
    <div class="cols cols-flex">
      <div class="col">${bloques.slice(0, 3).map(renderBloque).join('')}</div>
      <div class="col">${bloques.slice(3).map(renderBloque).join('')}</div>
    </div>
  `;

  const paginaDosBalanceada = `
    ${tituloPaginaDos}
    <div class="cols">
      ${bloques.map(renderBloque).join('')}
    </div>
  `;

  return { paginaUno, paginaDosFlex, paginaDosBalanceada };
}

function renderBloque(bloque) {
  return `
    <div class="card-block${bloque.flow ? ' card-block--flow' : ''}">
      <div class="card-title">${escapeHtml(bloque.titulo)}</div>
      ${bloque.contenido}
    </div>
  `;
}

function renderVariantePlanPago(variante) {
  const planesPago = [...(variante.cotizacion_plan_pago || [])].sort(
    (a, b) => ORDEN_FORMAS_PAGO.indexOf(a.formas_pago.codigo) - ORDEN_FORMAS_PAGO.indexOf(b.formas_pago.codigo)
  );

  // Solo se muestra la etiqueta cuando hay más de una variante para distinguir (MRC hoy
  // siempre cotiza "sin franquicia" — la etiqueta ahí no aporta nada, ver feedback de Kevin).
  const label = variante.tipo_franquicia === 'con_franquicia'
    ? `<div class="variante-label">Con franquicia (Gs. ${fmtGs(variante.franquicia_monto)})</div>`
    : '';

  const cuotasFinanciadas = planesPago.find((fp) => fp.monto_cuota > 0)?.cantidad_cuotas;
  const tituloCuota = cuotasFinanciadas ? `Cuota (${cuotasFinanciadas} cuotas)` : 'Cuota';

  return `
    ${label}
    <table class="plan-pago">
      <tr>
        <th style="text-align:left;">Forma de pago</th>
        <th>Premio</th>
        <th>Inicial</th>
        <th>${escapeHtml(tituloCuota)}</th>
      </tr>
      ${planesPago
      .map(
        (fp) => `
        <tr>
          <td>${escapeHtml(fp.formas_pago.nombre_display)}</td>
          <td>Gs. ${fmtGs(fp.premio_total)}</td>
          <td>Gs. ${fmtGs(fp.monto_inicial)}</td>
          <td>${fp.monto_cuota > 0 ? `Gs. ${fmtGs(fp.monto_cuota)}` : '—'}</td>
        </tr>
      `
      )
      .join('')}
    </table>
  `;
}

function renderCoberturaItem(cobertura) {
  const textoLegal = cobertura.texto_legal_snapshot
    ? `<div class="cobertura-item__legal">${escapeHtml(cobertura.texto_legal_snapshot)}</div>`
    : '';
  const textoExclusiones = cobertura.texto_exclusiones_snapshot
    ? `<div class="cobertura-item__legal cobertura-item__legal--exclusiones">Exclusiones: ${escapeHtml(cobertura.texto_exclusiones_snapshot)}</div>`
    : '';

  return `
    <div class="cobertura-item">
      <span class="nombre">${escapeHtml(cobertura.nombre_snapshot)}</span>
      ${textoLegal}
      ${textoExclusiones}
    </div>
  `;
}

function renderFilaSumaAsegurada(cobertura) {
  const badgeClass = cobertura.tipo_aplicacion === 'sublimite' ? 'badge--sublimite' : 'badge--cobertura';
  const badgeLabel = cobertura.tipo_aplicacion === 'sublimite' ? 'Sublímite' : 'Cobertura';
  const esSublimiteFijo = SUBLIMITES_FIJOS_MRC.includes(codigoDe(cobertura));

  return `
    <tr>
      <td><span class="badge ${badgeClass}">${badgeLabel}</span>${escapeHtml(cobertura.nombre_snapshot)}</td>
      <td>${fmtGs(cobertura.monto)}</td>
      <td>${esSublimiteFijo ? '' : escapeHtml(textoFranquicia(cobertura.franquicia))}</td>
    </tr>
  `;
}

// El monto de franquicia persistido es siempre el "mínimo Gs." de la opción elegida en el
// cotizador (FRANQUICIA_OPCIONES en cotizar.js) — el 10% es fijo en todas las opciones con
// franquicia, solo varía el mínimo. `null` es la opción "Sin deducible".
function textoFranquicia(montoFranquicia) {
  return montoFranquicia != null
    ? `10% en todo y cada siniestro, mínimo Gs. ${fmtGs(montoFranquicia)}`
    : 'Sin franquicia';
}
