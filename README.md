# Cotizador Tajy

Sistema de cotizaciones multi-ramo de Aseguradora Tajy (Auto individual, Auto Flota, Incendio,
Multirriesgo Hogar, MRC, TRO, Transporte de Mercadería, Vida y Accidentes Personales).

Antes de tocar código, leé **`CLAUDE.md`** (contexto operativo y metodología por fases),
**`docs/PLAN_DESARROLLO.md`** (arquitectura completa, schema SQL y motor de cálculo por ramo)
y **`docs/ESTADO_PROYECTO.md`** (qué está implementado hoy, decisiones tomadas y pendientes).

## Estructura

```
/backend      API Express (routes -> controllers -> services -> repositories -> Supabase)
/frontend     Vanilla JS: /cotizar /historial /admin
/docs         Documentación: plan de desarrollo y estado real de avance
```

## Requisitos

- Node.js 20+
- Cuenta de Supabase (proyecto PostgreSQL)

## Instalación

```bash
npm install --workspaces
cp backend/.env.example backend/.env
# completar SUPABASE_URL y SUPABASE_SERVICE_KEY en backend/.env
```

## Migraciones

Las migraciones están en `backend/migrations/*.sql`, numeradas en orden de aplicación.
Correrlas en el SQL Editor de Supabase (o vía CLI de Supabase) en orden ascendente.

## Desarrollo

```bash
npm run dev
```

Levanta el backend en `http://localhost:3000` con recarga automática. El frontend es
estático (Vanilla JS) — abrir los archivos de `/frontend` con un servidor estático local
(ej. `npx serve frontend`) o servirlos directo desde el backend en desarrollo.

## Estado

Ver `docs/ESTADO_PROYECTO.md` para el detalle completo de qué está implementado, decisiones
tomadas y pendientes. La sección "Estado actual del proyecto" en `CLAUDE.md` resume en qué
fase está el desarrollo.
