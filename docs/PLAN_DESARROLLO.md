# PLAN DE DESARROLLO — Sistema de Cotizaciones Aseguradora Tajy

## 1. Visión general

Sistema web independiente para que los agentes de Aseguradora Tajy generen cotizaciones formales de cualquier ramo (Auto, AP, Riesgo Comercio, Incendio, y los que se sumen a futuro), con:

- Cálculo automático de prima y plan de pago a partir de tablas de tasas cargadas por Excel.
- Selección de plan base + agregado/quitado de coberturas y servicios adicionales (tildables).
- Numeración correlativa e historial de cotizaciones.
- Generación de una **propuesta formal en PDF**, con el detalle cotizado, el texto legal de cada cobertura, exclusiones y franquicias — lista para enviar al cliente.

El diseño parte de la lógica ya usada hoy por Tajy para Auto (tasa por capital/plan + RPF por forma de pago/cuotas + IVA), pero generaliza el modelo para que sumar un ramo nuevo sea configuración, no reescritura.

---

## 2. Alcance funcional

| Área | Detalle |
|---|---|
| Ramos | Auto (individual + flota), Incendio, Multirriesgo Hogar, MRC, TRO, Transporte de Mercadería, Vida y Accidentes Personales. Caución queda fuera (proceso de análisis crediticio, no cotizador) |
| Planes | Fijos por ramo (ej: Auto → Premium/Superior/Fuerte/Noble + variantes; Hogar → Integral/Ampliada/Premium/Mi Hogar), con coberturas predefinidas |
| Coberturas | Catálogo reutilizable, cada una con monto, texto descriptivo, exclusiones y franquicia. Incluidas por defecto en el plan o agregables/quitables por cotización |
| Tarifación | Auto: capital × tasa con piso de prima mínima. Incendio/Hogar/MRC/TRO: tasa ‰ dentro de un rango, editable solo por roles autorizados. Transporte: tasa % por nivel de cobertura. Vida y AP: tasa ‰ por franja etaria |
| Plan de pago | **Contado** / **Crédito (Cobrador)** / **Boca de Cobranza** / **Tarjeta de Crédito**, con RPF escalonado por cuotas — motor unificado en todos los ramos. Fórmula de cuotas: cada pago = REDONDEAR.SUP(Premio/12, 1000) |
| Roles | Agente (cotiza con tasas ya configuradas), Admin/roles autorizados (puede editar tasas dentro del rango permitido) |
| Salida | Vista web + PDF tipo **carta oferta enriquecida** (coberturas, exclusiones y franquicias incluidas) — no el documento formal de solicitud con KYC/firmas |
| Persistencia | Historial completo, numeración correlativa, búsqueda por cliente/número/fecha/ramo |
| Administración | Carga y actualización de tasas vía Excel, gestión de catálogo de coberturas y planes |

---

## 3. Arquitectura general

```
┌─────────────────────────────┐
│   Frontend (Vanilla JS)     │
│  Netlify — SPA por hash     │
│  /cotizar  /historial  /admin│
└──────────────┬───────────────┘
               │ HTTPS (fetch)
               ▼
┌─────────────────────────────┐
│   Backend API (Express)      │
│  Railway / Render            │
│                               │
│  routes → controllers →      │
│  services → repositories     │
│                               │
│  ┌─────────────────────────┐ │
│  │ Motor de Cotización     │ │
│  │ (Strategy por ramo)     │ │
│  │  - calculators/auto.js  │ │
│  │  - calculators/ap.js    │ │
│  │  - calculators/incendio │ │
│  │  - calculators/comercio │ │
│  └─────────────────────────┘ │
│                               │
│  ┌─────────────────────────┐ │
│  │ Generador de PDF          │
│  │ (Puppeteer + plantillas   │
│  │  HTML por ramo)           │
│  └─────────────────────────┘ │
└──────────────┬───────────────┘
               │
               ▼
┌─────────────────────────────┐
│   Supabase (PostgreSQL)      │
│  Toda la comunicación pasa    │
│  por la API, nunca directo    │
│  desde el frontend            │
└───────────────────────────────┘
```

**Principio clave (igual que en gestion-tajy):** el frontend nunca habla directo con Supabase. Todo pasa por la API Express, que valida con Zod antes de tocar la base.

**Motor de cotización como Strategy pattern:** cada ramo implementa la misma interfaz (`calcular(input) → { prima, rpf, iva, premio, planPago }`), pero con su propia lógica interna. Esto permite sumar un ramo nuevo sin tocar el motor de Auto ya probado.

```js
// interfaz común
interface RamoCalculator {
  calcularPrima(input): { prima: number, detalle: object }
  calcularPlanPago(prima, formaPago, cuotas): { rpf, iva, premio, inicial, cuota }
}
```

---

## 4. Modelo de datos (Supabase / PostgreSQL)

