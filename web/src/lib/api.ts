export interface AppSettings {
  provider: string
  baseURL: string
  model: string
  maxTokens: number
  temperature: number
  hasKey?: boolean
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json() as Promise<T>
}

export interface QuestionDTO {
  id: string
  axis: string
  stem: string
  optionA: string
  optionB: string
}

export interface Progress {
  qCount: number
  minQ: number
  maxQ: number
}

export type Conf = Record<string, number>

export interface AnswerResp {
  question?: QuestionDTO
  clarify?: boolean
  text?: string
  done?: boolean
  resultCode?: string
  progress: Progress
  conf: Conf
}

export const api = {
  start: () => post<{ sessionId: string; question: QuestionDTO | null; progress: Progress; conf: Conf }>('/api/mbti/start', {}),
  answer: (sessionId: string, text: string) => post<AnswerResp>('/api/mbti/answer', { sessionId, text }),
  reset: (sessionId: string) => post<{ ok: boolean }>('/api/mbti/reset', { sessionId }),
  stats: (p: { type: string; code?: string }) => post<{ ok: boolean }>('/api/mbti/stats', p).catch(() => ({ ok: false })),
  getSettings: () => fetch('/api/settings').then((r) => r.json() as Promise<AppSettings>),
  saveSettings: (s: Partial<AppSettings> & { apiKey?: string }) => post<{ ok: boolean; hasKey: boolean }>('/api/settings', s),
}
