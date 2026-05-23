import type { Version, Task, VersionCreate, TaskCreate } from './types'
import {
  createAssignee,
  createProject,
  createTask,
  createVersion,
  fetchSnapshot,
  patchTask,
  patchVersion,
  removeTask,
  removeVersion,
} from './api'

const VERSIONS_KEY = 'vtm_versions'
const TASKS_KEY = 'vtm_tasks'
const ASSIGNEES_KEY = 'vtm_assignees'
const PROJECTS_KEY = 'vtm_projects'
const REVISION_KEY = 'vtm_revision'
export const DATA_CHANGED_EVENT = 'vtm:data-changed'

let syncing = false

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function save<T>(key: string, data: T) {
  localStorage.setItem(key, JSON.stringify(data))
}

function notifyDataChanged(key: string, errorMessage?: string) {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { key, error: errorMessage } }))
}

function bumpRevision() {
  const next = Number(localStorage.getItem(REVISION_KEY) || 0) + 1
  localStorage.setItem(REVISION_KEY, String(next))
}

function cacheSnapshot(snapshot: {
  versions: Version[]
  tasks: Task[]
  assignees: string[]
  projects: string[]
  revision?: number
}) {
  save(VERSIONS_KEY, snapshot.versions)
  save(TASKS_KEY, snapshot.tasks)
  save(ASSIGNEES_KEY, snapshot.assignees)
  save(PROJECTS_KEY, snapshot.projects)
  if (snapshot.revision !== undefined) localStorage.setItem(REVISION_KEY, String(snapshot.revision))
}

export async function syncFromServer(): Promise<boolean> {
  if (syncing) return false
  syncing = true
  try {
    const snapshot = await fetchSnapshot()
    cacheSnapshot(snapshot)
    notifyDataChanged('server-sync')
    return true
  } catch {
    return false
  } finally {
    syncing = false
  }
}

export function subscribeToDataChanges(onChange: () => void): () => void {
  const handleLocalChange = () => onChange()
  const events = new EventSource('/api/events')

  events.addEventListener('change', () => {
    syncFromServer().then((changed) => {
      if (!changed) onChange()
    })
  })

  window.addEventListener(DATA_CHANGED_EVENT, handleLocalChange)

  return () => {
    window.removeEventListener(DATA_CHANGED_EVENT, handleLocalChange)
    events.close()
  }
}

export function getVersions(): Version[] {
  return load<Version[]>(VERSIONS_KEY, [])
}

export async function addVersion(data: VersionCreate): Promise<Version> {
  const optimistic: Version = { ...data, id: `pending-${Date.now()}`, createdAt: new Date().toISOString() }
  const versions = load<Version[]>(VERSIONS_KEY, [])
  versions.push(optimistic)
  save(VERSIONS_KEY, versions)
  notifyDataChanged('version-add')

  try {
    const real = await createVersion(data)
    bumpRevision()
    // Replace pending version with server-returned real version
    const current = load<Version[]>(VERSIONS_KEY, [])
    const idx = current.findIndex((v) => v.id === optimistic.id)
    if (idx !== -1) {
      current[idx] = real
      save(VERSIONS_KEY, current)
    }
    // Fix any tasks that referenced the pending versionId
    const tasks = load<Task[]>(TASKS_KEY, [])
    let tasksChanged = false
    for (const t of tasks) {
      if (t.versionId === optimistic.id) {
        t.versionId = real.id
        tasksChanged = true
      }
    }
    if (tasksChanged) save(TASKS_KEY, tasks)
    await syncFromServer()
    return real
  } catch (err) {
    // Remove optimistic version on failure
    const current = load<Version[]>(VERSIONS_KEY, [])
    save(VERSIONS_KEY, current.filter((v) => v.id !== optimistic.id))
    notifyDataChanged('sync-error', err instanceof Error ? err.message : '创建版本失败')
    throw err
  }
}

export async function updateVersion(id: string, data: Partial<VersionCreate>) {
  const versions = load<Version[]>(VERSIONS_KEY, [])
  const idx = versions.findIndex((v) => v.id === id)
  const rollback = idx !== -1 ? { ...versions[idx] } : null
  if (idx !== -1) {
    versions[idx] = { ...versions[idx], ...data }
    save(VERSIONS_KEY, versions)
    notifyDataChanged('version-update')
  }
  try {
    await patchVersion(id, data)
    bumpRevision()
    await syncFromServer()
  } catch (err) {
    if (rollback) {
      const current = load<Version[]>(VERSIONS_KEY, [])
      const i = current.findIndex((v) => v.id === id)
      if (i !== -1) {
        current[i] = rollback
        save(VERSIONS_KEY, current)
      }
    }
    notifyDataChanged('sync-error', err instanceof Error ? err.message : '更新版本失败')
  }
}

