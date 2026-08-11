import {
  ICON_RAMO_AUTO,
  ICON_RAMO_MRC,
  ICON_RAMO_INCENDIO,
  ICON_RAMO_VIDA_AP,
  ICON_RAMO_HOGAR,
  ICON_SUBLIMITE_GENERICO,
  ICON_SUBLIMITE_AGUA,
  ICON_SUBLIMITE_ELECTRICOS,
  ICON_SUBLIMITE_GRANIZO,
  ICON_SUBLIMITE_MURALLAS,
  ICON_COBERTURA_MOBILIARIO_EQUIPOS,
  ICON_COBERTURA_ROBO_CONTENIDO,
  ICON_COBERTURA_CAJA_REGISTRADORA,
  ICON_COBERTURA_ROBO_TRANSITO,
  ICON_COBERTURA_CRISTALES,
  ICON_COBERTURA_RESPONSABILIDAD_CIVIL,
} from '../shared/nav-icons.js'

// ---- Metadata de ramos mostrados en el sidebar (8 ramos seedeados en la tabla `ramos`) ----
// El código de 2 letras y el estado (disponible/pausa/próximamente) son decisión de UI —
// el estado real se pisa en runtime con `ramoInfo()` según `ramos.activo` (togglable desde
// el panel admin, sección Ramos). Auto-Flota, TRO y Transporte de Mercadería tienen calculador
// propio ya escrito (backend/src/calculators/) pero no fueron pedidos para cotizar todavía —
// por eso quedan acá con estado de fallback 'proximamente' y la migración 046 fuerza
// `ramos.activo = false` para esos 3, así que aparecer en esta lista es solo para que el
// toggle del admin los controle: no los deja disponibles por sí solo (mismo criterio que la
// migración 041 usó para auto/hogar).
export const RAMOS_UI = [
  { nombre: 'auto', code: 'AU', label: 'Auto', estado: 'proximamente' },
  { nombre: 'auto-flota', code: 'AF', label: 'Automóviles - Flota', estado: 'proximamente' },
  { nombre: 'mrc', code: 'MR', label: 'Multirriesgo Comercio', estado: 'disponible' },
  { nombre: 'incendio', code: 'IN', label: 'Incendio', estado: 'disponible' },
  { nombre: 'vida-ap', code: 'VA', label: 'Vida y Accidentes Personales', estado: 'disponible' },
  { nombre: 'hogar', code: 'MH', label: 'Multirriesgo Hogar', estado: 'proximamente' },
  { nombre: 'tro', code: 'TR', label: 'Todo Riesgo Operativo', estado: 'proximamente' },
  { nombre: 'transporte', code: 'TM', label: 'Transporte de Mercadería', estado: 'proximamente' },
]

// Íconos por ramo — se usan tanto en el badge de la vista Datos (form-heading__badge)
// como en el nav del sidebar (.ramo-row__icon), Diseño 2 (docs/mockups/diseno-2-app-shell.html).
// Auto-Flota/TRO/Transporte no tienen ícono propio diseñado todavía — usan el genérico.
export const RAMO_ICONOS = {
  auto: ICON_RAMO_AUTO,
  'auto-flota': ICON_SUBLIMITE_GENERICO,
  mrc: ICON_RAMO_MRC,
  incendio: ICON_RAMO_INCENDIO,
  'vida-ap': ICON_RAMO_VIDA_AP,
  hogar: ICON_RAMO_HOGAR,
  tro: ICON_SUBLIMITE_GENERICO,
  transporte: ICON_SUBLIMITE_GENERICO,
}

// Ramos con calculador real conectado en esta pasada (ver CLAUDE.md — MRC primero, luego
// Incendio, luego Vida-AP).
export const RAMOS_CON_CALCULO = ['mrc', 'incendio', 'vida-ap']

// Nombres de plan cuyo criterio de "calculable" no es prima_tecnica_minima (MRC/Incendio),
// sino directamente esta lista fija — ver vida-ap.calculator.js (PLANES_NO_IMPLEMENTADOS).
export const PLANES_VIDA_AP_CALCULABLES = [
  'PROTECCION FAMILIAR',
  'ACCIDENTES PERSONALES - SECTOR COOPERATIVO',
  'ACCIDENTES PERSONALES - SECTOR PRIVADO',
  'VIDA DIRECTIVOS Y EMPLEADOS',
]

export const CLIENT_FIELDS = [
  { key: 'clienteNombre', label: 'Nombre del asegurado', placeholder: 'Juan Pérez', span: 2 },
  {
    key: 'cedula',
    label: 'RUC / Cédula de identidad',
    placeholder: '4.123.456',
    span: 1,
    money: true,
  },
  {
    key: 'direccion',
    label: 'Ubicación del Riesgo',
    placeholder: 'Av. España 1234, Asunción',
    span: 1,
  },
]