```sql
-- ============ USUARIOS Y PERMISOS ============

CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  email VARCHAR(150) UNIQUE,
  rol VARCHAR(30) NOT NULL DEFAULT 'agente',   -- 'agente' | 'admin' | (otros roles a futuro)
  puede_editar_tasas BOOLEAN DEFAULT FALSE,     -- solo true para admin y roles autorizados
  activo BOOLEAN DEFAULT TRUE
);

-- Límite de descuento que cada rol/cargo puede aplicar (del manual: Gerencia General 20%,
-- Analistas 0%, etc.) — valida en el backend antes de guardar un descuento en cotizacion_ajustes
CREATE TABLE descuento_limites_por_cargo (
  id SERIAL PRIMARY KEY,
  cargo VARCHAR(60) NOT NULL,          -- 'Gerencia General', 'Analistas', 'Supervisores'...
  descuento_global_max NUMERIC(6,3),
  descuento_especial_max NUMERIC(6,3),
  descuento_flota_max NUMERIC(6,3)
);

-- ============ CATÁLOGO BASE ============

CREATE TABLE ramos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,        -- 'auto', 'ap', 'incendio', 'comercio'
  nombre_display VARCHAR(100) NOT NULL,       -- 'Automóviles', 'Accidentes Personales'
  activo BOOLEAN DEFAULT TRUE,
  calculador VARCHAR(50) NOT NULL             -- referencia al módulo calculators/<x>.js
);

CREATE TABLE planes (
  id SERIAL PRIMARY KEY,
  ramo_id INT NOT NULL REFERENCES ramos(id),
  nombre VARCHAR(100) NOT NULL,               -- 'PLAN TAJY PREMIUM'
  prima_tecnica_minima NUMERIC(14,2),         -- valor tal cual lo usa el cotizador real (piso de la Prima)
  cotizacion_combinada BOOLEAN DEFAULT FALSE, -- si Sí, permite generar variante SIN/CON franquicia (además de la vía de importación)
  tipo_franquicia VARCHAR(30),                -- 'monto_fijo_por_siniestro' | otros a definir
  franquicia_porcentaje NUMERIC(6,3),         -- ej. 12% para Premium/Superior/Fuerte
  descuento_default NUMERIC(6,3),             -- ej. 20%
  descuento_maximo NUMERIC(6,3),              -- varía por plan (Premium/Superior 20%, Fuerte 55%)
  recargo_maximo NUMERIC(6,3),                -- ej. 100%
  cobertura_referencia_id INT,                -- FK a coberturas_catalogo: qué cobertura define el "Capital" para la tasa (varía por plan)
  cuotas_default INT DEFAULT 11,
  cuotas_maximo INT DEFAULT 11,
  puede_modificar_cuotas BOOLEAN DEFAULT TRUE,
  activo BOOLEAN DEFAULT TRUE
);

-- Tasa RPF FIJA por forma de pago (NO varía por cantidad de cuotas — corrección confirmada
-- contra la pantalla real del cotizador; puede variar de un plan a otro aunque hoy es igual en todos)
CREATE TABLE plan_formas_pago (
  id SERIAL PRIMARY KEY,
  plan_id INT NOT NULL REFERENCES planes(id),
  forma_pago_id INT NOT NULL REFERENCES formas_pago(id),
  tasa_rpf NUMERIC(10,6) NOT NULL,            -- ej. Cobrador=1.6, Boca de Cobranza=1.35, Tarjeta=1, Contado=0
  habilitada BOOLEAN DEFAULT TRUE,
  UNIQUE(plan_id, forma_pago_id)
);

-- ============ COBERTURAS (reutilizable en todos los ramos) ============

CREATE TABLE coberturas_catalogo (
  id SERIAL PRIMARY KEY,
  ramo_id INT NOT NULL REFERENCES ramos(id),
  codigo VARCHAR(50) NOT NULL,                -- 'robo_hurto', 'granizo', 'gastos_medicos'
  nombre VARCHAR(150) NOT NULL,               -- 'Pérdida total por robo/hurto'
  categoria VARCHAR(50),                      -- 'A mi vehículo' / 'A los demás' / 'Especiales'
  texto_legal TEXT,                           -- descripción completa para el PDF
  texto_exclusiones TEXT,
  monto_default NUMERIC(14,2),
  franquicia_default NUMERIC(14,2),
  es_opcional BOOLEAN DEFAULT FALSE,          -- si se puede agregar/quitar por cotización
  permite_como_sublimite BOOLEAN DEFAULT FALSE, -- si esta cobertura puede cotizarse como sublímite de otra (ej. Robo, Cristales, Granizo dentro de Incendio Edificio) en vez de como línea propia
  activo BOOLEAN DEFAULT TRUE
);

CREATE TABLE plan_coberturas (
  id SERIAL PRIMARY KEY,
  plan_id INT NOT NULL REFERENCES planes(id),
  cobertura_id INT NOT NULL REFERENCES coberturas_catalogo(id),
  incluida_por_defecto BOOLEAN DEFAULT TRUE,
  monto NUMERIC(14,2),                        -- override del monto_default si aplica
  franquicia NUMERIC(14,2),
  UNIQUE(plan_id, cobertura_id)
);

-- ============ TARIFACIÓN ============

-- Auto: tasa por rango de capital y plan (estructura ya definida)
CREATE TABLE tasas_capital (
  id SERIAL PRIMARY KEY,
  plan_id INT NOT NULL REFERENCES planes(id),
  capital_min NUMERIC(14,2) NOT NULL,
  capital_max NUMERIC(14,2) NOT NULL,
  tasa_porcentaje NUMERIC(10,6) NOT NULL,
  vigente_desde DATE DEFAULT CURRENT_DATE
);

-- Rubros de actividad (usado por Incendio simple y para clasificar Grupo A/B → MRC o TRO)
CREATE TABLE rubros_actividad (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,          -- 'BAZAR', 'FARMACIA', 'DEPOSITO', 'NEGOCIO - VIVIENDA'...
  categoria VARCHAR(20),                 -- 'CATEGORIA A' .. 'CATEGORIA I'
  grupo VARCHAR(10),                     -- 'MRC' (Grupo A) o 'TRO' (Grupo B), null para riesgos de vivienda pura
  tasa_edificio NUMERIC(10,6),           -- ‰ — usado por Incendio simple
  tasa_contenido NUMERIC(10,6)           -- ‰ — usado por Incendio simple
);

-- Tasa fija por línea de cobertura, propia de cada ramo de "Otros Riesgos".
-- MRC y TRO usan la MISMA estructura de líneas de cobertura pero con tasas distintas
-- (no varían por rubro dentro del ramo, solo el rubro decide si el negocio es MRC o TRO).
CREATE TABLE tasas_cobertura_ramo (
  id SERIAL PRIMARY KEY,
  ramo_id INT NOT NULL REFERENCES ramos(id),         -- incendio / mrc / tro / transporte
  cobertura_id INT NOT NULL REFERENCES coberturas_catalogo(id),
  tasa_valor NUMERIC(10,6) NOT NULL,
  unidad VARCHAR(15) NOT NULL DEFAULT 'permil',       -- 'permil' (Incendio/MRC/TRO) o 'porcentaje' (Transporte)
  vigente_desde DATE DEFAULT CURRENT_DATE
);

-- Tabla genérica de reserva para ramos futuros que no encajen en el patrón anterior (ej: AP).
CREATE TABLE tarifas_generico (
  id SERIAL PRIMARY KEY,
  ramo_id INT NOT NULL REFERENCES ramos(id),
  plan_id INT REFERENCES planes(id),
  variables JSONB NOT NULL,     -- ej: {"suma_min": 0, "suma_max": 5000000, "tasa": 0.012}
  vigente_desde DATE DEFAULT CURRENT_DATE
);

CREATE TABLE formas_pago (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(30) NOT NULL UNIQUE,   -- 'contado', 'cobrador', 'boca_cobranza', 'tarjeta_credito'
  nombre_display VARCHAR(50) NOT NULL,  -- 'Contado', 'Crédito (Cobrador)', 'Boca de Cobranza', 'Tarjeta de Crédito'
  tiene_rpf BOOLEAN DEFAULT TRUE        -- false para 'contado'
);

-- (La tasa RPF real vive en plan_formas_pago — fija por plan y forma de pago,
-- NO escalonada por cantidad de cuotas. Ver corrección en sección 5.)

-- ============ COTIZACIONES ============

CREATE TABLE correlativos (
  ramo_id INT PRIMARY KEY REFERENCES ramos(id),
  ultimo_numero INT NOT NULL DEFAULT 0
);

CREATE TABLE cotizaciones (
  id SERIAL PRIMARY KEY,
  numero_cotizacion VARCHAR(20) NOT NULL UNIQUE,  -- ej: 'AUTO-000123'
  ramo_id INT NOT NULL REFERENCES ramos(id),
  plan_id INT NOT NULL REFERENCES planes(id),
  agente_id INT NOT NULL,                          -- FK a usuarios/agentes
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  vigencia_dias INT DEFAULT 30,

  cliente_nombre VARCHAR(150),
  cliente_contacto VARCHAR(100),

  riesgo_datos JSONB NOT NULL,   -- flexible por ramo: vehículo, dirección, actividad comercial, etc.
  capital_asegurado NUMERIC(14,2),

  estado VARCHAR(20) DEFAULT 'borrador',  -- borrador / cotizada / aceptada / vencida / convertida
  pdf_carta_oferta_url TEXT,
  pdf_propuesta_formal_url TEXT,           -- se genera recién cuando estado = 'aceptada'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Monto base de franquicia fija para Auto - Importación Directa. Configurable en vez de
-- hardcodeado, porque puede variar según criterios (a definir — hoy solo hay un valor base).
CREATE TABLE franquicia_auto_importacion_directa (
  id SERIAL PRIMARY KEY,
  criterio VARCHAR(100) NOT NULL DEFAULT 'default',  -- por ahora un solo criterio; extensible cuando se definan los demás
  monto NUMERIC(14,2) NOT NULL,                       -- Gs. 350.000 (valor base actual)
  vigente_desde DATE DEFAULT CURRENT_DATE
);

-- Una cotización puede tener 1 o 2 variantes de franquicia (regla de negocio, no siempre ambas).
-- Auto: Vía Importación = 'REPRESENTANTE' → se generan las 2 (SIN y CON franquicia).
--       Vía Importación = 'IMPORTACION DIRECTA' (u otras) → se genera solo CON franquicia.
CREATE TABLE cotizacion_variantes (
  id SERIAL PRIMARY KEY,
  cotizacion_id INT NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  numero_variante VARCHAR(20) NOT NULL UNIQUE,   -- correlativo propio, ej '901940'
  tipo_franquicia VARCHAR(15) NOT NULL,          -- 'sin_franquicia' / 'con_franquicia'
  franquicia_monto NUMERIC(14,2) DEFAULT 0,
  prima NUMERIC(14,2) NOT NULL
);

-- Cada variante se cotiza en las 4 formas de pago SIMULTÁNEAMENTE (así se ve en el PDF real,
-- con checkbox por cada una — el agente no elige una sola de antemano).
CREATE TABLE cotizacion_plan_pago (
  id SERIAL PRIMARY KEY,
  variante_id INT NOT NULL REFERENCES cotizacion_variantes(id) ON DELETE CASCADE,
  forma_pago_id INT NOT NULL REFERENCES formas_pago(id),
  cantidad_cuotas INT NOT NULL DEFAULT 11,
  rpf_porcentaje NUMERIC(10,6),
  rpf_monto NUMERIC(14,2),
  iva_monto NUMERIC(14,2),
  premio_total NUMERIC(14,2) NOT NULL,
  monto_inicial NUMERIC(14,2),
  monto_cuota NUMERIC(14,2),
  UNIQUE(variante_id, forma_pago_id)
);

-- Snapshot de coberturas elegidas en ESA cotización (con su texto legal al momento,
-- para que si el catálogo cambia después, el PDF viejo no se vea afectado)
CREATE TABLE cotizacion_coberturas (
  id SERIAL PRIMARY KEY,
  cotizacion_id INT NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  cobertura_id INT NOT NULL REFERENCES coberturas_catalogo(id),
  nombre_snapshot VARCHAR(150) NOT NULL,
  texto_legal_snapshot TEXT,
  texto_exclusiones_snapshot TEXT,
  monto NUMERIC(14,2),
  franquicia NUMERIC(14,2),
  incluida BOOLEAN DEFAULT TRUE,   -- true = incluida en el plan, false = quitada manualmente
  tipo_aplicacion VARCHAR(10) NOT NULL DEFAULT 'cobertura'
    CHECK (tipo_aplicacion IN ('cobertura', 'sublimite')), -- decidido por el asegurado en ESTA cotización, no fijo en el catálogo
  sublimite_porcentaje NUMERIC(6,3),  -- ej. 50% de la suma asegurada, solo si tipo_aplicacion = 'sublimite'
  sublimite_monto_maximo NUMERIC(14,2) -- tope absoluto del sublímite, solo si tipo_aplicacion = 'sublimite'
);

-- ============ SERVICIOS (v1 — catálogo separado de coberturas, mismo patrón tildable) ============

CREATE TABLE servicios_catalogo (
  id SERIAL PRIMARY KEY,
  ramo_id INT NOT NULL REFERENCES ramos(id),
  nombre VARCHAR(150) NOT NULL,          -- 'Asistencia al Vehículo', 'Carta Verde'
  texto_legal TEXT,
  es_opcional BOOLEAN DEFAULT FALSE,
  activo BOOLEAN DEFAULT TRUE
);

CREATE TABLE plan_servicios (
  id SERIAL PRIMARY KEY,
  plan_id INT NOT NULL REFERENCES planes(id),
  servicio_id INT NOT NULL REFERENCES servicios_catalogo(id),
  incluido_por_defecto BOOLEAN DEFAULT TRUE,
  UNIQUE(plan_id, servicio_id)
);

CREATE TABLE cotizacion_servicios (
  id SERIAL PRIMARY KEY,
  cotizacion_id INT NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  servicio_id INT NOT NULL REFERENCES servicios_catalogo(id),
  nombre_snapshot VARCHAR(150) NOT NULL,
  texto_legal_snapshot TEXT,
  incluido BOOLEAN DEFAULT TRUE
);

-- ============ DESCUENTOS Y RECARGOS (v1) ============
-- Ajustan la Prima ANTES de calcular RPF/IVA/Premio (ver fórmula actualizada en sección 5)

CREATE TABLE descuentos_catalogo (
  id SERIAL PRIMARY KEY,
  ramo_id INT REFERENCES ramos(id),
  nombre VARCHAR(150) NOT NULL,
  porcentaje_default NUMERIC(6,3),
  activo BOOLEAN DEFAULT TRUE
);

CREATE TABLE recargos_catalogo (
  id SERIAL PRIMARY KEY,
  ramo_id INT REFERENCES ramos(id),
  nombre VARCHAR(150) NOT NULL,
  porcentaje_default NUMERIC(6,3),
  activo BOOLEAN DEFAULT TRUE
);

CREATE TABLE cotizacion_ajustes (
  id SERIAL PRIMARY KEY,
  variante_id INT NOT NULL REFERENCES cotizacion_variantes(id) ON DELETE CASCADE,
  tipo VARCHAR(10) NOT NULL,             -- 'descuento' / 'recargo'
  catalogo_id INT,                       -- referencia opcional al catálogo (null si es un ajuste libre)
  descripcion VARCHAR(150) NOT NULL,
  porcentaje NUMERIC(6,3),
  monto NUMERIC(14,2) NOT NULL
);

-- ============ CLÁUSULAS (v1) ============

CREATE TABLE clausulas_catalogo (
  id SERIAL PRIMARY KEY,
  ramo_id INT NOT NULL REFERENCES ramos(id),
  nombre VARCHAR(150) NOT NULL,
  texto_legal TEXT NOT NULL,
  activo BOOLEAN DEFAULT TRUE
);

CREATE TABLE cotizacion_clausulas (
  id SERIAL PRIMARY KEY,
  cotizacion_id INT NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  clausula_id INT NOT NULL REFERENCES clausulas_catalogo(id),
  texto_legal_snapshot TEXT
);

-- Descuento sobre la comisión del agente: NO afecta lo que paga el cliente, es un dato
-- administrativo interno. Se guarda aparte para no mezclarlo con los ajustes de prima.
ALTER TABLE cotizaciones ADD COLUMN descuento_comision_agente NUMERIC(6,3) DEFAULT 0;

-- Datos KYC / PLA-FT — se completan SOLO al momento de aceptar (estado = 'aceptada'),
-- no en la etapa de cotización rápida. Habilitan la generación de la Propuesta Formal.
CREATE TABLE cliente_kyc (
  id SERIAL PRIMARY KEY,
  cotizacion_id INT NOT NULL UNIQUE REFERENCES cotizaciones(id) ON DELETE CASCADE,
  tipo_persona VARCHAR(15) NOT NULL,        -- 'fisica' / 'juridica'
  nombre_razon_social VARCHAR(200) NOT NULL,
  documento VARCHAR(50),
  ruc VARCHAR(20),
  fecha_nacimiento DATE,
  estado_civil VARCHAR(30),
  nacionalidad VARCHAR(60),
  direccion_particular TEXT,
  direccion_comercial TEXT,
  ciudad VARCHAR(80),
  telefono VARCHAR(30),
  email VARCHAR(120),
  actividad VARCHAR(150),
  monto_ingreso_mensual NUMERIC(14,2),
  es_proveedor_estado BOOLEAN DEFAULT FALSE,
  es_pep BOOLEAN DEFAULT FALSE,
  pep_institucion VARCHAR(150),
  pep_cargo VARCHAR(100),
  declaracion_lavado_activos BOOLEAN,
  declaracion_paises_no_cooperantes BOOLEAN,
  declaracion_sujeto_obligado BOOLEAN,
  tipo_firma VARCHAR(30),                   -- 'digital' / 'facsimilar' / 'manuscrita'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

-- ============ AUTO - FLOTA ============
-- Marca la cotización como flota y agrupa N vehículos bajo un único costo total.
ALTER TABLE cotizaciones ADD COLUMN es_flota BOOLEAN DEFAULT FALSE;

CREATE TABLE cotizacion_flota_vehiculos (
  id SERIAL PRIMARY KEY,
  cotizacion_id INT NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  item INT NOT NULL,
  marca VARCHAR(80),
  modelo VARCHAR(80),
  anio INT NOT NULL,
  matricula VARCHAR(20),
  capital_asegurado NUMERIC(14,2) NOT NULL,
  prima_individual NUMERIC(14,2)     -- prima calculada para ese vehículo (tasa + recargo por antigüedad)
);

-- Recargo por antigüedad del vehículo (pendiente de que me pases la tabla real de Tajy)
CREATE TABLE recargo_antiguedad_tabla (
  id SERIAL PRIMARY KEY,
  antiguedad_anios_min INT NOT NULL,
  antiguedad_anios_max INT NOT NULL,
  porcentaje_recargo NUMERIC(6,3) NOT NULL
);
```

