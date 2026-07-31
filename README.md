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

## Ramos — estado actual (2026-07-31)

| Rama                             | Estado                                       | Detalles                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Multirriesgo Comercio** (MRC)  | 🟢 **Producción**                            | Plan Normal cotiza end-to-end con Carta Oferta en PDF. Coberturas adicionales repetibles (incluidos sublímites: murallas, granizo, agua, equipos electrónicos), limitadas a 1 repetición por código (`robo_contenido` hasta 2, excepción de negocio). Carta Oferta ajustada a tamaño Oficio real. `/frontend/cotizar` ya está rediseñado (Diseño 2) con stepper, panel en vivo y vista Detalle del plan reorganizada. RPF confirmado para plan Normal; `COMERCIO PROTECCION TOTAL` sigue desactivado (sin RPF). Plan **"MULTIRRIESGO COMERCIO - SEGUCOOP"** con descuento comercial fijo del 10% (editable solo por roles con el permiso `puede_editar_descuento_plan`). |
| **Incendio**                     | 🟢 **Producción**                            | 4 planes (Hipotecario, con/sin Inspección, Maquinaria Básico) cotizan end-to-end con Carta Oferta en PDF (texto legal por plan). Moneda USD/Gs. por cotización con tipo de cambio y fallback, umbral de inspección. Tasas por rubro de actividad (~209 rubros para Incendio) con pertenencia rubro↔ramo vía tabla `rubro_actividad_ramo` (migraciones 043/044 ya aplicadas contra Supabase real). RPF confirmado (plano: Contado 0%, Cobrador 1.6%, Boca 1.35%, Tarjeta 1%).                                                                                                                                                                                             |
| **Vida y Accidentes Personales** | 🟡 **Calculador listo / template pendiente** | Catálogo completo (7 planes, 11 coberturas, 44 filas de tarifación por edad) y calculador `vida-ap.js` completos y testeados. RPF confirmado (igual a Incendio). Falta el template de Carta Oferta (pendiente texto oficial de Kevin).                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Auto individual                  | ⏸ Pausado                                    | Schema y calculador completos (Fase 1). Pausado por prioridad del cliente — se retoma si se pide.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Auto Flota                       | ⏸ Pausado                                    | Planificado en Fase 2. Depende de retomar Auto individual.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Multirriesgo Hogar               | ⚪ Futuro                                    | Planificado.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Todo Riesgo Operativo (TRO)      | ⚪ Futuro                                    | Planificado.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Transporte de Mercadería         | ⚪ Futuro                                    | Planificado.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## Documentación

Antes de tocar código, leé en este orden:

1. **[`CLAUDE.md`](CLAUDE.md)** — contexto operativo, metodología por fases (7 fases ordenadas), convenciones de código, reglas de negocio clave. **Lectura obligatoria al empezar una sesión.**
2. **[`docs/PLAN_DESARROLLO.md`](docs/PLAN_DESARROLLO.md)** — arquitectura completa, schema SQL, motor de cálculo por ramo (fórmulas de prima/RPF/IVA/plan de pago), decisiones de diseño.
3. **[`docs/ESTADO_PROYECTO.md`](docs/ESTADO_PROYECTO.md)** — **Documento de traspaso**: qué está implementado hoy (sección por sección), decisiones tomadas y por qué, pendientes abiertos, historial de cambios.

**Nota:** `docs/ESTADO_PROYECTO.md` es el documento de traspaso más detallado, pero `CLAUDE.md` y `PLAN_DESARROLLO.md` también se mantienen sincronizados cuando cambia el estado real del proyecto.

## Características principales

### Cotizador (`/frontend/cotizar`)

- Pantalla de bienvenida post-login (`/frontend/bienvenida`) para elegir acción y ramo antes de entrar al cotizador.
- Selección de ramo (MRC/Incendio/Vida-AP funcionales; Auto pausado; Hogar próximamente).
- Plan y coberturas: coberturas fijas + adicionales repetibles (mismo código, distinta suma asegurada).
- Cálculo en vivo de prima, RPF, IVA y plan de pago (Contado 0% / Cobrador 1.6% / Boca de Cobranza 1.35% / Tarjeta 1%).
- Descuentos y recargos manuales (tope por plan + tope individual por usuario, gana el más restrictivo).
- **Carta Oferta en PDF** (MRC e Incendio operativos; Vida-AP pendiente de template).
- MRC: premium experience (3 coberturas mín., responsabilidad máxima asegurable, Prima Técnica Mínima silenciosa).
- UI visual ya migrada a **Diseño 2**: app shell nuevo, panel "Cotización en vivo" rediseñado, Detalle del plan en layout de 2 columnas/card fija, exclusiones visibles desde Datos.

### Panel Admin (`/frontend/admin`)

