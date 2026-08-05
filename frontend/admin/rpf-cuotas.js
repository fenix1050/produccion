import { api } from '../shared/api.js'
import { state } from './state.js'
import { renderApp, mostrarBanner } from './render/shell.js'

// ---------------------------------------------------------------------------
// R.P.F. por cuotas (migración 058, cambio `rpf-variable-mrc`): carga y guardado bulk
// de la curva global. A diferencia del resto de la sección Planes, no hay un Set de
// edición per-celda — la grilla siempre muestra inputs editables y un único "Guardar"
// (design.md Decisión 7, evita dejar la curva a medio editar en vivo).
// ---------------------------------------------------------------------------

export async function cargarCurvaRpf() {
  state.curvaRpf = { ...state.curvaRpf, loading: true, error: '' }
  renderApp()
  try {
    const datos = await api.get('/admin/rpf-cuotas')
    state.curvaRpf = { loading: false, error: '', datos, guardando: false }
  } catch (err) {
    state.curvaRpf = {
      loading: false,
      error: err.message || 'No se pudo cargar la curva de R.P.F.',
      datos: null,
      guardando: false,
    }
  }
  renderApp()
}

export async function guardarCurvaRpf(form) {
  const inputs = form.querySelectorAll('input[data-forma-pago-id]')
  const celdas = Array.from(inputs).map((input) => ({
    forma_pago_id: Number(input.dataset.formaPagoId),
    cuotas: Number(input.dataset.cuotas),
    tasa_rpf: Number(input.value),
  }))

  if (celdas.some((c) => Number.isNaN(c.tasa_rpf))) {
    mostrarBanner('error', 'Todas las celdas de la curva deben tener un valor numérico.')
    return
  }

  state.curvaRpf.guardando = true
  renderApp()
  try {
    const datos = await api.put('/admin/rpf-cuotas', { celdas })
    state.curvaRpf = { loading: false, error: '', datos, guardando: false }
    mostrarBanner('success', 'Curva de R.P.F. actualizada.')
  } catch (err) {
    state.curvaRpf.guardando = false
    mostrarBanner('error', err.message || 'No se pudo actualizar la curva de R.P.F.')
  }
  renderApp()
}
