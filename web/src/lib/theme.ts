export interface ThemeDef {
  id: string
  name: string
}

export const THEMES: ThemeDef[] = [
  { id: 'night', name: '深邃夜蓝' },
  { id: 'dawn', name: '柔和晨光' },
  { id: 'mint', name: '薄荷青' },
  { id: 'sakura', name: '暖樱粉' },
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