export const CIUDADES = ['Asunción', 'Ciudad del Este', 'Encarnación', 'Otra']

// Opciones de franquicia/deducible que el agente puede elegir por cobertura, según lo que le
// interese al asegurado — misma lista para cualquier cobertura de MRC (confirmado por Kevin,
// 2026-07-13). Puramente informativo para la propuesta: no cambia la prima ya calculada.
// `monto` es el mínimo de la franquicia (null = "Sin deducible", no aplica %).
export const FRANQUICIA_OPCIONES = [
  { valor: 'sin_deducible', label: 'Sin deducible', monto: null },
  { valor: '10_500000', label: '10% en todo y cada siniestro, mínimo Gs. 500.000', monto: 500000 },
  { valor: '10_800000', label: '10% en todo y cada siniestro, mínimo Gs. 800.000', monto: 800000 },
  {
    valor: '10_1000000',
    label: '10% en todo y cada siniestro, mínimo Gs. 1.000.000',
    monto: 1000000,
  },
  {
    valor: '10_1200000',
    label: '10% en todo y cada siniestro, mínimo Gs. 1.200.000',
    monto: 1200000,
  },
  {
    valor: '10_1500000',
    label: '10% en todo y cada siniestro, mínimo Gs. 1.500.000',
    monto: 1500000,
  },
]

// Ramos que hoy soportan descuento/recargo manual del agente en "Detalle del plan" — los
// calculadores de mrc/incendio ya implementan sumarAjustes con tope plan.descuento_maximo /
// plan.recargo_maximo (ver mrc.calculator.js / incendio.calculator.js). Vida/AP no tiene ese
// patrón todavía, no se ofrece ahí.
export const RAMOS_CON_AJUSTES = ['mrc', 'incendio']

// Nombre de campo por objeto de riesgo (PR4 de incendio-3-planes-y-moneda, mecánica
// `objeto_riesgo` — Hipotecario, con/sin Inspección) — mismo mapeo que
// `OBJETOS_RIESGO` en backend/src/calculators/incendio.calculator.js, pero acá con la clave
// de `state.data` (camelCase) en vez del campo de `riesgo_datos` (snake_case).
export const OBJETOS_RIESGO_CAMPOS = [
  { stateKey: 'capitalEdificio', riesgoKey: 'capital_edificio', label: 'Edificio' },
  { stateKey: 'capitalInstalaciones', riesgoKey: 'capital_instalaciones', label: 'Instalaciones' },
  {
    stateKey: 'capitalContenidoMuebleEquipos',
    riesgoKey: 'capital_contenido_mueble_equipos',
    label: 'Contenido Mueble y Equipos',
  },
  {
    stateKey: 'capitalContenidoMercaderia',
    riesgoKey: 'capital_contenido_mercaderia',
    label: 'Contenido Mercadería',
  },
]

// id del elemento del panel "Cotización en vivo" que explica por qué está bloqueado el avance a
// "Detalle del plan" (capital insuficiente, prima por debajo de la mínima, cálculo aún pendiente).
// Referenciado por aria-describedby desde el botón/tab deshabilitados para que el motivo sea
// accesible por lector de pantalla, no solo por el tooltip `title` (ver syncAvanceButtons()).
export const MOTIVO_BLOQUEO_ID = 'motivo-bloqueo-avance'

export const DEBOUNCE_MS = 450

// Códigos que no deben ofrecerse en "Coberturas adicionales": las 2 fijas ya tienen su propio
// campo en el formulario, sublimite_cctv todavía no tiene tasa cargada (no cotizable),
// 'equipos_electronicos' (la cobertura, distinta del sublímite) queda representada por ese
// mismo sublímite fijo en MRC — confirmado por el área técnica, 2026-07-15: en esta rama no se
// ofrece por separado — y 'robo_valores_ventanilla' pasa a auto-calcularse a partir de "Valores
// en caja fuerte" (ver sublimiteVentanillaCalculado(), Ajuste MC.xlsx ítem #5, 2026-08-05): el
// agente ya no lo elige a mano, revierte la decisión anterior de 2026-07-13 (migración 020,
// donde el 30% era solo referencia). Los sublímites fijos por defecto (WU6, 2026-07-17: ya no
// hardcodeados, ver sublimitesFijosMrc()) se agregan a esta lista de exclusión en tiempo real.
export const CODIGOS_COBERTURA_EXCLUIDOS_BASE = [
  'incendio_edificio',
  'incendio_contenido',
  'sublimite_cctv',
  'equipos_electronicos',
  'robo_valores_ventanilla',
]

