import { useState, useCallback, useEffect, useRef } from 'react'
import AppNav, { type AppTab } from './components/AppNav'
import VersionList from './components/VersionList'
import TaskList from './components/TaskList'
import Overview from './components/Overview'
import AssigneeOverview from './components/AssigneeOverview'
import {
  downloadBackup,
  importBackup,
  isBackupDue,
  isFolderConfigured,
  setupBackupFolder,
  autoBackup,
  getLastBackupDate,
} from './backup'
import { getVersions, subscribeToDataChanges, syncFromServer, DATA_CHANGED_EVENT } from './store'
import { applyTheme, getStoredTheme, THEMES, type ThemeId } from './theme'

export default function App() {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [tab, setTab] = useState<AppTab>('tasks')
  const [folderReady, setFolderReady] = useState(false)
  const [folderChecking, setFolderChecking] = useState(true)
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null)
  const [lastBackup, setLastBackup] = useState<string | null>(getLastBackupDate())
  const [syncError, setSyncError] = useState<string | null>(null)
  const [theme, setTheme] = useState<ThemeId>(getStoredTheme)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleThemeChange = (id: ThemeId) => {
    setTheme(id)
    applyTheme(id)
  }

  const handleSelect = useCallback((id: string) => {
    setSelectedVersionId(id)
    setRefreshKey((k) => k + 1)
  }, [])

  useEffect(() => {
    syncFromServer()
    return subscribeToDataChanges(() => {
      setRefreshKey((k) => k + 1)
      setSelectedVersionId((current) => {
        if (!current) return current
        return getVersions().some((version) => version.id === current) ? current : null
      })
    })
  }, [])

  // Sync error listener
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.key === 'sync-error') {
        setSyncError(detail?.error || '操作失败，请检查服务器连接')
        setTimeout(() => setSyncError(null), 6000)
      }
    }
    window.addEventListener(DATA_CHANGED_EVENT, handler)
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handler)
  }, [])
  useEffect(() => {
    isFolderConfigured().then((ok) => {
      setFolderReady(ok)
      setFolderChecking(false)
    })
  }, [])

  // Auto-backup check every 60s
  useEffect(() => {
    if (!folderReady) return
    const check = async () => {
      if (isBackupDue()) {
        const ok = await autoBackup()
        if (ok) setLastBackup(getLastBackupDate())
      }
    }
    check()
    const timer = setInterval(check, 60_000)
    return () => clearInterval(timer)
  }, [folderReady, refreshKey])

  const handleSetupFolder = async () => {
    const ok = await setupBackupFolder()
    if (ok) {
      setFolderReady(true)
      // try immediate backup after setup
      if (isBackupDue()) {
        const done = await autoBackup()
        if (done) setLastBackup(getLastBackupDate())
      }
    }
  }

  const handleExport = async () => {
    await downloadBackup()
    setLastBackup(getLastBackupDate())
  }

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ok = await importBackup(file)
    setRestoreMsg(ok ? '数据恢复成功，页面即将刷新' : '导入失败：无效的备份文件')
    if (ok) {
      setTimeout(() => window.location.reload(), 1000)
    } else {
      setTimeout(() => setRestoreMsg(null), 3000)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const renderMain = () => {
    switch (tab) {
      case 'tasks':
        return selectedVersionId ? (
          <TaskList versionId={selectedVersionId} refreshKey={refreshKey} />
        ) : (
          <div className="empty-state">
            <div className="empty-icon" aria-hidden="true" />
            <p>请从左侧选择一个版本查看任务</p>
            <span className="empty-hint-sub">在左侧版本列表中点击条目即可加载任务</span>
          </div>
        )
      case 'overview':
        return <Overview />
      case 'assignee':
        return <AssigneeOverview />
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>版本任务管理系统</h1>
        <AppNav tab={tab} onChange={setTab} />
        <div className="header-actions">
          <div className="theme-switch" role="group" aria-label="界面主题">
            {THEMES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`theme-switch-btn ${theme === item.id ? 'active' : ''}`}
                onClick={() => handleThemeChange(item.id)}
                title={item.description}
                aria-pressed={theme === item.id}
              >
                {item.label}
              </button>
            ))}
          </div>
          {!folderChecking && !folderReady && (
            <button className="btn-header-warn" onClick={handleSetupFolder}>
              配置自动备份
            </button>
          )}
          {folderReady && lastBackup && (
            <span className="backup-status" title="最近备份日期">上次备份: {lastBackup}</span>
          )}
          {folderReady && (
            <span className="backup-status-ok" title="自动备份已就绪">自动备份已启用</span>
          )}
          <button className="btn-header" onClick={handleExport} title="手动导出备份">
            导出
          </button>
          <button className="btn-header" onClick={() => fileInputRef.current?.click()} title="导入备份">
            导入
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleRestore}
          />
        </div>
      </header>

      {/* Sync error toast */}
      {syncError && (
        <div className="backup-banner banner-error toast-enter" role="alert">
          <span>{syncError}</span>
          <button type="button" className="btn-dismiss" onClick={() => setSyncError(null)} aria-label="关闭">×</button>
        </div>
      )}

      {/* Restore message */}
      {restoreMsg && (
        <div
          className={`backup-banner ${restoreMsg.includes('成功') ? 'banner-success' : 'banner-error'} toast-enter`}
          role="status"
        >
          <span>{restoreMsg}</span>
          <button type="button" className="btn-dismiss" onClick={() => setRestoreMsg(null)} aria-label="关闭">×</button>
        </div>
      )}

      <div className="app-body">
        <aside className="sidebar">
          <VersionList
            selectedId={selectedVersionId}
            onSelect={handleSelect}
          />
        </aside>
        <main className="main">
          {renderMain()}
        </main>
      </div>
    </div>
  )
}
