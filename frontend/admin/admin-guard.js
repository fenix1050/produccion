import { auth } from '../shared/api.js';

// Guard mínimo de la página stub de Admin (WU4) — el panel SPA real es WU5.
if (!auth.isLoggedIn()) {
  window.location.href = '../login/';
}

document.getElementById('logout-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  auth.clearSession();
  window.location.href = '../login/';
});
