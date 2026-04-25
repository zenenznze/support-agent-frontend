    import { useEffect, useMemo, useState } from 'react'

    const THEME_KEY = 'support-agent-frontend-theme'

    type ChatMessage = {
      id?: string
      role: 'user' | 'assistant'
      text: string
      timestamp: number
    }

    declare global {
      interface Window {
        __SUPPORT_CHAT_CONFIG__?: {
          apiBaseUrl?: string
        }
      }
    }

    const API_BASE = window.__SUPPORT_CHAT_CONFIG__?.apiBaseUrl || ''
    const IS_EXPERIMENTAL_ROUTE = window.location.pathname.startsWith('/experimental')
    const VISITOR_KEY = IS_EXPERIMENTAL_ROUTE ? 'support-chat-experimental-visitor-id' : 'support-chat-visitor-id'
    const SESSION_INIT_ENDPOINT = IS_EXPERIMENTAL_ROUTE ? '/api/session/init/experimental' : '/api/session/init'
    const CHAT_ENDPOINT = IS_EXPERIMENTAL_ROUTE ? '/api/chat/experimental' : '/api/chat'
    const PAGE_TITLE = IS_EXPERIMENTAL_ROUTE ? 'Experimental Support Chat' : 'Support Chat'
    const PAGE_SUBTITLE = IS_EXPERIMENTAL_ROUTE
      ? 'Parallel path for validating a new backend without touching the default route.'
      : 'Anonymous visitors can start a session immediately.'
    const ASSISTANT_NAME = IS_EXPERIMENTAL_ROUTE ? '🧪 Experimental Bot' : '🧩 Support Bot'
    const BRAND_MARK = IS_EXPERIMENTAL_ROUTE ? '🧪' : '🧩'

    async function fetchJson(path: string, init?: RequestInit) {
      const normalizedBase = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE
      const normalizedPath = path.startsWith('/') ? path : `/${path}`
      const response = await fetch(`${normalizedBase}${normalizedPath}`, init)
      const contentType = response.headers.get('content-type') || ''
      const text = await response.text()

      if (!contentType.includes('application/json')) {
        throw new Error(`Expected JSON from ${path}, got ${contentType || 'unknown'}: ${text.slice(0, 120)}`)
      }

      let data: any
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(`Invalid JSON from ${path}: ${text.slice(0, 120)}`)
      }

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error?.message || `Request failed: ${response.status}`)
      }
      return data
    }

    function generateVisitorId() {
      if (crypto?.randomUUID) return crypto.randomUUID()
      return `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`
    }

    function getVisitorId() {
      const existing = localStorage.getItem(VISITOR_KEY)
      if (existing) return existing
      const next = generateVisitorId()
      localStorage.setItem(VISITOR_KEY, next)
      return next
    }

    function getInitialTheme() {
      const saved = localStorage.getItem(THEME_KEY)
      if (saved === 'light' || saved === 'dark') return saved
      return 'light'
    }

    function renderMessageText(text: string) {
      const lines = text.split('\n')
      return lines.map((line, lineIndex) => {
        const trimmed = line.trim()
        const pureUrl = /^https?:\/\/[^\s]+$/.test(trimmed)
        return (
          <>
            {pureUrl ? (
              <a href={trimmed} target="_blank" rel="noreferrer">{trimmed}</a>
            ) : (
              <span>{line}</span>
            )}
            {lineIndex < lines.length - 1 ? <br /> : null}
          </>
        )
      })
    }

    export function App() {
      const [visitorId] = useState(() => getVisitorId())
      const [messages, setMessages] = useState<ChatMessage[]>([])
      const [input, setInput] = useState('')
      const [loading, setLoading] = useState(true)
      const [sending, setSending] = useState(false)
      const [error, setError] = useState('')
      const [theme, setTheme] = useState<'light' | 'dark'>(() => getInitialTheme())

      useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme)
        localStorage.setItem(THEME_KEY, theme)
      }, [theme])

      useEffect(() => {
        const bootstrap = async () => {
          setLoading(true)
          setError('')
          try {
            const data = await fetchJson(SESSION_INIT_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-visitor-id': visitorId },
              body: JSON.stringify({ visitorId })
            })
            setMessages(data.history || [])
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Initialization failed')
          } finally {
            setLoading(false)
          }
        }
        bootstrap()
      }, [visitorId])

      const sortedMessages = useMemo(
        () => [...messages].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)),
        [messages]
      )

      const onSend = async () => {
        const text = input.trim()
        if (!text || sending) return

        const optimistic: ChatMessage = {
          id: `local-${Date.now()}`,
          role: 'user',
          text,
          timestamp: Date.now()
        }

        setMessages((prev) => [...prev, optimistic])
        setInput('')
        setSending(true)
        setError('')

        try {
          const data = await fetchJson(CHAT_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-visitor-id': visitorId },
            body: JSON.stringify({ visitorId, message: text })
          })
          if (Array.isArray(data.history)) {
            setMessages(data.history)
          } else if (data.reply) {
            setMessages((prev) => [...prev, data.reply])
          } else {
            setMessages((prev) => prev.filter((item) => item.id !== optimistic.id))
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Send failed')
          setMessages((prev) => prev.filter((item) => item.id !== optimistic.id))
          setInput(text)
        } finally {
          setSending(false)
        }
      }

      return (
        <div className="app-shell">
          <div className="chat-card">
            <header className="chat-header">
              <div className="header-brand">
                <span className="brand-logo">{BRAND_MARK}</span>
                <div>
                  <h1>{PAGE_TITLE}</h1>
                  <p>{PAGE_SUBTITLE}</p>
                </div>
              </div>
              <div className="header-actions">
                <button className="theme-toggle" onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))} type="button">
                  {theme === 'light' ? 'Dark' : 'Light'}
                </button>
                <span className="status-pill">{sending ? 'Replying' : loading ? 'Connecting' : 'Online'}</span>
              </div>
            </header>

            <main className="chat-body">
              {loading ? (
                <div className="empty-state">{BRAND_MARK} connecting…</div>
              ) : sortedMessages.length === 0 ? (
                <div className="empty-state">
                  <div className="welcome-icon">{BRAND_MARK}</div>
                  <div className="welcome-title">Welcome to {PAGE_TITLE}</div>
                  <div className="welcome-sub">Ask anything to start a clean anonymous session.</div>
                </div>
              ) : (
                sortedMessages.map((message) => (
                  <div key={message.id || `${message.role}-${message.timestamp}`} className={`bubble-row ${message.role}`}>
                    <div className={`bubble ${message.role}`}>
                      <div className="bubble-role">{message.role === 'user' ? 'You' : ASSISTANT_NAME}</div>
                      <div className="bubble-text">{renderMessageText(message.text)}</div>
                    </div>
                  </div>
                ))
              )}
            </main>

            <footer className="chat-footer">
              {error ? <div className="error-banner">{error}</div> : null}
              <div className="composer">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Type your message… Enter for newline, Ctrl/Cmd+Enter to send"
                  rows={3}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault()
                      onSend()
                    }
                  }}
                />
                <button onClick={onSend} disabled={sending || !input.trim()}>
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
              <div className="footer-brand">support-agent-frontend starter</div>
            </footer>
          </div>
        </div>
      )
    }
