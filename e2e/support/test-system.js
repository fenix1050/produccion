import { createFixtureAdapter } from './fixture-adapter.js'
import { installLoopbackGuards, assertIsolatedEnvironment } from './isolation.js'

/**
 * GREEN Launcher for E2E Smoke Tests.
 *
 * This launcher ensures that the backend is started in a strictly isolated
 * environment, with repositories mocked by a fixture adapter and network
 * traffic restricted to loopback interfaces.
 *
 * @param {Object} fixtures - The set of fixture data to load into the adapter.
 * @param {Function} testFn - The test function to execute. Receives { port, adapter }.
 * @returns {Promise<void>}
 */
export async function launchGREEN(fixtures, testFn) {
  const originalSmoke = process.env.E2E_SMOKE
  const originalUrl = process.env.SUPABASE_URL
  const originalKey = process.env.SUPABASE_SERVICE_KEY
  const originalFrontendUrl = process.env.FRONTEND_URL
  const originalJwtSecret = process.env.JWT_SECRET

  process.env.E2E_SMOKE = '1'
  process.env.SUPABASE_URL = 'http://127.0.0.1:54321'
  process.env.SUPABASE_SERVICE_KEY = 'dummy-key'
  process.env.FRONTEND_URL = 'http://localhost:3000'
  process.env.JWT_SECRET = 'smoke-test-secret'

  // 2. Isolation Guards:
  // - Prevents any network call to a non-loopback target.
  // - Ensures no DB credentials or production env vars are leaked.
  const guards = installLoopbackGuards()
  assertIsolatedEnvironment()

  // 3. Mock Repositories using the Fixture Adapter.
  const adapter = createFixtureAdapter(fixtures)

  // Note: In an ESM environment, mocking individual repository modules
  // requires the use of a module loader or the Node.js native
  // --experimental-test-module-mocks. The test runner is responsible
  // for mapping the adapter's methods to the repository exports.

  // 4. Launch the Express server on a random loopback port.
  const { createApp } = await import('../../backend/src/app.js')
  const app = createApp()
  const server = app.listen({
    port: 0,
    host: '127.0.0.1',
  })

  await new Promise((resolve) => server.once('listening', resolve))
  const { port } = server.address()

  try {
    // 5. Execute the test function.
    await testFn({ port, adapter })
  } finally {
    // 6. Guaranteed Teardown:
    // - Close the Express server.
    // - Restore loopback guards.
    if (server.closeAllConnections) server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    guards.restore()
    process.env.E2E_SMOKE = originalSmoke
    process.env.SUPABASE_URL = originalUrl
    process.env.SUPABASE_SERVICE_KEY = originalKey
    process.env.FRONTEND_URL = originalFrontendUrl
    process.env.JWT_SECRET = originalJwtSecret
  }
}
