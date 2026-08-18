function freezeFixture(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nestedValue of Object.values(value)) freezeFixture(nestedValue)
    Object.freeze(value)
  }
  return value
}

export const FIXTURES = freezeFixture({
  user: {
    id: 1,
    nombre: 'Smoke Test Agent',
    email: 'smoke.agent@example.test',
    password: 'fixture-only-password',
    rol: 'agente',
    activo: true,
  },
  mrc: {
    ramo: { id: 10, codigo: 'mrc', nombre: 'Multirriesgo Comercio', activo: true },
    plan: { id: 101, ramo_id: 10, nombre: 'MRC Fixture Plan', prima_tecnica_minima: 409091 },
    rates: [{ cobertura_codigo: 'incendio_edificio', tasa_valor: 1 }],
    coverages: [{ id: 1001, codigo: 'incendio_edificio', nombre: 'Building Fire' }],
    payment: { codigo: 'contado', tasa_rpf: 0 },
    request: { cliente_nombre: 'MRC Fixture Client', riesgo_datos: { tipo_riesgo: 'OFFICE' } },
    invalidRequest: { cliente_nombre: '', riesgo_datos: {} },
  },
  incendio: {
    ramo: { id: 20, codigo: 'incendio', nombre: 'Incendio', activo: true },
    plan: { id: 201, ramo_id: 20, nombre: 'Incendio Fixture Plan', prima_tecnica_minima: 409091 },
    rates: [{ cobertura_codigo: 'incendio_contenido', tasa_valor: 2 }],
    coverages: [{ id: 2001, codigo: 'incendio_contenido', nombre: 'Contents Fire' }],
    payment: { codigo: 'contado', tasa_rpf: 0 },
    request: {
      cliente_nombre: 'Incendio Fixture Client',
      riesgo_datos: { tipo_riesgo: 'WAREHOUSE' },
    },
    invalidRequest: { cliente_nombre: '', riesgo_datos: {} },
  },
})
