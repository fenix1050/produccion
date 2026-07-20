// Badge reutilizable — un único punto de verdad para el HTML de estados/etiquetas
// (roles, disponibilidad de ramos, etc.) que hoy se repetía a mano en varias vistas
// (admin-pill, config-perfil-header__badge, ramo-row__badge...).

const BADGE_ICONS = {
  check: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 13l4.5 4.5L19 8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>`,
  shield: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 3.5l7 2.6v5.4c0 4.4-3 7.9-7 9-4-1.1-7-4.6-7-9V6.1l7-2.6z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path></svg>`,
};

function escapeHtml(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string} texto - contenido visible del badge.
 * @param {'primary'|'success'|'warning'|'danger'|'info'|'neutral'|'agent'} variante
 * @param {'check'|'shield'} [icono] - opcional, ícono de 12px antes del texto.
 */
export function crearBadge(texto, variante = 'neutral', icono) {
  const iconoSvg = icono && BADGE_ICONS[icono] ? BADGE_ICONS[icono] : '';
  return `<span class="badge badge--${variante}">${iconoSvg}${escapeHtml(texto)}</span>`;
}
