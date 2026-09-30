import assert from 'node:assert/strict'
import { spawnSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, describe, beforeEach, afterEach } from 'node:test'
import { fileURLToPath } from 'node:url'

// Tests del script scripts/backup-prod-db.sh con `docker`, `rclone` (y `flock` si el
// host no lo tiene) falsos en PATH. Nunca toca ningún host real.

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const SCRIPT = 'scripts/backup-prod-db.sh'
const BASH = process.env.BASH || 'bash'

const FAKE_DOCKER = `#!/usr/bin/env bash
echo "docker $*" >> "$FAKE_LOG"
# args: exec [-i] CONTAINER CMD ...
shift
[[ "$1" == "-i" ]] && shift
shift
case "$1" in
  pg_dump)
    if [[ "\${FAKE_DUMP_FAIL:-0}" == 1 ]]; then echo "pg_dump: error" >&2; exit 1; fi
    head -c "\${FAKE_DUMP_BYTES:-20000}" /dev/zero | tr '\\0' 'x'
    ;;
  pg_restore)
    cat > /dev/null
    echo "; Archive created at fake"
    echo "; dbname: postgres"
    i=0
    while ((i < \${FAKE_TOC_ENTRIES:-150})); do echo "$i; 1259 16385 TABLE public t$i owner"; i=$((i+1)); done
    ;;
  *) exit 2 ;;
esac
`

const FAKE_RCLONE = `#!/usr/bin/env bash
echo "rclone $*" >> "$FAKE_LOG"
if [[ "\${FAKE_RCLONE_FAIL:-}" == "$1" ]]; then echo "rclone: fake failure" >&2; exit 1; fi
`

// Solo se instala si el host no tiene flock (ej. Git Bash en Windows).
const FAKE_FLOCK = `#!/usr/bin/env bash
exit 0
`

function hasRealFlock() {
  return spawnSync(BASH, ['-c', 'command -v flock'], { encoding: 'utf8' }).status === 0
}

let tmp
let binDir
let backupDir
let logFile

function writeShim(name, body) {
  const p = path.join(binDir, name)
  fs.writeFileSync(p, body, { mode: 0o755 })
}

function baseEnv(extra = {}) {
  return {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
    FAKE_LOG: logFile,
    PROD_DB_CONTAINER: 'fake-db',
    BACKUP_DIR: backupDir,
    RCLONE_REMOTE: 'fake-remote:prod-db',
    ...extra,
  }
}

function run(args = [], env = {}, unset = []) {
  const e = baseEnv(env)
  for (const k of unset) delete e[k]
  return spawnSync(BASH, [SCRIPT, ...args], { cwd: REPO_ROOT, env: e, encoding: 'utf8' })
}

function calls() {
  return fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean) : []
}

