import type { HistoryEntry } from './api.js'

const H_KEY = 'mbti.history.v2'
const MAX = 20

export function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(H_KEY)
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : []
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
