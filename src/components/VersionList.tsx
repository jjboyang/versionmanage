import { useState, useRef, useEffect, useMemo } from 'react'
import type { Version, VersionStatus } from '../types'
import { getVersions, addVersion, updateVersion, deleteVersion, getVersionGroups, getTasks } from '../store'

const STATUS_OPTIONS: VersionStatus[] = ['未开始', '进行中', '已暂停', '已完成']
const STATUS_CLASS: Record<VersionStatus, string> = {
  '未开始': 's-todo',
  '进行中': 's-progress',
  '已暂停': 's-paused',
  '已完成': 's-done',
}

interface Props {
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function VersionList({ selectedId, onSelect }: Props) {
  const [, _r] = useState(0)
  const versions = getVersions()
  const allTasks = getTasks()
  const groups = getVersionGroups()

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const [status, setStatus] = useState<VersionStatus>('未开始')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editGroup, setEditGroup] = useState('')
  const [editStatus, setEditStatus] = useState<VersionStatus>('未开始')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const editNameRef = useRef<HTMLInputElement>(null)

  // drag state
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  // Task progress per version
  const versionProgress = useMemo(() => {
    const map = new Map<string, { total: number; done: number; inProgress: number }>()
    for (const t of allTasks) {
      const entry = map.get(t.versionId) || { total: 0, done: 0, inProgress: 0 }
      entry.total++
      if (t.status === '已完成') entry.done++
      else if (t.status === '进行中') entry.inProgress++
      map.set(t.versionId, entry)
    }
    return map
  }, [allTasks])

  useEffect(() => {
    if (editingId) editNameRef.current?.focus()
  }, [editingId])

  const ungrouped = versions.filter((v) => !v.group)

  const filteredGroups = groupFilter
    ? groups.filter((g) => g.toLowerCase().includes(groupFilter.toLowerCase()))
    : groups

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleAdd = () => {
    if (!name.trim()) return
    addVersion({
      name: name.trim(),
      group: group.trim(),
      status,
      startDate,
      endDate,
    })
    setName('')
    setGroup('')
    setStatus('未开始')
    setStartDate('')
    setEndDate('')
    setShowForm(false)
    _r(Math.random())
  }

  const handleDelete = (id: string) => {
    if (!confirm('删除版本会同时删除该版本下所有任务，确定？')) return
    deleteVersion(id)
    if (selectedId === id) onSelect('')
    _r(Math.random())
  }

  const startEdit = (v: Version, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(v.id)
    setEditName(v.name)
    setEditGroup(v.group)
    setEditStatus(v.status || '未开始')
    setEditStartDate(v.startDate || '')
    setEditEndDate(v.endDate || '')
  }

