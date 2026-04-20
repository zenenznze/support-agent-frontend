    import fs from 'node:fs'
    import path from 'node:path'
    import { fileURLToPath } from 'node:url'
    import express from 'express'
    import cors from 'cors'
    import dotenv from 'dotenv'
    import { randomUUID } from 'node:crypto'
    import { callExperimentalSupport } from './experimental-handler.js'
    import { appendExperimentalTranscriptItems, getExperimentalTranscript } from './experimental-store.js'

    dotenv.config()

    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    const ROOT_DIR = path.resolve(__dirname, '..')
    const DATA_DIR = process.env.BRIDGE_DATA_DIR ? path.resolve(process.env.BRIDGE_DATA_DIR) : path.join(ROOT_DIR, 'data')
    const FRONTEND_DIST_DIR = process.env.FRONTEND_DIST_DIR ? path.resolve(process.env.FRONTEND_DIST_DIR) : path.resolve(ROOT_DIR, '../frontend/dist')
    const MAPPINGS_FILE = path.join(DATA_DIR, 'visitor-sessions.json')
    const TRANSCRIPTS_FILE = path.join(DATA_DIR, 'mock-transcripts.json')

    const PORT = Number(process.env.PORT || 8787)
    const BRIDGE_MODE = process.env.BRIDGE_MODE || 'mock'
    const BACKEND_CHAT_URL = process.env.BACKEND_CHAT_URL || ''
    const BACKEND_HISTORY_URL = process.env.BACKEND_HISTORY_URL || ''
    const BACKEND_TIMEOUT_MS = Number(process.env.BACKEND_TIMEOUT_MS || 60000)
    const MOCK_ASSISTANT_NAME = process.env.MOCK_ASSISTANT_NAME || 'Support Bot'

    fs.mkdirSync(DATA_DIR, { recursive: true })

    const app = express()
    app.use(cors())
    app.use(express.json({ limit: '1mb' }))

    function readJson(file, fallback) {
      if (!fs.existsSync(file)) return fallback
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8'))
      } catch {
        return fallback
      }
    }

    function writeJson(file, data) {
      fs.writeFileSync(file, JSON.stringify(data, null, 2))
    }

    function loadMappings() {
      return readJson(MAPPINGS_FILE, { visitors: {} })
    }

    function saveMappings(data) {
      writeJson(MAPPINGS_FILE, data)
    }

    function loadMockTranscripts() {
      return readJson(TRANSCRIPTS_FILE, { sessions: {} })
    }

    function saveMockTranscripts(data) {
      writeJson(TRANSCRIPTS_FILE, data)
    }

    function getVisitorId(req) {
      return req.header('x-visitor-id') || req.body?.visitorId || req.query?.visitorId
    }

    function assertVisitorId(visitorId) {
      return typeof visitorId === 'string' && visitorId.trim().length >= 8
    }

    function getOrCreateSession(visitorId) {
      const store = loadMappings()
      const existing = store.visitors[visitorId]
      if (existing) {
        existing.updatedAt = Date.now()
        saveMappings(store)
        return { sessionKey: existing.sessionKey, isNew: false }
      }

      const sessionKey = `support:webchat:${visitorId}`
      store.visitors[visitorId] = { visitorId, sessionKey, createdAt: Date.now(), updatedAt: Date.now() }
      saveMappings(store)
      return { sessionKey, isNew: true }
    }

    function normalizeRole(role) {
      return role === 'assistant' ? 'assistant' : role === 'user' ? 'user' : null
    }

    function inferRole(item) {
      if (item.kind === 'assistant' || item.author === 'assistant') return 'assistant'
      if (item.kind === 'user' || item.author === 'user') return 'user'
      if (item.direction === 'outbound') return 'assistant'
      if (Array.isArray(item.content) && item.senderLabel === 'gateway-client') return 'user'
      return null
    }

    function extractText(item) {
      if (typeof item.text === 'string') return item.text
      if (typeof item.message === 'string') return item.message
      if (typeof item.content === 'string') return item.content
      if (Array.isArray(item.content)) {
        return item.content.map((part) => {
          if (typeof part?.text === 'string') return part.text
          if (typeof part?.content === 'string') return part.content
          return ''
        }).filter(Boolean).join('\n').trim()
      }
      if (item.message && typeof item.message === 'object') {
        if (typeof item.message.text === 'string') return item.message.text
        if (Array.isArray(item.message.content)) {
          return item.message.content.map((part) => (typeof part?.text === 'string' ? part.text : '')).filter(Boolean).join('\n').trim()
        }
      }
      if (item.parts && Array.isArray(item.parts)) {
        return item.parts.map((part) => part?.text || '').join('\n').trim()
      }
      if (item.payload?.text) return item.payload.text
      return ''
    }

    function normalizeTranscriptItems(items = []) {
      return items
        .filter(Boolean)
        .map((item) => ({
          id: item.id || item.messageId || randomUUID(),
          role: normalizeRole(item.role || inferRole(item)),
          text: extractText(item),
          timestamp: item.timestamp || item.createdAt || Date.now()
        }))
        .filter((item) => (item.role === 'assistant' || item.role === 'user') && item.text)
    }

    function ensureMockSession(sessionKey) {
      const store = loadMockTranscripts()
      if (!store.sessions[sessionKey]) {
        store.sessions[sessionKey] = []
        saveMockTranscripts(store)
      }
      return store
    }

    function buildMockReply(message) {
      const normalized = String(message || '').trim()
      if (!normalized) {
        return `Hello, I am ${MOCK_ASSISTANT_NAME}. How can I help?`
      }
      return [
        `Hello, I am ${MOCK_ASSISTANT_NAME}.`,
        `You said: ${normalized}`,
        '',
        'This is the safe mock path, useful for UI and session testing before wiring a real backend.'
      ].join('\n')
    }

    async function fetchJson(url, init = {}) {
      const response = await fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers || {})
        },
        signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS)
      })
      const text = await response.text()
      let payload = {}
      try {
        payload = JSON.parse(text || '{}')
      } catch {
        throw new Error(`Expected JSON from backend: ${text.slice(0, 200)}`)
      }
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error?.message || payload?.message || `Backend request failed: ${response.status}`)
      }
      return payload
    }

    async function fetchExternalHistory(sessionKey, visitorId) {
      if (!BACKEND_HISTORY_URL) throw new Error('BACKEND_HISTORY_URL is not configured')
      const url = new URL(BACKEND_HISTORY_URL)
      url.searchParams.set('visitorId', visitorId)
      url.searchParams.set('sessionKey', sessionKey)
      const payload = await fetchJson(url.toString(), { method: 'GET', headers: { 'x-visitor-id': visitorId } })
      return normalizeTranscriptItems(payload.history || payload.messages || payload.transcript || [])
    }

    async function sendExternalChat(sessionKey, visitorId, message) {
      if (!BACKEND_CHAT_URL) throw new Error('BACKEND_CHAT_URL is not configured')
      const payload = await fetchJson(BACKEND_CHAT_URL, {
        method: 'POST',
        headers: { 'x-visitor-id': visitorId },
        body: JSON.stringify({ visitorId, sessionKey, message })
      })
      const history = normalizeTranscriptItems(payload.history || payload.messages || [])
      const reply = history.at(-1) || payload.reply || { id: randomUUID(), role: 'assistant', text: 'Received.', timestamp: Date.now() }
      return { history, reply }
    }

    async function fetchHistory(sessionKey, visitorId) {
      if (BRIDGE_MODE === 'mock') {
        const store = ensureMockSession(sessionKey)
        return normalizeTranscriptItems(store.sessions[sessionKey] || [])
      }
      if (BRIDGE_MODE === 'external') {
        return fetchExternalHistory(sessionKey, visitorId)
      }
      throw new Error(`Unsupported BRIDGE_MODE: ${BRIDGE_MODE}`)
    }

    function fetchExperimentalHistory(sessionKey) {
      return normalizeTranscriptItems(getExperimentalTranscript(DATA_DIR, sessionKey))
    }

    async function sendChat(sessionKey, visitorId, message) {
      if (BRIDGE_MODE === 'mock') {
        const store = ensureMockSession(sessionKey)
        const sessionItems = store.sessions[sessionKey] || []
        const userItem = { id: randomUUID(), role: 'user', text: message, timestamp: Date.now() }
        const assistantItem = { id: randomUUID(), role: 'assistant', text: buildMockReply(message), timestamp: Date.now() + 1 }
        sessionItems.push(userItem, assistantItem)
        store.sessions[sessionKey] = sessionItems
        saveMockTranscripts(store)
        return { history: normalizeTranscriptItems(sessionItems), reply: assistantItem }
      }
      if (BRIDGE_MODE === 'external') {
        return sendExternalChat(sessionKey, visitorId, message)
      }
      throw new Error(`Unsupported BRIDGE_MODE: ${BRIDGE_MODE}`)
    }

    app.get('/api/health', (_req, res) => {
      res.json({ ok: true, mode: BRIDGE_MODE })
    })

    app.post('/api/session/init', async (req, res) => {
      const visitorId = getVisitorId(req)
      if (!assertVisitorId(visitorId)) {
        return res.status(400).json({ ok: false, error: { code: 'INVALID_VISITOR_ID', message: 'Invalid visitor id' } })
      }
      try {
        const { sessionKey, isNew } = getOrCreateSession(visitorId)
        const history = await fetchHistory(sessionKey, visitorId)
        return res.json({ ok: true, visitorId, sessionKey, isNew, history })
      } catch (error) {
        return res.status(502).json({ ok: false, error: { code: 'PRIMARY_BACKEND_UNAVAILABLE', message: error.message } })
      }
    })

    app.post('/api/session/init/experimental', (req, res) => {
      const visitorId = getVisitorId(req)
      if (!assertVisitorId(visitorId)) {
        return res.status(400).json({ ok: false, error: { code: 'INVALID_VISITOR_ID', message: 'Invalid visitor id' } })
      }
      try {
        const { sessionKey, isNew } = getOrCreateSession(visitorId)
        const history = fetchExperimentalHistory(sessionKey)
        return res.json({ ok: true, visitorId, sessionKey, isNew, history, backend: 'experimental' })
      } catch (error) {
        return res.status(502).json({ ok: false, error: { code: 'EXPERIMENTAL_BACKEND_UNAVAILABLE', message: error.message } })
      }
    })

    app.get('/api/history', async (req, res) => {
      const visitorId = getVisitorId(req)
      if (!assertVisitorId(visitorId)) {
        return res.status(400).json({ ok: false, error: { code: 'INVALID_VISITOR_ID', message: 'Invalid visitor id' } })
      }
      try {
        const { sessionKey } = getOrCreateSession(visitorId)
        const messages = await fetchHistory(sessionKey, visitorId)
        return res.json({ ok: true, visitorId, sessionKey, messages })
      } catch (error) {
        return res.status(502).json({ ok: false, error: { code: 'PRIMARY_BACKEND_UNAVAILABLE', message: error.message } })
      }
    })

    app.get('/api/history/experimental', (req, res) => {
      const visitorId = getVisitorId(req)
      if (!assertVisitorId(visitorId)) {
        return res.status(400).json({ ok: false, error: { code: 'INVALID_VISITOR_ID', message: 'Invalid visitor id' } })
      }
      try {
        const { sessionKey } = getOrCreateSession(visitorId)
        const messages = fetchExperimentalHistory(sessionKey)
        return res.json({ ok: true, visitorId, sessionKey, messages, backend: 'experimental' })
      } catch (error) {
        return res.status(502).json({ ok: false, error: { code: 'EXPERIMENTAL_BACKEND_UNAVAILABLE', message: error.message } })
      }
    })

    app.post('/api/chat', async (req, res) => {
      const visitorId = getVisitorId(req)
      const message = req.body?.message
      if (!assertVisitorId(visitorId)) {
        return res.status(400).json({ ok: false, error: { code: 'INVALID_VISITOR_ID', message: 'Invalid visitor id' } })
      }
      if (typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Message is required' } })
      }
      try {
        const { sessionKey } = getOrCreateSession(visitorId)
        const result = await sendChat(sessionKey, visitorId, message.trim())
        return res.json({ ok: true, visitorId, sessionKey, reply: result.reply, history: result.history })
      } catch (error) {
        return res.status(502).json({ ok: false, error: { code: 'PRIMARY_BACKEND_REPLY_FAILED', message: error.message } })
      }
    })

    app.post('/api/chat/experimental', async (req, res) => {
      const visitorId = getVisitorId(req)
      const message = req.body?.message
      if (!assertVisitorId(visitorId)) {
        return res.status(400).json({ ok: false, error: { code: 'INVALID_VISITOR_ID', message: 'Invalid visitor id' } })
      }
      if (typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Message is required' } })
      }
      try {
        const { sessionKey } = getOrCreateSession(visitorId)
        const userItem = { id: randomUUID(), role: 'user', text: message.trim(), timestamp: Date.now() }
        const { reply, error } = await callExperimentalSupport(message.trim(), sessionKey)
        if (error) console.error('Experimental backend error:', error)
        const replyItem = { id: randomUUID(), role: 'assistant', text: reply, timestamp: Date.now() }
        const history = appendExperimentalTranscriptItems(DATA_DIR, sessionKey, [userItem, replyItem])
        return res.json({ ok: true, visitorId, sessionKey, reply: replyItem, history, backend: 'experimental' })
      } catch (error) {
        return res.status(502).json({ ok: false, error: { code: 'EXPERIMENTAL_BACKEND_REPLY_FAILED', message: error.message } })
      }
    })

    if (fs.existsSync(FRONTEND_DIST_DIR)) {
      app.use(express.static(FRONTEND_DIST_DIR))
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/')) return next()
        return res.sendFile(path.join(FRONTEND_DIST_DIR, 'index.html'))
      })
    }

    export function startServer() {
      return app.listen(PORT, () => {
        console.log(`Bridge listening on http://0.0.0.0:${PORT}`)
        if (fs.existsSync(FRONTEND_DIST_DIR)) {
          console.log(`Serving frontend from ${FRONTEND_DIST_DIR}`)
        }
      })
    }

    if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
      startServer()
    }
