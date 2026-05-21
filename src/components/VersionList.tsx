import { useState, useRef, useEffect } from 'react'
import type { Version } from '../types'
import { getVersions, addVersion, updateVersion, deleteVersion, getVersionGroups } from '../store'

interface Props {
  selectedId: string | null
  onSelect: (id: string) => void
  refreshKey: number
}

export default function VersionList({ selectedId, onSelect, refreshKey }: Props) {
  const [, _r] = useState(0)
  const versions = getVersions()
  const groups = getVersionGroups()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editGroup, setEditGroup] = useState('')
  const editNameRef = useRef<HTMLInputElement>(null)

  // drag state
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null) // target group name, '__ungrouped__' for ungrouped

  useEffect(() => {
    if (editingId) editNameRef.current?.focus()
  }, [editingId])

  const ungrouped = versions.filter((v) => !v.group)

  const filteredGroups = groupFilter
    ? groups.filter((g) => g.toLowerCase().includes(groupFilter.toLowerCase()))
    : groups

  const handleAdd = () => {
    if (!name.trim()) return
    addVersion({ name: name.trim(), group: group.trim() })
    setName('')
    setGroup('')
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
  }

  const saveEdit = () => {
    if (!editingId || !editName.trim()) return
    updateVersion(editingId, { name: editName.trim(), group: editGroup.trim() })
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
            <div className="edit-actions">
              <button className="btn-confirm-sm" onClick={saveEdit}>保存</button>
              <button className="btn-cancel-sm" onClick={cancelEdit}>取消</button>
            </div>
          </div>
        </div>
      )
    }

    const isDragging = dragId === v.id

    return (
      <div
        key={v.id}
        className={`version-item ${v.id === selectedId ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
        onClick={() => onSelect(v.id)}
        draggable
        onDragStart={() => handleDragStart(v)}
        onDragEnd={handleDragEnd}
      >
        <span className="version-name">⠿ {v.name}</span>
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
