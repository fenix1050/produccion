# Arquitectura

## Objetivo

Este sistema sigue una arquitectura por capas con separación estricta de responsabilidades.

Frontend
↓

Express Router

↓

Controller

↓

Service

↓

Repository

↓

Supabase

---

# Responsabilidades

## Routes

- únicamente definen endpoints
- no contienen lógica

## Controllers

- reciben Request
- validan parámetros
- llaman a Services
- devuelven Response

## Services

- contienen TODA la lógica de negocio

## Repositories

- acceso exclusivo a Supabase

## Calculators

Cada ramo implementa la interfaz `RamoCalculator` — definición completa y actualizada en `CLAUDE.md` (no se repite acá para evitar desincronización).

---

# Flujo de una cotización

Usuario

↓

Frontend

↓

POST /cotizar

↓

Controller

↓

Service

↓

Calculator

↓

Repository

↓

Supabase

↓

PDF

↓

Frontend

---

# Principios

- DRY
- SOLID
- Composition over inheritance
- Zod para todas las validaciones
- Nunca acceder a Supabase desde Controllers
- Nunca acceder al DOM desde lógica de negocio
- Toda lógica compartida debe abstraerse

---

# Despliegue

- **Backend:** VPS propia, Docker Compose (`docker-compose.yml`, `backend/Dockerfile`) detrás de
  Caddy como reverse proxy TLS (`Caddyfile`, dominio `api.cotizador.lat`). Redeploy automático vía
  CD (`.github/workflows/deploy-backend.yml`): al terminar CI en verde sobre `main`, un workflow
  separado se conecta por SSH y corre `git reset --hard origin/main` +
  `docker compose up --build -d backend`, con health check contra `/health`. Si el health check
  falla, el workflow hace rollback automático (`git reset --hard` al SHA anterior + rebuild) y
  vuelve a verificar `/health` antes de reportar el deploy como fallido. `render.yaml` queda
  como alternativa no activa. `NODE_ENV=production` está fijado en `docker-compose.yml` (gana
  sobre `env_file` para esa misma clave) para que el `.env` real de la VPS no pueda dejar al
  proceso corriendo como no-producción sin querer.
- **Frontend:** Vercel, auto-deploy al pushear a `main` (integración nativa de Vercel con GitHub,
  configurada en `frontend/vercel.json`).
