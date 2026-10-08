export interface AppSettings {
  provider: string
  baseURL: string
  model: string
  maxTokens: number
  temperature: number
  reasoningEffort?: string
  hasKey?: boolean
  isOwner?: boolean
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json() as Promise<T>
}

export interface Progress {
  qCount: number
  minQ: number
  maxQ: number
}

export type Conf = Record<string, number>

export interface Tendency {
  dim: string
  posLabel: string
  negLabel: string
  posPct: number
}

/** 一次完成的测评结果(存在 localStorage,供「报告」页查看) */
export interface HistoryEntry {
  code: string
  summary: string
  tendencies: Tendency[]
  at: number
}

export interface TurnResp {
  sessionId?: string
  message?: string
  hints?: string[]
  clarify?: boolean
  done?: boolean
  resultCode?: string
  summary?: string
  tendencies?: Tendency[]
  progress: Progress
  conf: Conf
  degraded?: boolean
}

export const api = {
  start: () => post<TurnResp>('/api/mbti/start', {}),
  answer: (sessionId: string, text: string) => post<TurnResp>('/api/mbti/answer', { sessionId, text }),
  reset: (sessionId: string) => post<{ ok: boolean }>('/api/mbti/reset', { sessionId }),
  stats: (p: { type: string; code?: string }) => post<{ ok: boolean }>('/api/mbti/stats', p).catch(() => ({ ok: false })),
  getSettings: () => fetch('/api/settings').then((r) => r.json() as Promise<AppSettings>),
  resume: (id: string) =>
    fetch(`/api/mbti/session?id=${encodeURIComponent(id)}`).then(async (r) =>
      r.ok ? ((await r.json()) as TurnResp) : null,
    ),
  saveSettings: (s: Partial<AppSettings> & { apiKey?: string }) =>
    post<{ ok?: boolean; hasKey?: boolean; error?: string; message?: string }>('/api/settings', s),
}

export interface StreamHandlers {
  onStart?: () => void
  onDelta?: (text: string) => void
  onPing?: () => void
  onEnd?: (payload: TurnResp) => void
  onError?: (reason: string) => void
}

/**
 * 消费 SSE 流:start / delta / ping / end。
 * 带 60s 看门狗:每收到一个事件(含 ping)就重置;超时或无 end 即回调 onError。
 */
export async function streamTurn(
  url: string,
  body: unknown,
  h: StreamHandlers,
  { timeoutMs = 60000 }: { timeoutMs?: number } = {},
): Promise<boolean> {
  const ctrl = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const arm = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => ctrl.abort(), timeoutMs)
  }
  let ended = false
  try {
    arm()
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (!r.ok || !r.body) {
      h.onError?.('http')
      return false
    }
    const reader = r.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let idx: number
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        const line = chunk.split('\n').find((l) => l.startsWith('data:'))
        if (!line) continue
        try {
          const evt = JSON.parse(line.slice(5).trim()) as { type: string; text?: string; payload?: TurnResp }
          arm()
          if (evt.type === 'start') h.onStart?.()
          else if (evt.type === 'delta') h.onDelta?.(evt.text || '')
          else if (evt.type === 'ping') h.onPing?.()
          else if (evt.type === 'end' && evt.payload) {
            ended = true
            if (timer) clearTimeout(timer)
            h.onEnd?.(evt.payload)
          }
        } catch {
          /* 跳过不完整行 */
        }
      }
    }
    if (!ended) h.onError?.('incomplete')
    return true
  } catch (e) {
    h.onError?.((e as { name?: string })?.name === 'AbortError' ? 'timeout' : 'network')
    return false
  } finally {
    if (timer) clearTimeout(timer)
  }
}
