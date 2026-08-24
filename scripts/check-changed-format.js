#!/usr/bin/env node
/* global __dirname, console, process, require */

const { execFileSync, spawnSync } = require('node:child_process')
const path = require('node:path')

const baseRevision = process.argv[2]
const repositoryRoot = path.resolve(__dirname, '..')

function fail(message) {
  console.error(`Changed-files format check failed: ${message}`)
  process.exit(2)
}

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: options.encoding ?? 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  })
}

if (!baseRevision) {
  fail('an explicit base revision is required.')
}

let baseCommit
try {
  baseCommit = git(['rev-parse', '--verify', '--quiet', `${baseRevision}^{commit}`]).trim()
} catch {
  fail(`base revision "${baseRevision}" does not resolve to a commit.`)
}

try {
  git(['merge-base', baseCommit, 'HEAD'])
} catch {
  fail(`base revision "${baseRevision}" has no merge base with HEAD.`)
}

let changedFiles
try {
  const output = git(
    ['diff', '--name-only', '-z', '--diff-filter=ACMR', `${baseCommit}...HEAD`, '--'],
    {
      encoding: 'buffer',
    }
  )
  changedFiles = output.toString('utf8').split('\0').filter(Boolean)
} catch {
  fail(`could not collect changes from base revision "${baseRevision}".`)
}

async function main() {
  const prettier = await import('prettier')
  const eligibleFiles = []

  for (const file of changedFiles) {
    const fileInfo = await prettier.getFileInfo(path.join(repositoryRoot, file), {
      ignorePath: path.join(repositoryRoot, '.prettierignore'),
    })

    if (!fileInfo.ignored && fileInfo.inferredParser) {
      eligibleFiles.push(file)
    }
  }

  if (eligibleFiles.length === 0) {
    console.log('No Prettier-eligible changed files.')
    return
  }

  const prettierCli = require.resolve('prettier/bin/prettier.cjs')
  const result = spawnSync(process.execPath, [prettierCli, '--check', '--', ...eligibleFiles], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  })

  if (result.error) {
    fail(`could not run Prettier: ${result.error.message}`)
  }

  process.exit(result.status ?? 1)
}

main().catch((error) => fail(error.message))
