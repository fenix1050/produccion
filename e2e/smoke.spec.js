import { expect, test } from '@playwright/test'

import { FIXTURES } from './fixtures/data.js'

const API_BASE_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:3100/api'
const FRONTEND_BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5100'
const PDF_SIGNATURE = [37, 80, 68, 70, 45]

async function browserRequest(page, path, { method = 'GET', body, csrf = true } = {}) {
  return page.evaluate(
    async ({ base, requestPath, requestMethod, requestBody, includeCsrf }) => {
      const headers = requestBody === undefined ? {} : { 'Content-Type': 'application/json' }
      const token = globalThis.document.cookie.match(/(?:^|; )tajy_csrf=([^;]*)/)
      if (includeCsrf && token) headers['X-CSRF-Token'] = decodeURIComponent(token[1])
      const response = await fetch(`${base}${requestPath}`, {
        method: requestMethod,
        credentials: 'include',
        headers,
        ...(requestBody === undefined ? {} : { body: JSON.stringify(requestBody) }),
      })
      const contentType = response.headers.get('content-type') ?? ''
      if (contentType.includes('application/json'))
        return { status: response.status, json: await response.json() }
      const bytes = new Uint8Array(await response.arrayBuffer())
      return {
        status: response.status,
        contentType,
        byteLength: bytes.length,
        prefix: [...bytes.slice(0, 5)],
      }
    },
    {
      base: API_BASE_URL,
      requestPath: path,
      requestMethod: method,
      requestBody: body,
      includeCsrf: csrf,
    }
  )
}

async function fillMrc(page) {
  const addCoberturaLinea = page.locator('[data-action="add-cobertura-linea"]')
  await expect(addCoberturaLinea).toBeAttached()
  await expect(addCoberturaLinea).toBeEnabled()
  await page.locator('#campo-cliente-nombre').fill(FIXTURES.request.mrc.cliente_nombre)
  await page.locator('#campo-cedula').fill('1234567')
  await page.locator('#campo-direccion').fill('Av. Mariscal López 1234')
  await page.locator('[data-field="rubroActividad"]').selectOption('OFFICE')
  await page.locator('[data-field="ciudad"]').selectOption('Asunción')
  await page.locator('#campo-capital-edificio').fill('100000000')
  await page.locator('#campo-capital-contenido').fill('50000000')
  await addCoberturaLinea.click()
  await page.locator('[data-linea-field="codigo"]').selectOption('robo_contenido')
  const preview = page.waitForResponse((response) => {
    if (
      !response.url().endsWith('/api/cotizaciones/calcular') ||
      response.request().method() !== 'POST'
    ) {
      return false
    }

    const body = response.request().postDataJSON()
    return (
      body.cliente_nombre === FIXTURES.request.mrc.cliente_nombre &&
      body.riesgo_datos?.cedula === '1234567' &&
      body.riesgo_datos?.direccion === 'Av. Mariscal López 1234' &&
      body.riesgo_datos?.rubro_actividad === 'OFFICE' &&
      body.riesgo_datos?.ciudad === 'Asunción' &&
      body.riesgo_datos?.capital_edificio === 100000000 &&
      body.riesgo_datos?.capital_contenido === 50000000 &&
      body.riesgo_datos?.coberturas_adicionales?.some(
        (cobertura) =>
          cobertura.codigo === 'robo_contenido' && cobertura.suma_asegurada === 10000000
      )
    )
  })
  await page.locator('[data-linea-field="sumaAsegurada"]').fill('10000000')
  expect((await preview).status()).toBe(200)
  await expect(page.locator('.live-summary__price')).toContainText('495.000')
}

