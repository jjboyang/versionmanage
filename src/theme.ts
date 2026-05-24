export type ThemeId = 'default' | 'regal' | 'stellar'

const STORAGE_KEY = 'vtm_theme'

const VALID_THEMES: ThemeId[] = ['default', 'regal', 'stellar']

export const THEMES: { id: ThemeId; label: string; description: string }[] = [
  { id: 'default', label: '默认', description: '清爽浅色界面' },
  { id: 'regal', label: '深海剧院', description: '深蓝金调 · 背景插画' },
  { id: 'stellar', label: '星晶棱镜', description: '粉晶霓虹 · 星芒背景' },
]

export function getStoredTheme(): ThemeId {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (VALID_THEMES.includes(value as ThemeId)) return value as ThemeId
  } catch {
    /* ignore */
  }
  return 'default'
}

const META_COLORS: Record<ThemeId, string> = {
  default: '#2563eb',
  regal: '#0a101f',
  stellar: '#120422',
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