// Porcentaje del capital declarado en "Valores en caja fuerte" (codigo robo_caja_registradora)
// que se auto-asigna como suma asegurada del sublímite "Robo valores ventanilla".
export const PORCENTAJE_VENTANILLA_SOBRE_CAJA_FUERTE = 0.3

// Cuántas veces puede cargarse la MISMA cobertura entre las líneas de "Coberturas adicionales"
// (con distinta suma asegurada cada vez). Por defecto 1 (sin repetición). Ajustado el 2026-08-07
// a pedido de Kevin: 'robo_contenido' pierde su excepción de repetición x2 (confirmada el
// 2026-07-13) y pasa a comportarse como el resto del catálogo — máximo 1 vez.
export const LIMITE_REPETICION_COBERTURA_MRC = {}
export const LIMITE_REPETICION_COBERTURA_MRC_DEFAULT = 1

// Ícono por código de sublímite en el panel "Cotización en vivo" — códigos reales de MRC
// (migración 012/019), fallback genérico para cualquier código sin ícono propio definido.
export const SUBLIMITE_ICONOS = {
  sublimite_danos_agua: ICON_SUBLIMITE_AGUA,
  sublimite_equipos_electronicos: ICON_SUBLIMITE_ELECTRICOS,
  sublimite_granizo: ICON_SUBLIMITE_GRANIZO,
  sublimite_murallas_cercos: ICON_SUBLIMITE_MURALLAS,
  incendio_edificio: ICON_RAMO_HOGAR,
  incendio_contenido: ICON_RAMO_INCENDIO,
}

// Ícono por código de cobertura para el skin nuevo de "Coberturas adicionales"
// (coberturas-adicionales-redesign, requirement "Dedicated Icons for Previously Icon-less
// Coverages"). Spread de SUBLIMITE_ICONOS (byte-idéntico, sin tocarlo) + las 6 coberturas que
// hoy caen al genérico `ICON_SUBLIMITE_GENERICO` dentro de esa card. Unit 1/3: dead code, sin
// caller todavía — lo consume `cardCoberturaAdicional()` en render-datos.js recién en Unit 3.
// El `.cobertura-card` de solo lectura de "Detalle del plan" sigue leyendo SUBLIMITE_ICONOS,
// no este mapa — no puede regresionar.
export const COBERTURA_ICONOS = {
  ...SUBLIMITE_ICONOS,
  incendio_mobiliario_equipos: ICON_COBERTURA_MOBILIARIO_EQUIPOS,
  robo_contenido: ICON_COBERTURA_ROBO_CONTENIDO,
  robo_caja_registradora: ICON_COBERTURA_CAJA_REGISTRADORA,
  robo_transito: ICON_COBERTURA_ROBO_TRANSITO,
  cristales: ICON_COBERTURA_CRISTALES,
  responsabilidad_civil: ICON_COBERTURA_RESPONSABILIDAD_CIVIL,
}

// Ícono de precio para el footnote de "Detalle del plan" — no vive en nav-icons.js porque
// es específico de esta franja de resumen, no de la navegación.
export const ICON_TAG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M11.5 3.5H5a1.5 1.5 0 0 0-1.5 1.5v6.5a1.5 1.5 0 0 0 .44 1.06l8 8a1.5 1.5 0 0 0 2.12 0l6.5-6.5a1.5 1.5 0 0 0 0-2.12l-8-8A1.5 1.5 0 0 0 11.5 3.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path><circle cx="8.2" cy="8.2" r="1.4" fill="currentColor"></circle></svg>`

// Pasos del modal de progreso de emitirCartaOferta() — 0 y 3 son instantáneos (validación
// ya resuelta por el guard de entrada / blob ya resuelto), 1 y 2 quedan activos mientras
// corren los 2 awaits reales (crear/actualizar cotización, generar PDF).
export const PASOS_EMISION_CARTA = [
  'Validando datos',
  'Generando Carta Oferta',
  'Generando PDF',
  'Cotización lista',
]
export const ICON_PLUS = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>`

// Mismo orden que ORDEN_FORMAS_PAGO en backend/src/templates/oferta/{mrc,incendio}.js — el
// backend no garantiza este orden en la respuesta de preview, así que se ordena acá para que
// los pills de "Forma de pago" del panel en vivo salgan siempre igual (pedido de Kevin 2026-08-07).
export const ORDEN_FORMAS_PAGO = ['contado', 'cobrador', 'boca_cobranza', 'tarjeta_credito']

// Versión del cotizador mostrada en el topbar y en el pie de página del sidebar (chrome de
// UI, no viene de la base) — única fuente de verdad para que ambas queden siempre de la mano.
// Se incrementa a mano cuando haya un cambio visible que valga la pena versionar.
export const COTIZADOR_VERSION = '1.0.1'
