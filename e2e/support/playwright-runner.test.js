import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { cleanupSuccessfulArtifacts, runProcess } from './playwright-runner.js'

function childProcess(pid = 4321) {
  const child = new EventEmitter()
  child.pid = pid
  child.exitCode = null
  child.signalCode = null
  child.kill = () => true
  return child
}

test('runProcess() returns a normal child exit code with inherited process options', async () => {
  const child = childProcess()
  const result = await runProcess('node', ['-e', ''], {
    cwd: 'fixture-cwd',
    env: { FIXTURE: '1' },
    spawnProcess(executable, args, options) {
      assert.equal(executable, 'node')
      assert.deepEqual(args, ['-e', ''])
      assert.equal(options.stdio, 'inherit')
      assert.equal(options.cwd, 'fixture-cwd')
      assert.deepEqual(options.env, { FIXTURE: '1' })
      queueMicrotask(() => child.emit('close', 0, null))
      return child
    },
  })
  assert.equal(result, 0)
})

test('runProcess() taskkills a timed-out Windows tree and waits for close', async () => {
  const child = childProcess()
  let taskkillPid
  let closeObserved = false
  const result = await runProcess('node', [], {
    timeoutMs: 1,
    platform: 'win32',
    spawnProcess: () => child,
    taskkill: async (pid) => {
      taskkillPid = pid
      setTimeout(() => {
        closeObserved = true
        child.emit('close', null, 'SIGKILL')
      }, 1)
    },
    logger: { error() {} },
  })
  assert.equal(taskkillPid, 4321)
  assert.equal(closeObserved, true)
  assert.equal(result, 1)
})

test('runProcess() propagates spawn errors after its child closes', async () => {
  const child = childProcess()
  const failure = new Error('spawn failed')
  let closed = false
  await assert.rejects(
    runProcess('node', [], {
      platform: 'win32',
      spawnProcess: () => {
        queueMicrotask(() => child.emit('error', failure))
        return child
      },
      taskkill: async () => {
        setTimeout(() => {
          closed = true
          child.emit('close', null, 'SIGKILL')
        }, 1)
      },
      logger: { error() {} },
    }),
    failure
  )
  assert.equal(closed, true)
})

test('cleanupSuccessfulArtifacts() removes only successful-run artifacts', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'playwright-runner-'))
  const successDirectory = path.join(directory, 'success')
  const failureDirectory = path.join(directory, 'failure')
  try {
    await Promise.all([mkdir(successDirectory), mkdir(failureDirectory)])
    await writeFile(path.join(successDirectory, 'trace.zip'), 'success')
    await writeFile(path.join(failureDirectory, 'trace.zip'), 'failure')
    assert.equal(await cleanupSuccessfulArtifacts(0, successDirectory), true)
    assert.equal(await cleanupSuccessfulArtifacts(1, failureDirectory), false)
    await assert.rejects(readFile(path.join(successDirectory, 'trace.zip')))
    assert.equal(await readFile(path.join(failureDirectory, 'trace.zip'), 'utf8'), 'failure')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
