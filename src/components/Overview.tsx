import { useState, useMemo } from 'react'
import { getVersions, getVersionGroups, getTasks } from '../store'

export default function Overview() {
  const versions = getVersions()
  const groups = getVersionGroups()
  const allTasks = getTasks()

  const [selectedVersionIds, setSelectedVersionIds] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  // group versions
  const grouped = useMemo(() => {
    const result: { group: string; versions: typeof versions }[] = []
    for (const g of groups) {
      result.push({ group: g, versions: versions.filter((v) => v.group === g) })
    }
    const ungrouped = versions.filter((v) => !v.group)
    if (ungrouped.length > 0) result.push({ group: '未分组', versions: ungrouped })
    return result
  }, [versions, groups])

  const selectedSet = new Set(selectedVersionIds)

  const toggleVersion = (id: string) => {
    setSelectedVersionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const selectGroup = (groupVersions: typeof versions) => {
    const ids = groupVersions.map((v) => v.id)
    setSelectedVersionIds((prev) => {
      const existing = new Set(prev)
      const allSelected = ids.every((id) => existing.has(id))
      if (allSelected) {
        return prev.filter((x) => !ids.includes(x))
      }
      const merged = new Set(prev)
      ids.forEach((id) => merged.add(id))
      return [...merged]
    })
  }

  const toggleCollapse = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  const filteredTasks = useMemo(() => {
    let tasks = allTasks.filter((t) => selectedSet.has(t.versionId))
    if (statusFilter) {
      tasks = tasks.filter((t) => t.status === statusFilter)
    }
    return tasks
  }, [allTasks, selectedVersionIds, statusFilter])

  const memberStats = useMemo(() => {
    const map = new Map<string, { estimated: number; actual: number; count: number; done: number }>()
    for (const t of filteredTasks) {
      const key = t.assignee || '（未分配）'
      const entry = map.get(key) || { estimated: 0, actual: 0, count: 0, done: 0 }
      entry.estimated += t.estimatedHours
      entry.actual += t.actualHours
      entry.count += 1
      if (t.status === '已完成') entry.done += 1
      map.set(key, entry)
    }
    return [...map.entries()]
      .map(([name, s]) => ({ name, ...s }))
      .sort((a, b) => b.estimated - a.estimated)
  }, [filteredTasks])

  const totals = memberStats.reduce(
    (acc, m) => ({
      estimated: acc.estimated + m.estimated,
      actual: acc.actual + m.actual,
      count: acc.count + m.count,
      done: acc.done + m.done,
    }),
    { estimated: 0, actual: 0, count: 0, done: 0 }
  )

  const allSelected = versions.length > 0 && selectedVersionIds.length === versions.length

  return (
    <div className="overview-panel">
      <div className="panel-header">
        <h2>总览看板</h2>
      </div>

      {/* Selector */}
      <div className="overview-selector">
        <div className="selector-top">
          <span className="selector-label">选择版本：</span>
          <button
            className="btn-link"
            onClick={() => { allSelected ? setSelectedVersionIds([]) : setSelectedVersionIds(versions.map((v) => v.id)) }}
          >
            {allSelected ? '取消全选' : '全选'}
          </button>
          <span className="selector-count">已选 {selectedVersionIds.length}/{versions.length} 个版本</span>
        </div>

        <div className="version-checkbox-grid">
          {grouped.map(({ group, versions: groupVersions }) => {
            const groupIds = groupVersions.map((v) => v.id)
            const selectedCount = groupIds.filter((id) => selectedSet.has(id)).length
            const allGroupSelected = selectedCount === groupIds.length
            const collapsed = collapsedGroups.has(group)
            return (
              <div key={group} className="version-group-block">
                <div className="version-group-header">
                  <span
                    className="group-toggle"
                    onClick={() => selectGroup(groupVersions)}
                    title={allGroupSelected ? '取消全选' : '全选此分组'}
                  >
                    <input
                      type="checkbox"
                      checked={allGroupSelected}
                      onChange={() => selectGroup(groupVersions)}
                    />
                  </span>
                  <span className="group-name" onClick={() => toggleCollapse(group)} style={{ cursor: 'pointer' }}>
                    <span className="collapse-icon">{collapsed ? '▶' : '▼'}</span>{' '}
                    {group === '未分组' ? '📄' : '📁'} {group}
                  </span>
                  <span className="group-count">
                    {selectedCount}/{groupIds.length}
                  </span>
                </div>
                {!collapsed && (
                  <div className="version-group-items">
                    {groupVersions.map((v) => (
                      <label key={v.id} className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={selectedSet.has(v.id)}
                          onChange={() => toggleVersion(v.id)}
                        />
                        {v.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

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
      </div>

      {/* Summary cards */}
      {memberStats.length > 0 && (
        <div className="overview-summary">
          <div className="summary-card">
            <div className="summary-value">{totals.count}</div>
            <div className="summary-label">任务总数</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">{totals.estimated}h</div>
            <div className="summary-label">预估总工时</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">{totals.actual}h</div>
            <div className="summary-label">实际总工时</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">{memberStats.length}</div>
            <div className="summary-label">参与人数</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">{totals.count > 0 ? Math.round((totals.done / totals.count) * 100) : 0}%</div>
            <div className="summary-label">整体完成率</div>
          </div>
        </div>
      )}

      {/* Member table */}
      {memberStats.length > 0 && (
        <div className="overview-table-wrap">
          <table className="overview-table">
            <thead>
              <tr>
                <th>成员</th>
                <th>任务数</th>
                <th>已完成</th>
                <th>完成率</th>
                <th>预估工时 (h)</th>
                <th>实际工时 (h)</th>
                <th>工时偏差</th>
              </tr>
            </thead>
            <tbody>
              {memberStats.map((m) => {
                const deviation = m.actual - m.estimated
                return (
                  <tr key={m.name}>
                    <td className="td-member">{m.name}</td>
                    <td className="td-num">{m.count}</td>
                    <td className="td-num">{m.done}</td>
                    <td className="td-num">
                      <div className="completion-bar">
                        <div
                          className="completion-fill"
                          style={{ width: `${m.count > 0 ? Math.round((m.done / m.count) * 100) : 0}%` }}
                        />
                        <span>{m.count > 0 ? Math.round((m.done / m.count) * 100) : 0}%</span>
                      </div>
                    </td>
                    <td className="td-num">{m.estimated}</td>
                    <td className="td-num">{m.actual}</td>
                    <td className={`td-num ${deviation > 0 ? 'deviation-over' : deviation < 0 ? 'deviation-under' : ''}`}>
                      {deviation > 0 ? '+' : ''}{deviation}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>合计</strong></td>
                <td className="td-num"><strong>{totals.count}</strong></td>
                <td className="td-num"><strong>{totals.done}</strong></td>
                <td className="td-num"><strong>{totals.count > 0 ? Math.round((totals.done / totals.count) * 100) : 0}%</strong></td>
                <td className="td-num"><strong>{totals.estimated}</strong></td>
                <td className="td-num"><strong>{totals.actual}</strong></td>
                <td className="td-num"><strong>{totals.actual - totals.estimated > 0 ? '+' : ''}{totals.actual - totals.estimated}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {selectedVersionIds.length === 0 && (
        <div className="empty-hint overview-empty">请在上方勾选版本以生成看板</div>
      )}
      {selectedVersionIds.length > 0 && filteredTasks.length === 0 && (
        <div className="empty-hint">所选版本暂无匹配任务数据</div>
      )}
    </div>
  )
}
