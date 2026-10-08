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
  HINTS_SYSTEM,
  hintsUserPrompt,
} from './web/src/lib/prompts.ts'
import { isOwner, ownerToken, ownerCookieHeader } from './web/src/lib/owner.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const app = express()
app.use(express.json({ limit: '1mb' }))

const PORT = process.env.PORT || 8787
const distDir = join(__dirname, 'dist')
const dataDir = join(__dirname, 'data')
const settingsFile = join(dataDir, 'settings.json')
const keysFile = join(dataDir, 'keys.json')
const sessionsFile = join(dataDir, 'sessions.json')

// 站长兜底:带 ?owner=<token> 访问即种下 mbti_owner cookie(之后据此判为站长)
app.use((req, res, next) => {
  const url = new URL(req.url, 'http://localhost')
  const ownerParam = url.searchParams.get('owner')
  if (!ownerParam) return next()
  if (ownerParam !== ownerToken(dataDir)) return res.status(403).send('invalid owner token')
  if (url.pathname.startsWith('/api/')) return next()
  url.searchParams.delete('owner')
  res.setHeader('Set-Cookie', ownerCookieHeader(ownerToken(dataDir)))
  res.redirect(302, url.pathname + (url.search || ''))
})

// 类型小人插画(用户自行放置,不入库;找不到则前端回退 emoji)
app.use('/mascots', express.static(join(__dirname, 'mascots')))

app.use(express.static(distDir))

const sessions = new Map()
const stats = { start: 0, answer: 0, done: 0, reset: 0, perCode: {} }

const DEFAULTS = { provider: 'zxGateway', baseURL: '', model: '', maxTokens: 2048, temperature: 0.6, reasoningEffort: 'none' }
const now = () => Date.now()
const progressOf = (s) => ({ qCount: s.qCount, minQ: s.minQ, maxQ: s.maxQ })

/** 记住刚生成的场景标签,用于后续去重 */
function rememberScene(s, g) {
  const label = String((g && (g.scene || g.domain)) || '').trim()
  if (label) s.askedScenes = [...(s.askedScenes || []), label].slice(-8)
  if (g && g.domain) s.recentDomains = [...(s.recentDomains || []), g.domain].slice(-8)
}

function cleanup() {
  const ttl = 6 * 60 * 60 * 1000
  const t = now()
  let removed = false
  for (const [k, s] of sessions) {
    if (t - s.lastAt > ttl) {
      sessions.delete(k)
      removed = true
    }
  }
  if (removed) persistSessions()
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

// ---- 会话落盘(重启不丢) ----
const serializeSession = (s) => ({ ...s, usedIds: [...s.usedIds] })
const deserializeSession = (o) => ({ ...o, usedIds: new Set(Array.isArray(o.usedIds) ? o.usedIds : []) })

async function loadSessions() {
  const obj = await readJson(sessionsFile, {})
  for (const [id, o] of Object.entries(obj || {})) {
    try {
      sessions.set(id, deserializeSession(o))
    } catch {
      /* 跳过损坏条目 */
    }
  }
}

async function persistSessions() {
  const obj = {}
  for (const [id, s] of sessions) obj[id] = serializeSession(s)
  try {
    await fs.mkdir(dataDir, { recursive: true })
    const tmp = sessionsFile + '.tmp'
    await fs.writeFile(tmp, JSON.stringify(obj))
    await fs.rename(tmp, sessionsFile) // 原子替换,避免写一半被中断丢会话
  } catch (e) {
    console.warn('[mbti] 会话落盘失败:', e?.message || e)
  }
}

/** 本地默认走本机博客网关;线上由 ZX_AI_GATEWAY_URL 注入(app:3000 内网) */
const DEFAULT_GATEWAY = 'http://localhost:3000/api/ai/v1'

async function resolveEndpoint() {
  const { settings, keys } = await loadSettings()
  const apiKey = (settings.apiKey || keys.apiKey || process.env.ZX_AI_APP_TOKEN || '').trim()
  let baseURL = (settings.baseURL || '').trim().replace(/\/$/, '')
  if (!baseURL && settings.provider === 'zxGateway') {
    const envUrl = (process.env.ZX_AI_GATEWAY_URL || process.env.ZX_GATEWAY_BASE_URL || '').trim().replace(/\/$/, '')
    baseURL = envUrl || DEFAULT_GATEWAY
  }
  if (!baseURL) return null
  const url = baseURL.endsWith('/chat/completions') ? baseURL : baseURL + '/chat/completions'
  return { url, apiKey, settings }
}

/** 宽容解析:剥 ```json 围栏、截取首个平衡的 {} */
function extractJson(text) {
  if (typeof text !== 'string') return null
  let s = text.trim()
  if (!s) return null
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  try {
    return JSON.parse(s)
  } catch {
    /* 继续尝试截取 */
  }
  const start = s.indexOf('{')
  if (start < 0) return null
  let depth = 0
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(s.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/** 思考强度:'none'/'low' 会带上 reasoning_effort;'default' 则不传,交给模型默认 */
function reasoningParams(settings) {
  const v = settings && settings.reasoningEffort
  if (!v || v === 'default') return {}
  return { reasoning_effort: v }
}

async function llmOnce(ep, settings, system, user, tokens, temperature) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 12000)
  try {
    const r = await fetch(ep.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: ep.apiKey ? `Bearer ${ep.apiKey}` : '' },
      body: JSON.stringify({
        model: settings.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature,
        max_tokens: tokens,
        response_format: { type: 'json_object' },
        ...reasoningParams(settings),
      }),
      signal: ctrl.signal,
    })
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      console.warn('[mbti] LLM HTTP', r.status, t.slice(0, 200))
      return { ok: false, reason: 'http' }
    }
    const data = await r.json()
    const content = data?.choices?.[0]?.message?.content || ''
    const parsed = extractJson(content)
    if (!parsed) {
      console.warn('[mbti] LLM 返回无法解析 finish=%s len=%d', data?.choices?.[0]?.finish_reason, content.length)
      return { ok: false, reason: 'parse' }
    }
    return { ok: true, value: parsed }
  } catch (e) {
    const reason = e?.name === 'AbortError' ? 'timeout' : 'network'
    console.warn('[mbti] LLM 调用异常:', reason, e?.message || e)
    return { ok: false, reason }
  } finally {
    clearTimeout(timer)
  }
}