function backupFiles() {
  return fs.existsSync(backupDir) ? fs.readdirSync(backupDir) : []
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-prod-test-'))
  binDir = path.join(tmp, 'bin')
  backupDir = path.join(tmp, 'backups')
  logFile = path.join(tmp, 'calls.log')
  fs.mkdirSync(binDir)
  writeShim('docker', FAKE_DOCKER)
  writeShim('rclone', FAKE_RCLONE)
  if (!hasRealFlock()) writeShim('flock', FAKE_FLOCK)
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('backup-prod-db.sh', () => {
  test('camino feliz: crea dump final + sha256, sin .partial', () => {
    const r = run(['--skip-upload'])
    assert.equal(r.status, 0, r.stderr)
    const files = backupFiles()
    const dump = files.find((f) => /^prod-\d{8}-\d{6}\.dump$/.test(f))
    assert.ok(dump, `sin dump final: ${files}`)
    assert.ok(files.includes(`${dump}.sha256`))
    assert.equal(files.filter((f) => f.endsWith('.partial')).length, 0)
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(path.join(backupDir, dump)).mode & 0o777, 0o600)
    }
    assert.match(fs.readFileSync(path.join(backupDir, `${dump}.sha256`), 'utf8'), /^[0-9a-f]{64}\s/)
  })

  test('falla si faltan variables obligatorias', () => {
    for (const name of ['PROD_DB_CONTAINER', 'BACKUP_DIR']) {
      const r = run(['--skip-upload'], {}, [name])
      assert.notEqual(r.status, 0, name)
      assert.match(r.stderr, new RegExp(name))
    }
    assert.equal(backupFiles().length, 0)
  })

  test('falla y no deja archivo final si el dump es demasiado chico', () => {
    const r = run(['--skip-upload'], { FAKE_DUMP_BYTES: '0' })
    assert.notEqual(r.status, 0)
    assert.equal(backupFiles().filter((f) => f.startsWith('prod-')).length, 0)
    const r2 = run(['--skip-upload'], { FAKE_DUMP_BYTES: '100' })
    assert.notEqual(r2.status, 0)
    assert.equal(backupFiles().filter((f) => f.startsWith('prod-')).length, 0)
  })

  test('falla si pg_dump devuelve error', () => {
    const r = run(['--skip-upload'], { FAKE_DUMP_FAIL: '1' })
    assert.notEqual(r.status, 0)
    assert.equal(backupFiles().filter((f) => f.startsWith('prod-')).length, 0)
  })

  test('falla si el TOC tiene menos entradas que el mínimo', () => {
    const r = run(['--skip-upload'], { FAKE_TOC_ENTRIES: '10' })
    assert.notEqual(r.status, 0)
    assert.equal(backupFiles().filter((f) => f.startsWith('prod-')).length, 0)
  })

  test('rotación local: borra viejos prod-*.dump*, conserva recientes y ajenos', () => {
    fs.mkdirSync(backupDir, { recursive: true })
    const old = new Date(Date.now() - 20 * 86400 * 1000)
    const recent = new Date(Date.now() - 2 * 86400 * 1000)
    const mk = (name, when) => {
      const p = path.join(backupDir, name)
      fs.writeFileSync(p, 'x')
      fs.utimesSync(p, when, when)
    }
    mk('prod-20200101-000000.dump', old)
    mk('prod-20200101-000000.dump.sha256', old)
    mk('prod-20260928-000000.dump', recent)
    mk('otro-viejo.txt', old)
    const r = run(['--skip-upload'], { RETENTION_DAYS: '14' })
    assert.equal(r.status, 0, r.stderr)
    const files = backupFiles()
    assert.ok(!files.includes('prod-20200101-000000.dump'))
    assert.ok(!files.includes('prod-20200101-000000.dump.sha256'))
    assert.ok(files.includes('prod-20260928-000000.dump'))
    assert.ok(files.includes('otro-viejo.txt'))
  })

  test('sin RCLONE_REMOTE y sin --skip-upload se niega', () => {
    const r = run([], {}, ['RCLONE_REMOTE'])
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /RCLONE_REMOTE|skip-upload/)
    assert.equal(backupFiles().filter((f) => f.startsWith('prod-')).length, 0)
  })

  test('con --skip-upload no llama a rclone', () => {
    const r = run(['--skip-upload'], {}, ['RCLONE_REMOTE'])
    assert.equal(r.status, 0, r.stderr)
    assert.equal(calls().filter((c) => c.startsWith('rclone')).length, 0)
  })

  test('con RCLONE_REMOTE sube dump y sha256 y luego rota el remoto', () => {
    const r = run([], { REMOTE_RETENTION_DAYS: '30' })
    assert.equal(r.status, 0, r.stderr)
    const rc = calls().filter((c) => c.startsWith('rclone'))
    assert.equal(rc.length, 3, rc.join('\n'))
    assert.match(rc[0], /^rclone copy .*prod-\d{8}-\d{6}\.dump fake-remote:prod-db$/)
    assert.match(rc[1], /^rclone copy .*prod-\d{8}-\d{6}\.dump\.sha256 fake-remote:prod-db$/)
    assert.equal(rc[2], 'rclone delete --min-age 30d fake-remote:prod-db')
  })

  test('si rclone copy falla, el script sale != 0 y no rota el remoto', () => {
    const r = run([], { FAKE_RCLONE_FAIL: 'copy' })
    assert.notEqual(r.status, 0)
    assert.equal(calls().filter((c) => c.startsWith('rclone delete')).length, 0)
  })

  test(
    'una segunda corrida concurrente es rechazada por el lock',
    { skip: !hasRealFlock() && 'flock no disponible en esta plataforma' },
    async () => {
      fs.mkdirSync(backupDir, { recursive: true })
      // Retiene el mismo lock que usa el script (BACKUP_DIR/.backup.lock).
      const holder = spawn(
        BASH,
        ['-c', `exec 9>"$BACKUP_DIR/.backup.lock"; flock -n 9; echo locked; sleep 5`],
        {
          env: baseEnv(),
          stdio: ['ignore', 'pipe', 'inherit'],
        }
      )
      await new Promise((resolve) => holder.stdout.once('data', resolve))
      try {
        const r = run(['--skip-upload'])
        assert.notEqual(r.status, 0)
        assert.match(r.stderr, /lock|otra ejecuci/i)
      } finally {
        holder.kill()
      }
    }
  )
})
