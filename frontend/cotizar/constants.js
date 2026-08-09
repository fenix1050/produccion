import {
  ICON_RAMO_AUTO,
  ICON_RAMO_MRC,
  ICON_RAMO_INCENDIO,
  ICON_RAMO_VIDA_AP,
  ICON_RAMO_HOGAR,
  ICON_SUBLIMITE_GENERICO,
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
