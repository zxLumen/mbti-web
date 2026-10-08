export interface ThemeDef {
  id: string
  name: string
  /** 设置页色板的 CSS 背景 */
  swatch: string
  desc: string
}

/** 5 套结构各异的设计(不只换配色) */
export const THEMES: ThemeDef[] = [
  {
    id: 'night',
    name: '深邃夜蓝',
    swatch: 'radial-gradient(1200px 800px at 20% 0%, #162056 0%, #0b1020 60%)',
    desc: '深海蓝底 + 光晕，卡片描边发光',
  },
  {
    id: 'aurora',
    name: '极光玻璃',
    swatch: 'linear-gradient(135deg, #7c3aed, #0ea5e9 55%, #14b8a6)',
    desc: '极光渐变底 + 毛玻璃卡片，通透',
  },
  {
    id: 'paper',
    name: '纸感杂志',
    swatch: 'linear-gradient(135deg, #fbf9f5 0%, #f2ede4 100%)',
    desc: '米白纸张 + 衬线大字，编辑排版',
  },
  {
    id: 'vivid',
    name: '渐变活力',
    swatch: 'linear-gradient(135deg, #7c3aed, #db2777 46%, #f97316)',
    desc: '紫粉橙大渐变 + 白卡彩影，明快',
  },
  {
    id: 'mono',
    name: '极简黑白',
    swatch: 'linear-gradient(135deg, #0a0a0a 55%, #d4ff4f)',
    desc: '纯黑白 + 酸性绿点缀，克制锐利',
  },
]

const KEY = 'mbti.theme.v1'

export function readTheme(): string {
  try {
    const v = localStorage.getItem(KEY)
    return v && THEMES.some((t) => t.id === v) ? v : 'night'
  } catch {
    return 'night'
  }
}

export function applyTheme(id: string): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = id
}

export function saveTheme(id: string): void {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* ignore */
  }
  applyTheme(id)
}
