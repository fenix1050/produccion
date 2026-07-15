-- Fix: "Ídem" era un error de tipeo en los textos legales/exclusiones de coberturas_catalogo
-- (MRC, Incendio, Vida/AP) — la palabra correcta es "Ítem", detectado por Kevin al revisar
-- el PDF de Carta Oferta de MRC (exclusiones de "Incendio de Contenido").

UPDATE coberturas_catalogo
SET texto_exclusiones = REPLACE(texto_exclusiones, 'Ídem', 'Ítem')
WHERE texto_exclusiones LIKE 'Ídem%';
