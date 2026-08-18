import assert from 'node:assert'
import net from 'node:net'
import { test, describe, mock } from 'node:test'

import { FIXTURES } from '../fixtures/data.js'

import { launchGREEN } from './test-system.js'

// Mock Supabase config to prevent the top-level throw
mock.module('C:/Visual Studio/Produccion/backend/src/config/supabase.js', {
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  },
})

/**
 * Helper to check if a port is available on the loopback interface.
 */
async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close()
      resolve(true)
    })
    server.listen(port, '127.0.0.1')
  })
}

describe('TestSystem', () => {
  test('should start the server on a loopback port', async () => {
    await launchGREEN(FIXTURES, async ({ port }) => {
      const available = await isPortAvailable(port)
      assert.strictEqual(available, false, `Port ${port} should be occupied by the test system`)
    })
  })

  test('should execute a smoke test', async () => {
    await launchGREEN(FIXTURES, async ({ port }) => {
      const available = await isPortAvailable(port)
      assert.strictEqual(available, false, 'Server should be running during smoke test')
    })
  })

  test('should properly release the port after completion', async () => {
    let port
    await launchGREEN(FIXTURES, async ({ port: p }) => {
      port = p
    })
    const available = await isPortAvailable(port)
    assert.strictEqual(available, true, `Port ${port} should be released after stop()`)
  })
})
