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
  onEnd?: (payload: TurnResp) => void
}

/** 消费 SSE 流:start / delta / end(含完整 payload)。返回是否正常结束 */
export async function streamTurn(url: string, body: unknown, h: StreamHandlers): Promise<boolean> {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok || !r.body) return false
    const reader = r.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let idx
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        const line = chunk.split('\n').find((l) => l.startsWith('data:'))
        if (!line) continue
        try {
          const evt = JSON.parse(line.slice(5).trim()) as { type: string; text?: string; payload?: TurnResp }
          if (evt.type === 'start') h.onStart?.()
          else if (evt.type === 'delta') h.onDelta?.(evt.text || '')
          else if (evt.type === 'end' && evt.payload) h.onEnd?.(evt.payload)
        } catch {
          /* 跳过不完整行 */
        }
      }
    }
    return true
  } catch {
    return false
  }
}
