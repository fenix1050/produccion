-- Activa RLS en las 34 tablas de public marcadas CRITICAL por el advisor de Supabase.
-- El backend es el unico consumidor de estas tablas y usa SUPABASE_SERVICE_KEY
-- (service_role), que bypasea RLS siempre. No se agregan policies: el default-deny
-- resultante solo afecta a los roles anon/authenticated, que hoy no tienen ningun
-- cliente que los use contra esta base (frontend no tiene cliente Supabase propio).

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.descuento_limites_por_cargo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ramos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formas_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_formas_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coberturas_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_coberturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicios_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.descuentos_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recargos_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clausulas_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.franquicia_auto_importacion_directa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasas_capital ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubros_actividad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasas_cobertura_ramo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarifas_generico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recargo_antiguedad_tabla ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correlativos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizacion_variantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizacion_plan_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizacion_coberturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizacion_servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizacion_ajustes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizacion_clausulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizacion_flota_vehiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_kyc ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipos_riesgo_incendio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasas_riesgo_objeto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipos_cambio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubro_actividad_ramo ENABLE ROW LEVEL SECURITY;
