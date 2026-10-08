const KEY = 'mbti.settings.v1'

function getSettings() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export const api = {
  async start() {
    const res = await fetch('/api/mbti/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    return res.json()
  },
  async answer(sessionId: string, text: string) {
    const res = await fetch('/api/mbti/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, text }) })
    return res.json()
  },
  async reset(sessionId: string) {
    const res = await fetch('/api/mbti/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) })
    return res.json()
  },
  async stats(p: any) {
    try {
      await fetch('/api/mbti/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
    } catch {}
  }
}