**Flujo de dos documentos:** la cotización nace en `borrador`/`cotizada` con solo los datos del riesgo y el cálculo (esto alcanza para la Carta Oferta). Recién cuando el agente marca la cotización como `aceptada` se solicita completar `cliente_kyc`, y ahí se habilita generar la Propuesta Formal (con declaraciones PLA/FT y firmas). El PDF de Carta Oferta sigue disponible en cualquier momento desde `pdf_carta_oferta_url`.

**Extensibilidad para el ciclo de vida completo (fase futura, no se construye ahora):** el sistema actual de Tajy sigue después de la propuesta con Renovación, Inspección (fotos/documentos), inicio de Trámite y Expedientes. Este plan no construye esos módulos, pero el diseño los deja contemplados: `estado` en `cotizaciones` puede extenderse con nuevos valores (`en_tramite`, `con_expediente`, etc.) sin romper nada existente, y una futura tabla `expedientes` o `documentos_adjuntos` podría referenciar `cotizacion_id` sin necesidad de tocar el schema actual.

**Por qué `riesgo_datos` en JSONB:** cada ramo pide datos distintos (Auto: marca/modelo/año; Incendio: dirección/m²/tipo de construcción; AP: cantidad de personas/edades). En vez de una tabla con 40 columnas nulas la mayoría del tiempo, el frontend arma un formulario dinámico por ramo y el backend lo valida con un schema Zod específico por ramo antes de guardar. Campos como **Área de Circulación** van acá también — confirmaste que es solo informativo/estadístico, no afecta la tasa.

