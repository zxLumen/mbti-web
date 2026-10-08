export type Axis = 'E' | 'I' | 'S' | 'N' | 'T' | 'F' | 'J' | 'P'

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

export interface MbtiHistoryItem {
  qId: string
  axis: Axis
  cls: -2 | -1 | 0 | 1 | 2
  w: number
}

export interface MbtiResult {
  code: string
}

export interface SessionState {
  id: string
  createdAt: number
  lastAt: number
  qCount: number
  minQ: number
  maxQ: number
  confT: number
  scores: Record<Axis, number>
  conf: Record<Axis, number>
  history: MbtiHistoryItem[]
  done: boolean
  resultCode?: string
  clarifying: boolean
  usedIds: Set<string>
}
