import { execFile, spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function taskkillProcessTree(pid, execFileAsyncImpl = execFileAsync) {
  await execFileAsyncImpl('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
}

export async function cleanupSuccessfulArtifacts(exitCode, artifactsDirectory, remove = rm) {
  if (exitCode !== 0) return false
  await remove(artifactsDirectory, { recursive: true, force: true })
  return true
}

export function runProcess(
  executable,
  args,
  {
    cwd = process.cwd(),
    env = process.env,
    stdio = 'inherit',
    timeoutMs = 120000,
    killGraceMs = 5000,
    spawnProcess = spawn,
    platform = process.platform,
    taskkill = taskkillProcessTree,
    logger = console,
  } = {}
) {
  let child
  try {
    child = spawnProcess(executable, args, { cwd, env, stdio })
  } catch (error) {
    return Promise.reject(error)
  }

  return new Promise((resolve, reject) => {
    let timedOut = false
    let terminalError = null
    let terminating = false
    let settled = false
    let fallbackTimer

    const finish = (code, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      clearTimeout(fallbackTimer)
      if (terminalError) reject(terminalError)
      else resolve(timedOut || signal ? 1 : (code ?? 1))
    }

    const terminate = async () => {
      if (terminating || child.exitCode !== null || child.signalCode) return
      terminating = true
      if (!child.pid) {
        finish(1)
        return
      }
      if (platform === 'win32') {
        try {
          await taskkill(child.pid)
        } catch (error) {
          logger.error(`Could not taskkill child process tree: ${error.message}`)
          child.kill('SIGTERM')
        }
        return
      }

      child.kill('SIGTERM')
      fallbackTimer = setTimeout(() => child.kill('SIGKILL'), killGraceMs)
    }

    const timeout = setTimeout(() => {
      timedOut = true
      void terminate()
    }, timeoutMs)

    child.once('close', finish)
    child.once('error', (error) => {
      terminalError = error
      if (!child.pid) finish(1)
      else void terminate()
    })
  })
}