async function callLLMJson(system, user, { temperature, maxTokens } = {}) {
  const ep = await resolveEndpoint()
  if (!ep) return null
  const { settings } = ep
  const temp = temperature ?? Number(settings.temperature ?? 0.6)
  const base = maxTokens ?? Number(settings.maxTokens ?? 2048)
  let res = await llmOnce(ep, settings, system, user, base, temp)
  if (!res.ok && res.reason === 'parse') {
    // 仅"返回空/无法解析"时加倍预算重试;超时/网络错误不重试
    res = await llmOnce(ep, settings, system, user, Math.min(base * 2, 8192), temp)
  }
  return res.ok ? res.value : null
}

// ---------- 流式(SSE) ----------

/** 从（可能不完整的）JSON 文本里增量取出某个字符串字段的值 */
function extractField(raw, field) {
  const re = new RegExp('"' + field + '"\\s*:\\s*"')
  const m = raw.match(re)
  if (!m) return ''
  let i = m.index + m[0].length
  let out = ''
  while (i < raw.length) {
    const c = raw[i]
    if (c === '\\') {
      const n = raw[i + 1]
      out += n === 'n' ? '\n' : n === 't' ? '\t' : n === '"' ? '"' : n === '\\' ? '\\' : n || ''
      i += 2
      continue
    }
    if (c === '"') break
    out += c
    i++
  }
  return out
}

