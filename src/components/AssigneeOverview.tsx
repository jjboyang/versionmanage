import { useState, useMemo } from 'react'
import type { Task, TaskStatus, Priority } from '../types'
import { getVersions, getTasks, getAssignees, getProjects, updateTask, addAssignee, addProject } from '../store'
import TaskCardItem from './TaskCardItem'

const STATUS_CLASS: Record<TaskStatus, string> = {
  '未开始': 's-todo',
  '进行中': 's-progress',
  '已完成': 's-done',
  '已暂停': 's-paused',
}

const STATUS_OPTIONS: TaskStatus[] = ['未开始', '进行中', '已完成', '已暂停']
const PRIORITY_OPTIONS: Priority[] = ['P0', 'P1', 'P2', 'P3']

type Mode = 'overview' | 'todo'

export default function AssigneeOverview() {
  const versions = getVersions()
  const allTasks = getTasks()
  const assignees = getAssignees()
  const projects = getProjects()

  const [selectedAssignee, setSelectedAssignee] = useState('')
  const [selectedVersionIds, setSelectedVersionIds] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [mode, setMode] = useState<Mode>('overview')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [form, setForm] = useState<Omit<Task, 'id' | 'createdAt'> | null>(null)

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

  const childrenMap = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of allTasks) {
      if (!t.parentId) continue
      const list = map.get(t.parentId) || []
      list.push(t)
      map.set(t.parentId, list)
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

  const rollupTasks = useMemo(() => {
    const matchedIds = new Set(matchedTasks.map((t) => t.id))
    const taskMap = new Map(allTasks.map((t) => [t.id, t]))

    return matchedTasks.filter((task) => {
      let parentId = task.parentId
      while (parentId) {
        if (matchedIds.has(parentId)) return false
        parentId = taskMap.get(parentId)?.parentId
      }
      return true
    })
  }, [allTasks, matchedTasks])

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
    const total = rollupTasks.length
    const done = rollupTasks.filter((t) => t.status === '已完成').length
    const inProgress = rollupTasks.filter((t) => t.status === '进行中').length
    const estimated = rollupTasks.reduce((s, t) => s + t.estimatedHours, 0)
    const actual = rollupTasks.reduce((s, t) => s + t.actualHours, 0)
    return { total, done, inProgress, estimated, actual }
  }, [rollupTasks])

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

  const openEdit = (task: Task) => {
    setEditingId(task.id)
    setForm({
      versionId: task.versionId,
      parentId: task.parentId,
      name: task.name,
      assignee: task.assignee,
      startDate: task.startDate,
      completedDate: task.completedDate,
      estimatedHours: task.estimatedHours,
      actualHours: task.actualHours,
      status: task.status,
      project: task.project,
      priority: task.priority,
    })
  }

  const closeEdit = () => {
    setEditingId(null)
    setForm(null)
  }

  const saveEdit = () => {
    if (!editingId || !form || !form.name.trim()) return
    if (form.status === '已完成' && form.actualHours === 0) {
      alert('请先填写实际工时后再标记为已完成')
      return
    }
    updateTask(editingId, { ...form, name: form.name.trim() })
    if (form.assignee && !assignees.includes(form.assignee)) addAssignee(form.assignee)
    if (form.project && !projects.includes(form.project)) addProject(form.project)
    closeEdit()
  }

  const editingTask = editingId ? allTasks.find((t) => t.id === editingId) : undefined
  const editingHasChildren = editingTask ? childrenMap.has(editingTask.id) : false

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
            className="field-select"
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
            <select className="field-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">全部</option>
              <option value="未开始">未开始</option>
              <option value="进行中">进行中</option>
              <option value="已完成">已完成</option>
              <option value="已暂停">已暂停</option>
            </select>
          </div>
        )}
        {mode === 'todo' && (
          <div className="selector-row selector-hint">
            <span>
              当前显示：<strong>进行中</strong> 的任务
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
            <div className="summary-value">{stats.estimated}d</div>
            <div className="summary-label">预估总工时</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">{stats.actual}d</div>
            <div className="summary-label">实际总工时</div>
          </div>
        </div>
      )}

      {/* Task list grouped by version with tree view */}
      {selectedAssignee && matchedTasks.length > 0 && (
        <div className="assignee-version-groups">
          {groupedByVersion.map(([vName, tasks]) => {
            const taskIds = new Set(tasks.map((t) => t.id))
            const taskMap = new Map(tasks.map((t) => [t.id, t]))
            const versionRollupTasks = rollupTasks.filter((t) => taskIds.has(t.id))
            const vEstimated = versionRollupTasks.reduce((s, t) => s + t.estimatedHours, 0)
            const vActual = versionRollupTasks.reduce((s, t) => s + t.actualHours, 0)
            const vDone = versionRollupTasks.filter((t) => t.status === '已完成').length
            const vInProgress = versionRollupTasks.filter((t) => t.status === '进行中').length

            // Build flat tree rows for this version
            const topTasks = tasks.filter((t) => !t.parentId || !taskMap.has(t.parentId))
            const flatRows: { task: Task; depth: number; hasChildren: boolean }[] = []
            function walk(task: Task, depth: number) {
              const children = tasks.filter((t) => t.parentId === task.id)
              const hasChildren = children.length > 0
              flatRows.push({ task, depth, hasChildren })
              if (hasChildren && expandedIds.has(task.id)) {
                for (const child of children) walk(child, depth + 1)
              }
            }
            for (const t of topTasks) walk(t, 0)

            return (
              <div key={vName} className="task-table-wrap task-card-list-wrap assignee-task-block">
                <div className="version-block-header">
                  <h3>📋 {vName}</h3>
                  <span className="version-block-meta">
                    {versionRollupTasks.length} 个统计任务 | 预估 {vEstimated}d | 实际 {vActual}d
                    {mode === 'overview' ? ` | 完成 ${vDone}/${versionRollupTasks.length}` : ` | 进行中 ${vInProgress}`}
                  </span>
                </div>
                <div className="task-card-list">
                  {flatRows.map(({ task: t, depth, hasChildren }) => (
                    <TaskCardItem
                      key={t.id}
                      task={t}
                      depth={depth}
                      hasChildren={hasChildren}
                      expanded={expandedIds.has(t.id)}
                      readOnlyStatus
                      onToggleExpand={hasChildren ? () => setExpandedIds((prev) => {
                        const next = new Set(prev)
                        if (next.has(t.id)) next.delete(t.id)
                        else next.add(t.id)
                        return next
                      }) : undefined}
                      onEdit={() => openEdit(t)}
                    />
                  ))}
                </div>
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

      {form && (
        <div className="modal-overlay" onClick={closeEdit}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>编辑任务</h3>
              <button className="btn-close" onClick={closeEdit}>×</button>
            </div>
            <div className="modal-body">
              {form.parentId && (
                <div className="form-row">
                  <label>父任务</label>
                  <input value={parentMap.get(editingId || '')?.name || ''} disabled />
                </div>
              )}

              <div className="form-row">
                <label>任务名称 *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="输入任务名称"
                />
              </div>

              <div className="form-row form-row-3">
                <div className="form-col">
                  <label>负责人</label>
                  <input
                    value={form.assignee}
                    onChange={(e) => setForm({ ...form, assignee: e.target.value })}
                    placeholder="输入或选择"
                    list="assignee-overview-list"
                  />
                  <datalist id="assignee-overview-list">
                    {assignees.map((a) => <option key={a} value={a} />)}
                  </datalist>
                </div>
                <div className="form-col">
                  <label>项目</label>
                  <input
                    value={form.project}
                    onChange={(e) => setForm({ ...form, project: e.target.value })}
                    placeholder="输入或选择"
                    list="project-overview-list"
                  />
                  <datalist id="project-overview-list">
                    {projects.map((p) => <option key={p} value={p} />)}
                  </datalist>
                </div>
                <div className="form-col">
                  <label>开始时间</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row form-row-3">
                <div className="form-col">
                  <label>预估工时 (d){editingHasChildren ? ' [自动]' : ''}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.estimatedHours}
                    onChange={(e) => setForm({ ...form, estimatedHours: +e.target.value })}
                    disabled={editingHasChildren}
                    title={editingHasChildren ? '有子任务时工时自动累加' : ''}
                  />
                </div>
                <div className="form-col">
                  <label>实际工时 (d){editingHasChildren ? ' [自动]' : ''}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.actualHours}
                    onChange={(e) => setForm({ ...form, actualHours: +e.target.value })}
                    disabled={editingHasChildren}
                    title={editingHasChildren ? '有子任务时工时自动累加' : ''}
                  />
                </div>
                <div className="form-col">
                  <label>优先级</label>
                  <select
                    className="field-select"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}
                  >
                    {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <label>状态</label>
                <div className="status-radio-group">
                  {STATUS_OPTIONS.map((s) => (
                    <label key={s} className={`status-radio ${STATUS_CLASS[s]} ${form.status === s ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="assignee-status"
                        value={s}
                        checked={form.status === s}
                        onChange={() => setForm({ ...form, status: s })}
                      />
                      {s}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-row">
                <label>完成日期</label>
                <input
                  type="date"
                  value={form.completedDate || ''}
                  onChange={(e) => setForm({ ...form, completedDate: e.target.value || undefined })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={closeEdit}>取消</button>
              <button className="btn-confirm" onClick={saveEdit}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