test.describe.serial('Isolated MRC and Incendio smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (url.pathname === '/shared/config.js')
        return route.fulfill({
          contentType: 'application/javascript',
          body: `window.API_BASE_URL = ${JSON.stringify(API_BASE_URL)}`,
        })
      return ['127.0.0.1', 'localhost', '::1'].includes(url.hostname) ||
        ['blob:', 'data:'].includes(url.protocol)
        ? route.continue()
        : route.abort('blockedbyclient')
    })
  })

  test('login, MRC PDF, CSRF, Incendio API, and invalid boundaries', async ({ page, context }) => {
    await page.goto(`${FRONTEND_BASE_URL}/login/`)
    await page.locator('#email').fill(FIXTURES.user.email)
    await page.locator('#password').fill(FIXTURES.user.password)
    const [login] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/api/auth/login')),
      page.waitForURL(/\/bienvenida\/$/),
      page.locator('.login-submit').click(),
    ])
    expect(login.status()).toBe(200)
    const cookies = await context.cookies()
    expect(cookies.find((cookie) => cookie.name === 'tajy_session')?.httpOnly).toBe(true)
    expect(cookies.find((cookie) => cookie.name === 'tajy_csrf')?.httpOnly).toBe(false)

    await page.locator('[data-action="ir-cotizar"]').click()
    await Promise.all([
      page.waitForURL(/\/cotizar\/\?ramo=mrc/),
      page.locator('[data-action="select-ramo"][data-ramo="mrc"]').click(),
    ])
    await expect(page.locator('#campo-capital-edificio')).toBeVisible()
    await fillMrc(page)
    const planCoberturas = await browserRequest(page, '/planes/101/coberturas')
    expect(
      planCoberturas.json
        .filter((row) => row.coberturas_catalogo.categoria === 'Sublímites')
        .map((row) => [row.coberturas_catalogo.codigo, row.monto])
    ).toEqual([
      ['sublimite_danos_agua', 2500000],
      ['sublimite_equipos_electronicos', 5000000],
      ['sublimite_granizo', 5000000],
    ])
    await page.locator('#btn-ver-detalle').click()
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/cotizaciones') && response.request().method() === 'POST'
    )
    const pdf = page.waitForResponse((response) => response.url().includes('/pdf-oferta'), {
      timeout: 45000,
    })
    await page.locator('[data-action="emitir-carta"]').click()
    const createResponse = await created
    expect(createResponse.status()).toBe(201)
    const mrc = await createResponse.json()
    expect((await pdf).headers()['content-type']).toContain('application/pdf')
    const mrcPdf = await browserRequest(page, `/cotizaciones/${mrc.id}/pdf-oferta`)
    expect(mrcPdf).toMatchObject({ status: 200, prefix: PDF_SIGNATURE })
    expect(mrcPdf.contentType).toContain('application/pdf')
    expect(mrcPdf.byteLength).toBeGreaterThan(1024)

    const csrf = await browserRequest(page, '/cotizaciones/calcular', {
      method: 'POST',
      body: FIXTURES.request.incendio,
      csrf: false,
    })
    expect(csrf).toMatchObject({ status: 403, json: { error: 'Token CSRF inválido o ausente' } })
    const incendioPreview = await browserRequest(page, '/cotizaciones/calcular', {
      method: 'POST',
      body: FIXTURES.request.incendio,
    })
    expect(incendioPreview.status).toBe(200)
    const incendio = await browserRequest(page, '/cotizaciones', {
      method: 'POST',
      body: FIXTURES.request.incendio,
    })
    expect(incendio.status).toBe(201)
    const incendioPdf = await browserRequest(page, `/cotizaciones/${incendio.json.id}/pdf-oferta`)
    expect(incendioPdf).toMatchObject({ status: 200, prefix: PDF_SIGNATURE })
    expect(incendioPdf.contentType).toContain('application/pdf')
    expect(incendioPdf.byteLength).toBeGreaterThan(1024)

    await page.goto(`${FRONTEND_BASE_URL}/cotizar/?ramo=mrc`)
    await fillMrc(page)
    const forbidden = []
    const capture = (request) => {
      const pathname = new URL(request.url()).pathname
      if (
        pathname === '/api/cotizaciones/calcular' ||
        pathname === '/api/cotizaciones' ||
        pathname.includes('/pdf-oferta')
      )
        forbidden.push(pathname)
    }
    page.on('request', capture)
    try {
      await page.locator('#campo-capital-edificio').fill('')
      await page.locator('#campo-capital-contenido').fill('')
      await expect(page.locator('#btn-ver-detalle')).toHaveAttribute('aria-disabled', 'true')
      await page.locator('#btn-ver-detalle').click({ force: true })
      await page.waitForTimeout(750)
      await expect(page.locator('[data-action="emitir-carta"]')).toHaveCount(0)
    } finally {
      page.off('request', capture)
    }
    expect(forbidden).toEqual([])

    const invalidTraffic = []
    const captureInvalid = (request) => invalidTraffic.push(new URL(request.url()).pathname)
    page.on('request', captureInvalid)
    const invalidIncendio = {
      ...FIXTURES.request.incendio,
      capital_asegurado: 0,
      riesgo_datos: {
        ...FIXTURES.request.incendio.riesgo_datos,
        capital_edificio: 0,
      },
    }
    const invalid = await browserRequest(page, '/cotizaciones/calcular', {
      method: 'POST',
      body: invalidIncendio,
    })
    page.off('request', captureInvalid)
    expect(invalid.status).toBe(422)
    expect(invalidTraffic).toEqual(['/api/cotizaciones/calcular'])
  })
})
