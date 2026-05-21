import { useState, useMemo } from 'react'
import type { Task, TaskStatus } from '../types'
import { getVersions, getTasks, getAssignees } from '../store'

const STATUS_CLASS: Record<TaskStatus, string> = {
  '未开始': 's-todo',
  '进行中': 's-progress',
  '已完成': 's-done',
  '已暂停': 's-paused',
}

type Mode = 'overview' | 'todo'

export default function AssigneeOverview() {
  const versions = getVersions()
  const allTasks = getTasks()
  const assignees = getAssignees()

  const [selectedAssignee, setSelectedAssignee] = useState('')
  const [selectedVersionIds, setSelectedVersionIds] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [mode, setMode] = useState<Mode>('overview')

  // Build version map for quick lookup
  const versionMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const v of versions) map.set(v.id, v.name)
    return map
  }, [versions])

  // Build parent map: child id → parent task
  const parentMap = useMemo(() => {
    const map = new Map<string, Task>()
    for (const t of allTasks) {
      if (!t.parentId) continue
      const parent = allTasks.find((p) => p.id === t.parentId)
      if (parent) map.set(t.id, parent)
    }
    return map
  }, [allTasks])

  // All assignees' tasks (matching assignee, optionally filtered by version/status)
  const matchedTasks = useMemo(() => {
    let tasks = allTasks.filter((t) => t.assignee === selectedAssignee)
    if (selectedVersionIds.length > 0) {
      const idSet = new Set(selectedVersionIds)
      tasks = tasks.filter((t) => idSet.has(t.versionId))
    }
    if (mode === 'todo') {
      tasks = tasks.filter((t) => t.status === '进行中')
    } else if (statusFilter) {
      tasks = tasks.filter((t) => t.status === statusFilter)
    }
    return tasks
  }, [allTasks, selectedAssignee, selectedVersionIds, statusFilter, mode])

  // Group by version
  const groupedByVersion = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of matchedTasks) {
      const vName = versionMap.get(t.versionId) || '未知版本'
      const list = map.get(vName) || []
      list.push(t)
      map.set(vName, list)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [matchedTasks, versionMap])

  // Stats
  const stats = useMemo(() => {
    const total = matchedTasks.length
    const done = matchedTasks.filter((t) => t.status === '已完成').length
    const inProgress = matchedTasks.filter((t) => t.status === '进行中').length
    const estimated = matchedTasks.reduce((s, t) => s + t.estimatedHours, 0)
    const actual = matchedTasks.reduce((s, t) => s + t.actualHours, 0)
    return { total, done, inProgress, estimated, actual }
  }, [matchedTasks])

  // Version options for filter: only show versions that have tasks for this assignee
  const relevantVersions = useMemo(() => {
    if (!selectedAssignee) return []
    const vIds = new Set<string>()
    for (const t of allTasks) {
      if (t.assignee === selectedAssignee) vIds.add(t.versionId)
    }
    return versions.filter((v) => vIds.has(v.id))
  }, [allTasks, selectedAssignee, versions])

  const toggleVersion = (id: string) => {
    setSelectedVersionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const selectAllVersions = () => {
    setSelectedVersionIds(relevantVersions.map((v) => v.id))
  }
  const deselectAllVersions = () => setSelectedVersionIds([])

  return (
    <div className="overview-panel">
      <div className="panel-header">
        <h2>负责人看板</h2>
        <div className="mode-toggle">
          <button
            className={`mode-btn ${mode === 'overview' ? 'active' : ''}`}
            onClick={() => setMode('overview')}
          >
            总览模式
          </button>
          <button
            className={`mode-btn ${mode === 'todo' ? 'active' : ''}`}
            onClick={() => setMode('todo')}
          >
            TODO
          </button>
        </div>
      </div>

      {/* Selector */}
      <div className="overview-selector">
        <div className="selector-row">
          <label>选择负责人：</label>
          <select
            value={selectedAssignee}
            onChange={(e) => { setSelectedAssignee(e.target.value); setSelectedVersionIds([]) }}
          >
            <option value="">请选择</option>
            {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {selectedAssignee && relevantVersions.length > 0 && (
          <div className="selector-row" style={{ alignItems: 'flex-start' }}>
            <label>版本筛选：</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              {relevantVersions.map((v) => (
                <label key={v.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedVersionIds.length === 0 || selectedVersionIds.includes(v.id)}
                    onChange={() => toggleVersion(v.id)}
                  />
                  {v.name}
                </label>
              ))}
              <button className="btn-link" onClick={selectAllVersions}>全选</button>
              <button className="btn-link" onClick={deselectAllVersions}>清除</button>
            </div>
          </div>
        )}

        {mode === 'overview' && (
          <div className="selector-row">
            <label>任务状态：</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">全部</option>
              <option value="未开始">未开始</option>
              <option value="进行中">进行中</option>
              <option value="已完成">已完成</option>
              <option value="已暂停">已暂停</option>
            </select>
          </div>
        )}
        {mode === 'todo' && (
          <div className="selector-row">
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              当前显示：<strong style={{ color: '#2563eb' }}>进行中</strong> 的任务
            </span>
          </div>
        )}
      </div>

      {/* Stats cards */}
      {selectedAssignee && (
        <div className="overview-summary">
          <div className="summary-card">
            <div className="summary-value">{stats.total}</div>
            <div className="summary-label">{mode === 'todo' ? '进行中任务' : '任务总数'}</div>
          </div>
          {mode === 'overview' ? (
            <div className="summary-card">
              <div className="summary-value">{stats.done}/{stats.total}</div>
              <div className="summary-label">已完成</div>
            </div>
          ) : (
            <div className="summary-card">
              <div className="summary-value">{stats.inProgress}</div>
              <div className="summary-label">进行中</div>
            </div>
          )}
          <div className="summary-card">
            <div className="summary-value">{stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0}%</div>
            <div className="summary-label">完成率</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">{stats.estimated}h</div>
            <div className="summary-label">预估总工时</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">{stats.actual}h</div>
            <div className="summary-label">实际总工时</div>
          </div>
        </div>
      )}

      {/* Task list grouped by version */}
      {selectedAssignee && matchedTasks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, overflow: 'auto' }}>
          {groupedByVersion.map(([vName, tasks]) => {
            const vEstimated = tasks.reduce((s, t) => s + t.estimatedHours, 0)
            const vActual = tasks.reduce((s, t) => s + t.actualHours, 0)
            const vDone = tasks.filter((t) => t.status === '已完成').length
            const vInProgress = tasks.filter((t) => t.status === '进行中').length
            return (
              <div key={vName} className="task-table-wrap" style={{ flex: 'none', maxHeight: 'none' }}>
                <div style={{ padding: '10px 16px', background: '#fafafa', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600 }}>📋 {vName}</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {tasks.length} 个任务 | 预估 {vEstimated}h | 实际 {vActual}h
                    {mode === 'overview' ? ` | 完成 ${vDone}/${tasks.length}` : ` | 进行中 ${vInProgress}`}
                  </span>
                </div>
                <table className="task-table">
                  <thead>
                    <tr>
                      <th style={{ width: '22%' }}>任务名称</th>
                      <th>父任务</th>
                      <th>开始时间</th>
                      <th>完成日期</th>
                      <th>预估(h)</th>
                      <th>实际(h)</th>
                      <th>状态</th>
                      <th>优先级</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t) => {
                      const parent = parentMap.get(t.id)
                      return (
                        <tr key={t.id}>
                          <td className="td-name">{t.name}</td>
                          <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {parent ? parent.name : (t.parentId ? '—' : '（顶层）')}
                          </td>
                          <td>{t.startDate}</td>
                          <td style={{ fontSize: '12px' }}>{t.completedDate || '—'}</td>
                          <td className="td-num">{t.estimatedHours}</td>
                          <td className="td-num">{t.actualHours}</td>
                          <td>
                            <span className={`status-select ${STATUS_CLASS[t.status]}`} style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px' }}>
                              {t.status}
                            </span>
                          </td>
                          <td>
                            <span className={`priority-tag pri-${t.priority.toLowerCase()}`}>{t.priority}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      {selectedAssignee && matchedTasks.length === 0 && (
        <div className="empty-hint">
          {mode === 'todo' ? '该负责人暂无进行中的任务' : '该负责人暂无匹配任务'}
        </div>
      )}
      {!selectedAssignee && (
        <div className="empty-hint overview-empty">请选择负责人以查看任务</div>
      )}
    </div>
  )
}