- **Autenticación JWT** independiente, tokens auto-renovables.
- **Roles configurables** (`admin` y `agente` del sistema + custom roles):
  - Crear/editar roles con 5 permisos: `puede_gestionar_usuarios`, `puede_editar_coberturas`, `puede_editar_planes`, `puede_editar_tasas`, `puede_editar_descuento_plan` (permite editar el descuento en planes con descuento fijo, ej. MRC SEGUCOOP).
  - Usuarios se asignan a un rol (no booleanos sueltos).
  - Roles `admin`/`agente` del sistema no se pueden renombrar (inmutables).
- **Secciones** (visibles solo si usuario tiene permiso):
  - **Usuarios:** CRUD, resetear password, desactivar, eliminar si no tiene relaciones, tope de descuento/recargo individual.
  - **Coberturas por plan:** `plan_coberturas` (incluida por defecto, monto).
  - **Tasas:** fijas por cobertura (`tasas_cobertura_ramo`) + por Tipo de Riesgo (`rubros_actividad.tasa_edificio`/`tasa_contenido`, MRC/Incendio).
  - **Planes:** Prima Técnica Mínima, topología, responsabilidad máxima cotizable, eliminar plan (409 si tiene cotizaciones asociadas — desactivarlo en vez de borrarlo).
  - **Roles:** CRUD (custom roles solo; `admin`/`agente` protegidos).
  - **Ramos:** habilitar/deshabilitar, editar nombre y eliminar (409 si tiene planes o cotizaciones asociadas) ramos del sidebar de `/cotizar` (gateado por rol `admin` literal, no permiso delegable). Sidebar ampliado de 5 a 8 ramos (suma Auto Flota, TRO y Transporte, sin calculador propio todavía — mismo placeholder que Auto/Hogar).
- Tope de descuento/recargo: `MIN(tope_plan, tope_usuario)` (always el más restrictivo).
- **Guard de seguridad real:** ningún rol no-admin puede editar/desactivar/resetear/eliminar a un usuario admin, aunque tenga permisos sobre usuarios.
- Acceso al panel movido al menú de perfil/topbar; la card de acceso también aparece en bienvenida solo si el usuario tiene permiso real.

### Historial y búsqueda (Fase 5 implementada)

- Listado de cotizaciones: Número / Cliente / Ramo / Plan / Fecha / Estado / Prima.
- Filtros: ramo, cliente, fecha desde/hasta, estado (predefinido/confirmado/rechazado).
- Paginación automática, listado de 25 cotizaciones por página.
- Detalle de cotización: acceso completo a datos, coberturas, plan de pago.
- Descarga de Carta Oferta en PDF (disponible si ramo tiene calculador + template; MRC funcional).
- **Permisos:** usuarios no-admin ven solo sus cotizaciones (IDOR cerrado); admin ve todas.
- **Edición:** reabre el cotizador (mismo formulario) con ventana de 30 días desde creación.
- UI pulida: acciones con mejor jerarquía visual, estados con color semántico y botón de PDF protegido contra doble click.

## Estructura

```
/backend        API Express (routes -> controllers -> services -> repositories -> Supabase)
                Calculadores por ramo (Strategy pattern)
                Generador de PDF con Puppeteer

/frontend       Vanilla JS (sin framework, sin build step)
                /bienvenida       Selector post-login (acción + ramo)
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

El estado actual está en `docs/ESTADO_PROYECTO.md` sección 4 (tabla de migraciones, con descripción de qué hace cada una). En resumen:

- **001–010:** Schema base (usuarios, ramos, planes, tarifación, cotizaciones, Auto Flota, KYC, funcs SQL, códigos de tasa).
- **011–016:** Incendio/Vida-AP (coberturas, catálogos, tarifas por edad).
- **017–027:** MRC (texto legal, responsabilidad máxima, rename de coberturas, Carta Oferta).
- **028–031:** Panel Admin (permisos, versioning de tasas, roles configurables).
- **032–040:** Incendio — 3 planes nuevos (Hipotecario, con/sin Inspección), moneda USD/Gs. por cotización, tipo de cambio con fallback, umbral de inspección.
- **041:** Ramos — desactiva `auto`/`hogar` (`activo=false`) para habilitar el toggle de ramos del panel admin sin cambiar el comportamiento visible previo.
- **042:** Cotizaciones — corrige `cotizacion_variantes.numero_variante` de `UNIQUE` global a `UNIQUE (cotizacion_id, numero_variante)`.
- **043–044:** Incendio — tabla `rubro_actividad_ramo` (pertenencia rubro↔ramo) + seed de tasas por rubro de actividad (~184 rubros nuevos, ~209 rubros de Incendio en total).
- **045:** MRC — completa `texto_legal` de la cobertura "Cristales" (estaba `NULL` desde el seed original).
- **046:** Seguridad — activa RLS (default-deny) en las 34 tablas de `public` marcadas CRITICAL por el advisor de Supabase; sin impacto funcional (backend usa `SUPABASE_SERVICE_KEY`, que bypasea RLS).
- **047:** Ramos — desactiva `auto-flota`/`tro`/`transporte` (`activo=false`) al ampliar el sidebar de 5 a 8 ramos, mismo criterio que la 041.
- **048:** MRC — plan "MULTIRRIESGO COMERCIO - SEGUCOOP" con descuento fijo del 10% + permiso de rol `puede_editar_descuento_plan` (renombrada de `046` por colisión de numeración con la migración de RLS al mergear a `main`).

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

- Bienvenida: `http://localhost:5000/frontend/bienvenida/`
- Cotizador: `http://localhost:5000/frontend/cotizar/`
- Panel admin: `http://localhost:5000/frontend/admin/`
- API backend: `http://localhost:3000/api/...`

