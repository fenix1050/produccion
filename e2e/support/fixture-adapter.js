import bcrypt from 'bcryptjs'

const BREACH_CODE = 'E2E_ISOLATION_BREACH'
const copy = (value) => structuredClone(value)
const number = (value) => (typeof value === 'string' ? Number(value) : value)

function breach(repository, method) {
  const error = new Error(`${BREACH_CODE}: ${repository}.${method} is not handled by fixture data`)
  error.code = BREACH_CODE
  return error
}

function namedRepository(repository, handlers) {
  return new Proxy(handlers, {
    get(target, method) {
      if (typeof method === 'symbol') return target[method]
      return Object.hasOwn(target, method)
        ? target[method]
        : () => {
            throw breach(repository, method)
          }
    },
  })
}

export function createFixtureAdapter(fixtures) {
  const quotes = []
  const planCoberturaReads = []
  const ramosById = new Map(fixtures.ramos.map((row) => [row.id, row]))
  const planesById = new Map(fixtures.planes.map((row) => [row.id, row]))
  const rubrosById = new Map(fixtures.rubros.map((row) => [row.id, row]))
  const catalogoById = new Map(
    Object.values(fixtures.coberturasCatalogo)
      .flat()
      .map((row) => [row.id, row])
  )
  const formasPagoById = new Map(fixtures.formasPago.map((row) => [row.id, row]))
  const pagosPorPlan = new Map()
  const numerosPorRamo = new Map()
  let nextQuoteId = 1
  let nextCoberturaId = 1
  let nextVarianteId = 1
  let nextPlanPagoId = 1

  for (const row of fixtures.planFormasPago) {
    const rows = pagosPorPlan.get(row.plan_id) ?? []
    rows.push({ ...row, formas_pago: formasPagoById.get(row.forma_pago_id) })
    pagosPorPlan.set(row.plan_id, rows)
  }

  const user = {
    ...copy(fixtures.user),
    password_hash: bcrypt.hashSync(fixtures.user.password, 10),
    roles: { nombre: fixtures.user.rol },
  }

  function synthesizeQuote(payload) {
    const ramoId = number(payload.p_ramo_id ?? payload.ramo_id)
    const header = payload.p_cotizacion ?? payload
    const count = (numerosPorRamo.get(ramoId) ?? 0) + 1
    const ramo = ramosById.get(ramoId)
    const prefix = payload.p_prefijo_numero ?? ramo?.codigo ?? ramo?.nombre ?? 'COTIZACION'
    const quoteId = nextQuoteId++
    numerosPorRamo.set(ramoId, count)

    const coberturas = (payload.p_coberturas ?? []).map((row) => {
      const catalogo = catalogoById.get(number(row.cobertura_id))
      return {
        id: nextCoberturaId++,
        cotizacion_id: quoteId,
        cobertura_id: number(row.cobertura_id),
        nombre_snapshot: row.nombre_snapshot ?? catalogo?.nombre ?? null,
        texto_legal_snapshot: row.texto_legal_snapshot ?? catalogo?.texto_legal ?? null,
        texto_exclusiones_snapshot:
          row.texto_exclusiones_snapshot ?? catalogo?.texto_exclusiones ?? null,
        monto: row.monto ?? null,
        franquicia: row.franquicia ?? null,
        tipo_aplicacion: row.tipo_aplicacion ?? null,
        incluida: row.incluida ?? true,
        coberturas_catalogo: catalogo && {
          codigo: catalogo.codigo,
          incluye_en_suma_asegurada_total: catalogo.incluye_en_suma_asegurada_total,
        },
      }
    })
    const variantes = (payload.p_variantes ?? []).map((row) => {
      const varianteId = nextVarianteId++
      return {
        id: varianteId,
        cotizacion_id: quoteId,
        tipo_franquicia: row.tipo_franquicia ?? 'sin_franquicia',
        franquicia_monto: row.franquicia_monto ?? null,
        prima: row.prima ?? 0,
        cotizacion_ajustes: copy(row.ajustes ?? []),
        cotizacion_plan_pago: (row.planes_pago ?? []).map((pago) => ({
          id: nextPlanPagoId++,
          cotizacion_variante_id: varianteId,
          forma_pago_id: number(pago.forma_pago_id),
          cantidad_cuotas: pago.cantidad_cuotas ?? 0,
          rpf_porcentaje: pago.rpf_porcentaje ?? 0,
          rpf_monto: pago.rpf_monto ?? 0,
          iva_monto: pago.iva_monto ?? 0,
          premio_total: pago.premio_total ?? 0,
          monto_inicial: pago.monto_inicial ?? 0,
          monto_cuota: pago.monto_cuota ?? 0,
          formas_pago: formasPagoById.get(number(pago.forma_pago_id)) ?? null,
        })),
      }
    })
    return {
      id: quoteId,
      numero_cotizacion: `${prefix}-${String(count).padStart(4, '0')}`,
      ramo_id: ramoId,
      plan_id: header.plan_id ?? null,
      agente_id: header.agente_id ?? null,
      cliente_nombre: header.cliente_nombre ?? null,
      cliente_contacto: header.cliente_contacto ?? null,
      riesgo_datos: copy(header.riesgo_datos ?? {}),
      capital_asegurado: header.capital_asegurado ?? 0,
      estado: header.estado ?? 'cotizada',
      moneda: header.moneda ?? 'PYG',
      tipo_cambio_snapshot: null,
      tipo_cambio_fuente: null,
      tipo_cambio_fecha: null,
      created_at: '2026-08-19T00:00:00.000Z',
      usuarios: {
        nombre: user.nombre,
        email: user.email,
        telefono: user.telefono,
        roles: { nombre: user.rol },
      },
      cotizacion_coberturas: coberturas,
      cotizacion_variantes: variantes,
    }
  }

  const legacyRamos = [fixtures.mrc.ramo, fixtures.incendio.ramo]
  const legacyCoverages = new Map([
    [10, fixtures.mrc.coverages],
    [20, fixtures.incendio.coverages],
  ])
  const legacyRates = new Map([
    [10, fixtures.mrc.rates],
    [20, fixtures.incendio.rates],
  ])
  const adapter = {
    usuarios: namedRepository('usuarios', {
      async findByEmail(email) {
        return email === user.email ? copy(user) : null
      },
      async findById(id) {
        return number(id) === user.id ? copy(user) : null
      },
      async actualizarUltimaSesion(id) {
        return number(id) === user.id ? copy(user) : null
      },
    }),
    ramos: namedRepository('ramos', {
      async findByCodigo(codigo) {
        return copy(legacyRamos.find((row) => row.codigo === codigo) ?? null)
      },
      async findById(id) {
        return copy(legacyRamos.find((row) => row.id === number(id)) ?? null)
      },
      async findAll() {
        return copy(legacyRamos)
      },
      async findRamosActivos() {
        return copy(fixtures.ramos.filter((row) => row.activo))
      },
      async findAllRamos() {
        return copy(fixtures.ramos)
      },
      async findRamoById(id) {
        return copy(ramosById.get(number(id)) ?? null)
      },
      async findPlanesByRamoId(id) {
        return copy(fixtures.planes.filter((row) => row.ramo_id === number(id) && row.activo))
      },
      async findPlanById(id) {
        return copy(planesById.get(number(id)) ?? null)
      },
      async findCoberturasByPlanId(id) {
        const planId = number(id)
        const rows = fixtures.planCoberturas[planId] ?? []
        planCoberturaReads.push({ planId, rows: copy(rows), stack: new Error().stack })
        return copy(rows)
      },
      async findFormasPagoDelPlan(id) {
        return copy(pagosPorPlan.get(number(id)) ?? [])
      },
      async findClausulasObligatoriasByPlanId() {
        return []
      },
    }),
    coberturas: namedRepository('coberturas', {
      async findByRamoId(id) {
        return copy(legacyCoverages.get(number(id)) ?? [])
      },
      async findRubrosActividad(id) {
        return copy(
          (fixtures.rubrosPorRamo[number(id)] ?? []).map((rubroId) => rubrosById.get(rubroId))
        )
      },
      async findRubroPorNombre(nombre) {
        return copy(fixtures.rubros.find((row) => row.nombre === nombre) ?? null)
      },
      async findCoberturasCatalogoByRamoId(id) {
        return copy(fixtures.coberturasCatalogo[number(id)] ?? [])
      },
      async findTasasCoberturaRamo(id) {
        return copy(fixtures.tasasCoberturaRamo.filter((row) => row.ramo_id === number(id)))
      },
      async findTasasRiesgoObjeto(id, nombre) {
        const row = fixtures.tasasObjetoRiesgo[number(id)]
        return row?.tipo_riesgo.nombre === nombre ? copy(row) : null
      },
    }),
    cotizaciones: namedRepository('cotizaciones', {
      async crearCotizacionAtomica(payload) {
        const quote = synthesizeQuote(payload)
        quotes.push(quote)
        return quote.id
      },
      async findById(id) {
        return copy(quotes.find((row) => row.id === number(id)) ?? null)
      },
      async findCotizacionById(id) {
        return copy(quotes.find((row) => row.id === number(id)) ?? null)
      },
      async findCotizaciones() {
        return copy({ data: quotes, count: quotes.length })
      },
    }),
    tasas: namedRepository('tasas', {
      async findByRamoId(id) {
        return copy(legacyRates.get(number(id)) ?? [])
      },
    }),
    roles: namedRepository('roles', {
      async findByCodigo(codigo) {
        return codigo === user.rol ? copy({ codigo, nombre: 'Agent' }) : null
      },
    }),
    tiposCambio: namedRepository('tipos-cambio', {
      async findCurrent() {
        return { moneda: 'PYG', valor: 1 }
      },
    }),
  }
  adapter['tipos-cambio'] = adapter.tiposCambio
  adapter.quotes = quotes
  adapter.planCoberturaReads = planCoberturaReads
  return adapter
}
