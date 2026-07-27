import assert from 'node:assert/strict'
import { test } from 'node:test'

// Unit test de `findClausulasObligatoriasByPlanId` — cierre del gap detectado por sdd-verify
// en el cambio "incendio-3-planes-y-moneda": la migración 038 agregó `clausulas_catalogo.plan_id`
// (nullable) y cargó las 5 cláusulas legales obligatorias de "INCENDIO HIPOTECARIO" con ese
// `plan_id` seteado, pero ningún repository las leía todavía. Mismo patrón de mock de Supabase
// (builder mínimo, thenable) que coberturas.repository.test.js.
function mockearSupabase(t, respuesta) {
  t.mock.module('../config/supabase.js', {
    exports: {
      supabase: {
        from() {
          const builder = {
            select: () => builder,
            eq: () => builder,
            order: () => builder,
            then: (resolve, reject) => Promise.resolve(respuesta).then(resolve, reject),
          }
          return builder
        },
      },
    },
  })
}

test('findClausulasObligatoriasByPlanId: devuelve las 5 cláusulas obligatorias del plan Hipotecario', async (t) => {
  const clausulas = [
    { id: 1, plan_id: 10, nombre: 'Primer Riesgo Absoluto', texto_legal: '...', activo: true },
    {
      id: 2,
      plan_id: 10,
      nombre: 'Exigencia de Edificio Terminado',
      texto_legal: '...',
      activo: true,
    },
    {
      id: 3,
      plan_id: 10,
      nombre: 'Exclusión de Fenómenos Naturales sin los 4 Costados',
      texto_legal: '...',
      activo: true,
    },
    { id: 4, plan_id: 10, nombre: 'Informe de Tasación', texto_legal: '...', activo: true },
    {
      id: 5,
      plan_id: 10,
      nombre: 'Mantenimiento Eléctrico y Aviso Inmediato a la Compañía',
      texto_legal: '...',
      activo: true,
    },
  ]
  mockearSupabase(t, { data: clausulas, error: null })

  const { findClausulasObligatoriasByPlanId } =
    await import('./ramos.repository.js?case=hipotecario-5-clausulas')
  const resultado = await findClausulasObligatoriasByPlanId(10)

  assert.equal(resultado.length, 5)
  assert.deepEqual(
    resultado.map((c) => c.nombre),
    clausulas.map((c) => c.nombre)
  )
})

test('findClausulasObligatoriasByPlanId: plan sin cláusulas propias devuelve lista vacía', async (t) => {
  mockearSupabase(t, { data: [], error: null })

  const { findClausulasObligatoriasByPlanId } =
    await import('./ramos.repository.js?case=sin-clausulas-propias')
  const resultado = await findClausulasObligatoriasByPlanId(999)

  assert.deepEqual(resultado, [])
})

test('findClausulasObligatoriasByPlanId: propaga el error de Supabase', async (t) => {
  mockearSupabase(t, { data: null, error: new Error('boom') })

  const { findClausulasObligatoriasByPlanId } =
    await import('./ramos.repository.js?case=error-supabase')

  await assert.rejects(() => findClausulasObligatoriasByPlanId(1), /boom/)
})
