import type { Axis, MbtiQuestion, SessionState } from './mbti-types.js'

export const AXES: Axis[] = ['E', 'I', 'S', 'N', 'T', 'F', 'J', 'P']

/** 四个维度,每个含两个极性 */
export const DIMS: Array<[Axis, Axis]> = [
  ['E', 'I'],
  ['S', 'N'],
  ['T', 'F'],
  ['J', 'P'],
]

const OPP: Record<Axis, Axis> = { E: 'I', I: 'E', S: 'N', N: 'S', T: 'F', F: 'T', J: 'P', P: 'J' }
const DIM_OF: Record<Axis, number> = { E: 0, I: 0, S: 1, N: 1, T: 2, F: 2, J: 3, P: 3 }

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

export function createSession(id: string): SessionState {
  return {
    id,
    createdAt: Date.now(),
    lastAt: Date.now(),
    currentQId: null,
    qCount: 0,
    minQ: 12,
    maxQ: 30,
    confT: 0.85,
    scores: { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 },
    conf: { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 },
    history: [],
    done: false,
    clarifying: false,
    usedIds: new Set(),
  }
}

/** 某维度已作答的条目(按时间先后) */
function dimHistory(s: SessionState, dim: number) {
  return s.history.filter((h) => DIM_OF[h.axis] === dim)
}

/** 该维度内回答方向的反转次数(摇摆越多,置信度增长越慢) */
function dimFlips(s: SessionState, dim: number): number {
  let flips = 0
  let prev = 0
  for (const h of dimHistory(s, dim)) {
    const sign = h.cls > 0 ? 1 : h.cls < 0 ? -1 : 0
    if (sign === 0) continue
    if (prev !== 0 && sign !== prev) flips++
    prev = sign
  }
  return flips
}

export function updateConf(s: SessionState): void {
  for (let d = 0; d < DIMS.length; d++) {
    const qa = dimHistory(s, d).length
    const base = clamp(qa / 5, 0, 1)
    const consist = clamp(1 - (dimFlips(s, d) / Math.max(1, qa)) * 0.4, 0, 1)
    const c = clamp(base * (0.6 + 0.4 * consist), 0, 1)
    // 两端显示同一维度置信度
    for (const ax of DIMS[d]) s.conf[ax] = c
  }
}

/**
 * 计入用户对某题的归类。
 * `pair` 指明该极性的表述在 A 还是 B：pair='A' 选 A 朝向 axis；pair='B' 选 B 朝向 axis。
 */
export function applyAnswer(s: SessionState, q: MbtiQuestion, cls: -2 | -1 | 0 | 1 | 2): void {
  const towards = q.pair === 'A' ? cls : (-cls as -2 | -1 | 0 | 1 | 2)
  const delta = towards * q.weight
  s.scores[q.axis] += delta
  s.scores[OPP[q.axis]] -= delta
  s.history.push({ qId: q.id, axis: q.axis, cls, w: q.weight })
  s.qCount = s.history.length
  s.clarifying = false
  updateConf(s)
  s.lastAt = Date.now()
}

export function shouldClarify(s: SessionState): boolean {
  if (s.clarifying) return false
  const r = s.history.slice(-2)
  return r.length === 2 && r.every((h) => h.cls === 0)
}

export function canEnd(s: SessionState): boolean {
  if (s.qCount >= s.maxQ) return true
  return s.qCount >= s.minQ && DIMS.every(([a]) => s.conf[a] >= s.confT)
}

export function computeType(s: SessionState): string {
  let code = ''
  for (const [a, b] of DIMS) code += s.scores[a] >= s.scores[b] ? a : b
  return code
}

/** 选下一题：优先置信度最低的维度,再优先该维度里作答较少的极性 */
export function pickNext(s: SessionState, bank: MbtiQuestion[]): MbtiQuestion | null {
  const unused = bank.filter((q) => !s.usedIds.has(q.id))
  if (!unused.length) return null
  let target = 0
  let best = Number.POSITIVE_INFINITY
  for (let d = 0; d < DIMS.length; d++) {
    const v = s.conf[DIMS[d][0]]
    if (v < best - 1e-9) {
      best = v
      target = d
    }
  }
  let list = unused.filter((q) => DIM_OF[q.axis] === target)
  if (!list.length) list = unused
  // 两端平衡:优先作答较少的极性,其次权重高的题
  const [a, b] = DIMS[target]
  const na = dimHistory(s, target).filter((h) => h.axis === a).length
  const nb = dimHistory(s, target).filter((h) => h.axis === b).length
  const prefer: Axis = na <= nb ? a : b
  list = [...list].sort((x, y) => {
    const px = x.axis === prefer ? 0 : 1
    const py = y.axis === prefer ? 0 : 1
    if (px !== py) return px - py
    return (y.weight || 1) - (x.weight || 1)
  })
  const q = list[0]
  s.currentQId = q.id
  s.usedIds.add(q.id)
  return q
}
