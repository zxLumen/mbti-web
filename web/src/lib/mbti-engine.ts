import type { Axis, Dim, DimTendency, MbtiQuestion, Probe, SessionState } from './mbti-types.js'

export const DIMS: Array<[Axis, Axis]> = [
  ['E', 'I'],
  ['S', 'N'],
  ['T', 'F'],
  ['J', 'P'],
]
export const DIM_KEYS: Dim[] = ['EI', 'SN', 'TF', 'JP']

const DIM_OF_AXIS: Record<Axis, Dim> = { E: 'EI', I: 'EI', S: 'SN', N: 'SN', T: 'TF', F: 'TF', J: 'JP', P: 'JP' }
/** 各维度的正端(分数为 + 时朝向) */
export const POS: Record<Dim, Axis> = { EI: 'E', SN: 'S', TF: 'T', JP: 'J' }
export const NEG: Record<Dim, Axis> = { EI: 'I', SN: 'N', TF: 'F', JP: 'P' }

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

export function createSession(id: string): SessionState {
  return {
    id,
    createdAt: Date.now(),
    lastAt: Date.now(),
    currentProbe: null,
    currentPrompt: '',
    currentHints: [],
    recentDomains: [],
    askedScenes: [],
    recentSummaries: [],
    answerEvidence: [],
    qCount: 0,
    minQ: 12,
    maxQ: 30,
    confT: 0.85,
    scores: { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 },
    conf: { EI: 0, SN: 0, TF: 0, JP: 0 },
    history: [],
    done: false,
    clarifying: false,
    usedIds: new Set(),
  }
}

const dimOf = (q: MbtiQuestion): Dim => DIM_OF_AXIS[q.axis]
const dimHistory = (s: SessionState, dim: Dim) => s.history.filter((h) => h.dim === dim)

function dimFlips(s: SessionState, dim: Dim): number {
  let flips = 0
  let prev = 0
  for (const h of dimHistory(s, dim)) {
    const sign = h.score > 0 ? 1 : h.score < 0 ? -1 : 0
    if (sign === 0) continue
    if (prev !== 0 && sign !== prev) flips++
    prev = sign
  }
  return flips
}

export function updateConf(s: SessionState): void {
  for (const dim of DIM_KEYS) {
    const qa = dimHistory(s, dim).length
    const base = clamp(qa / 5, 0, 1)
    const consist = clamp(1 - (dimFlips(s, dim) / Math.max(1, qa)) * 0.4, 0, 1)
    s.conf[dim] = clamp(base * (0.6 + 0.4 * consist), 0, 1)
  }
}

/** 记录用户对当前探测点的归类(score 为正=偏该维度正端) */
export function applyAnswer(s: SessionState, probe: Probe, score: number): void {
  const sc = Math.max(-2, Math.min(2, Math.round(score)))
  const delta = sc * probe.weight
  s.scores[POS[probe.dim]] += delta
  s.scores[NEG[probe.dim]] -= delta
  s.history.push({ dim: probe.dim, score: sc, w: probe.weight })
  s.qCount = s.history.length
  s.clarifying = false
  updateConf(s)
  s.lastAt = Date.now()
}

export function shouldClarify(s: SessionState): boolean {
  if (s.clarifying) return false
  const r = s.history.slice(-2)
  return r.length === 2 && r.every((h) => h.score === 0)
}

export function canEnd(s: SessionState): boolean {
  if (s.qCount >= s.maxQ) return true
  return s.qCount >= s.minQ && DIM_KEYS.every((d) => s.conf[d] >= s.confT)
}

export function computeType(s: SessionState): string {
  let code = ''
  for (const [a, b] of DIMS) code += s.scores[a] >= s.scores[b] ? a : b
  return code
}

export function tendencies(s: SessionState): DimTendency[] {
  const labels: Record<Dim, [string, string]> = {
    EI: ['外向', '内向'],
    SN: ['实感', '直觉'],
    TF: ['思考', '情感'],
    JP: ['判断', '知觉'],
  }
  return DIM_KEYS.map((dim) => {
    const a = s.scores[POS[dim]]
    const b = s.scores[NEG[dim]]
    const denom = Math.abs(a) + Math.abs(b)
    const strength = denom < 1e-6 ? 0 : (a - b) / denom
    return {
      dim,
      posLabel: labels[dim][0],
      negLabel: labels[dim][1],
      posPct: Math.round(clamp(50 + 50 * strength, 0, 100)),
    }
  })
}

/** 选下一个探测点:置信度最低的维度,平衡两端,挑高权重未用题作参照 */
export function pickProbe(s: SessionState, bank: MbtiQuestion[]): Probe | null {
  const unused = bank.filter((q) => !s.usedIds.has(q.id))
  if (!unused.length) return null
  let target: Dim = DIM_KEYS[0]
  let best = Number.POSITIVE_INFINITY
  for (const d of DIM_KEYS) {
    const v = s.conf[d]
    if (v < best - 1e-9) {
      best = v
      target = d
    }
  }
  let list = unused.filter((q) => dimOf(q) === target)
  if (!list.length) list = unused
  // 平衡:优先作答较少的极性
  const na = dimHistory(s, target).filter((h) => h.score > 0).length
  const nb = dimHistory(s, target).filter((h) => h.score < 0).length
  list = [...list].sort((x, y) => {
    // 让两端交替:偏向极性作答较少的一方
    const scoreOf = (q: MbtiQuestion) => {
      const isPos = q.axis === POS[target]
      const cnt = isPos ? na : nb
      return cnt
    }
    const dx = scoreOf(x)
    const dy = scoreOf(y)
    if (dx !== dy) return dx - dy
    return (y.weight || 1) - (x.weight || 1)
  })
  const q = list[0]
  const probe: Probe = { dim: target, refId: q.id, refStem: q.stem, weight: q.weight || 1 }
  s.currentProbe = probe
  s.usedIds.add(q.id)
  return probe
}
