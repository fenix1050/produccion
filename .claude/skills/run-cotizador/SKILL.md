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

## 2. Serve from the REPO ROOT, not `frontend/` — and CORS needs port 5000

Two separate gotchas that both bit a past session, stack them:

**Serve root.** Pages reference the shared `logo/` folder (repo root,
sibling of `frontend/`, NOT inside it — e.g. sidebar logo and favicon
via `../../logo/logo.png` / `../../logo/favicon.ico` from
`frontend/cotizar/index.html`). If you `cd frontend && serve .`, the
server root is `frontend/` and every one of those `../../logo/...`
requests resolves outside the served root — the browser 404s them
**silently** (a broken `<img>` doesn't throw a JS error or show in
`console --errors`, so this is easy to ship without noticing — it did,
once). Serve the **repo root** instead, and the app lives under
`/frontend/...`:

```bash
npx --yes serve -l 5000 .   # from the REPO ROOT, not frontend/
echo $! > /tmp/cotizador-frontend.pid
timeout 15 bash -c 'until curl -sf http://localhost:5000/frontend/cotizar/ >/dev/null; do sleep 1; done'
```

Page URLs are now `http://localhost:5000/frontend/cotizar/`,
`http://localhost:5000/frontend/admin/`, etc. — not `/cotizar/`. Sanity
check after starting: `curl -o /dev/null -w '%{http_code}' http://localhost:5000/logo/logo.png`
must be `200`, not `404`.

**CORS.** `backend/src/app.js` sets
`cors({ origin: process.env.FRONTEND_URL || '*' })`, and `backend/.env`
pins `FRONTEND_URL=http://localhost:5000`. Any other port (5500, 8080,
whatever `serve` picks by default) gets a CORS preflight rejection and
every `fetch` in `frontend/shared/api.js` fails silently into
"No se pudo cargar..." errors in the UI — so the port must stay 5000
regardless of which directory you serve.

**Port already taken by a stale instance.** On Windows, `pkill -f
"serve -l 5000"` from Git Bash often does NOT kill the underlying
Windows node process — `serve` silently rebinds to a random port
instead of failing, so you can be looking at a stale instance without
any error. Verify the PID that actually owns :5000 and force-kill it
directly if a fresh `serve` doesn't report `Accepting connections at
http://localhost:5000` (it'll report some other port instead if 5000
was still held):

```bash
netstat -ano | grep ':5000.*LISTENING'   # note the PID in the last column
taskkill //PID <pid> //F                  # Git Bash needs // to escape the leading -
```

Stop with `kill $(cat /tmp/cotizador-frontend.pid)`, and verify with
`netstat` if you're not sure it actually died.

## 3. Scope the check to what changed (diff-aware)

Before driving the browser, run `git diff --name-only` (or
`--name-only HEAD~1` if already committed) and map touched files to the
affected page(s) instead of re-walking the whole app every time:

| Changed path | Test only |
|---|---|
| `backend/src/calculators/mrc.calculator.js`, `backend/src/schemas/*mrc*` | MRC flow in `/frontend/cotizar/` (Datos + Detalle del plan) |
| `backend/src/calculators/incendio*`, `*incendio*` | Incendio flow |
| `backend/src/templates/*carta-oferta*` | The PDF output for that ramo's Carta Oferta |
| `frontend/shared/*` (api.js, sidebar, etc.) | Smoke-test every ramo's sidebar nav + one fetch call, since shared code has cross-ramo blast radius |
| `frontend/admin/*` | `/frontend/admin/` only |
| Anything under `backend/migrations/` | Re-run whichever ramo flow reads the changed tables — migrations don't show up in a frontend diff but can silently break a calculator |

If the diff spans more than one ramo or touches `frontend/shared/`,
widen to a full pass across all ramos rather than guessing which one
broke. When in doubt, test more, not less — this table is for skipping
unrelated ramos, not for skipping the one you're actually changing.

## 4. Don't report done without evidence

Before saying the change works: take a screenshot of the actual
resulting state (the filled form, the `Detalle del plan` tab, or the
generated PDF page) — not just "no console errors" or "the API
returned 200". A broken `<img>` or a silently-empty coverage list won't
throw, so the only way to catch it is to look at the rendered page. If
you fixed something, capture before/after so the diff is visible, not
just claimed.

## 5. Drive it (Playwright — no `chromium-cli` in this environment)

No system-wide `chromium-cli`. Install Playwright once per session in
a scratch dir (don't add it to the repo's `package.json` — it's not a
project dependency):

```bash
mkdir -p /tmp/pw-check && cd /tmp/pw-check
npm init -y >/dev/null 2>&1
npm install playwright --no-save
npx playwright install chromium   # ~110MB, only needed once per machine
```

Then a Node script against `http://localhost:5000/frontend/cotizar/`. Key
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