const BREACH_CODE = 'E2E_ISOLATION_BREACH'

function deepCopy(value) {
  return structuredClone(value)
}

function isolationBreach(repository, method) {
  const error = new Error(`${BREACH_CODE}: ${repository}.${method} is not handled by fixture data`)
  error.code = BREACH_CODE
  return error
}

function namedRepository(repository, handlers) {
  return new Proxy(handlers, {
    get(target, method) {
      if (typeof method === 'symbol') return target[method]
      if (method in target) return target[method]
      return () => {
        throw isolationBreach(repository, method)
      }
    },
  })
}

export function createFixtureAdapter(fixtures) {
  const quotes = []
  let nextQuoteId = 1
  const ramos = [fixtures.mrc.ramo, fixtures.incendio.ramo]
  const coveragesByRamo = new Map([
    [fixtures.mrc.ramo.id, fixtures.mrc.coverages],
    [fixtures.incendio.ramo.id, fixtures.incendio.coverages],
  ])
  const ratesByRamo = new Map([
    [fixtures.mrc.ramo.id, fixtures.mrc.rates],
    [fixtures.incendio.ramo.id, fixtures.incendio.rates],
  ])

  const adapter = {
    usuarios: namedRepository('usuarios', {
      async findByEmail(email) {
        return email === fixtures.user.email ? deepCopy(fixtures.user) : null
      },
      async findById(id) {
        return id === fixtures.user.id ? deepCopy(fixtures.user) : null
      },
    }),
    ramos: namedRepository('ramos', {
      async findByCodigo(codigo) {
        return deepCopy(ramos.find((ramo) => ramo.codigo === codigo) ?? null)
      },
      async findById(id) {
        return deepCopy(ramos.find((ramo) => ramo.id === id) ?? null)
      },
      async findAll() {
        return deepCopy(ramos)
      },
    }),
    coberturas: namedRepository('coberturas', {
      async findByRamoId(ramoId) {
        return deepCopy(coveragesByRamo.get(ramoId) ?? [])
      },
    }),
    cotizaciones: namedRepository('cotizaciones', {
      async crearCotizacionAtomica(payload) {
        const quote = {
          id: nextQuoteId++,
          ...deepCopy(payload),
          riesgo_datos: deepCopy(payload.riesgo_datos ?? {}),
        }
        quotes.push(quote)
        return deepCopy(quote)
      },
      async findById(id) {
        return deepCopy(quotes.find((quote) => quote.id === id) ?? null)
      },
    }),
    tasas: namedRepository('tasas', {
      async findByRamoId(ramoId) {
        return deepCopy(ratesByRamo.get(ramoId) ?? [])
      },
    }),
    roles: namedRepository('roles', {
      async findByCodigo(codigo) {
        return codigo === fixtures.user.rol ? deepCopy({ codigo, nombre: 'Agent' }) : null
      },
    }),
    tiposCambio: namedRepository('tipos-cambio', {
      async findCurrent() {
        return deepCopy({ moneda: 'PYG', valor: 1 })
      },
    }),
  }

  adapter['tipos-cambio'] = adapter.tiposCambio
  return adapter
}
