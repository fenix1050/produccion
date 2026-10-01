import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, describe, beforeEach, afterEach } from 'node:test'
import { fileURLToPath } from 'node:url'

// Tests de scripts/deploy-backend-test.sh con ssh, scp, docker y curl falsos en PATH.
// Nunca toca ningun host real. Foco: el puntero de rollback (previous-image-tag.txt) solo
// se escribe con --approve-deploy, nunca con --preflight-only.

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const SCRIPT = 'scripts/deploy-backend-test.sh'
const BASH = process.env.BASH || 'bash'

// Ignora el host y ejecuta el resto localmente con HOME apuntando al "home remoto".
const FAKE_SSH = `#!/usr/bin/env bash
shift
export HOME="$FAKE_REMOTE_HOME"
if [[ "$1" == "bash" ]]; then
  exec "$@"
fi
exec bash -c "$*"
`

const FAKE_SCP = `#!/usr/bin/env bash
echo "scp $*" >> "$FAKE_LOG"
exit 1
`

const FAKE_CURL = `#!/usr/bin/env bash
exit 0
`

const FAKE_DOCKER = `#!/usr/bin/env bash
case "$*" in
  *"--format '{{.ID}}'"*|*"{{.ID}}"*) echo "abc123" ;;
  *"range .Config.Env"*) echo "NODE_ENV=test" ;;
  *".Config.Image"*) echo "cotizador-backend-test:previous-fake" ;;
  *"Health"*) echo "healthy" ;;
  *) exit 2 ;;
esac
`

let tmp
let binDir
let remoteHome
let manifestFile

function writeShim(name, body) {
  fs.writeFileSync(path.join(binDir, name), body, { mode: 0o755 })
}

function run(args, extraEnv = {}, { omit = [] } = {}) {
  const env = {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
    FAKE_LOG: path.join(tmp, 'calls.log'),
    FAKE_REMOTE_HOME: remoteHome,
    DOCKER_CMD: 'fake-docker',
    TEST_SSH_HOST: 'fake@host',
    PF3_TEST_COMPOSE_FILE: '/x/docker-compose.yml',
    PF3_TEST_COMPOSE_PROJECT: 'cotizador-backend-test',
    PF3_TEST_BACKEND_SERVICE: 'backend-test',
    PF3_TEST_HEALTH_URL: 'https://example.invalid/health',
    ...extraEnv,
  }
  for (const k of omit) delete env[k]
  const r = spawnSync(BASH, [SCRIPT, ...args], { cwd: REPO_ROOT, env, encoding: 'utf8' })
  return { ...r, out: `${r.stdout}\n${r.stderr}` }
}

describe('scripts/deploy-backend-test.sh', () => {
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-test-'))
    binDir = path.join(tmp, 'bin')
    remoteHome = path.join(tmp, 'remote-home')
    fs.mkdirSync(binDir)
    fs.mkdirSync(remoteHome)
    manifestFile = path.join(remoteHome, 'deploy-backups/backend-test/previous-image-tag.txt')
    writeShim('ssh', FAKE_SSH)
    writeShim('scp', FAKE_SCP)
    writeShim('curl', FAKE_CURL)
    writeShim('fake-docker', FAKE_DOCKER)
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  test('--preflight-only no modifica un puntero de rollback existente', () => {
    fs.mkdirSync(path.dirname(manifestFile), { recursive: true })
    fs.writeFileSync(manifestFile, 'old-image\n')
    const r = run(['--preflight-only'])
    assert.equal(r.status, 0, r.out)
    assert.match(r.out, /manifest=skipped/)
    assert.equal(fs.readFileSync(manifestFile, 'utf8'), 'old-image\n')
  })

  test('--preflight-only no crea el puntero si no existia', () => {
    const r = run(['--preflight-only'])
    assert.equal(r.status, 0, r.out)
    assert.match(r.out, /manifest=skipped/)
    assert.equal(fs.existsSync(manifestFile), false)
  })

  test('--approve-deploy escribe el puntero con la imagen previa', () => {
    const r = run(['--approve-deploy'])
    // El scp falso falla a proposito: el run se detiene justo despues del preflight.
    assert.notEqual(r.status, 0)
    assert.match(r.out, /manifest=written/)
    assert.equal(
      fs.readFileSync(manifestFile, 'utf8').trim(),
      'cotizador-backend-test:previous-fake'
    )
  })

  test('faltan variables obligatorias: exit 64', () => {
    const r = run(['--preflight-only'], {}, { omit: ['PF3_TEST_HEALTH_URL'] })
    assert.equal(r.status, 64)
    assert.match(r.out, /missing_required_value/)
  })

  test('proyecto que no es de test: non_test_target', () => {
    const r = run(['--preflight-only'], { PF3_TEST_COMPOSE_PROJECT: 'cotizador-prod' })
    assert.equal(r.status, 64)
    assert.match(r.out, /non_test_target/)
  })
})
