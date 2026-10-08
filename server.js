import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import crypto from 'crypto'
import { promises as fs } from 'fs'
import { MBTI_BANK } from './web/src/lib/mbti-bank.ts'
import {
  createSession,
  pickProbe,
  applyAnswer,
  shouldClarify,
  canEnd,
  computeType,
  tendencies,
  POS,
} from './web/src/lib/mbti-engine.ts'
import {
  SCENARIO_SYSTEM,
  CLASSIFY_SYSTEM,
  RESULT_SYSTEM,
  DIM_INFO,
  scenarioUserPrompt,
  classifyUserPrompt,
  resultUserPrompt,
} from './web/src/lib/prompts.ts'

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

const DEFAULTS = { provider: 'zxGateway', baseURL: '', model: '', maxTokens: 1024, temperature: 0.6 }
const now = () => Date.now()
const progressOf = (s) => ({ qCount: s.qCount, minQ: s.minQ, maxQ: s.maxQ })

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

async function resolveEndpoint() {
  const { settings, keys } = await loadSettings()
  const apiKey = (settings.apiKey || keys.apiKey || '').trim()
  let baseURL = (settings.baseURL || '').trim().replace(/\/$/, '')
  if (!baseURL && settings.provider === 'zxGateway') {
    baseURL = (process.env.ZX_GATEWAY_BASE_URL || '').trim().replace(/\/$/, '')
  }
  if (!baseURL) return null
  const url = baseURL.endsWith('/chat/completions') ? baseURL : baseURL + '/chat/completions'
  return { url, apiKey, settings }
}

async function callLLMJson(system, user, { temperature, maxTokens } = {}) {
  const ep = await resolveEndpoint()
  if (!ep) return null
  const { settings } = ep
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 25000)
    const r = await fetch(ep.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: ep.apiKey ? `Bearer ${ep.apiKey}` : '' },
      body: JSON.stringify({
        model: settings.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: temperature ?? Number(settings.temperature ?? 0.6),
        max_tokens: maxTokens ?? Number(settings.maxTokens ?? 1024),
        response_format: { type: 'json_object' },
      }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!r.ok) return null
    const data = await r.json()
    const content = data?.choices?.[0]?.message?.content || ''
    return JSON.parse(content)
  } catch {
    return null
  }
}

// ---------- 场景生成 ----------

/** 无模型降级:直接把参照题库题当场景(带 A/B) */
function fallbackScenario(probe) {
  const q = MBTI_BANK.find((x) => x.id === probe.refId)
  if (!q) return { reply: '最近过得怎么样？说说你平时更喜欢怎么安排事情吧。', hints: [], domain: '日常' }
  return {
    reply: `${q.stem}\n\n（可以选 A / B，也可以直接说说你的想法）\nA. ${q.optionA}\nB. ${q.optionB}`,
    hints: [q.optionA, q.optionB],
    domain: '日常',
  }
}

async function genScenario(args) {
  const raw = await callLLMJson(
    SCENARIO_SYSTEM,
    scenarioUserPrompt({
      dim: args.probe.dim,
      mode: args.mode,
      recentDomains: args.recentDomains || [],
      recent: args.recent || [],
      lastAnswer: args.lastAnswer,
    }),
    { temperature: 0.85, maxTokens: 500 },
  )
  if (!raw || typeof raw.reply !== 'string' || !raw.reply.trim()) return fallbackScenario(args.probe)
  const hints = Array.isArray(raw.hints)
    ? raw.hints.filter((h) => typeof h === 'string' && h.trim()).slice(0, 2)
    : []
  return {
    reply: raw.reply.trim(),
    hints,
    domain: typeof raw.domain === 'string' ? raw.domain.slice(0, 12) : '',
  }
}

// ---------- 判读 ----------

function opposite(axis) {
  return { E: 'I', I: 'E', S: 'N', N: 'S', T: 'F', F: 'T', J: 'P', P: 'J' }[axis]
}

function fallbackClassify(probe, answer) {
  const q = MBTI_BANK.find((x) => x.id === probe.refId)
  if (!q) return 0
  const t = (answer || '').trim()
  const upper = t.toUpperCase()
  const choseA = t.includes(q.optionA) || upper === 'A' || /^选?a$/.test(t.toLowerCase())
  const choseB = t.includes(q.optionB) || upper === 'B' || /^选?b$/.test(t.toLowerCase())
  if (!choseA && !choseB) return 0
  // A 端对应哪个极性
  const axisForA = q.pair === 'A' ? q.axis : opposite(q.axis)
  const signTowardPos = axisForA === POS[probe.dim] ? 1 : -1
  return choseA ? signTowardPos : -signTowardPos
}

async function classifyAnswer(args) {
  const raw = await callLLMJson(
    CLASSIFY_SYSTEM,
    classifyUserPrompt(args),
    { temperature: 0.2, maxTokens: 200 },
  )
  if (!raw) return fallbackClassify(args.probe, args.answer)
  const n = Math.round(Number(raw.score))
  return Number.isFinite(n) ? Math.max(-2, Math.min(2, n)) : 0
}

// ---------- 结果解读 ----------

