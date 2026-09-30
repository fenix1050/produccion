import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const scriptPath = fileURLToPath(new URL('./build.sh', import.meta.url))

test('embedded build config keeps API_BASE_URL without emitting the unused CSRF name', () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'frontend-build-'))

  try {
    const scriptCopy = path.join(fixture, 'frontend', 'scripts', 'build.sh')
    mkdirSync(path.dirname(scriptCopy), { recursive: true })
    mkdirSync(path.join(fixture, 'shared'))
    writeFileSync(scriptCopy, readFileSync(scriptPath))

    execFileSync('sh', [scriptCopy], {
      cwd: fixture,
      env: {
        ...process.env,
        API_BASE_URL: 'https://api.example.test',
        BUILD_VERSION: 'test',
        RUNTIME_CONFIG_MODE: 'embedded',
      },
      stdio: 'pipe',
    })

    const config = readFileSync(path.join(fixture, 'shared', 'config.js'), 'utf8')
    assert.match(config, /^window\.API_BASE_URL = 'https:\/\/api\.example\.test'$/m)
    assert.doesNotMatch(config, /window\.COOKIE_CSRF_NAME/)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
