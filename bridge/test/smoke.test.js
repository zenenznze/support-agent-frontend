import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

process.env.PORT = '0'
process.env.BRIDGE_MODE = 'mock'
process.env.BRIDGE_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'support-agent-frontend-'))
process.env.FRONTEND_DIST_DIR = path.join(process.env.BRIDGE_DATA_DIR, 'missing-frontend-dist')
process.env.MOCK_ASSISTANT_NAME = 'Support Bot'

const { startServer } = await import('../src/server.js')

function listen(server) {
  return new Promise((resolve) => {
    if (server.listening) return resolve()
    server.once('listening', resolve)
  })
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

test('mock bridge exposes health, session init, chat, and history', async () => {
  const server = startServer()
  await listen(server)
  const { port } = server.address()
  const baseUrl = `http://127.0.0.1:${port}`
  const visitorId = 'visitor-smoke-001'

  try {
    const health = await fetch(`${baseUrl}/api/health`).then((res) => res.json())
    assert.deepEqual(health, { ok: true, mode: 'mock' })

    const init = await fetch(`${baseUrl}/api/session/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId })
    }).then((res) => res.json())
    assert.equal(init.ok, true)
    assert.equal(init.visitorId, visitorId)
    assert.equal(init.sessionKey, `support:webchat:${visitorId}`)
    assert.deepEqual(init.history, [])

    const chat = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId, message: 'hello' })
    }).then((res) => res.json())
    assert.equal(chat.ok, true)
    assert.equal(chat.reply.role, 'assistant')
    assert.match(chat.reply.text, /You said: hello/)
    assert.equal(chat.history.length, 2)

    const history = await fetch(`${baseUrl}/api/history?visitorId=${visitorId}`).then((res) => res.json())
    assert.equal(history.ok, true)
    assert.equal(history.messages.length, 2)
  } finally {
    await close(server)
  }
})
