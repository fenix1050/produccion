---
name: run-cotizador
description: Launch the Cotizador Tajy app (Express backend + static Vanilla JS frontend) locally and drive it in a headless browser to verify a change end-to-end. Use whenever asked to run, start, or visually verify the cotizador app.
---

# Running the Cotizador Tajy app

Two independent processes: an Express API (backend) and a static
Vanilla JS frontend (no build step). The frontend talks to the API
directly via `fetch` — there's no dev-server proxy.

## 1. Start the backend (port 3000)

```bash
cd backend
npm run dev &   # nodemon-style --watch, restarts on file change
echo $! > /tmp/cotizador-backend.pid
timeout 30 bash -c 'until curl -sf http://localhost:3000/api/ramos >/dev/null; do sleep 1; done'
```

- Reads Supabase credentials from `backend/.env` — must exist and be valid.
- **`EADDRINUSE` on :3000** almost always means a backend from a
  previous session is still up. Check with
  `curl -s http://localhost:3000/api/ramos` first — if it responds,
  skip starting a new one and just use it.
- Stop with `kill $(cat /tmp/cotizador-backend.pid)` or `pkill -f "node --watch src/server.js"`.

## 2. CORS gotcha — the frontend MUST be served on port 5000

`backend/src/app.js` sets
`cors({ origin: process.env.FRONTEND_URL || '*' })`, and `backend/.env`
pins `FRONTEND_URL=http://localhost:5000`. Any other port (5500, 8080,
whatever `serve` picks by default) gets a CORS preflight rejection and
every `fetch` in `frontend/shared/api.js` fails silently into
"No se pudo cargar..." errors in the UI.

```bash
cd frontend
npx --yes serve -l 5000 . &
echo $! > /tmp/cotizador-frontend.pid
timeout 15 bash -c 'until curl -sf http://localhost:5000/cotizar/ >/dev/null; do sleep 1; done'
```

Stop with `kill $(cat /tmp/cotizador-frontend.pid)`.

## 3. Drive it (Playwright — no `chromium-cli` in this environment)

No system-wide `chromium-cli`. Install Playwright once per session in
a scratch dir (don't add it to the repo's `package.json` — it's not a
project dependency):

```bash
mkdir -p /tmp/pw-check && cd /tmp/pw-check
npm init -y >/dev/null 2>&1
npm install playwright --no-save
npx playwright install chromium   # ~110MB, only needed once per machine
```

Then a Node script against `http://localhost:5000/cotizar/`. Key
selectors/behavior discovered by trial:

- Sidebar ramo links are plain text — `page.click('text=Multirriesgo Comercio')`.
- Form inputs have **no `name`/`id`**, only `class="field-input"` and a
  placeholder — select by `page.locator('input.field-input').nth(N)`
  in DOM order (Nombre=0, Cédula=1, Dirección=2, then ramo-specific
  capital fields).
- Placeholder text (e.g. "450.000.000") is NOT a real value — you must
  `.fill()` every field or Zod validation 422s ("too_small" on
  cedula/direccion) or the calculation silently uses empty risk data.
- `select` elements: `page.locator('select').nth(0).selectOption({ index: 1 })`.
- The "Ver detalle completo →" button (`#btn-ver-detalle`) stays
  `disabled` until the async price preview finishes ("Calculando..."
  in the "Cotización en vivo" panel). Poll with
  `page.waitForFunction(() => !document.querySelector('#btn-ver-detalle').disabled)`
  instead of a fixed `waitForTimeout` — the calc call is a real network
  round-trip to Supabase.
- Screenshot both the filled form (`Datos` tab) and the `Detalle del
  plan` tab (click the tab button, or the CTA button navigates there
  directly) — cobertura names live in the second one.

Example full script: see the session that authored this skill, or
just reproduce the steps above — there's nothing project-specific left
out.

## Cleanup

```bash
kill $(cat /tmp/cotizador-backend.pid) 2>/dev/null
kill $(cat /tmp/cotizador-frontend.pid) 2>/dev/null
```

Don't kill a backend you didn't start yourself (check via the
`EADDRINUSE` signal above) — it may be the user's own dev session.