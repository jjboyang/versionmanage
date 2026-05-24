import { useCallback, useLayoutEffect, useRef, useState } from 'react'

export type AppTab = 'tasks' | 'overview' | 'assignee' | 'audit'

const TABS: { id: AppTab; label: string }[] = [
  { id: 'tasks', label: '任务管理' },
  { id: 'overview', label: '总览看板' },
  { id: 'assignee', label: '负责人看板' },
  { id: 'audit', label: '系统记录' },
]

interface Props {
  tab: AppTab
  onChange: (tab: AppTab) => void
}

export default function AppNav({ tab, onChange }: Props) {
  const navRef = useRef<HTMLElement>(null)
  const tabRefs = useRef<Partial<Record<AppTab, HTMLButtonElement>>>({})
  const [thumb, setThumb] = useState({ left: 0, width: 0 })

  const updateThumb = useCallback(() => {
    const nav = navRef.current
    const btn = tabRefs.current[tab]
    if (!nav || !btn) return
    setThumb({ left: btn.offsetLeft, width: btn.offsetWidth })
  }, [tab])

  useLayoutEffect(() => {
    updateThumb()
    const nav = navRef.current
    if (!nav) return
    const ro = new ResizeObserver(updateThumb)
    ro.observe(nav)
    window.addEventListener('resize', updateThumb)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', updateThumb)
    }
  }, [tab, updateThumb])

  return (
    <nav ref={navRef} className="app-nav" role="tablist" aria-label="主导航">
      <span
        className="nav-slider"
        aria-hidden="true"
        style={{
          width: thumb.width,
          transform: `translateX(${thumb.left}px)`,
        }}
      />
      {TABS.map((item) => (
        <button
          key={item.id}
          ref={(el) => {
            if (el) tabRefs.current[item.id] = el
          }}
          type="button"
          role="tab"
          aria-selected={tab === item.id}
          className={`nav-tab ${tab === item.id ? 'active' : ''}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}