**Por qué `cotizacion_coberturas` es un snapshot:** si mañana cambiás el texto de una exclusión en el catálogo, las cotizaciones ya emitidas no deben cambiar retroactivamente — quedan como una "foto" de lo que se cotizó ese día.

---

## 5. Motor de cálculo por ramo

**Fórmula de cuotas — unificada y confirmada (aplica a TODOS los ramos):**
```
Cada uno de los 12 pagos (Inicial + 11 cuotas) = REDONDEAR.SUP(Premio / 12, 1000)
```
Esto reemplaza las versiones anteriores (que no cerraban exacto) tanto para Auto como para Incendio/Hogar/Comercio/TRO/Transporte/Flota. Confirmado por vos: "se usa el premio dividido 12 y se redondea hacia arriba, para tener un monto entero — lo mismo pasa con Auto."

**RPF — corregido con la pantalla real del cotizador (v2):** es una **tasa fija por forma de pago**, NO escalonada por cantidad de cuotas. Es igual en los 5 planes de Auto que me mostraste: Contado=0%, Crédito (Cobrador)=1,6%, Boca de Cobranza=1,35%, Tarjeta de Crédito=1%. La tabla escalonada de `Calculo_RPF.xlsx` y la que aparecía en los manuales de Incendio/Hogar quedan descartadas para el cálculo real — se guardan en `plan_formas_pago` por si a futuro un plan específico necesita una tasa distinta.

**Corrección de "Prima Técnica Mínima":** la pantalla real del cotizador usa un único campo `Prima Técnica Mínima` con el valor que antes yo separaba en "Prima Mínima" vs "Premio Mínimo" (ej. Gs. 3.190.000 para Premium). Vuelvo a lo simple: el schema guarda `planes.prima_tecnica_minima` con ese valor tal cual, y el piso se aplica directo sobre la Prima antes de RPF/IVA — sin la distinción que había propuesto antes.

