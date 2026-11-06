import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, describe, beforeEach, afterEach } from 'node:test'
import { fileURLToPath } from 'node:url'

// Tests of scripts/deploy-backend-prod.sh with fake docker, git, sudo and sleep on PATH.
// They never touch a real host. The fakes append every call to $FAKE_LOG.

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const SCRIPT = 'scripts/deploy-backend-prod.sh'
const BASH = process.env.BASH || 'bash'

const SHA = 'a'.repeat(39) + '1'
const NEW_IMAGE = `cotizador-backend:${SHA}`
const OLD_IMAGE = 'cotizador-backend:oldoldold'

// sudo VAR=x cmd ...: log, then run through env so BACKEND_IMAGE reaches the fake docker.
const FAKE_SUDO = `#!/usr/bin/env bash
echo "sudo $*" >> "$FAKE_LOG"
exec env "$@"
`

const FAKE_SLEEP = `#!/usr/bin/env bash
exit 0
`

const FAKE_GIT = `#!/usr/bin/env bash
echo "git $*" >> "$FAKE_LOG"
args=("$@")
if [[ "\${args[0]}" == "-C" ]]; then args=("\${args[@]:2}"); fi
case "\${args[0]} \${args[1]:-}" in
  "worktree add")
    [[ -n "\${FAKE_GIT_FAIL_ADD:-}" ]] && exit 1
    mkdir -p "\${args[3]}" && echo "\${args[4]}" > "\${args[3]}/.sha" ;;
  "worktree remove") rm -rf "\${args[3]}" ;;
  "log -1") echo "\${SHA_FOR_LOG:-sha} subject" ;;
esac
exit 0
`

// State: $FAKE_STATE/current holds the running image. compose up copies $BACKEND_IMAGE there.
const FAKE_DOCKER = `#!/usr/bin/env bash
echo "docker BACKEND_IMAGE=\${BACKEND_IMAGE:-} $*" >> "$FAKE_LOG"
case "$1" in
  inspect) cat "$FAKE_STATE/current" ;;
  images) cat "$FAKE_STATE/images" ;;
  build) [[ -n "\${FAKE_BUILD_FAIL:-}" ]] && exit 1; exit 0 ;;
  compose)
    [[ -n "\${FAKE_COMPOSE_FAIL:-}" ]] && exit 1
    echo "$BACKEND_IMAGE" > "$FAKE_STATE/current"; exit 0 ;;
  exec)
    cur=$(cat "$FAKE_STATE/current")
    for u in \${FAKE_UNHEALTHY:-}; do
      if [[ "$u" == "$cur" ]]; then echo "health 503"; exit 0; fi
    done
    echo "health 200"; exit 0 ;;
  *) exit 2 ;;
esac
`

let tmp, binDir, home, appDir, stateDir, logFile

function shim(name, body) {
  fs.writeFileSync(path.join(binDir, name), body, { mode: 0o755 })
}

function run(args, extraEnv = {}) {
  const env = {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
    HOME: home,
    APP_DIR: appDir,
    FAKE_LOG: logFile,
    FAKE_STATE: stateDir,
    ...extraEnv,
  }
  const r = spawnSync(BASH, [SCRIPT, ...args], { cwd: REPO_ROOT, env, encoding: 'utf8' })
  return { ...r, out: `${r.stdout}\n${r.stderr}` }
}

const log = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '')
const logLines = () => log().split('\n').filter(Boolean)
const pointer = () => path.join(home, 'deploy-backups/backend-prod/previous-image-tag.txt')
const worktree = () => path.join(home, `build-${SHA}`)
const current = () => fs.readFileSync(path.join(stateDir, 'current'), 'utf8').trim()
const indexOfLine = (re) => logLines().findIndex((l) => re.test(l))

