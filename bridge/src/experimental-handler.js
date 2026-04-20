import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PYTHON_BIN = process.env.PYTHON_BIN || '/usr/bin/python3'
const HELPER_SCRIPT = process.env.EXPERIMENTAL_HELPER_SCRIPT || path.join(__dirname, 'experimental_bridge.py')
const HANDLER_TIMEOUT_MS = Number(process.env.EXPERIMENTAL_HANDLER_TIMEOUT_MS || 65000)

export async function callExperimentalSupport(message, sessionKey) {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(result)
    }

    const child = spawn(PYTHON_BIN, [HELPER_SCRIPT], {
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    })

    child.on('error', (error) => {
      finish({ reply: 'Experimental backend unavailable right now.', error: error.message })
    })

    child.stdout.on('data', (data) => { stdout += data.toString() })
    child.stderr.on('data', (data) => { stderr += data.toString() })

    child.on('close', (code) => {
      if (code !== 0) {
        finish({ reply: 'Experimental backend unavailable right now.', error: stderr || `Helper exited with code ${code}` })
        return
      }
      try {
        const payload = JSON.parse(stdout || '{}')
        finish({ reply: payload.reply || 'Received.', ...(payload.error ? { error: payload.error } : {}) })
      } catch (error) {
        finish({ reply: 'Experimental backend unavailable right now.', error: `Invalid helper output: ${error.message}; raw=${stdout}` })
      }
    })

    child.stdin.write(JSON.stringify({ message, sessionKey }))
    child.stdin.end()

    const timeout = setTimeout(() => {
      child.kill()
      finish({ reply: 'Experimental backend timed out.', error: `Timeout after ${HANDLER_TIMEOUT_MS}ms` })
    }, HANDLER_TIMEOUT_MS)
  })
}
