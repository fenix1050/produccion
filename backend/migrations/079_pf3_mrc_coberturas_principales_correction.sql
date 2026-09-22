-- PF-3 MRC content correction: replace the simplified five-sentence "coberturas_principales"
-- summary with the full approved official text (extension list, secondary coverages,
-- Distribución del Capital Asegurado tables, sublímites), supplied by Kevin Ruiz. Fixes three
-- clear copy/paste accent artifacts from the source ("Mercaderia" -> "Mercadería", "Transito"
-- -> "Tránsito", "Sublimite" -> "Sublímite"), matching the pattern already applied to
-- condiciones_mrc in migration 078. Existing versions remain immutable; only the publication
-- pointer moves to version 3.
BEGIN;

UPDATE propuesta_textos
SET publicado = FALSE
WHERE producto_codigo = 'mrc'
  AND clave = 'coberturas_principales'
  AND publicado = TRUE;

INSERT INTO propuesta_textos (
  producto_codigo, clave, version, contenido, motivo, publicado, publicado_at, origen
)
VALUES
  (
    'mrc',
    'coberturas_principales',
    3,
    $$Coberturas Principales:
Incendio, Rayo y Explosión;

Incendio y daños materiales por Huracán, Vendaval, Ciclón o Tornados;
Incendio y daños materiales por Tumulto y/o Alboroto Popular y/o Huelga que revista tales caracteres, siempre que no sean por motivos políticos;
Daños materiales por Caída de Aeronaves y/o de sus partes componentes;
Daños materiales por Impacto de vehículos terrestres de terceros;
Daños materiales por Humo y Hollín;

Robo y/o Asalto del Contenido.-
Robo (Caja registradora).-
Robo (Tránsito).-
Rotura de Cristales, Vidrios o Espejos.-
Responsabilidad Civil.-

Distribución del Capital Asegurado:
Incendio
Mercadería | Muebles, Equipos y Enseres
50% | 50%

Sublímite para Circuito Cerrado de televisión (Cámaras de Seguridad): Gs. 5.000.000.-
Sublímite para Daños por agua: Gs. 2.000.000.-

Robo
Mercadería | Equipos | Mueble
60% | 10% | 30%$$,
    'Reemplazo del resumen simplificado por el texto oficial completo de coberturas principales, provisto por Kevin Ruiz para la Propuesta Formal MRC v3.',
    TRUE,
    NOW(),
    'migracion_fuente_oficial'
  )
ON CONFLICT (producto_codigo, clave, version) DO NOTHING;

-- Reruns can encounter an existing version-3 row after the initial publication cleared it.
-- Republish it explicitly so the migration remains idempotent.
UPDATE propuesta_textos
SET publicado = TRUE,
    publicado_at = NOW()
WHERE producto_codigo = 'mrc'
  AND clave = 'coberturas_principales'
  AND version = 3;

COMMIT;
