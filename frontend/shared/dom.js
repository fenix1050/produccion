// Helpers de DOM/texto compartidos entre las vistas (cotizar/historial/admin/configuracion/login).

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch]);
}

// ---------------------------------------------------------------------------
// Focus trap para modales (role="dialog") — admin.js e historial.js reconstruyen
// el modal entero en cada renderApp(), así que el trap se resuelve consultando el
// contenedor vivo en cada evento en vez de guardar referencias a nodos que ya no
// existen tras el siguiente render.
// ---------------------------------------------------------------------------

const SELECTOR_FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function obtenerFocusables(contenedor) {
  if (!contenedor) return [];
  return Array.from(contenedor.querySelectorAll(SELECTOR_FOCUSABLE)).filter((el) => !el.disabled);
}

// Foco inicial al abrir un modal: primer elemento enfocable adentro, o el propio
// contenedor (con tabindex="-1" temporal) si no hay ninguno enfocable.
export function enfocarPrimerElemento(contenedor) {
  if (!contenedor) return;
  const focusables = obtenerFocusables(contenedor);
  if (focusables.length) {
    focusables[0].focus();
    return;
  }
  contenedor.setAttribute('tabindex', '-1');
  contenedor.focus();
}

// Ciclo estándar de focus trap: Tab en el último elemento vuelve al primero,
// Shift+Tab en el primero vuelve al último. Pensado para llamarse desde el
// keydown global existente (ver onKeydown en admin.js/historial.js).
export function atraparFoco(e, contenedor) {
  if (e.key !== 'Tab' || !contenedor) return;
  const focusables = obtenerFocusables(contenedor);
  if (!focusables.length) {
    e.preventDefault();
    return;
  }
  const primero = focusables[0];
  const ultimo = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === primero) {
    e.preventDefault();
    ultimo.focus();
  } else if (!e.shiftKey && document.activeElement === ultimo) {
    e.preventDefault();
    primero.focus();
  }
}
