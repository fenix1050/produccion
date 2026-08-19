function freezeFixture(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nestedValue of Object.values(value)) freezeFixture(nestedValue)
    Object.freeze(value)
  }
  return value
}

function coverage(id, ramoId, codigo, nombre, categoria = 'Cobertura') {
  return {
    id,
    ramo_id: ramoId,
    codigo,
    nombre,
    categoria,
    incluye_en_suma_asegurada_total: categoria === 'Cobertura',
    franquicia_default: null,
    texto_legal: `fixture legal text for ${codigo}`,
    texto_exclusiones: `fixture exclusions for ${codigo}`,
  }
}

function planPayment(id, planId, formaPagoId, tasaRpf) {
  return { id, plan_id: planId, forma_pago_id: formaPagoId, tasa_rpf: tasaRpf }
}

function planCoverage(id, cobertura, monto) {
  return {
    id,
    plan_id: 101,
    cobertura_id: cobertura.id,
    incluida_por_defecto: true,
    monto,
    franquicia: null,
    coberturas_catalogo: {
      codigo: cobertura.codigo,
      nombre: cobertura.nombre,
      categoria: cobertura.categoria,
    },
  }
}

function coverageRate(id, codigo, tasaValor) {
  return {
    id,
    ramo_id: 10,
    cobertura_codigo: codigo,
    tasa_valor: tasaValor,
    unidad: 'permil',
    vigente_desde: '2026-01-01',
    coberturas_catalogo: { codigo },
  }
}

const MRC_RAMO = {
  id: 10,
  codigo: 'mrc',
  nombre: 'mrc',
  nombre_display: 'Multirriesgo Comercio',
  activo: true,
}
const INCENDIO_RAMO = {
  id: 20,
  codigo: 'incendio',
  nombre: 'incendio',
  nombre_display: 'Incendio',
  activo: true,
}
const MRC_PLAN = {
  id: 101,
  ramo_id: 10,
  nombre: 'MRC Fixture Plan',
  tipo_mecanica: null,
  prima_tecnica_minima: 409091,
  prima_tecnica_minima_usd: null,
  responsabilidad_maxima_cotizable: null,
  cotizacion_combinada: false,
  descuento_default: null,
  descuento_maximo: 20,
  recargo_maximo: 100,
  cuotas_default: 1,
  cuotas_maximo: 1,
  activo: true,
}
const INCENDIO_PLAN = {
  id: 201,
  ramo_id: 20,
  nombre: 'INCENDIO SIN INSPECCION',
  tipo_mecanica: 'objeto_riesgo',
  prima_tecnica_minima: 409091,
  prima_tecnica_minima_usd: null,
  responsabilidad_maxima_cotizable: null,
  cotizacion_combinada: false,
  descuento_default: null,
  descuento_maximo: 20,
  recargo_maximo: 100,
  cuotas_default: 1,
  cuotas_maximo: 1,
  activo: true,
}
const MRC_COVERAGES = [
  coverage(1001, 10, 'incendio_edificio', 'Building Fire'),
  coverage(1002, 10, 'incendio_contenido', 'Contents Fire'),
  coverage(1003, 10, 'robo_contenido', 'Robo de Contenido'),
  coverage(1004, 10, 'sublimite_danos_agua', 'Daños por Agua', 'Sublímites'),
  coverage(
    1005,
    10,
    'sublimite_equipos_electronicos',
    'Daños a Equipos Electrónicos (sublímite Incendio)',
    'Sublímites'
  ),
  coverage(1006, 10, 'sublimite_granizo', 'Daños por Granizo (al edificio)', 'Sublímites'),
]
const INCENDIO_COVERAGES = [
  coverage(2001, 20, 'incendio_contenido', 'Contents Fire'),
  coverage(2002, 20, 'incendio_edificio', 'Incendio Edificio'),
]
const MRC_RATES = [{ cobertura_codigo: 'incendio_edificio', tasa_valor: 1 }]
const INCENDIO_RATES = [{ cobertura_codigo: 'incendio_contenido', tasa_valor: 2 }]
const CONTADO_PAYMENT = { codigo: 'contado', tasa_rpf: 0 }
const MRC_REQUEST = {
  cliente_nombre: 'MRC Fixture Client',
  plan_id: 101,
  capital_asegurado: 150000000,
  riesgo_datos: {
    tipo_riesgo: 'OFFICE',
    cedula: '1234567',
    direccion: 'Av. Mariscal López 1234',
    rubro_actividad: 'OFFICE',
    ciudad: 'Asunción',
    capital_edificio: 100000000,
    capital_contenido: 50000000,
    coberturas_adicionales: [{ codigo: 'robo_contenido', suma_asegurada: 10000000 }],
    franquicias_por_cobertura: {},
  },
  descuentos: [],
  recargos: [],
}
const INCENDIO_REQUEST = {
  cliente_nombre: 'Incendio Fixture Client',
  plan_id: 201,
  capital_asegurado: 250000000,
  riesgo_datos: {
    tipo_riesgo: 'WAREHOUSE',
    rubro_actividad: 'WAREHOUSE',
    capital_edificio: 250000000,
    capital_contenido: 0,
    capital_maquinaria: 0,
    capital_instalaciones: 0,
    capital_contenido_mueble_equipos: 0,
    capital_contenido_mercaderia: 0,
  },
  descuentos: [],
  recargos: [],
}

