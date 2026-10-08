import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import crypto from 'crypto'
import { promises as fs } from 'fs'
import { MBTI_BANK } from './web/src/lib/mbti-bank.ts'
import {
  createSession,
  applyAnswer,
  shouldClarify,
  canEnd,
  computeType,
  pickNext,
} from './web/src/lib/mbti-engine.ts'
import { CLASSIFY_SYSTEM_PROMPT } from './web/src/lib/prompts.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const app = express()
app.use(express.json({ limit: '1mb' }))

const PORT = process.env.PORT || 8787
const distDir = join(__dirname, 'dist')
const dataDir = join(__dirname, 'data')
const settingsFile = join(dataDir, 'settings.json')
const keysFile = join(dataDir, 'keys.json')

app.use(express.static(distDir))

const sessions = new Map()
const stats = { start: 0, answer: 0, done: 0, reset: 0, perCode: {} }

const DEFAULTS = { provider: 'zxGateway', baseURL: '', model: '', maxTokens: 1024, temperature: 0.4 }

const now = () => Date.now()
const progressOf = (s) => ({ qCount: s.qCount, minQ: s.minQ, maxQ: s.maxQ })
const publicQ = (q) => ({ id: q.id, axis: q.axis, stem: q.stem, optionA: q.optionA, optionB: q.optionB })

function cleanup() {
  const ttl = 45 * 60 * 1000
  const t = now()
  for (const [k, s] of sessions) if (t - s.lastAt > ttl) sessions.delete(k)
}
setInterval(cleanup, 60 * 1000)

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

async function loadSettings() {
  const s = { ...DEFAULTS, ...(await readJson(settingsFile, {})) }
  const k = await readJson(keysFile, {})
  return { settings: s, keys: k }
}

/** 调用 OpenAI 兼容接口做归类;未配置或失败时回退到规则法 */
async function classify(text, q, history) {
  const { settings, keys } = await loadSettings()
  const apiKey = (settings.apiKey || keys.apiKey || '').trim()
  let baseURL = (settings.baseURL || '').trim().replace(/\/$/, '')
  if (!baseURL && settings.provider === 'zxGateway') {
    baseURL = (process.env.ZX_GATEWAY_BASE_URL || '').trim().replace(/\/$/, '')
  }
  if (!baseURL) return classifyNaive(text)
  const url = baseURL.endsWith('/chat/completions') ? baseURL : baseURL + '/chat/completions'
  const recent = history.slice(-4).map((h) => `${h.qId} 归类=${h.cls}`).join('; ')
  const userMsg =
    `题干：${q.stem}\nA) ${q.optionA}\nB) ${q.optionB}\n` +
    (recent ? `此前作答：${recent}\n` : '') +
    `用户回答：${text}`
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 20000)
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: apiKey ? `Bearer ${apiKey}` : '' },
      body: JSON.stringify({
        model: settings.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
          { role: 'user', content: userMsg },
        ],
        temperature: Number(settings.temperature ?? 0.4),
        max_tokens: Number(settings.maxTokens ?? 1024),
        response_format: { type: 'json_object' },
      }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!r.ok) return classifyNaive(text)
    const data = await r.json()
    const content = data?.choices?.[0]?.message?.content || ''
    const parsed = JSON.parse(content)
    return normalizeCls(parsed.cls)
  } catch {
    return classifyNaive(text)
  }
}

function normalizeCls(v) {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return 0
  return Math.max(-2, Math.min(2, n))
}

function classifyNaive(text) {
  const t = (text || '').toLowerCase()
  if (/强烈b|很像b|绝对b|肯定b/.test(t)) return -2
  if (/强烈a|很像a|绝对a|肯定a/.test(t)) return 2
  if (/更像b|倾向b|比较b|选b|^b$/.test(t)) return -1
  if (/更像a|倾向a|比较a|选a|^a$/.test(t)) return 1
  return 0
}

app.post('/api/mbti/start', (_req, res) => {
  const id = crypto.randomUUID()
  const s = createSession(id)
  const q = pickNext(s, MBTI_BANK)
  sessions.set(id, s)
  stats.start++
  res.json({ sessionId: id, question: q ? publicQ(q) : null, progress: progressOf(s), conf: s.conf })
})