/** 调网关的流式接口,边收边把 `field` 字段的增量文本回调出去;返回完整 content */
async function streamAttempt(system, user, { temperature, maxTokens, field }, onDelta) {
  const ep = await resolveEndpoint()
  if (!ep) return { ok: false, reason: 'noconfig' }
  const { settings } = ep
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 40000)
  try {
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
        max_tokens: maxTokens ?? Number(settings.maxTokens ?? 2048),
        response_format: { type: 'json_object' },
        stream: true,
        ...reasoningParams(settings),
      }),
      signal: ctrl.signal,
    })
    if (!r.ok || !r.body) {
      console.warn('[mbti] stream HTTP', r.status)
      return { ok: false, reason: 'http' }
    }
    const reader = r.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    let content = ''
    let last = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let idx
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (!line.startsWith('data:')) continue
        const ds = line.slice(5).trim()
        if (!ds || ds === '[DONE]') continue
        try {
          const j = JSON.parse(ds)
          const d = j.choices?.[0]?.delta?.content
          if (d) content += d
        } catch {
          /* 跳过不完整的行 */
        }
      }
      if (content.length !== last) {
        last = content.length
        const partial = extractField(content, field)
        if (partial) onDelta(partial)
      }
    }
    return { ok: true, content }
  } catch (e) {
    const reason = e?.name === 'AbortError' ? 'timeout' : 'network'
    console.warn('[mbti] stream 异常:', reason, e?.message || e)
    return { ok: false, reason }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 流式生成。仅当"成功但内容为空"时加倍预算重试一次(思考型模型吃光预算的情形);
 * 超时/网络错误不重试(避免再等一轮)。返回 { content, reason }。
 */
async function streamLLM(system, user, opts, onDelta) {
  let emitted = false
  const wrap = (t) => {
    emitted = true
    onDelta(t)
  }
  const first = await streamAttempt(system, user, opts, wrap)
  if (first.ok && first.content) return { content: first.content, reason: '' }
  if (first.ok && !first.content && !emitted) {
    const bigger = { ...opts, maxTokens: Math.min((opts.maxTokens || 2048) * 2, 8192) }
    const second = await streamAttempt(system, user, bigger, wrap)
    return { content: second.ok ? second.content : '', reason: second.reason || 'empty' }
  }
  return { content: '', reason: first.reason || 'empty' }
}

function sseInit(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  if (typeof res.flushHeaders === 'function') res.flushHeaders()
}

/** 每几秒发一个 ping,让前端知道连接还活着(也刷新看门狗) */
function heartbeat(res, ms = 5000) {
  const t = setInterval(() => {
    try {
      sseSend(res, { type: 'ping' })
    } catch {
      /* ignore */
    }
  }, ms)
  return () => clearInterval(t)
}
function sseSend(res, obj) {
  res.write('data: ' + JSON.stringify(obj) + '\n\n')
}
function deltaSink(res) {
  let started = false
  return (txt) => {
    if (!started) {
      sseSend(res, { type: 'start' })
      started = true
    }
    sseSend(res, { type: 'delta', text: txt })
  }
}

/** 选项个数目标:按轮次在 3/2/4 之间浮动(内容仍由模型决定) */
const HINT_CYCLE = [3, 2, 4]
const hintTargetFor = (s) => HINT_CYCLE[(s.qCount || 0) % HINT_CYCLE.length]

// ---------- 场景生成 ----------

/** 无模型降级:直接把参照题库题当场景(带 A/B) */
function fallbackScenario(probe) {
  const q = MBTI_BANK.find((x) => x.id === probe.refId)
  if (!q) return { reply: '最近过得怎么样？说说你平时更喜欢怎么安排事情吧。', hints: [], domain: '日常', degraded: true }
  return {
    reply: `${q.stem}\n\n（可以选 A / B，也可以直接说说你的想法）\nA. ${q.optionA}\nB. ${q.optionB}`,
    hints: [q.optionA, q.optionB],
    domain: '日常',
    degraded: true,
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
      hintTarget: args.hintTarget,
    }),
    { temperature: 0.85, maxTokens: 1600 },
  )
  if (!raw || typeof raw.reply !== 'string' || !raw.reply.trim()) return fallbackScenario(args.probe)
  let hints = Array.isArray(raw.hints)
    ? raw.hints.filter((h) => typeof h === 'string' && h.trim()).slice(0, 4)
    : []
  if (!hints.length) hints = await genHints(raw.reply.trim(), args.probe.dim, args.hintTarget)
  return {
    reply: raw.reply.trim(),
    hints,
    domain: typeof raw.domain === 'string' ? raw.domain.slice(0, 12) : '',
    degraded: false,
  }
}