  const saveEdit = () => {
    if (!editingId || !editName.trim()) return
    updateVersion(editingId, {
      name: editName.trim(),
      group: editGroup.trim(),
      status: editStatus,
      startDate: editStartDate,
      endDate: editEndDate,
    })
    setEditingId(null)
    _r(Math.random())
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  // --- drag & drop ---
  const handleDragStart = (v: Version) => {
    setDragId(v.id)
  }

  const handleDragOver = (e: React.DragEvent, targetGroup: string) => {
    e.preventDefault()
    setDropTarget(targetGroup)
  }

  const handleDragLeave = (targetGroup: string) => {
    if (dropTarget === targetGroup) setDropTarget(null)
  }

  const handleDrop = (targetGroup: string) => {
    if (dragId) {
      updateVersion(dragId, { group: targetGroup === '__ungrouped__' ? '' : targetGroup })
      _r(Math.random())
    }
    setDragId(null)
    setDropTarget(null)
  }

  const handleDragEnd = () => {
    setDragId(null)
    setDropTarget(null)
  }

  const renderVersion = (v: Version) => {
    const progress = versionProgress.get(v.id)
    const isExpanded = expandedIds.has(v.id)

    if (editingId === v.id) {
      return (
        <div key={v.id} className="version-item editing">
          <div className="version-edit-form">
            <input
              ref={editNameRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit()
                if (e.key === 'Escape') cancelEdit()
              }}
              placeholder="版本名称"
            />
            <input
              value={editGroup}
              onChange={(e) => setEditGroup(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit()
                if (e.key === 'Escape') cancelEdit()
              }}
              placeholder="分组（可选）"
              list="edit-group-datalist"
            />
            <datalist id="edit-group-datalist">
              {groups.map((g) => <option key={g} value={g} />)}
            </datalist>
            <select className="field-select" value={editStatus} onChange={(e) => setEditStatus(e.target.value as VersionStatus)}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="version-date-row">
              <input type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} placeholder="开始日期" />
              <input type="date" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} placeholder="结束日期" />
            </div>
            <div className="edit-actions">
              <button className="btn-confirm-sm" onClick={saveEdit}>保存</button>
              <button className="btn-cancel-sm" onClick={cancelEdit}>取消</button>
            </div>
          </div>
        </div>
      )
    }

    const isDragging = dragId === v.id
    const isPending = v.id.startsWith('pending-')

    return (
      <div key={v.id}>
        <div
          className={`version-item ${v.id === selectedId ? 'active' : ''} ${isDragging ? 'dragging' : ''} ${isPending ? 'pending' : ''}`}
          onClick={() => { if (!isPending) onSelect(v.id) }}
          draggable={!isPending}
          onDragStart={() => handleDragStart(v)}
          onDragEnd={handleDragEnd}
          title={isPending ? '保存中...' : undefined}
        >
          <span
            className="version-expand-toggle"
            onClick={(e) => toggleExpand(v.id, e)}
          >
            {isExpanded ? '▼' : '▶'}
          </span>
          <span className={`version-status-badge ${STATUS_CLASS[v.status || '未开始']}`}>
            {v.status || '未开始'}
          </span>
          <span className="version-name">{isPending ? '⏳' : '⠿'} {v.name}</span>
          <div className="version-actions">
            <button
              className="btn-edit-icon"
              onClick={(e) => startEdit(v, e)}
              title="编辑"
            >
              ✎
            </button>
            <button
              className="btn-del"
              onClick={(e) => { e.stopPropagation(); handleDelete(v.id) }}
              title="删除版本"
            >
              ×
            </button>
          </div>
        </div>

        {/* Expanded progress view */}
        {isExpanded && !isPending && (
          <div className="version-progress-panel">
            {progress ? (
              <>
                <div className="vp-progress-bar-wrap">
                  <div
                    className="vp-progress-fill"
                    style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                  />
                </div>
                <div className="vp-progress-text">
                  已完成 {progress.done}/{progress.total}
                  {progress.inProgress > 0 && <span className="vp-in-progress"> · 进行中 {progress.inProgress}</span>}
                  <span className="vp-pct">{Math.round((progress.done / progress.total) * 100)}%</span>
                </div>
              </>
            ) : (
              <div className="vp-progress-text">暂无任务</div>
            )}
            {(v.startDate || v.endDate) && (
              <div className="vp-dates">
                {v.startDate && <span>开始: {v.startDate}</span>}
                {v.endDate && <span>结束: {v.endDate}</span>}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="version-panel">
      <div className="panel-header">
        <h2>版本列表</h2>
        <button className="btn-add" onClick={() => setShowForm(!showForm)}>
          {showForm ? '−' : '+'}
        </button>
      </div>

      {showForm && (
        <div className="form-inline">
          <input
            placeholder="版本名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <input
            placeholder="分组（可选）"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            list="group-datalist"
          />
          <datalist id="group-datalist">
            {groups.map((g) => <option key={g} value={g} />)}
          </datalist>
          <select className="field-select" value={status} onChange={(e) => setStatus(e.target.value as VersionStatus)}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="version-date-row">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="开始日期" />
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="结束日期" />
          </div>
          <button className="btn-confirm" onClick={handleAdd}>创建</button>
        </div>
      )}

      {groups.length > 0 && (
        <div className="group-filter">
          <input
            placeholder="筛选分组..."
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
          />
        </div>
      )}

      <div className="version-list">
        {filteredGroups.map((g) => (
          <div
            key={g}
            className={`group-section ${dropTarget === g ? 'drop-target' : ''}`}
            onDragOver={(e) => handleDragOver(e, g)}
            onDragLeave={() => handleDragLeave(g)}
            onDrop={() => handleDrop(g)}
          >
            <div className="group-title">📁 {g}</div>
            {versions.filter((v) => v.group === g).map(renderVersion)}
            {dropTarget === g && <div className="drop-hint">释放以移入此分组</div>}
          </div>
        ))}

        {ungrouped.length > 0 && (
          <div
            className={`group-section ${dropTarget === '__ungrouped__' ? 'drop-target' : ''}`}
            onDragOver={(e) => handleDragOver(e, '__ungrouped__')}
            onDragLeave={() => handleDragLeave('__ungrouped__')}
            onDrop={() => handleDrop('__ungrouped__')}
          >
            <div className="group-title">📄 未分组</div>
            {ungrouped.map(renderVersion)}
            {dropTarget === '__ungrouped__' && <div className="drop-hint">释放以取消分组</div>}
          </div>
        )}

        {versions.length === 0 && (
          <div className="empty-hint">暂无版本，点击 + 创建</div>
        )}
      </div>
    </div>
  )
}
