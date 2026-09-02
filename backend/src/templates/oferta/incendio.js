import { escapeHtml, fmtGs, fmtFecha } from './layout.js'

const ORDEN_FORMAS_PAGO = ['contado', 'cobrador', 'boca_cobranza', 'tarjeta_credito']
const DEFAULT_RENDER_CONTEXT = {
  timestamp: '1970-01-01T00:00:00.000Z',
  timezone: 'America/Asuncion',
  locale: 'es-PY',
}

const NOMBRE_PLAN_HIPOTECARIO = 'INCENDIO HIPOTECARIO'
const NOMBRE_PLAN_CON_INSPECCION = 'INCENDIO CON INSPECCION'
const NOMBRE_PLAN_SIN_INSPECCION = 'INCENDIO SIN INSPECCION'
const NOMBRE_PLAN_MAQUINARIA = 'MAQUINARIA BASICO'

// Textos legales verbatim provistos por Kevin (2026-07-28) — uno por plan, a diferencia de MRC
// (un solo plan, un solo texto). No se resumen ni reescriben. `MAQUINARIA BASICO` tiene una
// estructura distinta (sin "Exclusiones" propia, con "Cláusula Adicional de Cobranzas" y
// "Cobertura" en vez de "Coberturas Principales" sola) porque el texto provisto para ese plan
// venía incompleto — ver TEXTOS_POR_PLAN.maquinaria.
const TEXTOS_POR_PLAN = {
  [NOMBRE_PLAN_HIPOTECARIO]: {
    coberturasPrincipales: [
      'Queda entendido y convenido que el edificio amparado por la presente póliza cuenta con paredes, techos y aberturas terminadas, en caso contrario, la cobertura queda limitada a Incendio, Rayo y/o Explosión.',
      'Contrariamente a lo establecido en la cláusula 3) de las condiciones generales comunes, este seguro se efectúa a primer riesgo absoluto, y en consecuencia el asegurador indemnizara el daño hasta el límite de la suma asegurada indicada en las condiciones particulares, sin tener en cuenta la proporción que existe entre la suma asegurada y el valor asegurable.',
      'Que las características y descripciones del edificio de la vivienda familiar, objeto de este seguro se encuentran consignadas en el informe de tasación, la cual obra en el archivo de la compañía.',
    ],
    exclusiones: [
      'Cuando el edificio no posee los 4 (cuatro) costados se excluye la cobertura del huracán, vendaval, ciclón o tornado.',
    ],
    recomendaciones: [
      'Realizar un mantenimiento periódico preventivo por la instalación eléctrica.',
      'No dejar enchufado ningún artefacto eléctrico, salvo que cumplan con una función específica ej.: (heladeras, congeladoras, etc.).',
      'Una vez que haga efectivo lo enunciado anteriormente, deberá dar aviso inmediato a la compañía.',
    ],
  },
  [NOMBRE_PLAN_CON_INSPECCION]: {
    coberturasPrincipales: [
      'Que en caso de que el asegurado no presentase inventario de los bienes asegurados al momento de emisión de la póliza, la compañía en caso de un eventual siniestro indemnizara al asegurado teniendo en cuenta lo registrado contablemente a la fecha de ocurrencia del siniestro pudiendo ser demostrado esto mediante registros en libros de compras, ventas y bienes de uso.',
      'Es importante informar a la compañía aseguradora cada vez que se adquieran nuevos bienes a fin de que estos sean incluidos dentro de la cobertura de la póliza de seguros.',
      'Queda entendido y convenido que el edificio amparado por la presente póliza cuenta con paredes, techos y aberturas terminadas, en caso contrario, la cobertura queda limitada a Incendio, Rayo y/o Explosión.',
      'Las características y descripciones del edificio, objeto de este seguro se encuentran consignadas en la inspección de riesgo, la cual obra en el archivo de la compañía.',
      'Que expresamente la propuesta de seguro y el informe de inspección del riesgo forman parte integrante del presente contrato de seguro.',
    ],
    exclusiones: [
      'Cuando el edificio no posee los 4 (cuatro) costados se excluye la cobertura del huracán, vendaval, ciclón o tornado.',
    ],
    // La línea de INSPECCION DE RIESGO No. XXXX/XXXX queda literal con placeholders: no hay
    // ningún campo obvio en riesgo_datos/cotizacion (número/fecha de inspección puntual) del que
    // interpolarla — inventar ese mecanismo sin confirmación de Kevin sería asumir un dato que
    // no existe en el modelo actual.
    recomendaciones: [
      'Que de acuerdo con la INSPECCION DE RIESGO No. XXXX/XXXX realizada en fecha XX de XXXXXXX de XXXX se solicita tomar las siguientes medidas de prevención:',
      'Realizar un mantenimiento periódico preventivo por la instalación eléctrica.',
      'No dejar enchufado ningún artefacto eléctrico, salvo que cumplan con una función específica ej.: (heladeras, congeladoras, etc.).',
      'Una vez que haga efectivo lo enunciado anteriormente, deberá dar aviso inmediato a la compañía.',
    ],
  },
  [NOMBRE_PLAN_SIN_INSPECCION]: {
    coberturasPrincipales: [
      'Aplicación concepto "A Prorrata": La Compañía responderá en la proporción que exista entre el valor de reposición establecido en la póliza, y el valor de reposición real del bien al momento del siniestro; aplicando esta misma proporción sobre el monto de la perdida.',
      'Que en caso de que el asegurado no presentase inventario de los bienes asegurados al momento de emisión de la póliza, la compañía en caso de un eventual siniestro indemnizara al asegurado teniendo en cuenta lo registrado contablemente a la fecha de ocurrencia del siniestro pudiendo ser demostrado esto mediante registros en libros de compras, ventas y bienes de uso.',
      'Que es importante informar a la compañía aseguradora cada vez que se adquieran nuevos bienes a fin de que estos sean incluidos dentro de la cobertura de la póliza de seguros.',
      'Que expresamente la propuesta de seguro y el informe de inspección del riesgo forman parte integrante del presente contrato de seguro.',
    ],
    exclusiones: [
      'Cuando el edificio no posee los 4 (cuatro) costados se excluye la cobertura del huracán, vendaval, ciclón o tornado.',
    ],
    recomendaciones: [
      'Se solicita tomar las siguientes medidas de prevención:',
      'Realizar un mantenimiento periódico preventivo por la instalación eléctrica.',
      'No dejar enchufado ningún artefacto eléctrico, salvo que cumplan con una función específica ej.: (heladeras, congeladoras, etc.).',
      'Una vez que haga efectivo lo enunciado anteriormente, deberá dar aviso inmediato a la compañía.',
    ],
  },
  [NOMBRE_PLAN_MAQUINARIA]: {
    clausulaCobranzas:
      'Queda expresamente convenido y el asegurado acepta y entiende que, una vez que haya acusado recibo de la póliza correspondiente, las obligaciones contractuales de ambas partes se encuentran plenamente vigentes y la falta de pago de la prima pactada, a su vencimiento, producirá el decaimiento de los plazos establecidos en todos los demás documentos no vencidos, o cuotas pactadas, facultando a LA ASEGURADORA a exigir el pago inmediato del saldo adeudado. Asimismo, el simple vencimiento de la fecha de pago en cualquiera de los documentos obligacionales establecerá la mora del asegurado, por lo que este instrumento implica la autorización expresa del asegurado para que LA ASEGURADORA pueda realizar la consulta o la inclusión del mismo en la base de datos de empresas especializadas en informaciones comerciales, conforme a lo establecido en la Ley No. 1682/01 y modificatorias.',
    cobertura: [
      'Incendio parcial y/o total, rayo, y/o explosión hasta 100% del valor de mercado.',
      'Daños causados por Huracán, Vendaval, Ciclón o Tornado hasta 100% del valor de mercado.',
      'Daños causados por impacto de vehículos terrestres hasta 100% del valor de mercado.',
      'Daños causados por impacto de aviones hasta 100% del valor de mercado.',
      'Daños materiales y/o incendio causados por tumulto o huelga.',
      'Daños materiales causados por granizo.',
      'Daños materiales por vandalismo, hasta el 50% del valor de mercado.',
    ],
    coberturasPrincipales: [
      'Aplicación concepto "A Prorrata": La Compañía responderá en la proporción que exista entre el valor de reposición establecido en la póliza, y el valor de reposición real del bien al momento del siniestro; aplicando esta misma proporción sobre el monto de la perdida.',
      'Que en caso de que el asegurado no presentase inventario de los bienes asegurados al momento de emisión de la póliza, la compañía en caso de un eventual siniestro indemnizara al asegurado teniendo en cuenta lo registrado contablemente a la fecha de ocurrencia del siniestro pudiendo ser demostrado esto mediante registros en libros de compras, ventas y bienes de uso.',
    ],
    // Sin "Exclusiones"/"Recomendaciones" propias: el texto provisto para Maquinaria Básico
    // venía incompleto en esas secciones (confirmado con Kevin, 2026-07-28) — se omiten en vez
    // de rellenarlas con contenido de otro plan.
    exclusiones: [],
    recomendaciones: [],
  },
}