/** 流式版场景生成:把 reply 边生成边推给前端 */
async function genScenarioStream(probe, args, onDelta) {
  const { settings } = await loadSettings()
  const { content } = await streamLLM(
    SCENARIO_SYSTEM,
    scenarioUserPrompt({
      dim: probe.dim,
      mode: args.mode,
      recentDomains: args.recentDomains || [],
      askedScenes: args.askedScenes || [],
      recent: args.recent || [],
      lastAnswer: args.lastAnswer,
      hintTarget: args.hintTarget,
    }),
    { temperature: 0.85, maxTokens: Math.max(Number(settings.maxTokens || 2048), 1600), field: 'reply' },
    onDelta,
  )
  const parsed = content ? extractJson(content) : null
  if (!parsed || typeof parsed.reply !== 'string' || !parsed.reply.trim()) return fallbackScenario(probe)
  let hints = Array.isArray(parsed.hints)
    ? parsed.hints.filter((h) => typeof h === 'string' && h.trim()).slice(0, 4)
    : []
  if (!hints.length) hints = await genHints(parsed.reply.trim(), probe.dim, args.hintTarget)
  return {
    reply: parsed.reply.trim(),
    hints,
    domain: typeof parsed.domain === 'string' ? parsed.domain.slice(0, 12) : '',
    scene: typeof parsed.scene === 'string' ? parsed.scene.slice(0, 12) : '',
    degraded: false,
  }
}

/** 兜底:选项为空时,单独再要一组(不重跑场景,避免重复流式输出) */
async function genHints(question, dim, hintTarget) {
  const raw = await callLLMJson(HINTS_SYSTEM, hintsUserPrompt(question, dim, hintTarget), {
    temperature: 0.6,
    maxTokens: 400,
  })
  const arr = raw && Array.isArray(raw.hints) ? raw.hints : []
  return arr.filter((h) => typeof h === 'string' && h.trim()).slice(0, 4)
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
    { temperature: 0.2, maxTokens: 1000 },
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
    { temperature: 0.8, maxTokens: 1600 },
  )
  if (raw && typeof raw.summary === 'string' && raw.summary.trim()) return raw.summary.trim()
  return TYPE_BLURB[code] || '你的回答里藏着一套属于自己的方式。愿它帮你更温柔地理解自己。'
}

/** 流式版结果解读:把 summary 边生成边推给前端 */
async function genResultStream(code, themes, onDelta) {
  const { content } = await streamLLM(
    RESULT_SYSTEM.replace('{CODE}', code),
    resultUserPrompt({ themes }),
    { temperature: 0.8, maxTokens: 1600, field: 'summary' },
    onDelta,
  )
  const parsed = content ? extractJson(content) : null
  if (parsed && typeof parsed.summary === 'string' && parsed.summary.trim()) return parsed.summary.trim()
  return TYPE_BLURB[code] || '你的回答里藏着一套属于自己的方式。愿它帮你更温柔地理解自己。'
}

// ---------- 路由 ----------

app.post('/api/mbti/start', async (_req, res) => {
  const id = crypto.randomUUID()
  const s = createSession(id)
  const probe = pickProbe(s, MBTI_BANK)
  sessions.set(id, s)
  stats.start++
  sseInit(res)
  const stopHb = heartbeat(res)
  let ended = false
  const finish = (payload) => {
    if (ended) return
    ended = true
    stopHb()
    try {
      sseSend(res, { type: 'end', payload })
    } catch {
      /* ignore */
    }
    res.end()
  }
  try {
    if (!probe) {
      persistSessions()
      return finish({ sessionId: id, message: '你好，我们可以慢慢聊聊。', hints: [], progress: progressOf(s), conf: s.conf, degraded: false })
    }
    const g = await genScenarioStream(probe, { mode: 'opening', recentDomains: [], askedScenes: [], recent: [], hintTarget: hintTargetFor(s) }, deltaSink(res))
    s.currentPrompt = g.reply
    s.currentHints = g.hints
    rememberScene(s, g)
    persistSessions()
    finish({ sessionId: id, message: g.reply, hints: g.hints, progress: progressOf(s), conf: s.conf, degraded: g.degraded })
  } catch (e) {
    console.warn('[mbti] start 异常:', e?.message || e)
    finish({ sessionId: id, message: '你好，我们可以慢慢聊聊。', hints: [], progress: progressOf(s), conf: s.conf, degraded: true })
  }
})

