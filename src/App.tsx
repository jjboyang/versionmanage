import { useState, useCallback, useEffect, useRef } from 'react'
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

type Tab = 'tasks' | 'overview' | 'assignee'

export default function App() {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [tab, setTab] = useState<Tab>('tasks')
  const [folderReady, setFolderReady] = useState(false)
  const [folderChecking, setFolderChecking] = useState(true)
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null)
  const [lastBackup, setLastBackup] = useState<string | null>(getLastBackupDate())
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSelect = useCallback((id: string) => {
    setSelectedVersionId(id)
    setRefreshKey((k) => k + 1)
  }, [])

  // Init: check if backup folder is configured
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

  const handleExport = () => {
    downloadBackup()
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
            <div className="empty-icon">📋</div>
            <p>请从左侧选择一个版本查看任务</p>
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
        <nav className="app-nav">
          <button
            className={`nav-tab ${tab === 'tasks' ? 'active' : ''}`}
            onClick={() => setTab('tasks')}
          >
            任务管理
          </button>
          <button
            className={`nav-tab ${tab === 'overview' ? 'active' : ''}`}
            onClick={() => setTab('overview')}
          >
            总览看板
          </button>
          <button
            className={`nav-tab ${tab === 'assignee' ? 'active' : ''}`}
            onClick={() => setTab('assignee')}
          >
            负责人看板
          </button>
        </nav>
        <div className="header-actions">
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

      {/* Restore message */}
      {restoreMsg && (
        <div className={`backup-banner ${restoreMsg.includes('成功') ? 'banner-success' : 'banner-error'}`}>
          <span>{restoreMsg}</span>
          <button className="btn-cancel-sm" onClick={() => setRestoreMsg(null)}>×</button>
        </div>
      )}

      <div className="app-body">
        <aside className="sidebar">
          <VersionList
            selectedId={selectedVersionId}
            onSelect={handleSelect}
            refreshKey={refreshKey}
          />
        </aside>
        <main className="main">
          {renderMain()}
        </main>
      </div>
    </div>
  )
}
