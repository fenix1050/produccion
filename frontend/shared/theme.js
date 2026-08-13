// Toggle de tema claro/oscuro — cargado como script clásico (no módulo) en el <head>
// de cada página, junto al snippet anti-FOUC (ver frontend/shared/theme-dark.css para
// el porqué de data-theme en vez de prefers-color-scheme en el stylesheet). Expone
// funciones globales en window (mismo patrón que frontend/shared/config.js con
// window.API_BASE_URL) para que sidebar.js, que es un módulo ES, pueda usarlas sin
// convertir este archivo en módulo — el snippet anti-FOUC necesita correr antes de
// cualquier <link rel="stylesheet">, y un módulo se difiere hasta después del parseo,
// lo que reintroduciría el flash de tema incorrecto.

const TAJY_THEME_KEY = 'tajy-theme'

window.applyStoredTheme = function applyStoredTheme() {
  let theme
  try {
    theme = localStorage.getItem(TAJY_THEME_KEY)
  } catch {
    theme = null
  }
  if (theme !== 'dark' && theme !== 'light') {
    theme =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
  }
  document.documentElement.setAttribute('data-theme', theme)
  return theme
}

window.setTheme = function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(TAJY_THEME_KEY, theme)
  } catch {
    // localStorage puede fallar (modo privado, cuotas) — el atributo ya quedó
    // seteado igual, solo no persiste entre sesiones.
  }
  document.dispatchEvent(new CustomEvent('tajy-theme-change', { detail: { theme } }))
}

window.toggleTheme = function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  const next = current === 'dark' ? 'light' : 'dark'
  window.setTheme(next)
  return next
}

// Ícono sol/luna inline, mismo formato de template string que ICON_BELL/ICON_CHEVRON_DOWN
// en frontend/shared/nav-icons.js (Boxicons "regular", viewBox 24x24). Ambos íconos
// permanecen en el botón y CSS muestra el adecuado según data-theme: así el toggle no
// reconstruye la pantalla que lo contiene ni interrumpe el foco de sus controles.
const ICON_SUN = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17c-2.757 0-5-2.243-5-5s2.243-5 5-5 5 2.243 5 5-2.243 5-5 5zm0-8c-1.654 0-3 1.346-3 3s1.346 3 3 3 3-1.346 3-3-1.346-3-3-3zM11 0h2v3h-2zm0 21h2v3h-2zM3.515 4.929l1.414-1.414 2.122 2.121-1.414 1.414zM17.05 18.464l1.414-1.414 2.121 2.121-1.414 1.414zM18.464 3.515l1.414 1.414-2.121 2.122-1.414-1.414zM4.929 17.05l1.414 1.414-2.121 2.121-1.414-1.414zM21 11h3v2h-3zM0 11h3v2H0z"></path></svg>`
const ICON_MOON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.1 22c-5.523 0-10-4.477-10-10 0-4.418 2.865-8.166 6.839-9.489a1 1 0 0 1 1.211 1.417A7.98 7.98 0 0 0 9 8c0 4.411 3.589 8 8 8a7.98 7.98 0 0 0 4.072-1.15 1 1 0 0 1 1.417 1.211C21.166 20.135 17.418 22 13 22c-.302 0-.6-.017-.9-.05.001.017 0 .033 0 .05z"></path></svg>`

function themeToggleLabel(theme) {
  return theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'
}

window.renderThemeToggleButton = function renderThemeToggleButton({
  className = 'topbar__bell topbar__theme-toggle',
} = {}) {
  const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  return `<button class="${className}" type="button" data-action="toggle-theme" aria-label="${themeToggleLabel(theme)}" aria-pressed="${theme === 'dark'}">
    <span class="theme-toggle__icon" data-theme-icon="sun" aria-hidden="true">${ICON_SUN}</span>
    <span class="theme-toggle__icon" data-theme-icon="moon" aria-hidden="true">${ICON_MOON}</span>
  </button>`
}

let themeToggleBound = false
window.bindThemeToggleOnce = function bindThemeToggleOnce() {
  if (themeToggleBound) return
  themeToggleBound = true

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-action="toggle-theme"]')
    if (!trigger) return
    window.toggleTheme()
  })

  document.addEventListener('tajy-theme-change', () => {
    const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
    document.querySelectorAll('[data-action="toggle-theme"]').forEach((btn) => {
      btn.setAttribute('aria-label', themeToggleLabel(theme))
      btn.setAttribute('aria-pressed', String(theme === 'dark'))
    })
  })
}
