import assert from 'node:assert/strict'
import net from 'node:net'
import { describe, test } from 'node:test'

import { FIXTURES } from '../fixtures/data.js'

import { launchGREEN } from './test-system.js'

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, '127.0.0.1')
  })
}

describe('TestSystem', () => {
  test('rejects unsafe environments before mocks, guards, or listeners start', async () => {
    for (const [key, value] of [
      ['DATABASE_URL', 'postgres://unsafe.test/db'],
      ['SUPABASE_UNRELATED_SECRET', 'unsafe'],
      ['PGHOST', 'unsafe.test'],
      ['NODE_ENV', 'production'],
    ]) {
      const previous = process.env[key]
      const originalFetch = globalThis.fetch
      let callbackCalled = false
      process.env[key] = value
      try {
        await assert.rejects(
          launchGREEN(FIXTURES, async () => {
            callbackCalled = true
          }),
          (error) => error.code === 'E2E_ISOLATION_BREACH'
        )
      } finally {
        if (previous === undefined) delete process.env[key]
        else process.env[key] = previous
      }
      assert.equal(callbackCalled, false)
      assert.strictEqual(globalThis.fetch, originalFetch)
    }
  })

  test('starts a loopback API with repository mocks and releases its port', async () => {
    let releasedPort
    await launchGREEN(FIXTURES, async ({ port, adapter }) => {
      releasedPort = port
      assert.equal(await isPortAvailable(port), false)
      const health = await fetch(`http://127.0.0.1:${port}/health`)
      assert.deepEqual(await health.json(), { status: 'ok' })
      assert.equal(
        (await adapter.usuarios.findByEmail(FIXTURES.user.email)).email,
        FIXTURES.user.email
      )
    })
    assert.equal(await isPortAvailable(releasedPort), true)
  })
})
