import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { resolveLocalOutputPath } from './render-mrc-propuesta-local.js'

const SCRIPT_PATH = fileURLToPath(new URL('./render-mrc-propuesta-local.js', import.meta.url))
const BACKEND_DIRECTORY = fileURLToPath(new URL('../', import.meta.url))
const TMP_DIRECTORY = resolve(BACKEND_DIRECTORY, 'tmp')

function runCli(args) {
  return new Promise((resolveProcess, reject) => {
    const child = spawn(process.execPath, [SCRIPT_PATH, ...args], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.once('error', reject)
    child.once('close', (code) => resolveProcess({ code, stderr }))
  })
}

async function assertDoesNotExist(path) {
  await assert.rejects(() => access(path), { code: 'ENOENT' })
}

test('local MRC renderer accepts output paths below backend/tmp', () => {
  assert.equal(
    resolveLocalOutputPath('tmp/pf3/path-safety.pdf'),
    resolve(TMP_DIRECTORY, 'pf3/path-safety.pdf')
  )
  assert.equal(
    resolveLocalOutputPath('tmp/pf3/path-safety.json'),
    resolve(TMP_DIRECTORY, 'pf3/path-safety.json')
  )
})

test('local MRC renderer rejects traversal and outside outputs before writing', async () => {
  const suffix = `${process.pid}-${Date.now()}`
  const traversalTarget = resolve(BACKEND_DIRECTORY, `../pf3-renderer-traversal-${suffix}.pdf`)
  const metricsTarget = resolve(BACKEND_DIRECTORY, `../pf3-renderer-metrics-${suffix}.json`)
  const permittedOutput = resolve(TMP_DIRECTORY, `pf3-renderer-output-${suffix}.pdf`)

  await assertDoesNotExist(traversalTarget)
  await assertDoesNotExist(metricsTarget)
  await assertDoesNotExist(permittedOutput)

  const traversalResult = await runCli(['a', `../pf3-renderer-traversal-${suffix}.pdf`])
  assert.equal(traversalResult.code, 1)
  assert.match(traversalResult.stderr, /backend[\\/]tmp/)
  await assertDoesNotExist(traversalTarget)

  const metricsResult = await runCli([
    'a',
    `tmp/pf3-renderer-output-${suffix}.pdf`,
    `../pf3-renderer-metrics-${suffix}.json`,
  ])
  assert.equal(metricsResult.code, 1)
  assert.match(metricsResult.stderr, /backend[\\/]tmp/)
  await assertDoesNotExist(permittedOutput)
  await assertDoesNotExist(metricsTarget)
})
