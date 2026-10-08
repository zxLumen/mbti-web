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

/* ---------------- 已解锁的类型主题(收集) ---------------- */

const U_KEY = 'mbti.unlocked.v1'
const CODE_RE = /^[A-Z]{4}$/

function writeUnlocked(list: string[]): string[] {
  const uniq = [...new Set(list.filter((c) => CODE_RE.test(c)))]
  try {
    localStorage.setItem(U_KEY, JSON.stringify(uniq))
  } catch {
    /* ignore */
  }
  return uniq
}

/** 已解锁的类型;首次(没有该键)时从历史推导并落盘 */
export function readUnlocked(): string[] {
  try {
    const raw = localStorage.getItem(U_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) return arr.filter((c) => typeof c === 'string' && CODE_RE.test(c))
    }
  } catch {
    /* ignore */
  }
  const codes = [...new Set(readHistory().map((h) => h.code).filter((c) => CODE_RE.test(c)))]
  return codes.length ? writeUnlocked(codes) : []
}

/** 完成一次测评 → 解锁该类型主题 */
export function unlockType(code: string): string[] {
  if (!CODE_RE.test(code)) return readUnlocked()
  return writeUnlocked([...readUnlocked(), code])
}
