import { useState, useMemo, useRef, useCallback } from 'react'
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
const REPORT_DRAFT_KEY = 'vtm_report_draft'

const todayStr = () => new Date().toISOString().slice(0, 10)

function calcTaskProgress(task: Task, allTasks: Task[]): number {
  if (task.status === '已完成') return 100
  if (task.status === '未开始' || task.status === '已暂停') return 0
  const children = allTasks.filter((t) => t.parentId === task.id)
  if (children.length > 0) {
    const done = children.filter((c) => c.status === '已完成').length
    return Math.round((done / children.length) * 100)
  }
  if (task.estimatedHours > 0) {
    const pct = Math.round((task.actualHours / task.estimatedHours) * 100)
    return Math.min(Math.max(pct, 5), 99)
  }
  return 50
}

function loadDraft(assignee: string) {
  try {
    const raw = localStorage.getItem(REPORT_DRAFT_KEY + '_' + assignee)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveDraft(assignee: string, progress: Record<string, number>, notes: Record<string, string>, globalNotes: string) {
  localStorage.setItem(
    REPORT_DRAFT_KEY + '_' + assignee,
    JSON.stringify({ progress, notes, globalNotes }),
  )
}

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

  // --- Report state ---
  const [showReport, setShowReport] = useState(false)
  const [reportProgress, setReportProgress] = useState<Record<string, number>>({})
  const [reportTaskNotes, setReportTaskNotes] = useState<Record<string, string>>({})
  const [reportGlobalNotes, setReportGlobalNotes] = useState('')
  const [reportCopied, setReportCopied] = useState(false)
  const reportPreviewRef = useRef<HTMLPreElement>(null)

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

  // --- Report functions ---

  // Tasks for report (all assignee tasks, filterable by version)
  const reportTasks = useMemo(() => {
    if (!selectedAssignee) return []
    let tasks = allTasks.filter((t) => t.assignee === selectedAssignee)
    if (selectedVersionIds.length > 0) {
      const idSet = new Set(selectedVersionIds)
      tasks = tasks.filter((t) => idSet.has(t.versionId))
    }
    return tasks
  }, [allTasks, selectedAssignee, selectedVersionIds])

  const reportTasksByStatus = useMemo(() => {
    const t = todayStr()
    const completedToday: Task[] = []
    const completedEarlier: Task[] = []
    const inProgress: Task[] = []
    const notStarted: Task[] = []
    const paused: Task[] = []
    for (const task of reportTasks) {
      if (task.status === '已完成') {
        if (task.completedDate === t) completedToday.push(task)
        else completedEarlier.push(task)
      } else if (task.status === '进行中') {
        inProgress.push(task)
      } else if (task.status === '未开始') {
        notStarted.push(task)
      } else if (task.status === '已暂停') {
        paused.push(task)
      }
    }
    return { completedToday, completedEarlier, inProgress, notStarted, paused }
  }, [reportTasks])

  // Init report state when opening
  const openReport = useCallback(() => {
    if (!selectedAssignee) return
    const progress: Record<string, number> = {}
    for (const t of reportTasks) {
      progress[t.id] = calcTaskProgress(t, allTasks)
    }
    const draft = loadDraft(selectedAssignee)
    if (draft) {
      setReportProgress({ ...progress, ...draft.progress })
      setReportTaskNotes(draft.notes || {})
      setReportGlobalNotes(draft.globalNotes || '')
    } else {
      setReportProgress(progress)
      setReportTaskNotes({})
      setReportGlobalNotes('')
    }
    setReportCopied(false)
    setShowReport(true)
  }, [selectedAssignee, reportTasks, allTasks])

  const closeReport = () => {
    if (selectedAssignee) {
      saveDraft(selectedAssignee, reportProgress, reportTaskNotes, reportGlobalNotes)
    }
    setShowReport(false)
  }

  const handleCopyReport = async () => {
    if (selectedAssignee) {
      saveDraft(selectedAssignee, reportProgress, reportTaskNotes, reportGlobalNotes)
    }
    const md = generateReportMarkdown()
    try {
      await navigator.clipboard.writeText(md)
      setReportCopied(true)
      setTimeout(() => setReportCopied(false), 2000)
    } catch {
      // Fallback: select text in pre element
      if (reportPreviewRef.current) {
        const range = document.createRange()
        range.selectNode(reportPreviewRef.current)
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(range)
        document.execCommand('copy')
        setReportCopied(true)
        setTimeout(() => setReportCopied(false), 2000)
      }
    }
  }

  function generateReportMarkdown(): string {
    const t = todayStr()
    const { completedToday, completedEarlier, inProgress, notStarted, paused } = reportTasksByStatus
    const lines: string[] = []
    lines.push(`# 日报 — ${selectedAssignee} — ${t}`)
    lines.push('')

    // Summary stats
    const totalActual = [...completedToday, ...completedEarlier]
      .reduce((s, tk) => s + tk.actualHours, 0)
    const totalEstimate = [...inProgress, ...notStarted, ...paused]
      .reduce((s, tk) => s + tk.estimatedHours, 0)
    lines.push('## 📊 概览')
    lines.push('')
    lines.push(`- 今日完成: ${completedToday.length} 项`)
    lines.push(`- 进行中: ${inProgress.length} 项`)
    if (notStarted.length > 0) lines.push(`- 未开始: ${notStarted.length} 项`)
    if (paused.length > 0) lines.push(`- 已暂停: ${paused.length} 项`)
    lines.push(`- 今日实际工时: ${totalActual}d`)
    lines.push(`- 剩余预估工时: ${totalEstimate}d`)
    lines.push('')

    // Today's completed
    if (completedToday.length > 0) {
      lines.push('## ✅ 今日完成')
      lines.push('')
      for (const task of completedToday) {
        const vName = versionMap.get(task.versionId) || ''
        lines.push(`- [${task.priority}] ${task.name} — 实际 ${task.actualHours}d${vName ? ` (${vName})` : ''}`)
      }
      lines.push('')
    }

    // Earlier completed (just a count)
    if (completedEarlier.length > 0) {
      lines.push('## ☑️ 此前已完成')
      lines.push('')
      for (const task of completedEarlier) {
        const vName = versionMap.get(task.versionId) || ''
        lines.push(`- [${task.priority}] ${task.name} — ${task.completedDate || ''}${vName ? ` (${vName})` : ''}`)
      }
      lines.push('')
    }

    // In progress
    if (inProgress.length > 0) {
      lines.push('## 🔄 进行中')
      lines.push('')
      for (const task of inProgress) {
        const pct = reportProgress[task.id] ?? calcTaskProgress(task, allTasks)
        const note = reportTaskNotes[task.id] || ''
        const vName = versionMap.get(task.versionId) || ''
        const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10))
        lines.push(`- [${task.priority}] ${task.name} ${bar} ${pct}% — 预估 ${task.estimatedHours}d${vName ? ` (${vName})` : ''}`)
        if (note) lines.push(`  > ${note}`)
      }
      lines.push('')
    }

    // Not started
    if (notStarted.length > 0) {
      lines.push('## ⏳ 未开始')
      lines.push('')
      for (const task of notStarted) {
        const vName = versionMap.get(task.versionId) || ''
        lines.push(`- [${task.priority}] ${task.name} — 预估 ${task.estimatedHours}d${vName ? ` (${vName})` : ''}`)
      }
      lines.push('')
    }

    // Paused
    if (paused.length > 0) {
      lines.push('## ⏸️ 已暂停')
      lines.push('')
      for (const task of paused) {
        lines.push(`- [${task.priority}] ${task.name}`)
      }
      lines.push('')
    }

    // Global notes
    if (reportGlobalNotes.trim()) {
      lines.push('## 📝 备注 / 阻塞项 / 明日计划')
      lines.push('')
      lines.push(reportGlobalNotes.trim())
      lines.push('')
    }

    return lines.join('\n')
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
        {selectedAssignee && (
          <button className="btn-header" onClick={openReport}>
            生成日报
          </button>
        )}
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
              <button type="button" className="btn-link" onClick={selectAllVersions}>全选</button>
              <button type="button" className="btn-link" onClick={deselectAllVersions}>清除</button>
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
            const vDone = versionRollupTasks.filter((t) => t.status === '已完成').length
            const vInProgress = versionRollupTasks.filter((t) => t.status === '进行中').length
            const vTotal = versionRollupTasks.length

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

            const topHasExpand = topTasks.some((t) =>
              tasks.some((c) => c.parentId === t.id),
            )

            return (
              <div key={vName} className="task-table-wrap task-card-list-wrap assignee-task-block">
                <div className="task-card-list">
                  <div
                    className="version-section-header task-card-row task-card-row-top"
                    aria-label={`版本 ${vName}`}
                  >
                    <div className="task-card-title-row">
                      {topHasExpand ? (
                        <span className="expand-toggle expand-toggle--spacer" aria-hidden="true">
                          ▶
                        </span>
                      ) : null}
                      <h3 className="task-card-title version-section-title">{vName}</h3>
                    </div>
                    <div className="task-card-badges version-section-badges">
                      <span className="version-section-stat">
                        {mode === 'overview'
                          ? `完成 ${vDone}/${vTotal}`
                          : `进行中 ${vInProgress}`}
                      </span>
                    </div>
                  </div>
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

      {/* --- Report Modal --- */}
      {showReport && selectedAssignee && (() => {
        const { completedToday, inProgress, notStarted, paused } = reportTasksByStatus
        const allReportSections = [
          { label: '今日完成', cls: 's-done', tasks: completedToday, showProgress: false },
          { label: '进行中', cls: 's-progress', tasks: inProgress, showProgress: true },
          { label: '未开始', cls: 's-todo', tasks: notStarted, showProgress: false },
          { label: '已暂停', cls: 's-paused', tasks: paused, showProgress: false },
        ].filter((s) => s.tasks.length > 0)

        return (
          <div className="modal-overlay" onClick={closeReport}>
            <div className="modal" style={{ maxWidth: '760px', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>日报 — {selectedAssignee} — {todayStr()}</h3>
                <button className="btn-close" onClick={closeReport}>×</button>
              </div>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Stats bar */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <span className="task-meta-chip task-meta-chip-done task-meta-chip-done-filled">
                    今日完成 {completedToday.length}
                  </span>
                  <span className="task-meta-chip">
                    进行中 {inProgress.length}
                  </span>
                  <span className="task-meta-chip">
                    未开始 {notStarted.length}
                  </span>
                  {paused.length > 0 && (
                    <span className="task-meta-chip">已暂停 {paused.length}</span>
                  )}
                </div>

                {/* Task sections */}
                {allReportSections.map((section) => (
                  <div key={section.label}>
                    <h4 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 600 }}>{section.label}</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {section.tasks.map((task) => {
                        const pct = reportProgress[task.id] ?? calcTaskProgress(task, allTasks)
                        const note = reportTaskNotes[task.id] || ''
                        const vName = versionMap.get(task.versionId) || ''
                        return (
                          <div
                            key={task.id}
                            style={{
                              padding: '10px 12px',
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--radius-sm)',
                              background: 'var(--card-bg, var(--bg))',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: section.showProgress ? '6px' : '0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                <span className={`priority-tag pri-${task.priority.toLowerCase()}`}>{task.priority}</span>
                                <span style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</span>
                                {task.estimatedHours > 0 && (
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>预估 {task.estimatedHours}d</span>
                                )}
                                {vName && (
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{vName}</span>
                                )}
                              </div>
                              {task.status === '已完成' && <span style={{ fontSize: '12px', color: 'var(--status-done)', whiteSpace: 'nowrap' }}>✓</span>}
                            </div>
                            {section.showProgress && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  value={pct}
                                  onChange={(e) => setReportProgress((prev) => ({ ...prev, [task.id]: +e.target.value }))}
                                  style={{ flex: 1, height: '6px', accentColor: pct === 100 ? 'var(--status-done)' : 'var(--primary)' }}
                                />
                                <span style={{ minWidth: '36px', fontSize: '13px', textAlign: 'right', fontWeight: 600 }}>{pct}%</span>
                              </div>
                            )}
                            <input
                              type="text"
                              placeholder="添加备注..."
                              value={note}
                              onChange={(e) => setReportTaskNotes((prev) => ({ ...prev, [task.id]: e.target.value }))}
                              style={{
                                marginTop: section.showProgress ? '6px' : '4px',
                                width: '100%',
                                padding: '5px 8px',
                                fontSize: '12px',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--input-bg)',
                                color: 'var(--text)',
                              }}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {allReportSections.length === 0 && (
                  <div className="empty-hint">暂无任务数据</div>
                )}

                {/* Global notes */}
                <div>
                  <h4 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 600 }}>备注 / 阻塞项 / 明日计划</h4>
                  <textarea
                    value={reportGlobalNotes}
                    onChange={(e) => setReportGlobalNotes(e.target.value)}
                    placeholder="输入额外备注、阻塞项、明日计划..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      fontSize: '13px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--input-bg)',
                      color: 'var(--text)',
                      resize: 'vertical',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>

                {/* Markdown preview */}
                <div>
                  <h4 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 600 }}>预览</h4>
                  <pre
                    ref={reportPreviewRef}
                    style={{
                      padding: '12px',
                      fontSize: '12px',
                      lineHeight: 1.6,
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--code-bg, var(--bg-accent))',
                      color: 'var(--text)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: '200px',
                      overflow: 'auto',
                      margin: 0,
                    }}
                  >
{generateReportMarkdown()}
                  </pre>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn-cancel" onClick={closeReport}>关闭</button>
                <button className="btn-confirm" onClick={handleCopyReport}>
                  {reportCopied ? '已复制 ✓' : '复制日报'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
