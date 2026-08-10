// Estado global del cotizador (Fase 6, alcance MRC/Incendio/Vida-AP) + referencia al nodo raíz
// del DOM. Extraído verbatim de cotizar.js (Task 1 de la modularización, ver
// docs/PLAN_DESARROLLO.md / openspec/changes/cotizar-js-modularizacion) — cero cambio de
// comportamiento, solo movimiento de código.

const state = {
  ramosActivos: [],
  ramoId: null,
  // Sidebar hamburguesa (Fase 4 responsive, ≤1024px) — puramente visual, mismo patrón
  // que admin.js/configuracion.js/historial.js. Ver .sidebar/.sidebar-overlay en
  // frontend/shared/cotizador.css.
  sidebarAbierta: false,
  planes: [],
  planId: null,
  // true una vez que el agente llegó a "Detalle del plan" al menos una vez — a partir de ahí
  // el selector de plan en "Datos" queda de solo lectura (ver renderPlanRow()), aunque vuelva
  // a la pestaña "Datos". Se resetea al elegir ramo o al cargar una cotización para editar.
  planBloqueado: false,
  rubros: [],
  view: 'form', // 'form' | 'result'
  data: {},
  preview: null,
  previewError: null,
  loadingPreview: false,
  // Forma de pago elegida por el agente en el cotizador (sección "Cotización en vivo").
  // Se conserva mientras dure la cotización y es la que después va a mostrarse también
  // en "Detalle del plan" y en la Carta Oferta (cuando se implemente) — ver PLAN_DESARROLLO.md
  // sección 5: las 4 formas de pago se calculan siempre en simultáneo, pero el agente
  // presenta una sola al cliente.
  formaPagoCodigo: null,
  // Franquicia elegida por el agente para cada cobertura (codigo -> valor de FRANQUICIA_OPCIONES).
  // Puramente informativo para la propuesta — no afecta la prima ya calculada.
  franquiciasPorCobertura: {},
  // Catálogo de coberturas del plan actual (plan_coberturas + coberturas_catalogo), usado para
  // poblar el selector de "Coberturas adicionales". Se carga una vez al elegir plan.
  coberturasCatalogo: [],
  // Filas de `plan_coberturas` (con `coberturas_catalogo` embebido) del plan MRC elegido — de
  // acá salen los sublímites fijos por defecto (WU6, 2026-07-17: antes hardcodeados en
  // SUBLIMITES_FIJOS_MRC). Se carga una vez al elegir plan, vía GET /planes/:id/coberturas.
  planCoberturas: [],
  // Líneas de coberturas/sublímites adicionales que el agente agrega a mano, más allá de las
  // 2 fijas (Incendio Edificio / Incendio Contenido). Cada línea: { id, codigo, sumaAsegurada }.
  coberturasAdicionales: [],
  // true mientras se guarda la cotización y se genera el PDF, para deshabilitar el botón y
  // evitar doble click (crearía 2 cotizaciones con números correlativos distintos).
  emitiendoCarta: false,
  // Progreso del modal de emisión — null cuando el modal está cerrado.
  // { paso: 0-3 (índice en PASOS_EMISION_CARTA), estado: 'activo'|'exito'|'error', error?: string }
  // Los pasos 1 y 2 quedan atados a los 2 awaits reales de emitirCartaOferta() (crear/actualizar
  // cotización, generar PDF) — no son una animación simulada.
  progresoCarta: null,
  // Id de la cotización que se está editando (via ?editar=<id> — ver historial.js, botón
  // "Editar" dentro de la ventana de 30 días). null = flujo normal de alta. Si está seteado,
  // emitirCartaOferta() hace PUT /cotizaciones/:id en vez de POST /cotizaciones.
  editandoId: null,
  banner: null, // { tipo: 'error'|'success', texto }
}

const app = document.getElementById('app')

export { state, app }
