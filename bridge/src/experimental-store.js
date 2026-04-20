import fs from 'node:fs'
import path from 'node:path'

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

export function getExperimentalTranscriptStorePath(dataDir) {
  return path.join(dataDir, 'experimental-transcripts.json')
}

export function getExperimentalTranscript(dataDir, sessionKey) {
  const store = readJson(getExperimentalTranscriptStorePath(dataDir), { sessions: {} })
  return Array.isArray(store.sessions?.[sessionKey]) ? store.sessions[sessionKey] : []
}

export function appendExperimentalTranscriptItems(dataDir, sessionKey, items) {
  const file = getExperimentalTranscriptStorePath(dataDir)
  const store = readJson(file, { sessions: {} })
  const current = Array.isArray(store.sessions?.[sessionKey]) ? store.sessions[sessionKey] : []
  const next = current.concat((items || []).filter(Boolean))
  store.sessions[sessionKey] = next
  writeJson(file, store)
  return next
}