### Auto
```
Prima_base = MAX(Capital × Tasa(plan, rango capital), Prima_Técnica_Mínima_del_plan)
Prima = Prima_base − Σ(Descuentos, tope = plan.descuento_maximo) + Σ(Recargos, tope = plan.recargo_maximo)
        [Recargos posibles: marca (BMW/Mercedes/Land Rover/Porsche, estacional),
         movilidad híbrida +20%, importación directa +15%, convenio Tendota (pasajeros)]
RPF% = plan_formas_pago.tasa_rpf (fija según forma de pago, NO varía por cantidad de cuotas)
R.P.F. = REDONDEAR.SUP(Prima × RPF% / 100, 1000)
IVA = (Prima × 10%) + (R.P.F. × 10%)
Premio = Prima + R.P.F. + IVA
Inicial = Cuota = REDONDEAR.SUP(Premio / 12, 1000)   [cantidad configurable hasta plan.cuotas_maximo]
```
Formas de pago: **Contado** (sin RPF), **Crédito/Cobrador**, **Boca de Cobranza**, **Tarjeta de Crédito**, cada una con su tasa RPF fija (Tarjeta tiene además un precio preferencial de inicial + 2 cuotas a costo contado). **Las 4 se calculan siempre en simultáneo** — no se elige una sola forma de pago al cotizar, el PDF las muestra todas con checkbox y el cliente/agente marca la elegida al momento de firmar.

**Franquicia — fórmula confirmada por el manual oficial + pantalla real del cotizador:**
```
Vía Importación = 'IMPORTACION DIRECTA':
  Franquicia = Gs. 350.000 fija (IVA incluido), por defecto en TODA cotización
  [Actualizado — el manual y la config vieja tenían Gs. 220.000, ya obsoleto.
   Este monto base puede variar según criterios que todavía no definimos — ver pendiente]
  Para cobertura SIN franquicia: se suma un monto fijo a la Prima ⚠ pendiente recalcular
  (el valor de Gs. 909.091 estaba calculado sobre la franquicia vieja de 220.000, ya no aplica)
  → Solo se genera 1 variante (CON franquicia); la opción sin franquicia es un
    add-on dentro de esa misma variante, no una segunda variante separada

Vía Importación = 'REPRESENTANTE' Y plan.cotizacion_combinada = true (Premium/Superior/Fuerte):
  Franquicia es OPCIONAL. Si se elige:
    Descuento sobre Prima Comercial: plan.descuento_default (20% en Premium/Superior/Fuerte)
    Franquicia = Prima Comercial × plan.franquicia_porcentaje (12%)
  → Se generan 2 variantes: SIN franquicia (prima íntegra) y CON franquicia

Vía Importación = 'REPRESENTANTE' Y plan.cotizacion_combinada = false (Noble/Básico):
  → Solo 1 variante, sin franquicia
```
Esto corrige el diseño anterior de `cotizacion_variantes` — la franquicia dual depende del **plan** (campo `cotizacion_combinada`) además de la vía de importación, no solo de esta última. Para Importación Directa, la "franquicia sí/no" es un toggle dentro de la misma cotización (monto fijo aditivo), no dos variantes separadas.

**Otros recargos/descuentos de Auto a modelar en `descuentos_catalogo`/`recargos_catalogo`:**
- Bonificación por no siniestro (renovación, año 1): 10% sobre premio anterior, nunca por debajo del Premio Mínimo
- Recargos por siniestralidad histórica (5% a 35% según % siniestral) y por frecuencia (0%/2%/4%/no renovable) — aplican solo en renovaciones (Fase futura)
- Descuentos por cargo del usuario que cotiza (Gerencia/Analistas/Supervisores, etc.) con límites de autorización — requiere modelar `rol` en la tabla de usuarios/agentes con su límite de descuento habilitado

### Auto - Flota
```
Por cada vehículo:
  Prima_individual = MAX(Capital × Tasa(plan, rango capital), Prima_Mínima_del_plan)
  Prima_individual += Prima_individual × Recargo_Antigüedad(años del vehículo)
Prima_flota = Σ Prima_individual − Bonificación_por_cantidad_de_vehículos
  [Bonificación: 5% (6-10 vehículos), 10% (11-19), 20% (20+)]
Premio Contado = Prima_flota × 1.1 (IVA, sin RPF)
Inicial = Cuota = REDONDEAR.SUP(Premio / 12, 1000)
```
`recargo_antiguedad_tabla` **ya tiene datos reales** del manual: 0 años=0%, 1 a 14 años=11,1% (plano), luego escala: 15 años=18,1% … 25 años=31,1% (la tabla se recalcula cada año calendario, el "año 0" es siempre el año en curso).

La franquicia dual y las 4 formas de pago **no aplican** a Flota — solo Contado/Financiado. Salida: **carta de cotización** (formato carta comercial) — ver sección 7.

### Incendio (riesgo simple)
```
Categoria = buscar Rubro en rubros_actividad
Costo Edificio = Suma_Edificio × Tasa_Edificio(rubro) / 1000
Costo Contenido = Suma_Contenido × Tasa_Contenido(rubro) / 1000
Prima = MAX(Costo Edificio + Costo Contenido, Prima_Mínima)   [Gs. 409.909]
RPF% = tasa fija por forma de pago (mismo mecanismo que Auto — valores exactos para este ramo pendientes, ver punto 2 de la sección 11)
R.P.F. = REDONDEAR.SUP(Prima × RPF% / 100, 1000)
IVA = (Prima × 10%) + (R.P.F. × 10%)
Premio = Prima + R.P.F. + IVA
Inicial = Cuota = REDONDEAR.SUP(Premio / 12, 1000)
```
Tasa: rango 0,50‰ a 4‰ (Incendio) — **editable solo por roles autorizados** (admin y roles que se agreguen luego); el agente cotiza siempre con la tasa ya configurada, no la edita.

### Multirriesgo Hogar
Mismo esqueleto que Incendio, pero con **4 planes propios** (Protección Integral, Protección Ampliada, Protección Premium, Mi Hogar), cada uno con montos fijos de cobertura por ítem (Incendio edificio/contenido, Robo, Cristales, Muerte Accidental, Resp. Civil, Equipos Electrónicos, daños por agua/granizo, asistencias domiciliarias 24hs). Rango de tasa: 1,2‰ a 5,5‰ (promedio 4,15‰).

### MRC (Multirriesgo Comercio) y TRO (Todo Riesgo Operativo)
Mismo esqueleto, prima = suma de líneas de cobertura (Incendio edificio/contenido, Robo, Cristales, Valores en tránsito/caja fuerte, Resp. Civil, Equipos Electrónicos, sub-límites de granizo/agua/murallas), cada línea con su propia tasa dentro de un rango (Comercio: 2,5‰-4,5‰; TRO: 3,5‰-6,5‰). El **rubro de actividad** del cliente determina el ramo: Grupo A "sin proceso" (bazar, farmacia, oficina, boutique...) → MRC; Grupo B "con proceso" (depósito, taller, hotel, imprenta...) → TRO.