app.post('/api/mbti/answer', async (req, res) => {
  const { sessionId, text } = req.body || {}
  const s = sessions.get(sessionId)
  if (!s) return res.status(404).json({ error: 'not_found' })
  if (s.done) return res.status(400).json({ error: 'done' })
  const probe = s.currentProbe
  if (!probe) return res.status(500).json({ error: 'no_probe' })
  s.lastAt = now()
  sseInit(res)
  const stopHb = heartbeat(res)
  let ended = false
  const finish = (payload) => {
    if (ended) return
    ended = true
    stopHb()
    try {
      sseSend(res, { type: 'end', payload })
    } catch {
      /* ignore */
    }
    res.end()
  }
  try {
    if (shouldClarify(s)) {
      s.clarifying = true
      const g = await genScenarioStream(
        probe,
        { mode: 'clarify', recentDomains: s.recentDomains, askedScenes: s.askedScenes, recent: s.recentSummaries, lastAnswer: text, hintTarget: hintTargetFor(s) },
        deltaSink(res),
      )
      s.currentHints = g.hints
      persistSessions()
      return finish({ clarify: true, message: g.reply, hints: g.hints, progress: progressOf(s), conf: s.conf, degraded: g.degraded })
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
      const summary = await genResultStream(s.resultCode, s.recentSummaries, deltaSink(res))
      s.resultSummary = summary
      s.resultTendencies = tendencies(s)
      persistSessions()
      return finish({
        done: true,
        resultCode: s.resultCode,
        summary,
        tendencies: s.resultTendencies,
        progress: progressOf(s),
        conf: s.conf,
      })
    }

    const next = pickProbe(s, MBTI_BANK)
    const g = await genScenarioStream(
      next,
      { mode: 'next', recentDomains: s.recentDomains, askedScenes: s.askedScenes, recent: s.recentSummaries, lastAnswer: text, hintTarget: hintTargetFor(s) },
      deltaSink(res),
    )
    s.currentPrompt = g.reply
    s.currentHints = g.hints
    rememberScene(s, g)
    persistSessions()
    finish({ message: g.reply, hints: g.hints, progress: progressOf(s), conf: s.conf, degraded: g.degraded })
  } catch (e) {
    console.warn('[mbti] answer 异常:', e?.message || e)
    persistSessions()
    finish({ message: '刚才没接上，能再说一次吗？', hints: [], progress: progressOf(s), conf: s.conf, degraded: true })
  }
})

app.post('/api/mbti/reset', (req, res) => {
  const { sessionId } = req.body || {}
  if (sessionId && sessions.delete(sessionId)) {
    stats.reset++
    persistSessions()
  }
  res.json({ ok: true })
})

// 恢复:客户端带着 sessionId 回来,拿回进度/是否结束/结果
app.get('/api/mbti/session', (req, res) => {
  const id = String(req.query.id || '')
  const s = sessions.get(id)
  if (!s) return res.status(404).json({ error: 'not_found' })
  res.json({
    sessionId: id,
    progress: progressOf(s),
    conf: s.conf,
    hints: s.currentHints || [],
    done: Boolean(s.done),
    resultCode: s.resultCode || '',
    summary: s.resultSummary || '',
    tendencies: s.resultTendencies || [],
  })
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

app.get('/api/settings', async (req, res) => {
  const { settings, keys } = await loadSettings()
  res.json({
    provider: settings.provider,
    baseURL: settings.baseURL || '',
    model: settings.model || '',
    maxTokens: settings.maxTokens ?? 2048,
    temperature: settings.temperature ?? 0.6,
    reasoningEffort: settings.reasoningEffort || 'none',
    hasKey: Boolean(settings.apiKey || keys.apiKey),
    isOwner: isOwner(req, dataDir),
  })
})

app.post('/api/settings', async (req, res) => {
  if (!isOwner(req, dataDir)) return res.status(403).json({ error: 'forbidden', message: '仅站长可修改配置' })
  const b = req.body || {}
  const cur = { ...DEFAULTS, ...(await readJson(settingsFile, {})) }
  const keys = await readJson(keysFile, {})
  const next = {
    provider: typeof b.provider === 'string' ? b.provider : cur.provider,
    baseURL: typeof b.baseURL === 'string' ? b.baseURL : cur.baseURL,
    model: typeof b.model === 'string' ? b.model : cur.model,
    maxTokens: Number.isFinite(Number(b.maxTokens)) ? Number(b.maxTokens) : cur.maxTokens,
    temperature: Number.isFinite(Number(b.temperature)) ? Number(b.temperature) : cur.temperature,
    reasoningEffort: ['none', 'low', 'default'].includes(b.reasoningEffort) ? b.reasoningEffort : cur.reasoningEffort,
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

loadSessions().then(() => {
  app.listen(PORT, () => console.log('mbti-web listening on :' + PORT))
})