const TYPE_BLURB = {
  INTJ: '你习惯在脑子里先搭好一张蓝图，再安静地把它变为现实。独立、有远见，也愿意为认定的方向长期投入。',
  INTP: '你被"为什么"吸引，喜欢把事物拆开看看它如何运转。思考深、独立，享受在可能性里漫游。',
  ENTJ: '你天然想把事情推动起来，敢于承担、善于统筹。目标清晰，也乐于带着大家一起往前。',
  ENTP: '你点子多、反应快，喜欢在碰撞中把想法越辩越明。灵活、好奇，讨厌一成不变。',
  INFJ: '你敏感而坚定，能敏锐地感受他人，也愿意为在乎的价值默默付出。安静，却有力量。',
  INFP: '你内心有一片柔软而认真的天地，重视真实与意义。温和、有想象力，也忠于自己的价值。',
  ENFJ: '你关心人，也擅长把大家凝聚到一起。温暖、有感染力，愿意成就身边的人。',
  ENFP: '你热情、有想象力，容易被新的可能点燃。善于连接人心，也渴望真诚与自由。',
  ISTJ: '你可靠、务实，答应的事会稳稳做到。重视秩序与责任，是让人放心的那种人。',
  ISFJ: '你细致体贴，习惯默默照顾身边的人。踏实、忠诚，把温暖藏在具体的小事里。',
  ESTJ: '你有条理、行动力强，善于把事情组织得井井有条。直接、负责，重视效率与规则。',
  ESFJ: '你热心、周到，很在意关系的和谐。乐于帮衬他人，也愿意为集体多出一份力。',
  ISTP: '你冷静、灵巧，喜欢动手把问题解决掉。独立、务实，在临场应对时格外从容。',
  ISFP: '你温和、敏感，用行动而非言语表达在乎。忠于当下与真实的美，也珍视自己的节奏。',
  ESTP: '你爽快、机敏，喜欢在真实的情境里直接上手。行动力强，善于把握眼前的机会。',
  ESFP: '你热情、亲和，走到哪里都能带来气氛。享受当下、善待他人，也活得真诚自在。',
}

async function genResult(code, themes) {
  const raw = await callLLMJson(
    RESULT_SYSTEM.replace('{CODE}', code),
    resultUserPrompt({ themes }),
    { temperature: 0.8, maxTokens: 500 },
  )
  if (raw && typeof raw.summary === 'string' && raw.summary.trim()) return raw.summary.trim()
  return TYPE_BLURB[code] || '你的回答里藏着一套属于自己的方式。愿它帮你更温柔地理解自己。'
}

// ---------- 路由 ----------

app.post('/api/mbti/start', async (_req, res) => {
  const id = crypto.randomUUID()
  const s = createSession(id)
  const probe = pickProbe(s, MBTI_BANK)
  sessions.set(id, s)
  stats.start++
  if (!probe) return res.json({ sessionId: id, message: '你好，我们可以慢慢聊聊。', hints: [], progress: progressOf(s), conf: s.conf })
  const g = await genScenario({ probe, mode: 'opening', recentDomains: [], recent: [] })
  s.currentPrompt = g.reply
  s.currentHints = g.hints
  if (g.domain) s.recentDomains.push(g.domain)
  res.json({ sessionId: id, message: g.reply, hints: g.hints, progress: progressOf(s), conf: s.conf })
})

app.post('/api/mbti/answer', async (req, res) => {
  const { sessionId, text } = req.body || {}
  const s = sessions.get(sessionId)
  if (!s) return res.status(404).json({ error: 'not_found' })
  if (s.done) return res.status(400).json({ error: 'done' })
  const probe = s.currentProbe
  if (!probe) return res.status(500).json({ error: 'no_probe' })
  s.lastAt = now()

  if (shouldClarify(s)) {
    s.clarifying = true
    const g = await genScenario({
      probe,
      mode: 'clarify',
      recentDomains: s.recentDomains,
      recent: s.recentSummaries,
      lastAnswer: text,
    })
    return res.json({ clarify: true, message: g.reply, hints: g.hints, progress: progressOf(s), conf: s.conf })
  }

  const score = await classifyAnswer({ dim: probe.dim, scenario: s.currentPrompt, probe, answer: text })
  applyAnswer(s, probe, score)
  stats.answer++
  s.recentSummaries.push(`第${s.qCount}轮（${DIM_INFO[probe.dim].topic}）：${(text || '').slice(0, 40)}`)
  if (s.recentSummaries.length > 3) s.recentSummaries.shift()

  if (canEnd(s)) {
    s.done = true
    s.resultCode = computeType(s)
    stats.done++
    stats.perCode[s.resultCode] = (stats.perCode[s.resultCode] || 0) + 1
    const summary = await genResult(s.resultCode, s.recentSummaries)
    return res.json({
      done: true,
      resultCode: s.resultCode,
      summary,
      tendencies: tendencies(s),
      progress: progressOf(s),
      conf: s.conf,
    })
  }

  const next = pickProbe(s, MBTI_BANK)
  const g = await genScenario({
    probe: next,
    mode: 'next',
    recentDomains: s.recentDomains,
    recent: s.recentSummaries,
    lastAnswer: text,
  })
  s.currentPrompt = g.reply
  s.currentHints = g.hints
  if (g.domain) {
    s.recentDomains.push(g.domain)
    if (s.recentDomains.length > 3) s.recentDomains.shift()
  }
  res.json({ message: g.reply, hints: g.hints, progress: progressOf(s), conf: s.conf })
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

app.get('/api/settings', async (_req, res) => {
  const { settings, keys } = await loadSettings()
  res.json({
    provider: settings.provider,
    baseURL: settings.baseURL || '',
    model: settings.model || '',
    maxTokens: settings.maxTokens ?? 1024,
    temperature: settings.temperature ?? 0.6,
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
