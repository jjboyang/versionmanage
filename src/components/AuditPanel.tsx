import { useEffect, useState } from 'react'
import { fetchHistory, fetchLogs, rollbackToRevision, type HistoryItem, type OperationLog } from '../api'
import { syncFromServer } from '../store'

export default function AuditPanel() {
  const [logs, setLogs] = useState<OperationLog[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [message, setMessage] = useState('')

  const load = async () => {
    const [nextLogs, nextHistory] = await Promise.all([fetchLogs(), fetchHistory()])
    setLogs(nextLogs)
    setHistory(nextHistory)
  }

  useEffect(() => {
    load().catch(() => setMessage('记录加载失败，请确认后端已启动'))
  }, [])

  const handleRollback = async (revision: number) => {
    if (!confirm(`确定回滚到修订 ${revision}？当前数据会生成新的修订记录。`)) return
    try {
      await rollbackToRevision(revision)
      await syncFromServer()
      await load()
      setMessage(`已回滚到修订 ${revision}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '回滚失败')
    }
  }

  return (
    <div className="overview-panel">
      <div className="panel-header">
        <h2>系统记录</h2>
        <button className="btn-reset" onClick={() => load()}>刷新</button>
      </div>

      {message && <div className="backup-banner">{message}</div>}

      <div className="audit-grid">
        <section className="audit-section">
          <div className="audit-section-header">
            <h3>操作日志</h3>
            <span>{logs.length} 条</span>
          </div>
          <div className="audit-list">
            {logs.map((log) => (
              <div key={log.id} className="audit-item">
                <div>
                  <strong>{log.summary}</strong>
                  <span>修订 {log.revision} · {log.operation}</span>
                </div>
                <time>{new Date(log.created_at).toLocaleString()}</time>
              </div>
            ))}
            {logs.length === 0 && <div className="empty-hint">暂无操作记录</div>}
          </div>
        </section>

        <section className="audit-section">
          <div className="audit-section-header">
            <h3>历史修订</h3>
            <span>{history.length} 条</span>
          </div>
          <div className="audit-list">
            {history.map((item) => (
              <div key={item.revision} className="audit-item">
                <div>
                  <strong>修订 {item.revision}</strong>
                  <span>{item.operation}</span>
                </div>
                <div className="audit-actions">
                  <time>{new Date(item.created_at).toLocaleString()}</time>
                  <button className="btn-edit" onClick={() => handleRollback(item.revision)}>回滚</button>
                </div>
              </div>
            ))}
            {history.length === 0 && <div className="empty-hint">暂无历史修订</div>}
          </div>
        </section>
      </div>
    </div>
  )
}
