import { auth } from '../shared/api.js';

// Guard de la pantalla de Configuración: solo exige sesión activa (auth.isLoggedIn()),
// SIN chequear ningún permiso de admin — a diferencia de admin.js, esta pantalla es
// self-service y la usa cualquier usuario logueado (admin o agente) para ver su propio
// perfil y cambiar su propia contraseña. Mismo patrón que historial-guard.js.
if (!auth.isLoggedIn()) {
  window.location.href = '../login/';
}

document.getElementById('logout-link')?.addEventListener('click', async (e) => {
  e.preventDefault();
  await auth.logout();
  window.location.href = '../login/';
});