### Transporte de Mercadería
```
Prima = MAX(Suma Asegurada × Tasa_nivel_cobertura / 100, Prima_Mínima)
```
Nivel de cobertura: Libre Avería Particular (1,2%), Con Avería Particular (2%), Contra Todo Riesgo (4,5%). Mismo motor de RPF/IVA/cuotas que el resto.

### Vida y Accidentes Personales (antes "AP", ahora completamente definido)
Familia de productos con su propia lógica de tarificación **por edad de la persona**, no por capital de un bien:
- **Protección de Préstamos** (cooperativas/mercado general): tasa ‰ mensual por franja etaria (0,35‰ hasta 69 años, escalando hasta 2,12‰ para 76-80 años), aplicada sobre el saldo del préstamo
- **Protección Familiar**: tasa fija 10‰ 
- **Accidentes Personales** (individual/grupal): 5,5‰ (sector cooperativo) / 6,9‰ (sector privado), con recargos por edad avanzada
- **Vida Directivos y Empleados**: tasa anual‰ por franja etaria (1,1‰ para 18-25 años, hasta 50‰ para 65-69 años)
- **Aportes y Ahorros**: 0,60‰ mensual sobre saldo declarado

Este ramo necesita un `RamoCalculator` propio (`vida-ap.js`) con lógica de **tabla de tasas por edad** en vez de por capital — variable nueva a agregar: `personas_aseguradas` (JSONB con edad, sexo, capital por persona) en `riesgo_datos`.

### Caución — fuera de alcance del cotizador
Es un producto de **análisis crediticio/moral**, no de tarifa fija: requiere estudio de balances, contragarantías, niveles de autorización por monto (hasta Gs. 500M lo aprueba el Jefe de Caución, más que eso escala a Gerencia). No tiene una fórmula de prima estándar — cada caso se tarifa manualmente (hay incluso una tabla de "clientes con tasas diferenciadas" negociadas individualmente). Recomiendo dejarlo fuera de este sistema; si se quiere digitalizar en el futuro, sería un módulo de gestión de expedientes/análisis de crédito, no un cotizador.

---

## 6. Coberturas, Servicios, Descuentos/Recargos y Cláusulas

En el formulario de cotización, después de elegir Ramo + Plan, se cargan **cuatro bloques independientes** (así los separa la pantalla actual de Tajy, cada uno con su propio catálogo):

### Coberturas
1. El sistema carga automáticamente las coberturas **incluidas por defecto** del plan (`plan_coberturas` donde `incluida_por_defecto = true`), mostradas como tarjetas/checks ya tildados.
2. Se listan también las coberturas **opcionales** del ramo (`coberturas_catalogo` donde `es_opcional = true` y no están en el plan base) como botones para **agregar**.
3. El agente puede **destildar** una cobertura incluida o **tildar** una opcional para sumarla.
4. Cada cobertura tildada/destildada puede recalcular la prima si tiene impacto tarifario (a definir por ramo).

### Servicios (catálogo separado — ej. Asistencia al Vehículo, Carta Verde)
Mismo patrón tildable que coberturas (`servicios_catalogo` / `plan_servicios` / `cotizacion_servicios`), pero se muestran en un panel aparte porque conceptualmente son prestaciones/asistencias, no límites de indemnización. No suelen tener impacto en la prima (van incluidos en el plan), pero el schema lo permite si algún servicio tuviera costo propio.

### Descuentos y Recargos
Lista editable de ajustes sobre la Prima antes de calcular RPF/IVA (ver fórmula en sección 5). El agente puede tomar uno del catálogo (`descuentos_catalogo` / `recargos_catalogo`) o cargar uno libre, y queda registrado en `cotizacion_ajustes` con su descripción y monto/porcentaje — así el PDF puede mostrar el detalle de por qué la prima final difiere de la tarifa base.

### Cláusulas
Catálogo de textos legales adicionales por ramo (`clausulas_catalogo`) que el agente puede anexar a la cotización — quedan snapshoteados en `cotizacion_clausulas` y se imprimen en el PDF igual que las exclusiones de coberturas.

UI sugerida: cuatro secciones/tabs en el formulario de cotización (Coberturas, Servicios, Descuentos/Recargos, Cláusulas), cada una con su propio patrón de tildable o de lista editable, igual que en la pantalla actual de Tajy.

---

## 7. Generación de PDF — dos documentos, dos momentos

Confirmaste el enfoque híbrido: un documento simple para cotizar rápido, y el documento formal completo recién cuando el cliente acepta.

### Documento 1 — Carta Oferta (disponible desde que se guarda la cotización)
Puppeteer, plantilla HTML/CSS con el branding de Tajy. **Diseño visual basado en el modelo MAPFRE que compartiste al inicio** (`MODELO_DE_COTIZACION_AUTO.pdf`): logo arriba a la izquierda, banner rojo de sección arriba a la derecha, bloque "CARTA OFERTA" destacado, tabla de datos del riesgo con filas alternadas, tabla "PLAN DE PAGO" con columnas por forma de pago, y la página 2 de beneficios/coberturas en dos columnas. Se adapta la paleta al rojo/branding de Tajy en vez del de MAPFRE, pero la disposición general (jerarquía visual, tablas, tipografía) sigue ese layout como plantilla base.

Contenido:
- Encabezado con logo, número(s) de cotización (uno por variante), fecha, vigencia
- Datos del riesgo (según ramo)
- Coberturas incluidas, agrupadas por categoría, con su monto/límite
- Texto legal de cada cobertura, exclusiones y franquicia (`texto_legal_snapshot` / `texto_exclusiones_snapshot`)
- Liquidación de Premio por variante (si hay 2 variantes de franquicia, una tabla por cada una) mostrando **las 4 formas de pago en simultáneo**, igual que el modelo real: Prima, R.P.F., I.V.A., Premio, Inicial, 11 cuotas
- Pie legal estándar ("esta cotización no implica aceptación del riesgo...")

### Documento 2 — Propuesta Formal (se genera al marcar la cotización como `aceptada`)
Réplica del documento real que compartiste (`ASEGURADORA TAJY — PROPUESTA PARA SEGURO DE...`):

- Todo lo del Documento 1, más:
- Datos del asegurado (KYC): persona física o jurídica, completados en `cliente_kyc`
- Sección PEP (Persona Políticamente Expuesta) con institución/cargo si aplica
- Declaraciones juradas PLA/FT (lavado de activos, países no cooperantes, sujeto obligado)
- Declaración jurada de origen de fondos
- Bloque de "Asistencia al Viajero" u otros textos fijos del plan (no ligados a montos, son fijos por producto)
- Autorización de débito de tarjeta (si la forma de pago elegida es Tarjeta de Crédito)
- Firmas (Agente / Titular de tarjeta / Titular del seguro) y datos del operador
- Checkbox marcado sobre la forma de pago que efectivamente eligió el cliente

