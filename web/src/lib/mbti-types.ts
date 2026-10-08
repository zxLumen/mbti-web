export type Axis = 'E' | 'I' | 'S' | 'N' | 'T' | 'F' | 'J' | 'P'

/** 四个维度 */
export type Dim = 'EI' | 'SN' | 'TF' | 'JP'

/** 题库条目:仅在「无模型」降级时展示 optionA/B;有模型时只用作测量参照 */
export interface MbtiQuestion {
  id: string
  axis: Axis
  pair: 'A' | 'B'
  stem: string
  optionA: string
  optionB: string
  weight: number
  tags?: string[]
}

/** 一次探测意图:只暴露「要探哪个维度」和一条参照,不暴露选项 */
export interface Probe {
  dim: Dim
  refId: string
  refStem: string
  weight: number
}

export interface MbtiHistoryItem {
  dim: Dim
  /** 相对该维度正端的倾向强度:-2..2 */
  score: number
  w: number
}

export interface DimTendency {
  dim: Dim
  posLabel: string
  negLabel: string
  /** 偏正端的百分比 0..100 */
  posPct: number
}

export interface SessionState {
  id: string
  createdAt: number
  lastAt: number
  /** 当前等待回答的探测点 */
  currentProbe: Probe | null
  /** 当前展示给用户的场景/问题文本(判读时要用) */
  currentPrompt: string
  /** 当前这轮的软参考词 */
  currentHints: string[]
  /** 最近用过的场景域,用于避免重复 */
  recentDomains: string[]
  /** 最近几轮问答摘要,用于承接 */
  recentSummaries: string[]
  qCount: number
  minQ: number
  maxQ: number
  confT: number
  scores: Record<Axis, number>
  conf: Record<Dim, number>
  history: MbtiHistoryItem[]
  done: boolean
  resultCode?: string
  clarifying: boolean
  usedIds: Set<string>
}
