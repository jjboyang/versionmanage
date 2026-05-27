import { useEffect, useState, useCallback } from 'react'

/** 可持久化的区块收起状态（localStorage 存 string[]） */
export function usePersistedCollapsed(storageKey: string) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return new Set(raw ? (JSON.parse(raw) as string[]) : [])
    } catch {
      return new Set()
    }
  })

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify([...collapsed]))
  }, [collapsed, storageKey])

  const isCollapsed = useCallback((id: string) => collapsed.has(id), [collapsed])

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const expand = useCallback((id: string) => {
    setCollapsed((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  return { collapsed, isCollapsed, toggle, expand, setCollapsed }
}