Cada ramo tiene su propia plantilla HTML para ambos documentos (`templates/auto-oferta.html`, `templates/auto-propuesta.html`, etc.) que comparten un layout base (header/footer/branding).

### Documento 3 — Carta de Cotización de Flota (formato carta, no el diseño con código de barras)
Réplica del documento Word que compartiste:
- Encabezado tipo carta comercial (fecha, destinatario, referencia)
- Descripción del plan y coberturas (texto fijo del plan, en % del valor de mercado o montos fijos — no por vehículo)
- Tabla de vehículos: Item / Marca y Modelo / Año / Matrícula / Suma Asegurada, con total sumado
- Costo del seguro por flota: Contado (IVA incluido) y Financiado (Inicial + 11 cuotas)
- Condiciones y firma de quien realiza la cotización (agente/analista de riesgo)

**Pendiente a definir:** este documento hoy lo redacta un analista de Riesgo "a mano" — falta confirmar si el sistema nuevo lo genera automáticamente con estos mismos datos, o si sigue habiendo una instancia de revisión manual antes de enviarlo (dado que la prima de flota depende del recargo por antigüedad que todavía no está tabulado).

**Pendiente a definir:** los textos fijos por plan que no dependen de la cotización particular (como "Asistencia al Viajero", límites de servicio de grúa, Carta Verde) — conviene guardarlos como un campo `texto_fijo_plan` en la tabla `planes` en vez de repetirlos por cobertura, ya que aplican al plan completo.

---

## 8. Endpoints de la API

```
GET  /api/ramos                          Listar ramos activos
GET  /api/ramos/:id/planes               Planes disponibles de un ramo
GET  /api/planes/:id/coberturas          Coberturas del plan (incluidas + opcionales disponibles)
GET  /api/planes/:id/servicios           Servicios del plan (incluidos + opcionales disponibles)
GET  /api/ramos/:id/descuentos           Catálogo de descuentos del ramo
GET  /api/ramos/:id/recargos             Catálogo de recargos del ramo
GET  /api/ramos/:id/clausulas            Catálogo de cláusulas del ramo

POST /api/cotizaciones/calcular          Calcula prima/plan de pago (4 formas de pago) sin guardar (preview en vivo)
POST /api/cotizaciones                   Crea y guarda la cotización + sus variantes (asigna números correlativos)
GET  /api/cotizaciones                   Historial (filtros: ramo, cliente, fecha, estado)
GET  /api/cotizaciones/:id               Detalle de una cotización (variantes + planes de pago)
GET  /api/cotizaciones/:id/pdf-oferta    Genera/descarga la Carta Oferta
POST /api/cotizaciones/:id/aceptar       Marca como 'aceptada' + guarda cliente_kyc
GET  /api/cotizaciones/:id/pdf-propuesta Genera/descarga la Propuesta Formal (requiere estado 'aceptada')

POST /api/admin/tasas/importar           Sube Excel de tasas (Auto)
POST /api/admin/rpf/importar             Sube Excel de RPF
GET  /api/admin/coberturas               CRUD del catálogo de coberturas
POST /api/admin/coberturas
PUT  /api/admin/coberturas/:id
```

---

## 9. Estructura del frontend

```
/cotizar
  1. Seleccionar Ramo
  2. Formulario dinámico del riesgo (según ramo) + Capital/Suma asegurada
  3. Seleccionar Plan → carga coberturas incluidas
  4. Agregar/quitar coberturas opcionales (checks/toggles)
  5. Elegir forma de pago y cantidad de cuotas → preview en vivo del cálculo
  6. Guardar cotización → genera número correlativo
  7. Ver / descargar PDF

/historial
  Tabla con filtros (ramo, cliente, fecha, estado), buscar por número

/admin
  Gestión de planes, coberturas, importación de tasas
```

Mismo patrón visual que Siniestros Tajy (sidebar, Vanilla JS, sin framework).

---

## 10. Fases de desarrollo

**Fase 1 — Base del sistema**
- Estructura del monorepo (backend/frontend), conexión Supabase, schema completo
- Importador de `Automovil_Listado_de_Tasa.xlsx` → `tasas_capital` + `planes`
- Importador de `Calculo_RPF.xlsx` → catálogo de `formas_pago` (los valores de RPF por cuotas de ese archivo quedan descartados — ver sección 5)
- Carga inicial del catálogo de coberturas de Auto (a partir del PDF modelo)

**Fase 2 — Cotizador de Auto end-to-end (individual + flota)** — ⏸ PAUSADA (2026-07-10): el cliente solicitó priorizar MRC, Incendio y Vida/AP. El avance parcial de Fase 1 para Auto (schema, importador de tasas) queda tal cual está, sin tocar, hasta retomar esta fase.
- Motor de cálculo Auto individual completo (con la fórmula de Cuota ya confirmada)
- Motor de cálculo Auto Flota (Contado + Financiado, recargo por antigüedad)
- Regla de variantes sin/con franquicia según Vía de Importación (solo Auto individual)
- Formulario de cotización + preview en vivo (4 formas de pago simultáneas para individual)
- Listado de vehículos editable para Flota (agregar/quitar filas, total automático)
- Guardado con numeración correlativa por variante
- Generación de la Carta Oferta (individual) y la Carta de Cotización de Flota en PDF

**Fase 3 — Coberturas, Servicios, Descuentos/Recargos y Cláusulas**
- UI de agregar/quitar coberturas (tildables)
- Catálogo y UI de Servicios (Asistencia al Vehículo, Carta Verde, etc.)
- Catálogo y UI de Descuentos/Recargos, integrados a la fórmula de Prima
- Catálogo y UI de Cláusulas
- Snapshot de los cuatro bloques por cotización
- Anexo de condiciones dinámico en el PDF

**Fase 4 — Propuesta Formal**
- Formulario de KYC/PLA-FT al marcar cotización como 'aceptada'
- Plantilla y generación de la Propuesta Formal en PDF (réplica del documento real)
- Firmas y checkbox de forma de pago elegida

**Fase 5 — Historial y administración**
- Listado con filtros, búsqueda, reimpresión de PDF
- Panel admin: gestión de planes/coberturas, reimportación de tasas

