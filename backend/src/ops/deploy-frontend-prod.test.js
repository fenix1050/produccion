import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, describe, beforeEach, afterEach } from 'node:test'
import { fileURLToPath } from 'node:url'

// Tests of scripts/deploy-frontend-prod.sh. git is faked; tar, cp, diff, stat and sha256sum
// are the real ones working inside a temp dir. Never touches a real host.

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const SCRIPT = 'scripts/deploy-frontend-prod.sh'
const BASH = process.env.BASH || 'bash'
const SHA = 'b'.repeat(39) + '2'

// "worktree add" materialises $FAKE_WT_SOURCE as the worktree and records the SHA.
const FAKE_GIT = `#!/usr/bin/env bash
echo "git $*" >> "$FAKE_LOG"
args=("$@")
if [[ "\${args[0]}" == "-C" ]]; then dir="\${args[1]}"; args=("\${args[@]:2}"); fi
case "\${args[0]} \${args[1]:-}" in
  "worktree add")
    cp -a "$FAKE_WT_SOURCE" "\${args[3]}" && echo "\${args[4]}" > "\${args[3]}/.sha" ;;
  "worktree remove") rm -rf "\${args[3]}" ;;
  "rev-parse HEAD") cat "$dir/.sha" ;;
esac
exit 0
`

// Wraps the real tar. On the extracting call it can tamper with the destination.
const tarShim = (realTar) => `#!/usr/bin/env bash
echo "tar $*" >> "$FAKE_LOG"
"${realTar}" "$@"
rc=$?
if [[ " $* " == *" -xf "* ]]; then
  [[ -n "\${TAMPER_CONFIG:-}" ]] && echo tampered >> "$FRONTEND_DIR/shared/config.js"
  [[ -n "\${TAMPER_FILE:-}" ]] && echo tampered >> "$FRONTEND_DIR/index.html"
  [[ -n "\${TAR_FAIL_EXIT:-}" ]] && exit 2
fi
exit $rc
`

let tmp, binDir, home, appDir, prodDir, srcDir, logFile

function shim(name, body) {
  fs.writeFileSync(path.join(binDir, name), body, { mode: 0o755 })
}
function write(base, rel, content) {
  const f = path.join(base, rel)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, content)
}
const read = (base, rel) => fs.readFileSync(path.join(base, rel), 'utf8')
const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
const log = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '')
const worktree = () => path.join(home, `build-${SHA}`)
const backups = () => {
  const d = path.join(home, 'deploy-backups')
  return fs.existsSync(d) ? fs.readdirSync(d).filter((n) => n.startsWith('frontend-prod-')) : []
}

// Git Bash tar reads "C:\..." as host:path, so hand bash POSIX-style paths (no-op elsewhere).
const posix = (p) =>
  process.platform === 'win32'
    ? spawnSync('cygpath', ['-u', p], { encoding: 'utf8' }).stdout.trim()
    : p

function run(args, extraEnv = {}) {
  const env = {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
    HOME: home,
    APP_DIR: posix(appDir),
    FRONTEND_DIR: posix(prodDir),
    FAKE_LOG: logFile,
    FAKE_WT_SOURCE: srcDir,
    ...extraEnv,
  }
  const r = spawnSync(BASH, [SCRIPT, ...args], { cwd: REPO_ROOT, env, encoding: 'utf8' })
  return { ...r, out: `${r.stdout}\n${r.stderr}` }
}

