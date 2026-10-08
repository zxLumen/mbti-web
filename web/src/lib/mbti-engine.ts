import type { Axis, MbtiHistoryItem, SessionState, MbtiQuestion } from './mbti-types.js'

export function createSession(id: string): SessionState {
  const scores: Record<Axis, number> = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 }
  const conf: Record<Axis, number> = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 }
  return {
    id,
    createdAt: Date.now(),
    lastAt: Date.now(),
    qCount: 0,
    minQ: 12,
    maxQ: 30,
    confT: 0.85,
    scores,
    conf,
    history: [],
    done: false,
    clarifying: false,
    usedIds: new Set(),
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function axisKeyCount(s: SessionState, a: Axis): number {
  return s.history.filter((h) => h.axis === a).length
}

function axisReverseSwitches(s: SessionState, a: Axis): number {
  const list = s.history.filter((h) => h.axis === a).map((h) => (h.cls > 0 ? 1 : h.cls < 0 ? -1 : 0))
  let sw = 0
  let prev = 0
  for (const v of list) {
    if (v === 0) {
      // skip neutral doesn't reset sign strongly
      continue
    }
    if (prev !== 0 && prev !== v) sw++
    prev = v
  }
  return sw
}

export function updateConf(s: SessionState): void {
  const axes: Axis[] = ['E', 'I', 'S', 'N', 'T', 'F', 'J', 'P']
  for (const a of axes) {
    const qa = axisKeyCount(s, a)
    const sw = axisReverseSwitches(s, a)
    const base = clamp(qa / 6, 0, 1)
    const consist = clamp(1 - (sw / Math.max(1, qa)) * 0.4, 0, 1)
    s.conf[a] = clamp(base * (0.6 + 0.4 * consist), 0, 1)
  }
}

export function applyClassification(s: SessionState, axis: Axis, cls: -2 | -1 | 0 | 1 | 2, w: number, qId: string): void {
  s.qCount += 1
  s.history.push({ qId, axis, cls, w })
  // cls>0 means optionA, cls<0 means optionB (by pair meaning we track delta)
  const delta = cls * w
  // accumulate on axis primary? axis is the measured axis
  s.scores[axis] += delta
  s.lastAt = Date.now()
  updateConf(s)
}

export function shouldClarify(s: SessionState): boolean {
  if (s.clarifying) return false
  if (s.qCount === 0) return false
  const last = s.history[s.history.length - 1]
  if (!last) return false
  if (last.cls !== 0) return false
  // check previous also 0
  const prev = s.history[s.history.length - 2]
  if (prev && prev.cls === 0) return true
  return false
}

export function canEnd(s: SessionState): boolean {
  const axes: Axis[] = ['E', 'I', 'S', 'N', 'T', 'F', 'J', 'P']
  const minConf = Math.min(...axes.map((a) => s.conf[a]))
  if (s.qCount >= s.maxQ) return true
  if (s.qCount >= s.minQ && minConf >= s.confT) return true
  return false
}

export function computeType(s: SessionState): string {
  let ei: 'E' | 'I' = s.scores['E'] >= s.scores['I'] ? 'E' : 'I'
  let sn: 'S' | 'N' = s.scores['S'] >= s.scores['N'] ? 'S' : 'N'
  let tf: 'T' | 'F' = s.scores['T'] >= s.scores['F'] ? 'T' : 'F'
  let jp: 'J' | 'P' = s.scores['J'] >= s.scores['P'] ? 'J' : 'P'
  // tie-break neutral -> prefer more common? keep as-is (>=)
  return `${ei}${sn}${tf}${jp}`
}

export function pickNextQuestion(s: SessionState, bank: MbtiQuestion[]): MbtiQuestion | null {
  if (canEnd(s)) return null
  // find axis with lowest conf
  const axes: Axis[] = ['E', 'I', 'S', 'N', 'T', 'F', 'J', 'P']
  let target: Axis = axes[0]
  let best = Number.POSITIVE_INFINITY
  for (const a of axes) {
    const v = s.conf[a]
    if (v < best - 1e-6) {
      best = v
      target = a
    } else if (Math.abs(v - best) < 1e-6 && axisKeyCount(s, target) > axisKeyCount(s, a)) {
      target = a
    }
  }
  const candidates = bank.filter((q) => q.axis === target && !s.usedIds.has(q.id))
  if (candidates.length === 0) {
    // fallback: any unused
    const any = bank.filter((q) => !s.usedIds.has(q.id))
    if (any.length === 0) return null
    return any[Math.floor(Math.random() * any.length)]
  }
  // prefer higher weight + less used? simple: sort by weight desc then random small
  candidates.sort((a, b) => (b.weight || 1) - (a.weight || 1))
  return candidates[0]
}
