export interface TypeMeta {
  code: string
  /** 中文名 */
  name: string
  /** 常见外号/昵称 */
  alias: string
  /** emoji 拟人(免费可商用,可后续替换为插画) */
  emoji: string
  /** 类型组色(沿用常见四分法) */
  group: 'NT' | 'NF' | 'SJ' | 'SP'
  color: string
}

const C = { NT: '#a78bfa', NF: '#5eead4', SJ: '#7dd3fc', SP: '#fbbf24' }

export const TYPE_META: Record<string, TypeMeta> = {
  INTJ: { code: 'INTJ', name: '建筑师', alias: '策略家', emoji: '🦉', group: 'NT', color: C.NT },
  INTP: { code: 'INTP', name: '逻辑学家', alias: '思考者', emoji: '🐱', group: 'NT', color: C.NT },
  ENTJ: { code: 'ENTJ', name: '指挥官', alias: '统帅', emoji: '🦁', group: 'NT', color: C.NT },
  ENTP: { code: 'ENTP', name: '辩论家', alias: '点子王', emoji: '🦊', group: 'NT', color: C.NT },
  INFJ: { code: 'INFJ', name: '提倡者', alias: '引路人', emoji: '🐺', group: 'NF', color: C.NF },
  INFP: { code: 'INFP', name: '调停者', alias: '小蝴蝶', emoji: '🦋', group: 'NF', color: C.NF },
  ENFJ: { code: 'ENFJ', name: '主人公', alias: '大家长', emoji: '🐬', group: 'NF', color: C.NF },
  ENFP: { code: 'ENFP', name: '竞选者', alias: '小狗', emoji: '🐶', group: 'NF', color: C.NF },
  ISTJ: { code: 'ISTJ', name: '物流师', alias: '务实派', emoji: '🐻', group: 'SJ', color: C.SJ },
  ISFJ: { code: 'ISFJ', name: '守卫者', alias: '守护者', emoji: '🐧', group: 'SJ', color: C.SJ },
  ESTJ: { code: 'ESTJ', name: '总经理', alias: '执行者', emoji: '🐝', group: 'SJ', color: C.SJ },
  ESFJ: { code: 'ESFJ', name: '执政官', alias: '热心肠', emoji: '🐰', group: 'SJ', color: C.SJ },
  ISTP: { code: 'ISTP', name: '鉴赏家', alias: '手艺人', emoji: '🐈', group: 'SP', color: C.SP },
  ISFP: { code: 'ISFP', name: '探险家', alias: '小画家', emoji: '🦌', group: 'SP', color: C.SP },
  ESTP: { code: 'ESTP', name: '企业家', alias: '行动派', emoji: '🐯', group: 'SP', color: C.SP },
  ESFP: { code: 'ESFP', name: '表演者', alias: '开心果', emoji: '🦜', group: 'SP', color: C.SP },
}

export function typeMeta(code: string): TypeMeta | null {
  return TYPE_META[code] || null
}
