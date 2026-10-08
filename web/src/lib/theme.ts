/** 默认主题:纸感 · 朱砂(界面不提供主题切换) */
export const DEFAULT_THEME = 'paper'

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

/** 生效主题:有类型极光则用 aurora(配合 data-atype),否则恒为默认纸感朱砂 */
export function readTheme(): string {
  return readAtype() ? 'aurora' : DEFAULT_THEME
}

export function applyTheme(id: string, atype = ''): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = id
  if (atype) document.documentElement.dataset.atype = atype
  else delete document.documentElement.dataset.atype
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

/**
 * 已有完成记录、但还没有类型极光的用户(含老版本记录):回溯套用最新一条的类型。
 */
export function retroTypeTheme(history: { code?: string }[]): void {
  if (readAtype()) return
  const code = (history || []).find((h) => h && /^[A-Z]{4}$/.test(h.code || ''))?.code || ''
  if (code) applyTypeTheme(code)
}
