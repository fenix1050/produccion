-- 027_quitar_cctv_de_sublimites_mrc.sql
-- Kevin confirmó (2026-07-15) que el sub-límite de Circuito Cerrado de Televisión (CCTV) no
-- debe listarse por separado: ya está incluido dentro de "Daños a los Equipos Electrónicos".
-- Se quita esa línea de planes.texto_sublimites_generales para MULTIRRIESGO COMERCIO - NORMAL
-- (bloque "Sub-límites" del panel "Detalle del plan"). El texto equivalente en la Carta Oferta
-- (TEXTO_DISTRIBUCION_CAPITAL, backend/src/templates/oferta/mrc.js) se corrige en el mismo commit.
-- No se toca coberturas_catalogo.sublimite_cctv: esa fila ya no es seleccionable como cobertura
-- adicional (sin tasa cargada, excluida a mano en cotizar.js) — este cambio es solo textual.

UPDATE planes
SET texto_sublimites_generales = 'Sub-límites de coberturas para daños o pérdidas como consecuencia de un riesgo cubierto, a primer riesgo absoluto para:
Daños por agua: hasta la suma máxima de Gs. 2.500.000.-
Daños a los Equipos Electrónicos: hasta la suma máxima de Gs. 5.000.000.-
Daños a murallas, cercos perimetrales y rejas: hasta la suma máxima de Gs. 1.000.000.- para cada vigencia.
Daños por granizo: hasta la suma máxima de Gs. 5.000.000.- por cada vigencia, para daños al edificio.'
WHERE nombre = 'MULTIRRIESGO COMERCIO - NORMAL';
