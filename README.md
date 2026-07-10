# Cotizador Tajy

Sistema web de cotización de pólizas para **Aseguradora Tajy** (Paraguay): genera Carta Oferta al
cotizar y Propuesta Formal (con KYC/PLA-FT) cuando el cliente acepta, con historial correlativo
por ramo.

![Node](https://img.shields.io/badge/node-20%2B-339933?logo=node.js&logoColor=white)
![Backend](https://img.shields.io/badge/backend-Express-000000?logo=express&logoColor=white)
![DB](https://img.shields.io/badge/database-Supabase%20%2F%20PostgreSQL-3ECF8E?logo=supabase&logoColor=white)
![Frontend](https://img.shields.io/badge/frontend-Vanilla%20JS-F7DF1E?logo=javascript&logoColor=black)

> Desarrollo por fases — ver el estado real de avance en [`docs/ESTADO_PROYECTO.md`](docs/ESTADO_PROYECTO.md).

## Ramos cubiertos

| Ramo | Estado |
|---|---|
| Multirriesgo Comercio (MRC) | 🟡 En desarrollo (fase activa) |
| Incendio | 🟡 En desarrollo (fase activa) |
| Vida y Accidentes Personales | 🟡 En desarrollo (fase activa) |
| Auto individual | ⏸ Pausado (schema listo, fase futura) |
| Auto Flota | ⏸ Pausado (fase futura) |
| Multirriesgo Hogar | ⚪ Planificado |
| Todo Riesgo Operativo (TRO) | ⚪ Planificado |
| Transporte de Mercadería | ⚪ Planificado |

## Documentación

Antes de tocar código, leé en este orden:

1. **[`CLAUDE.md`](CLAUDE.md)** — contexto operativo, metodología por fases y estado actual.
2. **[`docs/PLAN_DESARROLLO.md`](docs/PLAN_DESARROLLO.md)** — arquitectura completa, schema SQL y motor de cálculo por ramo.
3. **[`docs/ESTADO_PROYECTO.md`](docs/ESTADO_PROYECTO.md)** — qué está implementado hoy, decisiones tomadas y por qué, pendientes abiertos.

## Estructura

```
/backend        API Express (routes -> controllers -> services -> repositories -> Supabase)
/frontend       Vanilla JS: /cotizar /historial /admin
/docs           Documentación: plan de desarrollo y estado real de avance
/docs/insumos   Manuales de suscripción, propuestas reales y planillas de tasas (referencia)
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
