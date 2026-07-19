# Cotizador Tajy

Sistema web de cotización de pólizas para **Aseguradora Tajy** (Paraguay): Genera Carta Oferta en PDF al
cotizar y permite crear Propuesta Formal (con KYC/PLA-FT) cuando el cliente acepta, con historial
correlativo y numeración progresiva por rama.

![Node](https://img.shields.io/badge/node-20%2B-339933?logo=node.js&logoColor=white)
![Backend](https://img.shields.io/badge/backend-Express-000000?logo=express&logoColor=white)
![DB](https://img.shields.io/badge/database-Supabase%20%2F%20PostgreSQL-3ECF8E?logo=supabase&logoColor=white)
![Frontend](https://img.shields.io/badge/frontend-Vanilla%20JS-F7DF1E?logo=javascript&logoColor=black)
![Estado](https://img.shields.io/badge/estado-Fase%206%2F7-blue)

> Desarrollo por fases — ver el estado real de avance, decisiones tomadas y pendientes en
> [`docs/ESTADO_PROYECTO.md`](docs/ESTADO_PROYECTO.md).

## Ramos — estado actual (2026-07-19)

| Rama | Estado | Detalles |
|---|---|---|
| **Multirriesgo Comercio** (MRC) | 🟢 **Producción** | Plan Normal cotiza end-to-end con Carta Oferta en PDF. Coberturas adicionales repetibles (incluidos sublímites: murallas, granizo, agua, equipos electrónicos). Editor de tasas por Tipo de Riesgo desde panel admin. RPF confirmado para plan Normal; falta RPF de "Comercio Protección Total" (desactivado hasta confirmar). |
| **Incendio** | 🟡 **Listo para cotizar** | Catálogo completo (2 planes, 5 coberturas). RPF confirmado (plano: Contado 0%, Cobrador 1.6%, Boca 1.35%, Tarjeta 1%). Falta calculador `incendio.js` y template de PDF. |
| **Vida y Accidentes Personales** | 🟡 **Listo para cotizar** | Catálogo completo (7 planes, 11 coberturas, 44 filas de tarifación por edad). RPF confirmado (igual a Incendio). Falta calculador `vida-ap.js` y template de PDF. |
| Auto individual | ⏸ Pausado | Schema y calculador completos (Fase 1). Pausado por prioridad del cliente — se retoma si se pide. |
| Auto Flota | ⏸ Pausado | Planificado en Fase 2. Depende de retomar Auto individual. |
| Multirriesgo Hogar | ⚪ Futuro | Planificado. |
| Todo Riesgo Operativo (TRO) | ⚪ Futuro | Planificado. |
| Transporte de Mercadería | ⚪ Futuro | Planificado. |

## Documentación

Antes de tocar código, leé en este orden:

1. **[`CLAUDE.md`](CLAUDE.md)** — contexto operativo, metodología por fases (7 fases ordenadas), convenciones de código, reglas de negocio clave. **Lectura obligatoria al empezar una sesión.**
2. **[`docs/PLAN_DESARROLLO.md`](docs/PLAN_DESARROLLO.md)** — arquitectura completa, schema SQL, motor de cálculo por ramo (fórmulas de prima/RPF/IVA/plan de pago), decisiones de diseño.
3. **[`docs/ESTADO_PROYECTO.md`](docs/ESTADO_PROYECTO.md)** — **Documento de traspaso**: qué está implementado hoy (sección por sección), decisiones tomadas y por qué, pendientes abiertos, historial de cambios.

**Nota:** `docs/ESTADO_PROYECTO.md` es el único documento que se actualiza con cada cambio importante — los otros dos (`CLAUDE.md`, `PLAN_DESARROLLO.md`) son referencias estables de arquitectura y reglas.

## Características principales

### Cotizador (`/frontend/cotizar`)
- Selección de ramo, plan y coberturas.
- Cálculo en vivo de prima, RPF, IVA y plan de pago (Contado / Cobrador / Boca de Cobranza / Tarjeta).
- Descuentos y recargos manuales (tope por plan y por usuario).
- Generación de **Carta Oferta en PDF** (MRC implementada; Incendio/Vida-AP pendientes de template).
- Coberturas adicionales repetibles en MRC (permite agregar la misma cobertura con distinta suma asegurada).

### Panel Admin (`/frontend/admin`)
- **Autenticación JWT** independiente por usuario.
- **Usuarios:** crear, editar, resetear password, desactivar.
- **Permisos por sección** (no todo-o-nada):
  - Editar coberturas por plan (`plan_coberturas`: incluida por defecto, monto).
  - Editar tasas fijas por cobertura (`tasas_cobertura_ramo`).
  - Editar tasas por Tipo de Riesgo (`rubros_actividad.tasa_edificio`, `tasa_contenido`) — MRC/Incendio.
  - Gestionar usuarios (crear/editar permisos de otros usuarios).
- Cada usuario admin puede tener un tope propio de descuento/recargo más restrictivo que el plan.

### Historial y búsqueda (Fase 5 futura)
- Listado de cotizaciones con numeración correlativa.
- Búsqueda por cliente, número, ramo, fecha.

## Estructura

```
/backend        API Express (routes -> controllers -> services -> repositories -> Supabase)
                Calculadores por ramo (Strategy pattern)
                Generador de PDF con Puppeteer

/frontend       Vanilla JS (sin framework, sin build step)
                /cotizar           Flujo de cotización
                /admin             Panel admin con JWT + permisos granulares
                /historial         Listado y búsqueda (Fase 5)
                /shared            Componentes y utilidades comunes

/docs           PLAN_DESARROLLO.md — arquitectura y reglas
                ESTADO_PROYECTO.md — traspaso de qué está hecho y decisiones
                
/docs/insumos   Manuales de suscripción, propuestas reales y planillas de tasas
                (excluido del repo por .gitignore — contiene datos reales de clientes)
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

## Migraciones y base de datos

### Aplicar migraciones

Las migraciones están en `backend/migrations/*.sql`, numeradas en orden de aplicación.

**En Supabase (producción o proyecto real):**

1. Abrí el SQL Editor en https://app.supabase.com → tu proyecto.
2. Copiá el contenido de cada archivo `.sql` (en orden) y correlo.

**Localmente (Supabase CLI):**

```bash
cd backend
supabase migration up
```

El estado actual está en `docs/ESTADO_PROYECTO.md` sección 4 (tabla de migraciones 001 a 030, con descripción de qué hace cada una).

### Reset de Supabase local

Si necesitás empezar de cero:

```bash
supabase db reset
```

Esto corre todas las migraciones en orden contra tu proyecto local.

## Desarrollo local

### Requisitos previos

- Node.js 20+
- Supabase CLI (opcional, para migraciones locales)
- `.env` del backend con `SUPABASE_URL` y `SUPABASE_SERVICE_KEY` (**no versionado** — pedir a Kevin)

### Levantarse rápido

**Opción 1: Script automatizado (Windows, PowerShell)**

```powershell
.\scripts\dev.ps1
```

Levanta backend y frontend cada uno en su ventana, con recarga automática.

**Opción 2: Manual (macOS/Linux/Windows)**

Terminal 1 — backend en `:3000` con hot reload:

```bash
cd backend && npm run dev
```

Terminal 2 — frontend estático en `:5000` (desde la **raíz del repo**, no desde `/frontend`):

```bash
npx serve -l 5000 .
```

> El frontend **debe servirse desde la raíz** porque las rutas de imágenes (`logo/`) son relativas.
> Si lo servís desde `/frontend`, las imágenes se rompen silenciosamente.

### URLs locales

- Cotizador: `http://localhost:5000/frontend/cotizar/`
- Panel admin: `http://localhost:5000/frontend/admin/`
- API backend: `http://localhost:3000/api/...`

El puerto `:5000` está hardcodeado en `backend/.env` para CORS — cambiar el puerto del frontend rompe las llamadas a la API.

### Acceder al panel admin

Usuario de prueba: `test` / `password` (crear manualmente en Supabase `usuarios` si no existe).

**Permisos del panel admin:**

Cada usuario puede tener una combinación de estos permisos (se asignan en Supabase o desde el mismo panel si tenés `puede_gestionar_usuarios`):

- `puede_editar_tasas` — editar tasas fijas de coberturas y por Tipo de Riesgo.
- `puede_editar_coberturas` — editar qué coberturas vienen por defecto en cada plan.
- `puede_editar_planes` — editar planes (Prima Técnica Mínima, RPF, topología).
- `puede_gestionar_usuarios` — crear/editar otros usuarios y sus permisos.

Todos ellos pueden además establecer su propio tope de descuento/recargo más restrictivo que el del plan.

## Arquitectura y convenciones

### Backend — capas limpias

La API Express sigue el patrón de capas: **routes → controllers → services → repositories**

```
routes/cotizaciones.js          Define endpoints (GET, POST)
  ↓
controllers/cotizaciones.js     Recibe request, llama services, devuelve response
  ↓
services/cotizacion.service.js  Lógica de negocio: cálculo, validación, persistencia
  ↓
repositories/cotizaciones.repo.js  Acceso a Supabase (queries SQL)
```

**Regla no negociable:** El frontend **nunca** habla directo con Supabase. Todo pasa por esta API, que valida con Zod antes de tocar la base.

### Motor de cotización — Strategy pattern

Cada ramo implementa la misma interfaz en `/backend/src/calculators/{ramo}.js`:

```js
class RamoCalculator {
  calcularPrima(riesgo_datos) {
    // Lógica específica del ramo → { prima, detalle }
  }
  
  calcularPlanPago(prima, formaPago, cuotas) {
    // Común a todos: { rpf, iva, premio, inicial, cuota }
  }
}
```

Sumar un ramo nuevo = implementar esta interfaz, sin tocar Auto.

### Validación — Zod por ramo

Cada ramo tiene su schema en `/backend/src/schemas/{ramo}.schema.js`:

```js
export const cotizar{Ramo}Schema = z.object({
  riesgo_datos: z.object({
    /* campos específicos del ramo */
  }),
  // ... más campos comunes
});
```

La API valida **toda** entrada antes de usarla — si falla, devuelve 422 con detalles.

### Frontend — Vanilla JS, sin framework

- Sin transpilación, sin bundler — `<script>` directo en HTML.
- Estructura por página: `/frontend/{pagina}/index.html` + `.js`/`.css` colocalizados.
- Fetch wrapper en `/frontend/shared/api.js` para reutilizar (headers, auth token, etc.).
- Estado local en `localStorage` (usuario logueado) + en memoria si hace falta.

### Generación de PDF

**Backend:** `/backend/src/services/pdf.service.js` + templates en `/backend/src/templates/oferta/`

Usa Puppeteer (Chromium headless) para convertir HTML → PDF. Cada ramo puede tener su template.

- MRC: implementado (`backend/src/templates/oferta/mrc.js`).
- Incendio/Vida-AP: pendientes (necesitan su template + texto oficial).

## Estado actual

**Última actualización:** 2026-07-19

Ver `docs/ESTADO_PROYECTO.md` para el detalle completo de:
- Qué está implementado (sección por sección)
- Decisiones tomadas y por qué
- Pendientes abiertos
- Historial de cambios y bugs corregidos

La sección "Estado actual del proyecto" en `CLAUDE.md` resume qué fase es la activa y cuál es el próximo paso.
