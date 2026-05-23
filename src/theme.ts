export type ThemeId = 'default' | 'regal'

const STORAGE_KEY = 'vtm_theme'

export const THEMES: { id: ThemeId; label: string; description: string }[] = [
  { id: 'default', label: '默认', description: '清爽浅色界面' },
  { id: 'regal', label: '深海剧院', description: '深蓝金调 · 背景插画' },
]

export function getStoredTheme(): ThemeId {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'regal' || value === 'default') return value
  } catch {
    /* ignore */
  }
  return 'default'
}

const META_COLORS: Record<ThemeId, string> = {
  default: '#2563eb',
  regal: '#0a101f',
}

export function applyTheme(id: ThemeId) {
  document.documentElement.setAttribute('data-theme', id)
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', META_COLORS[id])
}

export function initTheme() {
  applyTheme(getStoredTheme())
}
