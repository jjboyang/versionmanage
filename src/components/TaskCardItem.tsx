import type { Task, TaskStatus } from '../types'

const STATUS_OPTIONS: TaskStatus[] = ['未开始', '进行中', '已完成', '已暂停']

const STATUS_CLASS: Record<TaskStatus, string> = {
  '未开始': 's-todo',
  '进行中': 's-progress',
  '已完成': 's-done',
  '已暂停': 's-paused',
}

interface Props {
  task: Task
  depth: number
  hasChildren: boolean
  expanded: boolean
  onToggleExpand?: () => void
  onStatusChange?: (status: TaskStatus) => void
  onEdit: () => void
  onAddSub?: () => void
  onDelete?: () => void
  readOnlyStatus?: boolean
}

export default function TaskCardItem({
  task,
  depth,
  hasChildren,
  expanded,
  onToggleExpand,
  onStatusChange,
  onEdit,
  onAddSub,
  onDelete,
  readOnlyStatus = false,
}: Props) {
  const isParent = hasChildren

  const statusControl = readOnlyStatus ? (
    <span className={`status-select status-select-compact ${STATUS_CLASS[task.status]}`}>{task.status}</span>
  ) : (
    <select
      className={`status-select status-select-compact field-select ${STATUS_CLASS[task.status]}`}
      value={task.status}
      onChange={(e) => onStatusChange?.(e.target.value as TaskStatus)}
      aria-label="任务状态"
    >
      {STATUS_OPTIONS.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  )

  return (
    <article
      className={`task-card ${depth > 0 ? 'task-card-sub' : ''} ${isParent ? 'task-card-parent' : ''}`}
      style={{ ['--task-depth' as string]: depth }}
    >
      <div className="task-card-inner">
        {/* 第一行：标题 + 完成 · 状态 · 优先级 */}
        <div className="task-card-row task-card-row-top">
          <div className="task-card-title-row">
            {isParent && onToggleExpand ? (
              <button
                type="button"
                className="expand-toggle"
                onClick={onToggleExpand}
                aria-expanded={expanded}
                aria-label={expanded ? '收起子任务' : '展开子任务'}
              >
                {expanded ? '▼' : '▶'}
              </button>
            ) : depth > 0 ? (
              <span className="sub-indent" aria-hidden="true" />
            ) : null}
            <h4 className="task-card-title">{task.name}</h4>
          </div>

          <div className="task-card-badges">
            <span
              className={`task-meta-chip task-meta-chip-done ${task.completedDate ? 'task-meta-chip-done-filled' : ''}`}
            >
              <span className="task-card-label">完成</span>
              <span>{task.completedDate || '—'}</span>
            </span>
            {statusControl}
            <span className={`priority-tag pri-${task.priority.toLowerCase()}`}>{task.priority}</span>
          </div>
        </div>

        {/* 第二行：元信息 + 编辑 · 子任务 */}
        <div className="task-card-row task-card-row-meta">
          <div className="task-card-meta-inline">
            <span className="task-meta-chip">
              <span className="task-card-label">负责人</span>
              <span>{task.assignee || '—'}</span>
            </span>
            <span className="task-meta-chip">
              <span className="task-card-label">项目</span>
              <span>{task.project || '—'}</span>
            </span>
            <span className="task-meta-chip">
              <span className="task-card-label">开始</span>
              <span>{task.startDate || '—'}</span>
            </span>
            <span className="task-meta-chip">
              <span className="task-card-label">预估</span>
              <span className={isParent ? 'td-auto' : ''}>
                {isParent && <span className="auto-icon">Σ </span>}
                {task.estimatedHours}d
              </span>
            </span>
            <span className="task-meta-chip">
              <span className="task-card-label">实际</span>
              <span className={isParent ? 'td-auto' : ''}>
                {isParent && <span className="auto-icon">Σ </span>}
                {task.actualHours}d
              </span>
            </span>
          </div>
          <div className="task-card-actions td-actions">
            <button type="button" className="btn-edit" onClick={onEdit}>编辑</button>
            {onAddSub && (
              <button type="button" className="btn-sub" onClick={onAddSub}>子任务</button>
            )}
            {onDelete && (
              <button type="button" className="btn-del" onClick={onDelete}>删除</button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