describe('scripts/deploy-backend-prod.sh', () => {
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-prod-'))
    binDir = path.join(tmp, 'bin')
    home = path.join(tmp, 'home')
    appDir = path.join(tmp, 'app')
    stateDir = path.join(tmp, 'state')
    logFile = path.join(tmp, 'calls.log')
    for (const d of [binDir, home, appDir, stateDir]) fs.mkdirSync(d)
    fs.writeFileSync(path.join(stateDir, 'current'), `${OLD_IMAGE}\n`)
    fs.writeFileSync(path.join(stateDir, 'images'), `${OLD_IMAGE}\nother:tag\n`)
    shim('sudo', FAKE_SUDO)
    shim('sleep', FAKE_SLEEP)
    shim('git', FAKE_GIT)
    shim('docker', FAKE_DOCKER)
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  describe('SHA validation', () => {
    const bad = [
      ['short SHA', 'abc1234'],
      ['non-hex', 'g'.repeat(40)],
      ['41 chars', 'a'.repeat(41)],
      ['uppercase', 'A'.repeat(40)],
      ['shell metacharacters', 'a'.repeat(30) + '; rm -rf /'],
      ['command substitution', '$(touch /tmp/pwned)' + 'a'.repeat(21)],
    ]
    for (const [label, value] of bad) {
      test(`rejects ${label} and executes nothing`, () => {
        for (const extra of [[], ['--approve-deploy']]) {
          const r = run([value, ...extra])
          assert.equal(r.status, 64, r.out)
          assert.match(r.out, /invalid_sha/)
          assert.equal(log(), '')
        }
      })
    }

    test('rejects a newline suffix (passed via env: Windows argv splits newlines)', () => {
      const env = {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
        HOME: home,
        APP_DIR: appDir,
        FAKE_LOG: logFile,
        FAKE_STATE: stateDir,
        BAD_SHA: 'a'.repeat(40) + '\nx',
      }
      const r = spawnSync(BASH, ['-c', `bash ${SCRIPT} "$BAD_SHA"`], {
        cwd: REPO_ROOT,
        env,
        encoding: 'utf8',
      })
      assert.equal(r.status, 64, `${r.stdout}${r.stderr}`)
      assert.match(r.stderr, /invalid_sha/)
      assert.equal(log(), '')
    })

    test('missing SHA prints usage and executes nothing', () => {
      const r = run([])
      assert.equal(r.status, 64, r.out)
      assert.equal(log(), '')
    })

    test('unknown flag is rejected', () => {
      const r = run([SHA, '--yolo'])
      assert.equal(r.status, 64, r.out)
      assert.equal(log(), '')
    })
  })

  describe('preflight (no --approve-deploy)', () => {
    test('changes nothing and prints the current image and plan', () => {
      const r = run([SHA])
      assert.equal(r.status, 0, r.out)
      assert.match(r.out, new RegExp(OLD_IMAGE))
      assert.match(r.out, /preflight/i)
      const calls = log()
      assert.doesNotMatch(calls, /docker .*build/)
      assert.doesNotMatch(calls, /docker .*compose/)
      assert.doesNotMatch(calls, /worktree add/)
      assert.doesNotMatch(calls, /git .*fetch/)
      assert.equal(fs.existsSync(pointer()), false)
      assert.equal(fs.existsSync(worktree()), false)
      assert.equal(current(), OLD_IMAGE)
    })

    test('fails when the compose dir is missing', () => {
      const r = run([SHA], { APP_DIR: path.join(tmp, 'nope') })
      assert.notEqual(r.status, 0)
      assert.match(r.out, /app_dir_missing/)
    })

    test('fails when the container does not exist', () => {
      fs.rmSync(path.join(stateDir, 'current'))
      const r = run([SHA])
      assert.notEqual(r.status, 0)
      assert.match(r.out, /container_missing/)
    })
  })

  describe('--approve-deploy', () => {
    test('runs the steps in the exact order and succeeds', () => {
      const r = run([SHA, '--approve-deploy'])
      assert.equal(r.status, 0, r.out)
      const order = [
        /^git -C .*app fetch origin/,
        new RegExp(`^git -C .*app worktree add --detach .*build-${SHA} ${SHA}`),
        new RegExp(`^docker .* build -f backend/Dockerfile -t ${NEW_IMAGE} \\.`),
        /^docker .* images /,
        new RegExp(
          `^sudo BACKEND_IMAGE=${NEW_IMAGE} docker compose up -d --no-deps --no-build --force-recreate backend`
        ),
        /^docker .* exec cotizador-tajy-backend node -e/,
        /^git -C .*app worktree remove --force .*build-/,
      ]
      let last = -1
      for (const re of order) {
        const i = indexOfLine(re)
        assert.ok(i > last, `step ${re} out of order or missing (idx ${i}, last ${last})\n${log()}`)
        last = i
      }
      assert.equal(current(), NEW_IMAGE)
      assert.equal(fs.existsSync(worktree()), false, 'worktree removed on success')
      assert.match(r.out, new RegExp(NEW_IMAGE))
      assert.match(r.out, /previous-image-tag\.txt/)
    })

    test('writes the previous-image pointer before compose up', () => {
      run([SHA, '--approve-deploy'])
      assert.equal(fs.readFileSync(pointer(), 'utf8').trim(), OLD_IMAGE)
      // Pointer content cannot be the new image: it was written before compose ran.
      assert.ok(indexOfLine(/docker .* images /) < indexOfLine(/docker compose up/))
    })

    test('refuses when the current image already equals the target', () => {
      fs.writeFileSync(path.join(stateDir, 'current'), `${NEW_IMAGE}\n`)
      const r = run([SHA, '--approve-deploy'])
      assert.notEqual(r.status, 0)
      assert.match(r.out, /already_deployed/)
      assert.doesNotMatch(log(), /docker .*compose/)
      assert.doesNotMatch(log(), /docker .*build/)
      assert.equal(fs.existsSync(pointer()), false)
    })

    test('aborts if the worktree path already exists', () => {
      fs.mkdirSync(worktree())
      const r = run([SHA, '--approve-deploy'])
      assert.notEqual(r.status, 0)
      assert.match(r.out, /worktree_exists/)
      assert.doesNotMatch(log(), /docker .*build/)
      assert.equal(fs.existsSync(worktree()), true, 'pre-existing worktree untouched')
    })

    test('aborts before compose up when the previous image is missing locally', () => {
      fs.writeFileSync(path.join(stateDir, 'images'), 'other:tag\n')
      const r = run([SHA, '--approve-deploy'])
      assert.notEqual(r.status, 0)
      assert.match(r.out, /previous_image_missing/)
      assert.doesNotMatch(log(), /docker compose/)
      assert.doesNotMatch(log(), /sudo/)
      assert.equal(current(), OLD_IMAGE)
    })

    test('stops on first failure: build failure never reaches compose', () => {
      const r = run([SHA, '--approve-deploy'], { FAKE_BUILD_FAIL: '1' })
      assert.notEqual(r.status, 0)
      assert.doesNotMatch(log(), /docker compose/)
      assert.equal(fs.existsSync(pointer()), false)
      assert.equal(fs.existsSync(worktree()), true, 'worktree kept after a failure')
    })

    test('stops when git worktree add fails', () => {
      const r = run([SHA, '--approve-deploy'], { FAKE_GIT_FAIL_ADD: '1' })
      assert.notEqual(r.status, 0)
      assert.doesNotMatch(log(), /docker .*build/)
    })

    test('health failure rolls back automatically with the previous image', () => {
      const r = run([SHA, '--approve-deploy'], { FAKE_UNHEALTHY: NEW_IMAGE })
      assert.notEqual(r.status, 0)
      const ups = logLines().filter((l) => /^sudo BACKEND_IMAGE=.* docker compose up/.test(l))
      assert.equal(ups.length, 2, log())
      assert.match(ups[0], new RegExp(`BACKEND_IMAGE=${NEW_IMAGE}`))
      assert.match(ups[1], new RegExp(`BACKEND_IMAGE=${OLD_IMAGE}`))
      assert.equal(current(), OLD_IMAGE)
      assert.match(r.out, /rolled_back/i)
      assert.equal(fs.existsSync(worktree()), true, 'worktree kept after a failure')
    })

    test('reports loudly when the rollback itself is unhealthy', () => {
      const r = run([SHA, '--approve-deploy'], { FAKE_UNHEALTHY: `${NEW_IMAGE} ${OLD_IMAGE}` })
      assert.notEqual(r.status, 0)
      assert.match(r.out, /rollback_unhealthy/i)
      assert.equal(current(), OLD_IMAGE)
    })

    test('compose up failure also attempts the rollback', () => {
      // Fails only for the new image: the fake reads FAKE_COMPOSE_FAIL for every call,
      // so use a flag file instead through unhealthy semantics is not possible; assert attempt count.
      const r = run([SHA, '--approve-deploy'], { FAKE_COMPOSE_FAIL: '1' })
      assert.notEqual(r.status, 0)
      const ups = logLines().filter((l) => /docker compose up/.test(l))
      assert.equal(ups.length, 2, log())
      assert.match(r.out, /rollback_unhealthy/i)
    })
  })

  describe('--rollback', () => {
    beforeEach(() => {
      fs.mkdirSync(path.dirname(pointer()), { recursive: true })
      fs.writeFileSync(pointer(), 'cotizador-backend:prevprev\n')
      fs.writeFileSync(path.join(stateDir, 'images'), `${OLD_IMAGE}\ncotizador-backend:prevprev\n`)
    })

    test('without --approve-deploy only prints the plan', () => {
      const r = run(['--rollback'])
      assert.equal(r.status, 0, r.out)
      assert.match(r.out, /prevprev/)
      assert.doesNotMatch(log(), /compose/)
      assert.equal(current(), OLD_IMAGE)
    })

    test('with --approve-deploy restores the pointer image and checks health', () => {
      const r = run(['--rollback', '--approve-deploy'])
      assert.equal(r.status, 0, r.out)
      assert.equal(current(), 'cotizador-backend:prevprev')
      assert.match(
        log(),
        /sudo BACKEND_IMAGE=cotizador-backend:prevprev docker compose up -d --no-deps --no-build --force-recreate backend/
      )
      assert.match(log(), /exec cotizador-tajy-backend node -e/)
    })

    test('fails when the pointer file is missing', () => {
      fs.rmSync(pointer())
      const r = run(['--rollback', '--approve-deploy'])
      assert.notEqual(r.status, 0)
      assert.match(r.out, /pointer_missing/)
      assert.doesNotMatch(log(), /compose/)
    })

    test('fails when the pointer image is not on the host', () => {
      fs.writeFileSync(path.join(stateDir, 'images'), `${OLD_IMAGE}\n`)
      const r = run(['--rollback', '--approve-deploy'])
      assert.notEqual(r.status, 0)
      assert.match(r.out, /previous_image_missing/)
      assert.doesNotMatch(log(), /compose/)
    })

    test('reports an unhealthy rollback with non-zero exit', () => {
      const r = run(['--rollback', '--approve-deploy'], {
        FAKE_UNHEALTHY: 'cotizador-backend:prevprev',
      })
      assert.notEqual(r.status, 0)
      assert.match(r.out, /rollback_unhealthy/i)
    })

    test('rejects a pointer with unsafe content', () => {
      fs.writeFileSync(pointer(), 'x; rm -rf /\n')
      const r = run(['--rollback', '--approve-deploy'])
      assert.notEqual(r.status, 0)
      assert.doesNotMatch(log(), /compose/)
    })
  })
})