/**
 * Arma el contenido HTML (páginas 1 y 2) de la Carta Oferta de Incendio. `cotizacion` viene con
 * `cotizacion_variantes(*, cotizacion_plan_pago(*, formas_pago(*)))` y `cotizacion_coberturas(*)`
 * ya resueltos por findCotizacionById, igual que en mrc.js. A diferencia de MRC (un solo plan,
 * un solo texto legal), Incendio tiene 4 planes con contenido de Coberturas
 * Principales/Exclusiones/Recomendaciones distinto por plan — ver TEXTOS_POR_PLAN. `planCoberturas`
 * se recibe por paridad de firma con buildMrcOfertaPages (el caller en index.js llama a todos los
 * builders igual) pero no se usa acá: a diferencia de MRC, Incendio no tiene sub-límites fijos
 * cuyo monto dependa del catálogo vigente del plan.
 */
export function buildIncendioOfertaPages({
  cotizacion,
  plan,
  renderContext = DEFAULT_RENDER_CONTEXT,
}) {
  const riesgo = cotizacion.riesgo_datos || {}
  const textos = TEXTOS_POR_PLAN[plan.nombre] ?? null

  const coberturasCotizadas = [...(cotizacion.cotizacion_coberturas || [])]

  const sumaAseguradaTotal = coberturasCotizadas.reduce((acc, c) => {
    const esSublimite = c.tipo_aplicacion === 'sublimite'
    const cuentaParaTotal =
      !esSublimite && c.coberturas_catalogo?.incluye_en_suma_asegurada_total !== false
    return acc + (cuentaParaTotal ? Number(c.monto) || 0 : 0)
  }, 0)

  const paginaUno = `
    <div class="meta-row">
      <div>Fecha: ${fmtFecha(renderContext.timestamp, renderContext)}</div>
      <div class="plan-name">${escapeHtml(plan.nombre)}</div>
    </div>
    <div class="cliente-banner"><span class="cliente-banner__accent"></span>Sr/a ${escapeHtml(cotizacion.cliente_nombre || 'Asegurado')} — Cotización Nro: ${escapeHtml(cotizacion.numero_cotizacion)}</div>
    <h1 class="title">CARTA <strong>OFERTA</strong></h1>

    <table class="data-table">
      <tr><td>Tipo de Riesgo</td><td>${escapeHtml(riesgo.rubro_actividad || '—')}</td></tr>
      <tr><td>Ubicación del Riesgo</td><td>${escapeHtml(riesgo.direccion || '—')}</td></tr>
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

    <div class="footer-legal">
      Este presupuesto es válido por ${cotizacion.vigencia_dias || 30} días. <br>
      Esta cotización no implica aceptación del riesgo, ni el consentimiento de cobertura alguna por parte del
Asegurado. <br>
      <strong style="color:#d8132e;">La compañía se reserva el derecho de realizar la inspección para el seguro, y la exigencia de medidas
de seguridad y adecuaciones que surjan de la misma.</strong>
    </div>
    <div class="pie-agente">
      <div class="agente-linea">
        <span><strong>AGENTE:</strong> ${escapeHtml(cotizacion.usuarios?.nombre || 'Aseguradora Tajy')}</span>
        ${cotizacion.usuarios?.email ? `<span><strong>EMAIL:</strong> ${escapeHtml(cotizacion.usuarios.email)}</span>` : ''}
      </div>
    </div>
  `

  const bloques = buildBloquesLegales(textos, plan.nombre)

  const tituloPaginaDos = '<h2 class="section-title">COBERTURAS <strong>Y CONDICIONES</strong></h2>'
  const mitad = Math.ceil(bloques.length / 2)

  const paginaDosFlex = `
    ${tituloPaginaDos}
    <div class="cols cols-flex">
      <div class="col">${bloques.slice(0, mitad).map(renderBloque).join('')}</div>
      <div class="col">${bloques.slice(mitad).map(renderBloque).join('')}</div>
    </div>
  `

  const paginaDosBalanceada = `
    ${tituloPaginaDos}
    <div class="cols">
      ${bloques.map(renderBloque).join('')}
    </div>
  `

  return { paginaUno, paginaDosFlex, paginaDosBalanceada }
}