El puerto `:5000` está hardcodeado en `backend/.env` para CORS — cambiar el puerto del frontend rompe las llamadas a la API.

### Acceder al panel admin

Usuario de prueba habitual: `test@test.com` / `a.123456`.

> Si ese usuario no existe en tu base o fue limpiado, pedile a Kevin el acceso vigente o crealo
> manualmente para ambiente local. No asumir que en todas las bases clonadas existe el mismo seed.

**Permisos del panel admin:**

Cada usuario puede tener una combinación de estos permisos (se asignan en Supabase o desde el mismo panel si tenés `puede_gestionar_usuarios`):

- `puede_editar_tasas` — editar tasas fijas de coberturas y por Tipo de Riesgo.
- `puede_editar_coberturas` — editar qué coberturas vienen por defecto en cada plan.
- `puede_editar_planes` — editar planes (Prima Técnica Mínima, RPF, topología).
- `puede_gestionar_usuarios` — crear/editar otros usuarios y sus permisos.
- `puede_editar_descuento_plan` — editar el descuento en planes con descuento fijo (ej. MRC "SEGUCOOP", 10%); sin este permiso el campo Descuento queda precargado y bloqueado en el valor del plan.

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
- Incendio: implementado (`backend/src/templates/oferta/incendio.js`), texto legal por plan (4 planes).
- Vida-AP: pendiente (necesita texto oficial).

## Despliegue

- **Backend:** Docker Compose (`docker-compose.yml` + `Dockerfile` en `/backend`) con Caddy como
  reverse proxy TLS (`Caddyfile`, dominio `api.cotizador.lat`) en una VPS propia. `render.yaml`
  queda como alternativa de despliegue en Render (no es el destino activo). **El redeploy del
  backend en la VPS es manual** (`git pull` + `docker compose up --build`) — no hay GitHub Action
  ni pipeline de CD para esto.
- **Frontend:** Vercel (`frontend/vercel.json`), con despliegue automático al hacer push a `main`
  vía la integración nativa de Vercel con GitHub.
- **Importante:** como el frontend se despliega automático y el backend no, un cambio que
  modifique el contrato entre ambos (p. ej. un parámetro de query nuevo obligatorio) puede quedar
  roto en producción hasta que alguien redespliegue el backend a mano. Verificar esto después de
  mergear cualquier cambio de API a `main`.

## Estado actual

**Última actualización:** 2026-07-31 — MRC e Incendio operativos end-to-end (calculador + Carta Oferta en PDF); Vida-AP tiene calculador completo pero sigue sin template (falta texto oficial). Incendio suma 3 planes nuevos, moneda USD/Gs. y tasas por rubro de actividad (~209 rubros, migraciones 043/044 ya aplicadas contra Supabase real). MRC suma el plan "SEGUCOOP" con descuento fijo del 10% (permiso de rol dedicado). Panel admin con secciones de Usuarios/Coberturas/Tasas/Planes/Roles/Ramos (esta última para habilitar/deshabilitar, editar nombre y eliminar ramos del sidebar, ahora con 8 ramos) y opción de eliminar planes. RLS activado (default-deny) en las 34 tablas CRITICAL de Supabase. Se removieron los imports de Vercel Analytics/Speed Insights del frontend (rompían con `Uncaught TypeError` fuera del build de Vercel). Backend desplegado en VPS propia (Docker + Caddy, `api.cotizador.lat`, redeploy manual); frontend en Vercel (auto-deploy en `main`).

Ver `docs/ESTADO_PROYECTO.md` para el detalle completo de:

- Qué está implementado sección por sección
- Decisiones tomadas y por qué
- Pendientes abiertos y bloqueantes
- Migraciones SQL aplicadas

La sección "Estado actual del proyecto" en `CLAUDE.md` resume la fase activa, próximos pasos y reglas de negocio.

<!-- test: verificación del gate CI+CodeQL de release-please -->
