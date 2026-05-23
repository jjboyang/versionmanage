import type { Task, TaskCreate, Version, VersionCreate } from './types'

const API_BASE = '/api'

export interface AppSnapshot {
  versions: Version[]
  tasks: Task[]
  assignees: string[]
  projects: string[]
  revision: number
  updatedAt: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

function currentRevision() {
  return Number(localStorage.getItem('vtm_revision') || 0)
}

function withRevision<T extends object>(data: T): T & { baseRevision: number } {
  return { ...data, baseRevision: currentRevision() }
}

export function fetchSnapshot(): Promise<AppSnapshot> {
  return request<AppSnapshot>('/snapshot')
}

export function createVersion(data: VersionCreate): Promise<Version> {
  return request<Version>('/versions', { method: 'POST', body: JSON.stringify(withRevision(data)) })
}

export function patchVersion(id: string, data: Partial<VersionCreate>): Promise<Version> {
  return request<Version>(`/versions/${id}`, { method: 'PUT', body: JSON.stringify(withRevision(data)) })
}

export function removeVersion(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/versions/${id}`, { method: 'DELETE', body: JSON.stringify(withRevision({})) })
}

export function createTask(data: TaskCreate): Promise<Task> {
  return request<Task>('/tasks', { method: 'POST', body: JSON.stringify(withRevision(data)) })
}

export function patchTask(id: string, data: Partial<TaskCreate>): Promise<Task> {
  return request<Task>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(withRevision(data)) })
}

export function removeTask(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/tasks/${id}`, { method: 'DELETE', body: JSON.stringify(withRevision({})) })
}

export function createAssignee(name: string): Promise<string[]> {
  return request<string[]>('/assignees', { method: 'POST', body: JSON.stringify(withRevision({ name })) })
}

export function createProject(name: string): Promise<string[]> {
  return request<string[]>('/projects', { method: 'POST', body: JSON.stringify(withRevision({ name })) })
}

export function importSnapshot(data: Pick<AppSnapshot, 'versions' | 'tasks' | 'assignees' | 'projects'>): Promise<AppSnapshot> {
  return request<AppSnapshot>('/import', { method: 'POST', body: JSON.stringify(withRevision(data)) })
}

export interface OperationLog {
  id: string
  revision: number
  operation: string
  target_type: string
  target_id: string | null
  summary: string
  created_at: string
}

export interface HistoryItem {
  revision: number
  operation: string
  created_at: string
}

export function fetchLogs(limit = 50): Promise<OperationLog[]> {
  return request<OperationLog[]>(`/logs?limit=${limit}`)
}

export function fetchHistory(limit = 50): Promise<HistoryItem[]> {
  return request<HistoryItem[]>(`/history?limit=${limit}`)
}

export function rollbackToRevision(revision: number): Promise<AppSnapshot> {
  return request<AppSnapshot>('/rollback', {
    method: 'POST',
    body: JSON.stringify(withRevision({ revision })),
  })
}