// Fallback si `plan.nombre` no matchea ninguna key conocida (plan nuevo sin texto legal cargado
// todavía): no rompe el render, solo devuelve un bloque único avisando que el texto está
// pendiente — mismo criterio defensivo que mrc.js usa para catálogo/planCoberturas ausentes.
function buildBloquesLegales(textos, nombrePlan) {
  if (!textos) {
    return [
      {
        titulo: 'Coberturas y condiciones',
        contenido: `<div class="legal-block">Texto legal pendiente de carga para el plan "${escapeHtml(nombrePlan)}".</div>`,
      },
    ]
  }

  const bloques = []

  if (textos.clausulaCobranzas) {
    bloques.push({
      titulo: 'Cláusula Adicional de Cobranzas',
      contenido: `<div class="legal-block">${escapeHtml(textos.clausulaCobranzas)}</div>`,
    })
  }

  if (textos.cobertura?.length) {
    bloques.push({
      titulo: 'Cobertura',
      contenido: `<div class="legal-block">${textos.cobertura.map(escapeHtml).join('.\n')}.</div>`,
    })
  }

  bloques.push({
    titulo: 'Coberturas principales incluidas',
    contenido: `<div class="legal-block">${textos.coberturasPrincipales.map(escapeHtml).join('.\n')}.</div>`,
  })

  if (textos.exclusiones?.length) {
    bloques.push({
      titulo: 'Exclusiones',
      contenido: `<div class="legal-block">${textos.exclusiones.map(escapeHtml).join('.\n')}.</div>`,
    })
  }

  if (textos.recomendaciones?.length) {
    bloques.push({
      titulo: 'Recomendaciones',
      contenido: `<div class="legal-block">${textos.recomendaciones.map(escapeHtml).join('.\n')}.</div>`,
    })
  }

  return bloques
}

