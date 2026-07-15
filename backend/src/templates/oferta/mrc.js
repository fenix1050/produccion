import { escapeHtml, fmtGs, fmtFecha } from './layout.js';

const ORDEN_FORMAS_PAGO = ['contado', 'cobrador', 'boca_cobranza', 'tarjeta_credito'];

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
];

const TEXTO_DISTRIBUCION_CAPITAL = `Incendio: Mercaderías 50% / Contenido General 50%
Sublímite CCTV: Gs. 5.000.000 | Daños por agua: Gs. 2.500.000 | Equipos Electrónicos: Gs. 5.000.000
Robo: Mercaderías 50% / Contenido General 50%
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
  const coberturasCotizadas = cotizacion.cotizacion_coberturas || [];

  // Misma cuenta que "Suma Asegurada total" en el panel del cotizador (cotizar.js): suma el
  // monto de cada cobertura cotizada, salvo las marcadas incluye_en_suma_asegurada_total = false
  // (hoy solo "Robo valores ventanilla", sub-límite de Caja Fuerte, no una suma independiente).
  const sumaAseguradaTotal = coberturasCotizadas.reduce((acc, c) => {
    const cuentaParaTotal = c.coberturas_catalogo?.incluye_en_suma_asegurada_total !== false;
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
      ${coberturasCotizadas.map(renderFilaSumaAsegurada).join('')}
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
      La presente cotización no implica aceptación del riesgo por parte de la compañía.<br>
      Este presupuesto es válido por ${cotizacion.vigencia_dias || 30} días.
    </div>
  `;

  const paginaDos = `
    <h2 class="section-title">COBERTURAS <strong>Y CONDICIONES</strong></h2>
    <div class="cols">
      <div class="card-block">
        <div class="card-title">Coberturas cotizadas</div>
        ${coberturasCotizadas.map(renderCoberturaItem).join('') || '<div class="cobertura-item">Sin coberturas adicionales cotizadas.</div>'}
      </div>

      <div class="card-block">
        <div class="card-title">Forman parte del contrato</div>
        <div class="legal-block">${escapeHtml(TEXTO_CLAUSULAS_CONTRATO)}</div>
      </div>

      <div class="card-block">
        <div class="card-title">Coberturas principales incluidas</div>
        <div class="legal-block">${TEXTO_COBERTURAS_PRINCIPALES.map(escapeHtml).join('.\n')}.</div>
      </div>

      <div class="card-block">
        <div class="card-title">Distribución del capital asegurado</div>
        <div class="legal-block">${escapeHtml(TEXTO_DISTRIBUCION_CAPITAL)}</div>
      </div>

      <div class="card-block">
        <div class="card-title">Franquicias</div>
        <div class="legal-block">${TEXTO_FRANQUICIAS_ESTANDAR
          .split('\n')
          .map((linea) => escapeHtml(linea))
          .join('\n')}</div>
      </div>

      <div class="card-block">
        <div class="card-title">Exclusiones</div>
        <div class="legal-block">${escapeHtml(TEXTO_EXCLUSIONES)}</div>
      </div>
    </div>
  `;

  return [paginaUno, paginaDos];
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

  return `
    ${label}
    <table class="plan-pago">
      <tr>
        <th style="text-align:left;">Forma de pago</th>
        <th>Premio</th>
        <th>Inicial</th>
        <th>Cuota</th>
      </tr>
      ${planesPago
        .map(
          (fp) => `
        <tr>
          <td>${escapeHtml(fp.formas_pago.nombre_display)}</td>
          <td>Gs. ${fmtGs(fp.premio_total)}</td>
          <td>Gs. ${fmtGs(fp.monto_inicial)}</td>
          <td>${fp.cantidad_cuotas > 0 ? `Gs. ${fmtGs(fp.monto_cuota)}` : '—'}</td>
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

  return `
    <tr>
      <td><span class="badge ${badgeClass}">${badgeLabel}</span>${escapeHtml(cobertura.nombre_snapshot)}</td>
      <td>${fmtGs(cobertura.monto)}</td>
      <td>${escapeHtml(textoFranquicia(cobertura.franquicia))}</td>
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
