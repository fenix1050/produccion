-- 021_fix_texto_sublimites_mrc_normal.sql
-- Corrige planes.texto_sublimites_generales para "MULTIRRIESGO COMERCIO - NORMAL": el texto
-- cargado en la migración 017 estaba incompleto (solo tenía Murallas/Granizo, faltaban CCTV/
-- Daños por agua/Equipos Electrónicos) y el monto de Daños por Granizo estaba desactualizado
-- (Gs. 2.000.000, de una oferta puntual — ver comentario de la 017). Kevin confirmó (2026-07-13)
-- el texto completo real contra el cotizador de pólizas nuevas, y los 5 montos coinciden EXACTO
-- con lo que ya estaba cargado en plan_coberturas.monto desde la migración 012 — no hacía falta
-- tocar plan_coberturas, solo el texto que se muestra en el resumen.

UPDATE planes
SET texto_sublimites_generales = 'Sub-límites de coberturas para daños o pérdidas como consecuencia de un riesgo cubierto, a primer riesgo absoluto para:
Circuito Cerrado de Televisión (Cámaras de Seguridad): hasta la suma máxima de Gs. 5.000.000.-
Daños por agua: hasta la suma máxima de Gs. 2.500.000.-
Daños a los Equipos Electrónicos: hasta la suma máxima de Gs. 5.000.000.-
Daños a murallas, cercos perimetrales y rejas: hasta la suma máxima de Gs. 1.000.000.- para cada vigencia.
Daños por granizo: hasta la suma máxima de Gs. 5.000.000.- por cada vigencia, para daños al edificio.'
WHERE nombre = 'MULTIRRIESGO COMERCIO - NORMAL';
