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
  Caddy como reverse proxy TLS (`Caddyfile`, dominio `api.cotizador.lat`). Redeploy manual (`git
  pull` + `docker compose up --build`) — sin pipeline de CD. `render.yaml` queda como alternativa
  no activa.
- **Frontend:** Vercel, auto-deploy al pushear a `main` (integración nativa de Vercel con GitHub,
  configurada en `frontend/vercel.json`).
- Consecuencia arquitectónica: como ambos lados no se despliegan juntos automáticamente, un cambio
  de contrato de API (parámetro nuevo obligatorio, endpoint removido) puede dejar producción rota
  entre el momento en que el frontend se auto-despliega y el momento en que alguien redespliega el
  backend a mano — coordinar manualmente al mergear cambios de API a `main`.
