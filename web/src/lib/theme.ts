export interface ThemeDef {
  id: string
  name: string
  /** 设置页色板的 CSS 背景 */
  swatch: string
  desc: string
}

/** 主题清单:纸感系列(结构复用,换配色) + 其余几套结构不同的设计 */
export const THEMES: ThemeDef[] = [
  // —— 纸感系列(同一套编辑排版,不同配色) ——
  { id: 'paper', name: '纸感 · 朱砂', swatch: 'linear-gradient(135deg, #fbf9f5 0%, #c0392b 100%)', desc: '米白纸 + 朱砂红,杂志封面感' },
  { id: 'paper-ink', name: '纸感 · 墨黑', swatch: 'linear-gradient(135deg, #f8f7f5 0%, #17150f 100%)', desc: '米白纸 + 浓墨,极致对比' },
  { id: 'paper-indigo', name: '纸感 · 靛蓝', swatch: 'linear-gradient(135deg, #f7f8fd 0%, #2b4bd6 100%)', desc: '米白纸 + 靛蓝,理性清爽' },
  { id: 'paper-olive', name: '纸感 · 橄榄', swatch: 'linear-gradient(135deg, #f9f8f1 0%, #5f7a33 100%)', desc: '米白纸 + 橄榄绿,自然温润' },
  { id: 'paper-clay', name: '纸感 · 陶土', swatch: 'linear-gradient(135deg, #fcf6ef 0%, #b4552d 100%)', desc: '米白纸 + 陶土橙,暖调' },
  { id: 'paper-plum', name: '纸感 · 紫棠', swatch: 'linear-gradient(135deg, #faf6f9 0%, #7b3f6e 100%)', desc: '米白纸 + 紫棠,雅致' },
  // —— 极光系列(完成测评后按类型自动切换) ——
  { id: 'aurora', name: '极光 · 霓蓝', swatch: 'linear-gradient(135deg, #7c3aed, #0ea5e9 60%)', desc: '紫青两团柔光,毛玻璃卡片' },
  { id: 'aurora-emerald', name: '极光 · 翡翠', swatch: 'linear-gradient(135deg, #059669, #0ea5e9 60%)', desc: '青绿蓝,清透' },
  { id: 'aurora-sunset', name: '极光 · 暮霞', swatch: 'linear-gradient(135deg, #d946ef, #f97316 60%)', desc: '紫粉橙,暖而浓' },
  { id: 'aurora-ice', name: '极光 · 极地', swatch: 'linear-gradient(135deg, #67e8f9, #818cf8 60%)', desc: '冰青靛,冷静通透' },
  { id: 'aurora-gold', name: '极光 · 流金', swatch: 'linear-gradient(135deg, #f59e0b, #fb7185 60%)', desc: '琥珀玫,热烈' },
  // —— 其他结构不同的设计 ——
  { id: 'night', name: '深邃夜蓝', swatch: 'radial-gradient(1200px 800px at 20% 0%, #162056 0%, #0b1020 60%)', desc: '深海蓝底 + 光晕,发光描边' },
  { id: 'vivid', name: '渐变活力', swatch: 'linear-gradient(135deg, #7c3aed, #db2777 46%, #f97316)', desc: '紫粉橙渐变 + 白卡彩影' },
  { id: 'mono', name: '极简黑白', swatch: 'linear-gradient(135deg, #0a0a0a 55%, #d4ff4f)', desc: '纯黑 + 酸性绿,克制锐利' },
]

/** 默认主题:纸感 · 朱砂 */
export const DEFAULT_THEME = 'paper'

const KEY = 'mbti.theme.v1'
const AKEY = 'mbti.atype.v1'

/** 已完成测评的类型(完成一次后,整体切到该类型专属极光) */
export function readAtype(): string {
  try {
    const v = localStorage.getItem(AKEY)
    return v && /^[A-Z]{4}$/.test(v) ? v : ''
  } catch {
    return ''
  }
}

/** 生效主题:有类型极光则用 aurora(配合 data-atype),否则用用户选择/默认 */
export function readTheme(): string {
  if (readAtype()) return 'aurora'
  try {
    const v = localStorage.getItem(KEY)
    return v && THEMES.some((t) => t.id === v) ? v : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function applyTheme(id: string, atype = ''): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = id
  if (atype) document.documentElement.dataset.atype = atype
  else delete document.documentElement.dataset.atype
}

/** 用户主动选主题:清掉类型极光覆盖 */
export function saveTheme(id: string): void {
  try {
    localStorage.setItem(KEY, id)
    localStorage.removeItem(AKEY)
  } catch {
    /* ignore */
  }
  applyTheme(id, '')
}

/** 完成一次测评:整体切换为该类型专属极光 */
export function applyTypeTheme(code: string): void {
  if (!/^[A-Z]{4}$/.test(code)) return
  try {
    localStorage.setItem(AKEY, code)
  } catch {
    /* ignore */
  }
  applyTheme('aurora', code)
}

/** 放弃类型极光,回到用户选择/默认主题 */
export function clearTypeTheme(): void {
  try {
    localStorage.removeItem(AKEY)
  } catch {
    /* ignore */
  }
  applyTheme(readTheme(), '')
}
