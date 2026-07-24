import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMrcOfertaPages } from './mrc.js';

// Regresión del bug de auditoría: la Carta Oferta de MRC hardcodeaba los montos de sub-límites
// fijos (equipos electrónicos/agua/murallas/granizo) en vez de leerlos de `plan_coberturas`, el
// mismo catálogo que edita el panel admin. Si un admin cambiaba un monto, el PDF seguía
// mostrando el valor viejo. Este test arma un `planCoberturas` con montos DISTINTOS a los que
// estaban hardcodeados y verifica que el HTML generado refleje los montos nuevos, no los viejos.

const COTIZACION_BASE = {
  numero_cotizacion: 'MRC-0001',
  cliente_nombre: 'Cliente de Prueba',
  fecha: '2026-07-01',
  vigencia_dias: 30,
  riesgo_datos: { rubro_actividad: 'Comercio', direccion: 'Calle Falsa 123', ciudad: 'Asunción' },
  cotizacion_coberturas: [],
  cotizacion_variantes: [],
  usuarios: { nombre: 'Agente Prueba', email: 'agente@tajy.com.py' },
};

const PLAN_BASE = { nombre: 'MULTIRRIESGO COMERCIO - NORMAL' };
const RAMO_BASE = { nombre: 'mrc', nombre_display: 'Multirriesgo Comercio', calculador: 'mrc' };

function planCoberturaFija(codigo, monto) {
  return {
    incluida_por_defecto: true,
    monto,
    coberturas_catalogo: { codigo },
  };
}

test('buildMrcOfertaPages usa los montos vigentes de planCoberturas, no valores hardcodeados', () => {
  const planCoberturas = [
    planCoberturaFija('sublimite_equipos_electronicos', 9000000),
    planCoberturaFija('sublimite_danos_agua', 2500000),
    planCoberturaFija('sublimite_murallas_cercos', 1000000),
    planCoberturaFija('sublimite_granizo', 5000000),
  ];

  const { paginaDosBalanceada } = buildMrcOfertaPages({
    cotizacion: COTIZACION_BASE,
    plan: PLAN_BASE,
    ramo: RAMO_BASE,
    planCoberturas,
  });

  assert.match(paginaDosBalanceada, /Equipos Electrónicos: 9\.000\.000/);
  assert.doesNotMatch(paginaDosBalanceada, /Equipos Electrónicos: 5\.000\.000/);
});

test('buildMrcOfertaPages incluye sublimite_murallas_cercos (bug: faltaba en el array hardcodeado)', () => {
  const planCoberturas = [
    planCoberturaFija('sublimite_equipos_electronicos', 5000000),
    planCoberturaFija('sublimite_danos_agua', 2500000),
    planCoberturaFija('sublimite_murallas_cercos', 1000000),
    planCoberturaFija('sublimite_granizo', 5000000),
  ];

  const cotizacionConSublimiteMurallas = {
    ...COTIZACION_BASE,
    cotizacion_coberturas: [
      {
        tipo_aplicacion: 'sublimite',
        monto: 1000000,
        franquicia: null,
        nombre_snapshot: 'Daños a Murallas, Cercos Perimetrales y Rejas',
        coberturas_catalogo: { codigo: 'sublimite_murallas_cercos' },
      },
    ],
  };

  const { paginaUno } = buildMrcOfertaPages({
    cotizacion: cotizacionConSublimiteMurallas,
    plan: PLAN_BASE,
    ramo: RAMO_BASE,
    planCoberturas,
  });

  // El sub-límite fijo de murallas no debe aparecer como fila cotizable en "Sumas Aseguradas":
  // ya se muestra en "Distribución del capital asegurado". Antes del fix, al faltar en el
  // array hardcodeado, sí aparecía ahí (y cobraba franquicia indebidamente).
  assert.doesNotMatch(paginaUno, /Daños a Murallas, Cercos Perimetrales y Rejas/);
});

test('buildMrcOfertaPages no rompe si planCoberturas no trae un código esperado', () => {
  const { paginaDosBalanceada } = buildMrcOfertaPages({
    cotizacion: COTIZACION_BASE,
    plan: PLAN_BASE,
    ramo: RAMO_BASE,
    planCoberturas: [],
  });

  assert.match(paginaDosBalanceada, /Incendio: Mercaderías 50% \/ Contenido General 50%/);
  assert.doesNotMatch(paginaDosBalanceada, /undefined/);
});

test('buildMrcOfertaPages no rompe si planCoberturas es undefined', () => {
  assert.doesNotThrow(() => {
    buildMrcOfertaPages({ cotizacion: COTIZACION_BASE, plan: PLAN_BASE, ramo: RAMO_BASE, planCoberturas: undefined });
  });
});
