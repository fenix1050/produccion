// Iconos de línea para el sidebar de nav (cotizar/historial/admin/configuración) y el
// texto de confianza del footer — todos comparten este set para no duplicar SVGs por página.

export const ICON_ARROW_LEFT = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
export const ICON_CLOCK = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.7"></circle><path d="M12 7.5V12l3 2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
export const ICON_GEAR = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"></circle><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M17.7 6.3l-1.5 1.5M7.8 16.2l-1.5 1.5M17.7 17.7l-1.5-1.5M7.8 7.8L6.3 6.3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path></svg>`;
export const ICON_WRENCH = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14.7 6.3a3.5 3.5 0 0 0-4.7 4.2L4.5 16l3.5 3.5 5.5-5.5a3.5 3.5 0 0 0 4.2-4.7l-2.6 2.6-2.1-2.1 2.6-2.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path></svg>`;
export const ICON_LOGOUT = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H9M14 16l4-4-4-4M18 12H9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
export const ICON_SHIELD = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3.5l7 2.6v5.4c0 4.4-3 7.9-7 9-4-1.1-7-4.6-7-9V6.1l7-2.6z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path></svg>`;

export function renderTrustFooter() {
  return `<div class="sidebar__trust">${ICON_SHIELD}<span>Tu información está segura con nosotros</span></div>`;
}