app.post('/api/mbti/answer', async (req, res) => {
  const { sessionId, text } = req.body || {}
  const s = sessions.get(sessionId)
  if (!s) return res.status(404).json({ error: 'not_found' })
  if (s.done) return res.status(400).json({ error: 'done' })
  const q = MBTI_BANK.find((x) => x.id === s.currentQId)
  if (!q) return res.status(500).json({ error: 'no_current' })
  s.lastAt = now()

  if (shouldClarify(s)) {
    s.clarifying = true
    return res.json({
      clarify: true,
      text: '方便再具体一点吗？比如更常是哪种做法、更自然的是哪一边。',
      progress: progressOf(s),
      conf: s.conf,
    })
  }

  const cls = await classify(text, q, s.history)
  applyAnswer(s, q, cls)
  stats.answer++

  if (canEnd(s)) {
    s.done = true
    s.resultCode = computeType(s)
    stats.done++
    stats.perCode[s.resultCode] = (stats.perCode[s.resultCode] || 0) + 1
    return res.json({ done: true, resultCode: s.resultCode, progress: progressOf(s), conf: s.conf })
  }

  const next = pickNext(s, MBTI_BANK)
  if (!next) {
    s.done = true
    s.resultCode = computeType(s)
    stats.done++
    stats.perCode[s.resultCode] = (stats.perCode[s.resultCode] || 0) + 1
    return res.json({ done: true, resultCode: s.resultCode, progress: progressOf(s), conf: s.conf })
  }
  return res.json({ question: publicQ(next), progress: progressOf(s), conf: s.conf })
})

app.post('/api/mbti/reset', (req, res) => {
  const { sessionId } = req.body || {}
  if (sessionId && sessions.delete(sessionId)) stats.reset++
  res.json({ ok: true })
})

app.post('/api/mbti/stats', (req, res) => {
  const { type, code } = req.body || {}
  if (type === 'start') stats.start++
  else if (type === 'answer') stats.answer++
  else if (type === 'reset') stats.reset++
  else if (type === 'done') {
    stats.done++
    if (typeof code === 'string') stats.perCode[code] = (stats.perCode[code] || 0) + 1
  }
  res.json({ ok: true })
})

app.get('/api/mbti/stats', (_req, res) => res.json(stats))

// ---- 设置(服务端保存;支持博客 AI 网关或自定义 OpenAI 兼容) ----
app.get('/api/settings', async (_req, res) => {
  const { settings, keys } = await loadSettings()
  res.json({
    provider: settings.provider,
    baseURL: settings.baseURL || '',
    model: settings.model || '',
    maxTokens: settings.maxTokens ?? 1024,
    temperature: settings.temperature ?? 0.4,
    hasKey: Boolean(settings.apiKey || keys.apiKey),
  })
})

app.post('/api/settings', async (req, res) => {
  const b = req.body || {}
  const cur = { ...DEFAULTS, ...(await readJson(settingsFile, {})) }
  const keys = await readJson(keysFile, {})
  const next = {
    provider: typeof b.provider === 'string' ? b.provider : cur.provider,
    baseURL: typeof b.baseURL === 'string' ? b.baseURL : cur.baseURL,
    model: typeof b.model === 'string' ? b.model : cur.model,
    maxTokens: Number.isFinite(Number(b.maxTokens)) ? Number(b.maxTokens) : cur.maxTokens,
    temperature: Number.isFinite(Number(b.temperature)) ? Number(b.temperature) : cur.temperature,
  }
  if (typeof b.apiKey === 'string') {
    if (b.apiKey) keys.apiKey = b.apiKey
    else delete keys.apiKey
  }
  await fs.mkdir(dataDir, { recursive: true })
  await fs.writeFile(settingsFile, JSON.stringify(next, null, 2))
  await fs.writeFile(keysFile, JSON.stringify(keys, null, 2))
  res.json({ ok: true, hasKey: Boolean(keys.apiKey) })
})

app.get('*', (_req, res) => res.sendFile(join(distDir, 'index.html')))

app.listen(PORT, () => console.log('mbti-web listening on :' + PORT))