describe('scripts/deploy-frontend-prod.sh', () => {
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-fe-prod-'))
    binDir = path.join(tmp, 'bin')
    home = path.join(tmp, 'home')
    appDir = path.join(tmp, 'app')
    prodDir = path.join(tmp, 'frontend-prod')
    srcDir = path.join(tmp, 'wt-source') // plays the role of a checked-out worktree
    logFile = path.join(tmp, 'calls.log')
    for (const d of [binDir, home, appDir]) fs.mkdirSync(d)
    // New code (in the repo) vs what PROD currently serves.
    write(srcDir, 'frontend/index.html', 'NEW index\n')
    write(srcDir, 'frontend/shared/app.js', 'NEW app\n')
    write(srcDir, 'frontend/shared/config.js', 'REPO DEV CONFIG\n')
    write(srcDir, 'frontend/nueva/pagina.html', 'NEW page\n')
    write(prodDir, 'index.html', 'OLD index\n')
    write(prodDir, 'shared/app.js', 'OLD app\n')
    write(prodDir, 'shared/config.js', 'PROD CONFIG SECRET\n')
    const past = new Date('2026-01-01T00:00:00Z')
    fs.utimesSync(path.join(prodDir, 'shared/config.js'), past, past)
    const realTar = spawnSync(BASH, ['-c', 'command -v tar'], { encoding: 'utf8' }).stdout.trim()
    shim('git', FAKE_GIT)
    shim('tar', tarShim(realTar))
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  describe('SHA validation', () => {
    const bad = [
      ['short SHA', 'abc1234'],
      ['non-hex', 'z'.repeat(40)],
      ['41 chars', 'b'.repeat(41)],
      ['shell metacharacters', 'b'.repeat(30) + '; rm -rf /'],
    ]
    for (const [label, value] of bad) {
      test(`rejects ${label} and executes nothing`, () => {
        for (const extra of [[], ['--approve-deploy']]) {
          const r = run([value, ...extra])
          assert.equal(r.status, 64, r.out)
          assert.match(r.out, /invalid_sha/)
          assert.equal(log(), '')
        }
        assert.equal(read(prodDir, 'index.html'), 'OLD index\n')
      })
    }
    test('missing SHA or unknown flag: usage, nothing executed', () => {
      assert.equal(run([]).status, 64)
      assert.equal(run([SHA, '--yolo']).status, 64)
      assert.equal(log(), '')
    })
  })

  describe('preflight (no --approve-deploy)', () => {
    test('changes nothing', () => {
      const r = run([SHA])
      assert.equal(r.status, 0, r.out)
      assert.match(r.out, /preflight/i)
      assert.doesNotMatch(log(), /worktree add|fetch|tar /)
      assert.equal(backups().length, 0)
      assert.equal(fs.existsSync(worktree()), false)
      assert.equal(read(prodDir, 'index.html'), 'OLD index\n')
    })

    test('fails when shared/config.js is missing in PROD', () => {
      fs.rmSync(path.join(prodDir, 'shared/config.js'))
      const r = run([SHA])
      assert.notEqual(r.status, 0)
      assert.match(r.out, /config_js_missing/)
    })

    test('fails when the frontend dir is missing', () => {
      const r = run([SHA], { FRONTEND_DIR: path.join(tmp, 'nope') })
      assert.notEqual(r.status, 0)
      assert.match(r.out, /frontend_dir_missing/)
    })
  })

  describe('--approve-deploy', () => {
    test('creates the worktree, backs up, copies, verifies and cleans up', () => {
      const r = run([SHA, '--approve-deploy'])
      assert.equal(r.status, 0, r.out)
      assert.match(log(), new RegExp(`git -C .*app fetch origin`))
      assert.match(log(), new RegExp(`git -C .*app worktree add --detach .*build-${SHA} ${SHA}`))
      assert.equal(read(prodDir, 'index.html'), 'NEW index\n')
      assert.equal(read(prodDir, 'shared/app.js'), 'NEW app\n')
      assert.equal(read(prodDir, 'nueva/pagina.html'), 'NEW page\n')
      assert.equal(fs.existsSync(worktree()), false, 'created worktree removed on success')
      assert.match(log(), /worktree remove --force/)
    })

    test('backup is taken before copying and keeps the old content and config.js', () => {
      run([SHA, '--approve-deploy'])
      const [b] = backups()
      assert.match(b, /^frontend-prod-\d{8}-\d{6}$/)
      const bdir = path.join(home, 'deploy-backups', b)
      assert.equal(read(bdir, 'index.html'), 'OLD index\n')
      assert.equal(read(bdir, 'shared/config.js'), 'PROD CONFIG SECRET\n')
    })

    test('aborts before copying when shared/config.js is missing', () => {
      fs.rmSync(path.join(prodDir, 'shared/config.js'))
      const r = run([SHA, '--approve-deploy'])
      assert.notEqual(r.status, 0)
      assert.match(r.out, /config_js_missing/)
      assert.doesNotMatch(log(), /tar /)
      assert.equal(read(prodDir, 'index.html'), 'OLD index\n')
      assert.equal(backups().length, 0)
    })

    test('never copies shared/config.js and leaves its content, mtime and checksum untouched', () => {
      const cfg = path.join(prodDir, 'shared/config.js')
      const before = { mtime: fs.statSync(cfg).mtimeMs, sum: sha256(cfg) }
      const r = run([SHA, '--approve-deploy'])
      assert.equal(r.status, 0, r.out)
      assert.match(log(), /tar --exclude=shared\/config\.js -cf -/)
      assert.match(log(), /tar --no-same-permissions -m -xf -/)
      assert.equal(read(prodDir, 'shared/config.js'), 'PROD CONFIG SECRET\n')
      assert.equal(fs.statSync(cfg).mtimeMs, before.mtime)
      assert.equal(sha256(cfg), before.sum)
    })

    test('aborts loudly if config.js changed during the copy', () => {
      const r = run([SHA, '--approve-deploy'], { TAMPER_CONFIG: '1' })
      assert.notEqual(r.status, 0)
      assert.match(r.out, /config_js_changed/)
      assert.match(r.out, /backup/i)
    })

    test('fails when diff finds a differing file after the copy', () => {
      const r = run([SHA, '--approve-deploy'], { TAMPER_FILE: '1' })
      assert.notEqual(r.status, 0)
      assert.match(r.out, /diff_mismatch/)
      assert.equal(fs.existsSync(worktree()), true, 'worktree kept after a failure')
    })

    test('extra files only in PROD are reported as a warning, not deleted', () => {
      write(prodDir, 'viejo/legacy.js', 'legacy\n')
      const r = run([SHA, '--approve-deploy'])
      assert.equal(r.status, 0, r.out)
      assert.match(r.out, /WARNING/)
      assert.match(
        r.out,
        /Only in .*frontend-prod.*viejo.*legacy\.js|Only in .*frontend-prod: viejo/
      )
      assert.equal(read(prodDir, 'viejo/legacy.js'), 'legacy\n')
    })

    test('a tar error does not hide behind success: diff decides', () => {
      // tar exits 2 after extracting everything: only a warning, the diff passes.
      const r = run([SHA, '--approve-deploy'], { TAR_FAIL_EXIT: '1' })
      assert.equal(r.status, 0, r.out)
      assert.match(r.out, /tar_exit=/)
    })

    test('reuses an existing worktree at the same SHA and does not remove it', () => {
      fs.cpSync(srcDir, worktree(), { recursive: true })
      fs.writeFileSync(path.join(worktree(), '.sha'), `${SHA}\n`)
      const r = run([SHA, '--approve-deploy'])
      assert.equal(r.status, 0, r.out)
      assert.doesNotMatch(log(), /worktree add|worktree remove/)
      assert.equal(fs.existsSync(worktree()), true)
      assert.equal(read(prodDir, 'index.html'), 'NEW index\n')
    })

    test('aborts if the existing worktree is at a different commit', () => {
      fs.cpSync(srcDir, worktree(), { recursive: true })
      fs.writeFileSync(path.join(worktree(), '.sha'), `${'c'.repeat(40)}\n`)
      const r = run([SHA, '--approve-deploy'])
      assert.notEqual(r.status, 0)
      assert.match(r.out, /worktree_sha_mismatch/)
      assert.equal(read(prodDir, 'index.html'), 'OLD index\n')
      assert.equal(backups().length, 0)
    })
  })
})