export async function deleteVersion(id: string) {
  const versions = load<Version[]>(VERSIONS_KEY, [])
  const tasks = load<Task[]>(TASKS_KEY, [])
  const versionBackup = versions.find((v) => v.id === id)
  const tasksBackup = tasks.filter((t) => t.versionId === id)
  save(VERSIONS_KEY, versions.filter((v) => v.id !== id))
  save(TASKS_KEY, tasks.filter((t) => t.versionId !== id))
  notifyDataChanged('version-delete')
  try {
    await removeVersion(id)
    bumpRevision()
    await syncFromServer()
  } catch (err) {
    if (versionBackup) {
      const current = load<Version[]>(VERSIONS_KEY, [])
      current.push(versionBackup)
      save(VERSIONS_KEY, current)
    }
    const currentTasks = load<Task[]>(TASKS_KEY, [])
    save(TASKS_KEY, [...currentTasks, ...tasksBackup])
    notifyDataChanged('sync-error', err instanceof Error ? err.message : '删除版本失败')
  }
}

export function getVersionGroups(): string[] {
  const groups = new Set(getVersions().map((v) => v.group).filter(Boolean))
  return [...groups]
}

export function getTasks(versionId?: string): Task[] {
  const all = load<Task[]>(TASKS_KEY, [])
  if (versionId) return all.filter((t) => t.versionId === versionId)
  return all
}

export function getSubTasks(parentId: string): Task[] {
  return getTasks().filter((t) => t.parentId === parentId)
}

export function hasSubTasks(taskId: string): boolean {
  return getTasks().some((t) => t.parentId === taskId)
}

export async function addTask(data: TaskCreate): Promise<Task> {
  const optimistic: Task = { ...data, id: `pending-${Date.now()}`, createdAt: new Date().toISOString() }
  const tasks = load<Task[]>(TASKS_KEY, [])
  tasks.push(optimistic)
  save(TASKS_KEY, tasks)
  notifyDataChanged('task-add')

  try {
    const real = await createTask(data)
    bumpRevision()
    const current = load<Task[]>(TASKS_KEY, [])
    const idx = current.findIndex((t) => t.id === optimistic.id)
    if (idx !== -1) {
      current[idx] = real
      save(TASKS_KEY, current)
    }
    await syncFromServer()
    return real
  } catch (err) {
    const current = load<Task[]>(TASKS_KEY, [])
    save(TASKS_KEY, current.filter((t) => t.id !== optimistic.id))
    notifyDataChanged('sync-error', err instanceof Error ? err.message : '创建任务失败')
    throw err
  }
}

export async function updateTask(id: string, data: Partial<TaskCreate>) {
  const tasks = load<Task[]>(TASKS_KEY, [])
  const idx = tasks.findIndex((t) => t.id === id)
  const rollback = idx !== -1 ? { ...tasks[idx] } : null
  if (idx !== -1) {
    tasks[idx] = { ...tasks[idx], ...data }
    save(TASKS_KEY, tasks)
    notifyDataChanged('task-update')
  }
  try {
    await patchTask(id, data)
    bumpRevision()
    await syncFromServer()
  } catch (err) {
    if (rollback) {
      const current = load<Task[]>(TASKS_KEY, [])
      const i = current.findIndex((t) => t.id === id)
      if (i !== -1) {
        current[i] = rollback
        save(TASKS_KEY, current)
      }
    }
    notifyDataChanged('sync-error', err instanceof Error ? err.message : '更新任务失败')
  }
}

export async function deleteTask(id: string) {
  const tasks = load<Task[]>(TASKS_KEY, [])
  const idsToDelete = new Set<string>([id])
  function collectChildren(parentId: string) {
    tasks.filter((t) => t.parentId === parentId).forEach((t) => {
      idsToDelete.add(t.id)
      collectChildren(t.id)
    })
  }
  collectChildren(id)
  const deletedTasks = tasks.filter((t) => idsToDelete.has(t.id))
  save(TASKS_KEY, tasks.filter((t) => !idsToDelete.has(t.id)))
  notifyDataChanged('task-delete')
  try {
    await removeTask(id)
    bumpRevision()
    await syncFromServer()
  } catch (err) {
    const current = load<Task[]>(TASKS_KEY, [])
    save(TASKS_KEY, [...current, ...deletedTasks])
    notifyDataChanged('sync-error', err instanceof Error ? err.message : '删除任务失败')
  }
}

export function getAssignees(): string[] {
  return load<string[]>(ASSIGNEES_KEY, [])
}

export function addAssignee(name: string) {
  createAssignee(name).then(syncFromServer).catch((err) =>
    notifyDataChanged('sync-error', err instanceof Error ? err.message : '操作失败')
  )
}

export function getProjects(): string[] {
  return load<string[]>(PROJECTS_KEY, [])
}

export function addProject(name: string) {
  createProject(name).then(syncFromServer).catch((err) =>
    notifyDataChanged('sync-error', err instanceof Error ? err.message : '操作失败')
  )
}
