import { useState, useMemo } from 'react'
import type { Task, TaskStatus, Priority } from '../types'
import { getTasks, addTask, updateTask, deleteTask, getAssignees, addAssignee, getProjects, addProject } from '../store'
import TaskCardItem from './TaskCardItem'

interface Props {
  versionId: string
  refreshKey: number
}

const STATUS_OPTIONS: TaskStatus[] = ['未开始', '进行中', '已完成', '已暂停']
const PRIORITY_OPTIONS: Priority[] = ['P0', 'P1', 'P2', 'P3']

const STATUS_CLASS: Record<TaskStatus, string> = {
  '未开始': 's-todo',
  '进行中': 's-progress',
  '已完成': 's-done',
  '已暂停': 's-paused',
}

interface FlatRow {
  task: Task
  depth: number
  hasChildren: boolean
}

export default function TaskList({ versionId }: Props) {
  const [, _r] = useState(0)
  const allTasks = getTasks(versionId)
  const assignees = getAssignees()
  const projects = getProjects()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [parentIdForNew, setParentIdForNew] = useState<string | undefined>(undefined)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // filters
  const [filterStatus, setFilterStatus] = useState<TaskStatus | ''>('')
  const [filterAssignee, setFilterAssignee] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterPriority, setFilterPriority] = useState<Priority | ''>('')
  const [searchName, setSearchName] = useState('')

  // completion date prompt
  const [completeTarget, setCompleteTarget] = useState<{ taskId: string } | null>(null)
  const [completeDate, setCompleteDate] = useState('')

  // form state
  const emptyForm: Omit<Task, 'id' | 'createdAt'> = {
    versionId,
    name: '',
    assignee: '',
    startDate: '',
    completedDate: undefined,
    estimatedHours: 0,
    actualHours: 0,
    status: '未开始',
    project: '',
    priority: 'P2',
  }
  const [form, setForm] = useState({ ...emptyForm })

  // Top-level tasks & their children
  const topTasks = allTasks.filter((t) => !t.parentId)
  const childrenMap = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of allTasks) {
      if (t.parentId) {
        const list = map.get(t.parentId) || []
        list.push(t)
        map.set(t.parentId, list)
      }
    }
    return map
  }, [allTasks])

  // Build flat row list respecting expand state & filters
  const { flatRows } = useMemo(() => {
    const matchFilter = (t: Task): boolean => {
      if (filterStatus && t.status !== filterStatus) return false
      if (filterAssignee && t.assignee !== filterAssignee) return false
      if (filterProject && t.project !== filterProject) return false
      if (filterPriority && t.priority !== filterPriority) return false
      if (searchName && !t.name.toLowerCase().includes(searchName.toLowerCase())) return false
      return true
    }

    const topMatched = new Set<string>()
    const rows: FlatRow[] = []

    // First pass: check which top-level tasks (or their children) match filters
    const hasActiveFilter = !!(filterStatus || filterAssignee || filterProject || filterPriority || searchName)

    function subtreeHasMatch(taskId: string): boolean {
      const task = allTasks.find((t) => t.id === taskId)
      if (!task) return false
      if (matchFilter(task)) return true
      const children = childrenMap.get(taskId) || []
      return children.some((c) => subtreeHasMatch(c.id))
    }

    for (const t of topTasks) {
      if (hasActiveFilter) {
        if (subtreeHasMatch(t.id)) {
          topMatched.add(t.id)
        }
      } else {
        topMatched.add(t.id)
      }
    }

    // Flatten: show all top-level + children if expanded (or if filters match children)
    function flatten(task: Task, depth: number) {
      const children = childrenMap.get(task.id) || []
      const hasMatchInSubtree = hasActiveFilter && children.some((c) => subtreeHasMatch(c.id))
      const shouldExpand = expandedIds.has(task.id) || hasMatchInSubtree

      rows.push({ task, depth, hasChildren: children.length > 0 })

      if (children.length > 0 && shouldExpand) {
        for (const child of children) {
          flatten(child, depth + 1)
        }
      }
    }

    for (const t of topTasks) {
      if (topMatched.has(t.id)) {
        flatten(t, 0)
      }
    }

    return { flatRows: rows }
  }, [topTasks, childrenMap, expandedIds, filterStatus, filterAssignee, filterProject, filterPriority, searchName, allTasks])

  // Stats: only count leaf tasks (no children) for accuracy
  const leafTasks = flatRows.filter((r) => !r.hasChildren)
  const totalEstimated = leafTasks.reduce((s, r) => s + r.task.estimatedHours, 0)
  const totalActual = leafTasks.reduce((s, r) => s + r.task.actualHours, 0)
  const doneCount = leafTasks.filter((r) => r.task.status === '已完成').length

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openForm = (task?: Task, asChild?: boolean) => {
    if (task && !asChild) {
      setEditingId(task.id)
      setParentIdForNew(undefined)
      setForm({
        versionId: task.versionId,
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
    } else if (task && asChild) {
      setEditingId(null)
      setParentIdForNew(task.id)
      setForm({ ...emptyForm, versionId, parentId: task.id })
    } else {
      setEditingId(null)
      setParentIdForNew(undefined)
      setForm({ ...emptyForm, versionId })
    }
    setShowForm(true)
  }

  const handleSubmit = () => {
    if (!form.name.trim()) return
    if (form.status === '已完成' && form.actualHours === 0) {
      alert('请先填写实际工时后再标记为已完成')
      return
    }
    if (editingId) {
      updateTask(editingId, form)
    } else {
      addTask(form)
    }
    if (form.assignee && !assignees.includes(form.assignee)) addAssignee(form.assignee)
    if (form.project && !projects.includes(form.project)) addProject(form.project)
    setShowForm(false)
    setEditingId(null)
    setParentIdForNew(undefined)
    _r(Math.random())
  }

  const handleDelete = (id: string) => {
    const children = childrenMap.get(id) || []
    const msg = children.length > 0
      ? `确定删除此任务及其 ${children.length} 个子任务？`
      : '确定删除此任务？'
    if (!confirm(msg)) return
    deleteTask(id)
    _r(Math.random())
  }

  const handleStatusChange = (taskId: string, status: TaskStatus) => {
    if (status === '已完成') {
      const task = allTasks.find((t) => t.id === taskId)
      if (task && task.actualHours === 0) {
        alert('请先填写实际工时后再标记为已完成')
        _r(Math.random())
        return
      }
      setCompleteTarget({ taskId })
      setCompleteDate(new Date().toISOString().slice(0, 10))
      return
    }
    updateTask(taskId, { status })
    _r(Math.random())
  }

  const confirmComplete = () => {
    if (!completeTarget) return
    updateTask(completeTarget.taskId, { status: '已完成', completedDate: completeDate })
    setCompleteTarget(null)
    _r(Math.random())
  }

  const cancelComplete = () => {
    setCompleteTarget(null)
    _r(Math.random()) // reset select to previous value
  }

  const editingTask = editingId ? allTasks.find((t) => t.id === editingId) : undefined
  const editingHasChildren = editingTask ? childrenMap.has(editingTask.id) : false

  return (
    <div className="task-panel">
      <div className="panel-header">
        <h2>任务列表 ({leafTasks.length})</h2>
        <button className="btn-primary" onClick={() => openForm()}>+ 新建任务</button>
      </div>

      {/* Stats bar */}
      <div className="stats-bar">
        <span>预估工时: <strong>{totalEstimated}d</strong></span>
        <span>实际工时: <strong>{totalActual}d</strong></span>
        <span>完成: <strong>{doneCount}/{leafTasks.length}</strong></span>
        {leafTasks.length > 0 && (
          <span>完成率: <strong>{Math.round((doneCount / leafTasks.length) * 100)}%</strong></span>
        )}
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <input
          placeholder="搜索任务名..."
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
        />
        <select className="field-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as TaskStatus | '')}>
          <option value="">全部状态</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="field-select" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value as Priority | '')}>
          <option value="">全部优先级</option>
          {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="field-select" value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)}>
          <option value="">全部负责人</option>
          {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="field-select" value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
          <option value="">全部项目</option>
          {projects.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button className="btn-reset" onClick={() => {
          setFilterStatus(''); setFilterAssignee(''); setFilterProject(''); setFilterPriority(''); setSearchName('')
        }}>重置</button>
      </div>

      {/* Task cards */}
      <div className="task-table-wrap task-card-list-wrap">
        <div className="task-card-list">
          {flatRows.map(({ task, depth, hasChildren }) => (
            <TaskCardItem
              key={task.id}
              task={task}
              depth={depth}
              hasChildren={hasChildren}
              expanded={expandedIds.has(task.id)}
              onToggleExpand={hasChildren ? () => toggleExpand(task.id) : undefined}
              onStatusChange={(status) => handleStatusChange(task.id, status)}
              onEdit={() => openForm(task)}
              onAddSub={() => openForm(task, true)}
              onDelete={() => handleDelete(task.id)}
            />
          ))}
          {flatRows.length === 0 && (
            <div className="empty-hint task-card-empty">暂无任务</div>
          )}
        </div>
      </div>

      {/* Task Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => { setShowForm(false); setEditingId(null); setParentIdForNew(undefined) }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {editingId ? '编辑任务' : parentIdForNew
                  ? `添加子任务 → ${allTasks.find((t) => t.id === parentIdForNew)?.name || ''}`
                  : '新建任务'}
              </h3>
              <button className="btn-close" onClick={() => { setShowForm(false); setEditingId(null); setParentIdForNew(undefined) }}>×</button>
            </div>
            <div className="modal-body">
              {parentIdForNew && (
                <div className="form-row">
                  <label>父任务</label>
                  <input value={allTasks.find((t) => t.id === parentIdForNew)?.name || ''} disabled />
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
                    list="assignee-list"
                  />
                  <datalist id="assignee-list">
                    {assignees.map((a) => <option key={a} value={a} />)}
                  </datalist>
                </div>
                <div className="form-col">
                  <label>项目</label>
                  <input
                    value={form.project}
                    onChange={(e) => setForm({ ...form, project: e.target.value })}
                    placeholder="输入或选择"
                    list="project-list"
                  />
                  <datalist id="project-list">
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
                        name="status"
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
              <button className="btn-cancel" onClick={() => { setShowForm(false); setEditingId(null); setParentIdForNew(undefined) }}>取消</button>
              <button className="btn-confirm" onClick={handleSubmit}>{editingId ? '保存' : '创建'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Completion date prompt */}
      {completeTarget && (
        <div className="modal-overlay" onClick={cancelComplete}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>填写完成日期</h3>
              <button className="btn-close" onClick={cancelComplete}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <label>实际完成日期 *</label>
                <input
                  type="date"
                  value={completeDate}
                  onChange={(e) => setCompleteDate(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={cancelComplete}>取消</button>
              <button className="btn-confirm" onClick={confirmComplete} disabled={!completeDate}>确认完成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
