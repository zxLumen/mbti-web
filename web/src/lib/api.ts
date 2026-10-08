export interface AppSettings {
  provider: string
  baseURL: string
  model: string
  maxTokens: number
  temperature: number
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
  saveSettings: (s: Partial<AppSettings> & { apiKey?: string }) =>
    post<{ ok?: boolean; hasKey?: boolean; error?: string; message?: string }>('/api/settings', s),
}
