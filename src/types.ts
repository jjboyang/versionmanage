export type TaskStatus = '未开始' | '进行中' | '已完成' | '已暂停'
export type VersionStatus = TaskStatus
export type Priority = 'P0' | 'P1' | 'P2' | 'P3'

export interface Version {
  id: string
  name: string
  group: string
  status: VersionStatus
  startDate: string
  endDate: string
  createdAt: string
}

export interface Task {
  id: string
  versionId: string
  parentId?: string
  name: string
  assignee: string
  startDate: string
  completedDate?: string
  estimatedHours: number
  actualHours: number
  status: TaskStatus
  project: string
  priority: Priority
  createdAt: string
}

export type VersionCreate = Omit<Version, 'id' | 'createdAt'>
export type TaskCreate = Omit<Task, 'id' | 'createdAt'>