export const FIXTURES = freezeFixture({
  user: {
    id: 1,
    nombre: 'Smoke Test Agent',
    email: 'smoke.agent@example.test',
    password: 'fixture-only-password',
    rol: 'agente',
    activo: true,
    token_version: 1,
    telefono: '+595 981 000 000',
    puede_agregar_cobertura_libre: true,
    puede_editar_tasas: false,
    puede_gestionar_usuarios: false,
    puede_editar_coberturas: false,
    puede_editar_planes: false,
    puede_editar_descuento_plan: false,
    puede_ver_descuento_plan: true,
    descuento_maximo_pct: null,
    recargo_maximo_pct: null,
  },

  mrc: {
    ramo: MRC_RAMO,
    plan: MRC_PLAN,
    rates: MRC_RATES,
    coverages: [MRC_COVERAGES[0]],
    payment: CONTADO_PAYMENT,
    request: MRC_REQUEST,
    invalidRequest: { cliente_nombre: '', riesgo_datos: {} },
  },
  incendio: {
    ramo: INCENDIO_RAMO,
    plan: INCENDIO_PLAN,
    rates: INCENDIO_RATES,
    coverages: [INCENDIO_COVERAGES[1]],
    payment: CONTADO_PAYMENT,
    request: INCENDIO_REQUEST,
    invalidRequest: { cliente_nombre: '', riesgo_datos: {} },
  },

  ramos: [
    { ...MRC_RAMO, calculador: 'mrc', usa_rpf_por_cuotas: false },
    { ...INCENDIO_RAMO, calculador: 'incendio', usa_rpf_por_cuotas: false },
  ],
  planes: [MRC_PLAN, INCENDIO_PLAN],
  rubros: [
    {
      id: 1,
      nombre: 'OFFICE',
      descripcion: 'Administrative office',
      tasa_edificio: 1,
      tasa_contenido: 2,
    },
    {
      id: 2,
      nombre: 'RETAIL',
      descripcion: 'Retail business',
      tasa_edificio: 1.4,
      tasa_contenido: 2.3,
    },
    {
      id: 3,
      nombre: 'WAREHOUSE',
      descripcion: 'Merchandise warehouse',
      tasa_edificio: 1,
      tasa_contenido: 2,
    },
  ],
  rubrosPorRamo: { 10: [1, 2], 20: [1, 3] },
  coberturasCatalogo: { 10: MRC_COVERAGES, 20: INCENDIO_COVERAGES },
  planCoberturas: {
    101: [
      planCoverage(1101, MRC_COVERAGES[3], 2500000),
      planCoverage(1102, MRC_COVERAGES[4], 5000000),
      planCoverage(1103, MRC_COVERAGES[5], 5000000),
    ],
    201: [],
  },
  tasasCoberturaRamo: [
    coverageRate(1, 'incendio_edificio', MRC_RATES[0].tasa_valor),
    coverageRate(2, 'robo_contenido', 5),
    coverageRate(3, 'sublimite_danos_agua', 22),
    coverageRate(4, 'sublimite_equipos_electronicos', 16),
    coverageRate(5, 'sublimite_granizo', 22),
  ],
  tasasObjetoRiesgo: {
    20: {
      tipo_riesgo: {
        nombre: 'WAREHOUSE',
        tasa_global: 0.5,
        tasa_minima: null,
        tasa_maxima: null,
        unidad: 'permil',
      },
      objetos: { edificio: { tasa_valor: 0.4, unidad: 'permil' } },
    },
  },
  formasPago: [
    { id: 1, ...CONTADO_PAYMENT, nombre_display: 'Contado' },
    { id: 2, codigo: 'cobrador', nombre_display: 'Crédito (Cobrador)' },
    { id: 3, codigo: 'boca_cobranza', nombre_display: 'Boca de Cobranza' },
    { id: 4, codigo: 'tarjeta_credito', nombre_display: 'Tarjeta de Crédito' },
  ],
  planFormasPago: [
    planPayment(1001, 101, 1, 0),
    planPayment(1002, 101, 2, 1.6),
    planPayment(1003, 101, 3, 1.35),
    planPayment(1004, 101, 4, 1),
    planPayment(2001, 201, 1, 0),
    planPayment(2002, 201, 2, 1.6),
    planPayment(2003, 201, 3, 1.35),
    planPayment(2004, 201, 4, 1),
  ],
  request: { mrc: MRC_REQUEST, incendio: INCENDIO_REQUEST },
  expected: {
    mrc: { prima: 495000, premioContado: 544000, premioSinIvaContado: 495000 },
    incendio: { prima: 409091, premioContado: 450000, premioSinIvaContado: 409091 },
  },
})
