import { createRequire } from 'node:module'
import path from 'node:path'
import { mock } from 'node:test'
import { fileURLToPath } from 'node:url'

import express from 'express'

import { closeBrowser } from '../../backend/src/templates/oferta/pdf-utils.js'

import { createFixtureAdapter } from './fixture-adapter.js'
import { assertIsolatedEnvironment, installLoopbackGuards } from './isolation.js'
import { cleanupSuccessfulArtifacts, runProcess } from './playwright-runner.js'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')
const backendDir = path.join(repoRoot, 'backend')
const frontendDir = path.join(repoRoot, 'frontend')
const backendAppUrl = new URL('../../backend/src/app.js', import.meta.url)
const mockedSpecifiers = new Set()
let activeAdapter = null

const REPOSITORY_METHODS = {
  usuarios: [
    'findByEmail',
    'findById',
    'actualizarUltimaSesion',
    'findAll',
    'crear',
    'actualizar',
    'actualizarPassword',
    'incrementarTokenVersion',
    'eliminar',
  ],
  ramos: [
    'findRamosActivos',
    'findRamoById',
    'findAllRamos',
    'actualizarRamo',
    'countPlanesByRamoId',
    'countCotizacionesByRamoId',
    'eliminarRamo',
    'findPlanesByRamoId',
    'findPlanById',
    'findCoberturasByPlanId',
    'findTasaCapital',
    'findFormasPagoDelPlan',
    'findClausulasObligatoriasByPlanId',
    'findCurvaRpf',
    'findFormasPagoDelPlanTodas',
  ],
  coberturas: [
    'findRubrosActividad',
    'actualizarRubroActividad',
    'findRubroPorNombre',
    'findCoberturasCatalogoByRamoId',
    'findTasasCoberturaRamo',
    'findTasasRiesgoObjeto',
    'findTarifasGenericoByPlanId',
    'findPlanCoberturasByPlanId',
    'crearPlanCobertura',
    'actualizarPlanCobertura',
    'eliminarPlanCobertura',
    'findTasasCoberturaRamoConHistorial',
    'eliminarTasaCoberturaRamo',
    'crearTasaCoberturaRamo',
  ],
  cotizaciones: [
    'crearCotizacionAtomica',
    'actualizarCotizacionAtomica',
    'findCotizacionById',
    'findCotizaciones',
  ],
  tasas: [
    'findPlanByCodigoTasa',
    'reemplazarTasasCapitalDePlan',
    'findAllPlanes',
    'findPlanById',
    'actualizarPlan',
    'eliminarPlan',
    'findPlanFormaPagoById',
    'actualizarPlanFormaPago',
    'upsertCurvaRpf',
  ],
  roles: ['findAll', 'findById', 'crear', 'actualizar', 'eliminar'],
  'tipos-cambio': ['findUltimoVigente', 'insertTipoCambio'],
}

function mockModuleOnce(specifier, exports) {
  if (mockedSpecifiers.has(specifier)) return
  mock.module(specifier, { cache: true, exports })
  mockedSpecifiers.add(specifier)
}

function repositoryExports(repository, methods) {
  return Object.fromEntries(
    methods.map((method) => [
      method,
      (...args) => {
        if (!activeAdapter)
          throw new Error(`E2E_ISOLATION_BREACH: ${repository}.${method} called without a fixture`)
        return activeAdapter[repository][method](...args)
      },
    ])
  )
}

function mockRepositories() {
  const repositories = {
    'usuarios.repository.js': 'usuarios',
    'ramos.repository.js': 'ramos',
    'coberturas.repository.js': 'coberturas',
    'cotizaciones.repository.js': 'cotizaciones',
    'tasas.repository.js': 'tasas',
    'roles.repository.js': 'roles',
    'tipos-cambio.repository.js': 'tipos-cambio',
  }
  for (const [fileName, repository] of Object.entries(repositories)) {
    mockModuleOnce(
      new URL(`../../backend/src/repositories/${fileName}`, import.meta.url).href,
      repositoryExports(repository, REPOSITORY_METHODS[repository])
    )
  }
  mockModuleOnce(new URL('../../backend/src/config/supabase.js', import.meta.url).href, {
    supabase: {},
  })
}

function listenLoopback(server, label, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => finish(new Error(`${label} did not start within ${timeoutMs}ms`)),
      timeoutMs
    )
    function finish(error) {
      clearTimeout(timeout)
      server.off('listening', onListening)
      server.off('error', onError)
      if (error) reject(error)
      else resolve()
    }
    function onListening() {
      finish()
    }
    function onError(error) {
      finish(error)
    }
    server.once('listening', onListening)
    server.once('error', onError)
  })
}

