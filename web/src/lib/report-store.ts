import type { HistoryEntry, Tendency } from './api.js'

const H_KEY = 'mbti.history.v2'
const H_KEY_OLD = 'mbti.history.v1'
const MAX = 20

/** 把老版本(v1)存档迁到 v2,并补上缺失字段 */
function migrate(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(H_KEY_OLD)
    if (!raw) return []
    const old = JSON.parse(raw)
    if (!Array.isArray(old) || !old.length) return []
    const fixed: HistoryEntry[] = old
      .filter((e: unknown) => e && typeof e === 'object')
      .map((e: Record<string, unknown>) => ({
        code: typeof e.code === 'string' ? e.code : '',
        summary: typeof e.summary === 'string' ? e.summary : '',
        tendencies: Array.isArray(e.tendencies) ? (e.tendencies as Tendency[]) : [],
        at: typeof e.at === 'number' ? e.at : Date.now(),
      }))
    localStorage.setItem(H_KEY, JSON.stringify(fixed))
    localStorage.removeItem(H_KEY_OLD)
    return fixed
  } catch {
    return []
  }
}

export function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(H_KEY)
    if (raw) return JSON.parse(raw) as HistoryEntry[]
    return migrate()
  } catch {
    return []
  }
}

export function writeHistory(list: HistoryEntry[]): HistoryEntry[] {
  const trimmed = list.slice(0, MAX)
  try {
    localStorage.setItem(H_KEY, JSON.stringify(trimmed))
  } catch {
    /* ignore */
  }
  return trimmed
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(H_KEY)
  } catch {
    /* ignore */
  }
}
