# Propuestas Formal — autosave sin interrumpir edición

## Goal

Evitar que el autosave del wizard de `frontend/propuestas/` interrumpa la escritura, pierda el foco o devuelva la pantalla al inicio.

## Scope

- `frontend/propuestas/propuestas.js`
- `frontend/propuestas/propuestas.test.js`

## Plan

1. Aumentar el debounce del autosave a un intervalo razonable para edición humana.
2. Hacer que el autosave exitoso actualice solo el indicador/estado, sin reconstruir el formulario.
3. Mantener render explícito para guardado manual y errores, preservando el comportamiento existente.
4. Agregar regresiones de contrato y ejecutar tests, ESLint, Prettier y `git diff --check`.

## Non-goals

- No cambiar endpoints, payloads, readiness, emisión ni backend.
- No tocar el listado de Propuestas Formales, Historial, OpenSpec ni archivos ajenos.
- No commit.

## Evidence

- Current autosave delay was 900 ms in `propuestas.js`.
- `guardar()` called `render()` after every save, replacing the form and losing focus/scroll.
- Implemented `AUTOSAVE_DEBOUNCE_MS = 2000` and `guardar({ silencioso: true })` for background saves.
- Successful silent saves update only the save indicator; error/conflict rendering restores field focus, selection, and document scroll where possible.
- Verification: frontend tests 108/108, ESLint clean, Prettier check clean, `git diff --check` clean for the candidate (unrelated CRLF warnings remain in pre-existing shared files).
- Browser smoke via `run-cotizador`: mocked authenticated `/propuestas/?carta=123`, one autosave PUT after 2.3s, active `direccion` field/value preserved, internal `.admin-content` scrollTop remained 400, save indicator showed `Guardado · revisión 2`, no console/page errors. Screenshot: `C:/tmp/pw-check/propuestas-autosave.png`.
- TEST deployment: uploaded only `propuestas/propuestas.js` to `soporte@192.168.0.90`, backed up the remote file, replaced it in place under `/opt/cotizador/frontend-test`, and confirmed the served SHA-256 matched `200ab4badd6209354c0b27e972ce258d871d506b73ca9bcf17e33a3db9128779`.
- Authenticated Playwright smoke on `https://test-web.cotizador.lat/propuestas/?carta=1`: step-2 `lugar_trabajo` autosaved after 2.3s; active field/value preserved, internal `.admin-content` scrollTop remained 300, indicator showed `Guardado · revisión 9`, original empty value restored afterward, no page errors or failed requests. One expected 401 occurred on initial `/api/auth/me` before login.