async function closeServer(server) {
  if (!server?.listening) return
  server.closeAllConnections?.()
  await new Promise((resolve) => server.close(resolve))
}

async function assertHttpOk(url, label) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error(`${label} readiness check failed with HTTP ${response.status}`)
}

function saveEnvironment() {
  return Object.fromEntries(
    ['E2E_SMOKE', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'FRONTEND_URL', 'JWT_SECRET'].map(
      (key) => [key, process.env[key]]
    )
  )
}

function restoreEnvironment(original) {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

export async function launchGREEN(
  fixtures,
  testFn,
  { apiPort = 0, frontendUrl = 'http://localhost:3000' } = {}
) {
  assertIsolatedEnvironment(process.env)
  const originalEnv = saveEnvironment()
  let guards
  let server
  try {
    Object.assign(process.env, {
      E2E_SMOKE: '1',
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_SERVICE_KEY: 'dummy-key',
      FRONTEND_URL: frontendUrl,
      JWT_SECRET: 'smoke-test-secret',
    })
    guards = installLoopbackGuards()
    mockRepositories()
    activeAdapter = createFixtureAdapter(fixtures)

    const { createApp } = await import(backendAppUrl.href)
    server = createApp().listen({ port: apiPort, host: '127.0.0.1' })
    await listenLoopback(server, 'Smoke API')
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : null
    if (!port) throw new Error('Smoke API did not expose a loopback port')
    await assertHttpOk(`http://127.0.0.1:${port}/health`, 'Smoke API')
    return await testFn({ port, adapter: activeAdapter })
  } finally {
    try {
      await closeBrowser()
    } finally {
      try {
        await closeServer(server)
      } finally {
        activeAdapter = null
        guards?.restore()
        restoreEnvironment(originalEnv)
      }
    }
  }
}

function isDirectRun(metaUrl) {
  return path.resolve(process.argv[1] ?? '') === fileURLToPath(metaUrl)
}

async function runSmokeLauncher() {
  const { FIXTURES } = await import('../fixtures/data.js')
  const frontendPort = 5100
  const frontendUrl = `http://127.0.0.1:${frontendPort}`
  const apiUrl = 'http://127.0.0.1:3100/api'
  let staticServer
  let adapter
  let exitCode = 1

  try {
    exitCode = await launchGREEN(
      FIXTURES,
      async ({ adapter: fixtureAdapter }) => {
        adapter = fixtureAdapter
        const frontend = express()
        frontend.use(express.static(frontendDir))
        staticServer = frontend.listen(frontendPort, '127.0.0.1')
        await listenLoopback(staticServer, 'Smoke frontend')
        await assertHttpOk(`${frontendUrl}/login/`, 'Smoke frontend')

        const cli = require.resolve('@playwright/test/cli', { paths: [backendDir] })
        const result = await runProcess(
          process.execPath,
          [
            cli,
            'test',
            '--config',
            path.join(repoRoot, 'playwright.config.js'),
            'e2e/smoke.spec.js',
          ],
          {
            cwd: repoRoot,
            env: { ...process.env, E2E_BASE_URL: frontendUrl, E2E_API_URL: apiUrl },
          }
        )
        await cleanupSuccessfulArtifacts(result, path.join(repoRoot, 'test-results'))
        return result
      },
      { apiPort: 3100, frontendUrl }
    )
  } catch (error) {
    console.error(`[e2e:smoke] Launcher failed: ${error.message}`)
  } finally {
    await closeServer(staticServer)
  }

  const reads = adapter?.planCoberturaReads?.filter((read) => read.planId === 101) ?? []
  const sublimits = new Set(
    reads.flatMap((read) =>
      read.rows.map((row) => `${row.coberturas_catalogo?.codigo}:${row.monto}`)
    )
  )
  const mrcPlanCoverageRead =
    reads.some((read) => read.stack?.includes('generarPdfOferta')) &&
    [
      'sublimite_danos_agua:2500000',
      'sublimite_equipos_electronicos:5000000',
      'sublimite_granizo:5000000',
    ].every((value) => sublimits.has(value))
  const quotes = adapter?.quotes?.length ?? 0
  console.log(
    `[e2e:smoke] Playwright exit=${exitCode} | quotes=${quotes} (expected: 2) | MRC PDF plan coverage read=${mrcPlanCoverageRead}`
  )
  if (exitCode !== 0 || quotes !== 2 || !mrcPlanCoverageRead) process.exitCode = 1
}

if (isDirectRun(import.meta.url)) {
  runSmokeLauncher().catch((error) => {
    console.error(`[e2e:smoke] Unhandled launcher failure: ${error.stack || error.message}`)
    process.exitCode = 1
  })
}
