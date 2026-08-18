import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])
const BREACH_CODE = 'E2E_ISOLATION_BREACH'

function isolationBreach(message) {
  const error = new Error(`${BREACH_CODE}: ${message}`)
  error.code = BREACH_CODE
  return error
}

const SAFE_DUMMIES = new Set([
  'dummy-key',
  'http://127.0.0.1:54321',
  'dummy-url',
  'http://localhost:3000',
  'smoke-test-secret',
])

function configured(value) {
  return value !== undefined && value !== '' && !SAFE_DUMMIES.has(value)
}

function restrictedEnvironmentKey(environment) {
  return Object.keys(environment).find(
    (key) =>
      configured(environment[key]) &&
      (key === 'DATABASE_URL' || key.startsWith('SUPABASE_') || key.startsWith('PG'))
  )
}

export function assertIsolatedEnvironment(environment = process.env) {
  const restrictedKey = restrictedEnvironmentKey(environment)
  if (restrictedKey) {
    throw isolationBreach(`${restrictedKey} must be absent from the smoke-test environment`)
  }

  if (environment.NODE_ENV === 'production') {
    throw isolationBreach('NODE_ENV=production is not allowed for the smoke suite')
  }
}

function hostnameFrom(value) {
  if (value instanceof URL) return value.hostname
  if (typeof value !== 'string') return undefined

  if (value.includes('://')) return new URL(value).hostname
  return value
}

function normalizeHost(host) {
  if (!host) return undefined

  const normalized = host.trim().toLowerCase()
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    return normalized.slice(1, -1)
  }
  if (normalized === '::1') return normalized

  const firstColon = normalized.indexOf(':')
  if (firstColon !== -1 && firstColon === normalized.lastIndexOf(':')) {
    return normalized.slice(0, firstColon)
  }
  return normalized
}

function targetHost(args) {
  const [target, possibleHost] = args
  if (typeof target === 'number') return normalizeHost(hostnameFrom(possibleHost))
  if (target && typeof target === 'object' && !(target instanceof URL)) {
    return normalizeHost(target.hostname ?? target.host)
  }
  return normalizeHost(hostnameFrom(target))
}

function assertLoopbackTarget(args) {
  const host = targetHost(args)
  if (!LOOPBACK_HOSTS.has(host)) {
    throw isolationBreach(`non-loopback network target blocked: ${host ?? 'unknown'}`)
  }
}

function guardMethods(module, methodNames, restorers) {
  for (const methodName of methodNames) {
    const original = module[methodName]
    module[methodName] = (...args) => {
      assertLoopbackTarget(args)
      return original(...args)
    }
    restorers.push(() => {
      module[methodName] = original
    })
  }
}

export function installLoopbackGuards({
  netModule = net,
  tlsModule = tls,
  httpModule = http,
  httpsModule = https,
  globalObject = globalThis,
} = {}) {
  const restorers = []
  guardMethods(netModule, ['connect', 'createConnection'], restorers)
  guardMethods(tlsModule, ['connect'], restorers)
  guardMethods(httpModule, ['request', 'get'], restorers)
  guardMethods(httpsModule, ['request', 'get'], restorers)
  guardMethods(globalObject, ['fetch'], restorers)

  return {
    restore() {
      while (restorers.length > 0) restorers.pop()()
    },
  }
}