**Fase 6 — Incendio / Multirriesgo Hogar / MRC / TRO / Transporte** — ▶ ACTIVA (2026-07-10). Orden interno acordado con Kevin: **MRC primero**, luego Incendio, Hogar y TRO quedan fuera de esta fase (se retoman después, no las pidió el cliente todavía).
- Cargar `rubros_actividad`, `tasas_cobertura_ramo` y planes de MRC/Incendio según los manuales oficiales y las propuestas manuales ya recibidas (ver `docs/cotizaciones-ejemplo/` o equivalente)
- Implementar los calculadores (`mrc.js`, `incendio.js`) sobre el motor unificado (RPF fijo por forma de pago + cuotas = REDONDEAR.SUP(Premio/12,1000)) — **bloqueado hasta recibir el Excel de tasas/RPF del dpto. técnico** (pendiente #2, sección 11); mientras tanto se avanza con schema, catálogo de coberturas y el calculador con la tasa como parámetro configurable (sin hardcodear)
- Formularios dinámicos por ramo en el frontend (rubro, m², suma por línea de cobertura, etc.)
- UI para tildar cada cobertura como `cobertura` propia o `sublimite` de otra, según lo que el asegurado quiera pagar (`cotizacion_coberturas.tipo_aplicacion`, ver sección 4) — confirmado con ejemplos reales (GT S.A., Grupo Seguridad Electrónica Paraguay)
- UI de edición de tasas dentro de rango, restringida a roles con `puede_editar_tasas = true`
- Plantillas PDF por ramo
- Hogar y TRO quedan pendientes de fase futura (mismo esqueleto que MRC/Incendio, se suman cuando el cliente los pida)

**Fase 7 — Vida y Accidentes Personales** — ▶ ACTIVA junto con Fase 6 (2026-07-10), tercer ramo solicitado por el cliente
- `RamoCalculator` con tarificación por franja etaria (`vida-ap.js`)
- Formulario dinámico de personas aseguradas (edad, sexo, capital por ítem)
- Carga de tablas de tasas por edad de cada sub-producto (Protección de Préstamos, AP, Vida Directivos, etc.) — mismo bloqueo: falta confirmación del dpto. técnico

**Fase 8 — Deploy**
- Backend a Railway/Render (con Puppeteer configurado)
- Frontend a Netlify
- Variables de entorno y pruebas en producción

---

## 11. Pendientes / decisiones abiertas

**Resueltos por los manuales oficiales, las pantallas reales del cotizador y tus últimas respuestas** (dejo la referencia por trazabilidad):
- ~~Fórmula de Cuota~~ → unificada: cada pago = REDONDEAR.SUP(Premio/12, 1000), igual en todos los ramos
- ~~RPF de Auto~~ → tasa fija por forma de pago (Cobrador 1,6% / Boca de Cobranza 1,35% / Tarjeta 1%), confirmada contra la pantalla real del cotizador — descarta la tabla escalonada por cuotas
- ~~Reglas de tarificación de Vida y AP~~ → definidas en el manual correspondiente (sección 5)
- ~~Piso mínimo Auto~~ → `Prima Técnica Mínima` por plan, tomada directo de la pantalla real (Premium 3.190.000, Superior 2.695.000, Fuerte 2.365.000, Noble 1.661.000, Básico 645.000)
- ~~Tabla de recargo por antigüedad (Flota)~~ → cargada desde el manual de Auto
- ~~Fórmula de franquicia~~ → resuelta, incluyendo el flag `cotizacion_combinada` por plan (Premium/Superior/Fuerte = Sí, Noble = No)

**Siguen abiertos:**
1. **Coberturas con costo propio en Auto:** definir si alguna cobertura opcional tiene impacto en la prima o todas están ya contempladas en la tasa del plan.
2. **RPF de Incendio/Hogar/MRC/TRO:** confirmado que Auto usa tasa fija por forma de pago (no escalonada) — falta el mismo dato (los 3 valores fijos: Cobrador/Boca de Cobranza/Tarjeta) para estos otros ramos, ya que el manual mostraba la tabla escalonada vieja.
3. **Textos fijos por plan** (Asistencia al Viajero, servicios de grúa, Carta Verde): confirmar si son iguales para todos los planes de Auto o varían por plan.
4. **Plan Básico:** confirmar el resto de su configuración — no usa tasa por capital sino una "Tasa Única" fija (1,64%) sobre la cobertura de RC, distinto al resto de los planes.
5. **Recargo por marca (BMW/Mercedes/Land Rover/Porsche):** el manual dice "a partir de julio" pero no da la regla completa de cuándo se activa/desactiva por temporada.
6. **Convenio Tendota (cobertura de pasajeros):** el manual solo dice "se genera como recargo en el cotizador" sin el %, falta el dato.
7. **Auto - Flota:** confirmar si la bonificación por cantidad de vehículos (5%/10%/20%) y el recargo por antigüedad se aplican en el orden que asumí (recargo primero, bonificación después sobre el total).
8. **Máximos de descuento/recargo por plan** (`descuento_maximo`, `recargo_maximo`): ya tengo Premium/Superior (20%/100%) y Fuerte (55%/100%) — faltan Noble y Básico, y el resto de los planes que todavía no me mostraste.
9. **Franquicia de Importación Directa actualizada a Gs. 350.000** (antes 220.000) — falta: (a) los criterios que hacen variar ese monto base, y (b) el nuevo monto del add-on para sacar la franquicia (el de Gs. 909.091 estaba calculado sobre el valor viejo).
10. **RPF fijo de MRC, Incendio y Vida/AP:** solicitado al dpto. técnico (2026-07-10); llegará vía Excel. Bloquea terminar los calculadores de la Fase 6/7, no bloquea schema ni catálogo de coberturas.
11. **Regla "cobertura vs. sublímite" — RESUELTA (2026-07-10), aplica solo a ramos "Otros Riesgos" (MRC, Incendio, etc.), NO a Auto:**
    - **Auto:** el sublímite es solo texto informativo en la cobertura/PDF (ej. "hasta Gs. X"), sin lógica de cálculo propia. No usa el campo `tipo_aplicacion` — el modelo de Auto ya definido en secciones 4-5 no cambia.
    - **MRC / Incendio / demás Otros Riesgos:** el asegurado elige por cotización si un ítem (ej. Robo, Granizo, daños a murallas) se cotiza como línea propia (`tipo_aplicacion = 'cobertura'`: capital y prima propios) o como sublímite (`tipo_aplicacion = 'sublimite'`: tope % o monto fijo de indemnización dentro de la cobertura principal, **sin prima adicional**) — ver ejemplos GT S.A. y Grupo Seguridad Electrónica Paraguay. Confirmado: sublímite no lleva tasa reducida propia, es solo un tope de indemnización sin costo adicional.

---

## 12. Stack y despliegue

| Capa | Herramienta |
|---|---|
| Backend | Node.js + Express |
| Base de datos | Supabase (PostgreSQL) |
| Validación | Zod (un schema por ramo para `riesgo_datos`) |
| Frontend | Vanilla JS |
| Importación de Excel | SheetJS |
| Generación de PDF | Puppeteer (HTML/CSS → PDF) |
| Deploy frontend | Netlify |
| Deploy backend | Railway o Render (Puppeteer necesita más RAM/CPU que serverless) |
| Organización | Monorepo GitHub (igual que gestion-tajy) |
