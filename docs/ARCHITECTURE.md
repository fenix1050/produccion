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

**Todo corre en una única VPS propia** (Docker + Caddy), con dos entornos separados — TEST
(`test-api.cotizador.lat` / `test-web.cotizador.lat`) y PROD (`api.cotizador.lat` / `cotizador.lat`) —
cada uno con su propio backend y su propio frontend estático. **No hay CD automático**:
`.github/workflows/deploy-backend.yml` está deshabilitado (`if: false`) desde 2026-09-01. Mergear a
`main` no despliega nada por sí solo.

- **Backend:** Docker Compose (`docker-compose.yml`, `backend/Dockerfile`) detrás de Caddy como reverse
  proxy TLS (`Caddyfile`). Imágenes inmutables versionadas por SHA-256 (`BACKEND_IMAGE` explícito, sin
  rebuild sobre la marcha). Redeploy **manual**, con autorización explícita en cada paso (bundle →
  preflight de solo lectura → deploy con flag de aprobación → rollback solo tras decisión separada).
  `NODE_ENV=production` está fijado en `docker-compose.yml` (gana sobre `env_file` para esa misma
  clave) para que el `.env` real de la VPS no pueda dejar al proceso corriendo como no-producción sin
  querer.
- **Frontend:** archivos estáticos servidos directamente por Caddy desde la misma VPS (`frontend-prod`
  / `frontend-test`), redeploy también manual. **No Vercel** — `frontend/vercel.json` y `render.yaml`
  son artefactos legacy de una estrategia de deploy anterior (Render.com / Vercel) que precedió a la
  VPS actual; Vercel sigue corriendo como preview deployment en los checks de CI de cada PR, pero esa
  preview no sirve tráfico real de TEST ni de PROD.
- Promover un cambio de TEST a PROD es un paso manual separado, no documentado como workflow de GitHub
  Actions en este repo.

Detalle completo (contenedores exactos, scripts de deploy, guardas de autorización) en `CLAUDE.md`,
sección "Infraestructura de despliegue".
