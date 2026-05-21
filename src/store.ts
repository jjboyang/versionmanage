import type { Version, Task, VersionCreate, TaskCreate } from './types'

const VERSIONS_KEY = 'vtm_versions'
const TASKS_KEY = 'vtm_tasks'
const ASSIGNEES_KEY = 'vtm_assignees'
const PROJECTS_KEY = 'vtm_projects'

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

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// --- Versions ---

export function getVersions(): Version[] {
  return load<Version[]>(VERSIONS_KEY, [])
}

export function addVersion(data: VersionCreate): Version {
  const versions = getVersions()
  const v: Version = { ...data, id: uid(), createdAt: new Date().toISOString() }
  versions.push(v)
  save(VERSIONS_KEY, versions)
  return v
}

export function updateVersion(id: string, data: Partial<VersionCreate>) {
  const versions = getVersions()
  const idx = versions.findIndex((v) => v.id === id)
  if (idx === -1) return
  versions[idx] = { ...versions[idx], ...data }
  save(VERSIONS_KEY, versions)
}

export function deleteVersion(id: string) {
  save(VERSIONS_KEY, getVersions().filter((v) => v.id !== id))
  save(TASKS_KEY, getTasks().filter((t) => t.versionId !== id))
}

export function getVersionGroups(): string[] {
  const groups = new Set(getVersions().map((v) => v.group).filter(Boolean))
  return [...groups]
}

// --- Tasks ---

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

export function addTask(data: TaskCreate): Task {
  const tasks = getTasks()
  const t: Task = { ...data, id: uid(), createdAt: new Date().toISOString() }
  tasks.push(t)
  save(TASKS_KEY, tasks)
  if (data.parentId) recalcParentHours(data.parentId)
  return t
}

export function updateTask(id: string, data: Partial<TaskCreate>) {
  const tasks = getTasks()
  const idx = tasks.findIndex((t) => t.id === id)
  if (idx === -1) return
  const oldParentId = tasks[idx].parentId
  tasks[idx] = { ...tasks[idx], ...data }
  save(TASKS_KEY, tasks)
  // recalc old and new parent if parent changed
  if (oldParentId && oldParentId !== data.parentId) recalcParentHours(oldParentId)
  if (data.parentId && data.parentId !== oldParentId) recalcParentHours(data.parentId)
  // recalc current parent if this task's hours changed (and it has a parent)
  if (tasks[idx].parentId) recalcParentHours(tasks[idx].parentId!)
}

export function deleteTask(id: string) {
  const tasks = getTasks()
  const task = tasks.find((t) => t.id === id)
  if (!task) return
  const idsToDelete = new Set([id])
  // cascade: collect all descendants
  function collectChildren(parentId: string) {
    tasks.filter((t) => t.parentId === parentId).forEach((child) => {
      idsToDelete.add(child.id)
      collectChildren(child.id)
    })
  }
  collectChildren(id)
  save(TASKS_KEY, tasks.filter((t) => !idsToDelete.has(t.id)))
  if (task.parentId) recalcParentHours(task.parentId)
}

function recalcParentHours(parentId: string) {
  const tasks = getTasks()
  const idx = tasks.findIndex((t) => t.id === parentId)
  if (idx === -1) return
  const children = tasks.filter((t) => t.parentId === parentId)
  tasks[idx].estimatedHours = children.reduce((s, t) => s + t.estimatedHours, 0)
  tasks[idx].actualHours = children.reduce((s, t) => s + t.actualHours, 0)
  save(TASKS_KEY, tasks)
}

// --- Enum options (assignees, projects) ---

export function getAssignees(): string[] {
  return load<string[]>(ASSIGNEES_KEY, [])
}

export function addAssignee(name: string) {
  const list = getAssignees()
  if (!list.includes(name)) {
    list.push(name)
    save(ASSIGNEES_KEY, list)
  }
}

export function getProjects(): string[] {
  return load<string[]>(PROJECTS_KEY, [])
}

export function addProject(name: string) {
  const list = getProjects()
  if (!list.includes(name)) {
    list.push(name)
    save(PROJECTS_KEY, list)
  }
}
