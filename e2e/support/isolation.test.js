import assert from 'node:assert/strict'
import { test } from 'node:test'

function assertIsolationBreach(action, expectedDetail) {
  assert.throws(action, (error) => {
    assert.equal(error.code, 'E2E_ISOLATION_BREACH')
    assert.match(error.message, expectedDetail)
    return true
  })
}

test('assertIsolatedEnvironment() rejects database credentials and production mode', async () => {
  const { assertIsolatedEnvironment } = await import('./isolation.js')

  for (const [name, environment] of [
    ['Supabase URL', { SUPABASE_URL: 'https://project.supabase.co' }],
    ['Supabase service key', { SUPABASE_SERVICE_KEY: 'service-role-secret' }],
    ['other Supabase credential', { SUPABASE_ANON_KEY: 'anon-secret' }],
    ['database URL', { DATABASE_URL: 'postgres://database' }],
    ['Postgres host', { PGHOST: 'database.internal' }],
    ['production mode', { NODE_ENV: 'production' }],
  ]) {
    assertIsolationBreach(
      () => assertIsolatedEnvironment(environment),
      new RegExp(name === 'production mode' ? 'production' : Object.keys(environment)[0])
    )
  }

  assert.doesNotThrow(() => assertIsolatedEnvironment({ NODE_ENV: 'test' }))
})

function createNetworkDoubles() {
  const calls = []
  const record =
    (name) =>
    (...args) => {
      calls.push({ name, args })
      return name
    }

  return {
    calls,
    dependencies: {
      netModule: {
        connect: record('net.connect'),
        createConnection: record('net.createConnection'),
      },
      tlsModule: { connect: record('tls.connect') },
      httpModule: { request: record('http.request'), get: record('http.get') },
      httpsModule: { request: record('https.request'), get: record('https.get') },
      globalObject: { fetch: record('fetch') },
    },
  }
}

test('installLoopbackGuards() blocks non-loopback HTTP, socket, and fetch targets before delegation', async () => {
  const { installLoopbackGuards } = await import('./isolation.js')
  const { calls, dependencies } = createNetworkDoubles()
  const guards = installLoopbackGuards(dependencies)

  assertIsolationBreach(
    () => dependencies.netModule.connect({ host: 'example.test', port: 443 }),
    /example\.test/
  )
  assertIsolationBreach(() => dependencies.tlsModule.connect(443, 'example.test'), /example\.test/)
  assertIsolationBreach(
    () => dependencies.httpModule.request('http://example.test/'),
    /example\.test/
  )
  assertIsolationBreach(
    () => dependencies.httpsModule.get({ hostname: 'example.test', port: 443 }),
    /example\.test/
  )
  assertIsolationBreach(
    () => dependencies.globalObject.fetch('https://example.test/'),
    /example\.test/
  )
  assert.deepEqual(calls, [])

  assert.equal(
    dependencies.netModule.createConnection({ host: '127.0.0.1', port: 3100 }),
    'net.createConnection'
  )
  assert.equal(dependencies.tlsModule.connect(443, 'localhost'), 'tls.connect')
  assert.equal(dependencies.httpModule.get('http://localhost:5100/health'), 'http.get')
  assert.equal(dependencies.httpsModule.request(new URL('https://[::1]/')), 'https.request')
  assert.equal(dependencies.globalObject.fetch('http://127.0.0.1:3100/health'), 'fetch')
  assert.deepEqual(
    calls.map(({ name }) => name),
    ['net.createConnection', 'tls.connect', 'http.get', 'https.request', 'fetch']
  )

  guards.restore()
})