function renderBloque(bloque) {
  return `
    <div class="card-block">
      <div class="card-title">${escapeHtml(bloque.titulo)}</div>
      ${bloque.contenido}
    </div>
  `
}

function renderVariantePlanPago(variante) {
  const planesPago = [...(variante.cotizacion_plan_pago || [])].sort(
    (a, b) =>
      ORDEN_FORMAS_PAGO.indexOf(a.formas_pago.codigo) -
      ORDEN_FORMAS_PAGO.indexOf(b.formas_pago.codigo)
  )

  const label =
    variante.tipo_franquicia === 'con_franquicia'
      ? `<div class="variante-label">Con franquicia (Gs. ${fmtGs(variante.franquicia_monto)})</div>`
      : ''

  const cuotasFinanciadas = planesPago.find((fp) => fp.monto_cuota > 0)?.cantidad_cuotas
  const tituloCuota = cuotasFinanciadas ? `Cuota (${cuotasFinanciadas} cuotas)` : 'Cuota'

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
  `
}

function renderFilaSumaAsegurada(cobertura) {
  const badgeClass =
    cobertura.tipo_aplicacion === 'sublimite' ? 'badge--sublimite' : 'badge--cobertura'
  const badgeLabel = cobertura.tipo_aplicacion === 'sublimite' ? 'Sublímite' : 'Cobertura'

  return `
    <tr>
      <td><span class="badge ${badgeClass}">${badgeLabel}</span>${escapeHtml(cobertura.nombre_snapshot)}</td>
      <td>${fmtGs(cobertura.monto)}</td>
      <td>${escapeHtml(textoFranquicia(cobertura.franquicia))}</td>
    </tr>
  `
}

function textoFranquicia(montoFranquicia) {
  return montoFranquicia != null
    ? `10% en todo y cada siniestro, mínimo Gs. ${fmtGs(montoFranquicia)}`
    : 'Sin franquicia'
}
