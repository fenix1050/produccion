import * as coberturasRepository from '../repositories/coberturas.repository.js'
import * as ramosRepository from '../repositories/ramos.repository.js'
import { getSchemaCotizar } from '../schemas/index.js'

import { withCache } from './cache.js'
import { normalizarFranquiciasMrc } from './mrc-franquicia-authorization.service.js'
import { resolverUmbralInspeccion } from './umbral-inspeccion.service.js'

export async function validarYResolverContexto(body, usuario) {
  const plan = await ramosRepository.findPlanById(body.plan_id)
  // soloActivos: true — no se debe poder cotizar/editar sobre un ramo dado de baja
  // (mismo comportamiento que el `.find()` sobre `findRamosActivos()` que reemplaza).
  const ramo = await ramosRepository.findRamoById(plan.ramo_id, { soloActivos: true })

  const schema = getSchemaCotizar(ramo.calculador)
  const datosValidados = schema.parse(body)

  const planCoberturas =
    ramo.calculador === 'mrc' ? await ramosRepository.findCoberturasByPlanId(plan.id) : null

  return {
    plan,
    ramo,
    datosValidados:
      ramo.calculador === 'mrc'
        ? normalizarFranquiciasMrc(datosValidados, usuario, planCoberturas)
        : datosValidados,
  }
}

/**
 * Resuelve, ANTES de invocar al calculador, todo el dato que hoy vive detrás de un repository
 * (plan/tasas/catálogo/rubro/tarifas) — así los calculators quedan puros (sin `await` a ningún
 * repository) y respetan la capa `routes → controllers → services → repositories`. Un `switch`
 * por `ramo.calculador` porque cada ramo necesita datos distintos.
 *
 * Para MRC/Incendio se trae siempre `tasasRamo` (incluso para "Edificio y Contenido", que antes
 * no la pedía) y se intenta resolver `rubro` siempre que venga `riesgo_datos.rubro_actividad`
 * (incluso para "Maquinaria Básico", que antes no lo pedía en absoluto). Es un overfetch mínimo
 * aceptado a propósito — una query de más, sin impacto en el resultado numérico — a cambio de no
 * duplicar acá la lógica de "es Maquinaria Básico" que ya vive en incendio.calculator.js.
 */
// Catálogo/tasas/rubro son datos que solo cambian cuando un admin edita coberturas, tasas
// o rubros desde el panel admin (ver invalidarCacheCatalogos en esos endpoints) — el
// cotizador los re-pide en cada preview mientras el agente edita el formulario, así que se
// pasan por el caché en memoria de cache.js en vez de pegarle a Supabase en cada tecla.
export async function resolverContextoRepositorios(ramo, plan, riesgoDatos, capital, moneda) {
  switch (ramo.calculador) {
    case 'auto':
      return { tasaCapital: await ramosRepository.findTasaCapital(plan.id, capital) }
    case 'mrc':
    case 'incendio': {
      const [rubro, catalogoRamo, tasasRamo] = await Promise.all([
        riesgoDatos?.rubro_actividad
          ? withCache(`rubro:${riesgoDatos.rubro_actividad}`, () =>
              coberturasRepository.findRubroPorNombre(riesgoDatos.rubro_actividad)
            )
          : null,
        withCache(`catalogoRamo:${plan.ramo_id}`, () =>
          coberturasRepository.findCoberturasCatalogoByRamoId(plan.ramo_id)
        ),
        withCache(`tasasRamo:${plan.ramo_id}`, () =>
          coberturasRepository.findTasasCoberturaRamo(plan.ramo_id)
        ),
      ])

      // Mecánica "objeto_riesgo" (Incendio Hipotecario / con-sin Inspección, migración 035/036):
      // además de lo de arriba, resuelve la tasa por objeto de riesgo (findTasasRiesgoObjeto) y
      // el umbral de inspección — ninguno de los dos aplica a MRC ni a las otras 2 mecánicas de
      // Incendio, así que quedan afuera del Promise.all de arriba (evita I/O innecesario).
      if (ramo.calculador === 'incendio' && plan.tipo_mecanica === 'objeto_riesgo') {
        const tipoRiesgoNombre = riesgoDatos?.rubro_actividad
        const [tasasObjetoRiesgo, umbralInspeccion] = await Promise.all([
          tipoRiesgoNombre
            ? withCache(`tasasObjeto:${plan.ramo_id}:${tipoRiesgoNombre}:${plan.id}`, () =>
                coberturasRepository.findTasasRiesgoObjeto(plan.ramo_id, tipoRiesgoNombre, plan.id)
              )
            : null,
          resolverUmbralInspeccion(plan, moneda),
        ])
        return { rubro, catalogoRamo, tasasRamo, tasasObjetoRiesgo, umbralInspeccion }
      }

      return { rubro, catalogoRamo, tasasRamo }
    }
    case 'vida-ap': {
      const [tarifas, catalogoRamo] = await Promise.all([
        coberturasRepository.findTarifasGenericoByPlanId(plan.id),
        withCache(`catalogoRamo:${plan.ramo_id}`, () =>
          coberturasRepository.findCoberturasCatalogoByRamoId(plan.ramo_id)
        ),
      ])
      return { tarifas, catalogoRamo }
    }
    default:
      return {}
  }
}
