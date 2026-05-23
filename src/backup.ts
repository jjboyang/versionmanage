import { fetchSnapshot, importSnapshot } from './api'

const LAST_BACKUP_KEY = 'vtm_last_backup'
const DATA_CHANGED_EVENT = 'vtm:data-changed'
const DB_NAME = 'vtm-backup-db'
const DB_STORE = 'handles'
const DIR_HANDLE_KEY = 'backup-dir'

const STORAGE_KEYS = [
  'vtm_versions',
  'vtm_tasks',
  'vtm_assignees',
  'vtm_projects',
]

export interface BackupData {
  version: 1
  exportedAt: string
  data: Record<string, unknown>
}

// ---- IndexedDB for directory handle ----

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore(DB_STORE) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function saveDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(DB_STORE, 'readwrite')
  tx.objectStore(DB_STORE).put(handle, DIR_HANDLE_KEY)
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function loadDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB()
    const tx = db.transaction(DB_STORE, 'readonly')
    const req = tx.objectStore(DB_STORE).get(DIR_HANDLE_KEY)
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

// ---- Backup folder setup ----

export async function isFolderConfigured(): Promise<boolean> {
  const handle = await loadDirHandle()
  if (!handle) return false
  // verify permission still valid
  const ok = await verifyPermission(handle)
  return ok
}

async function verifyPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' }
  if ((await handle.queryPermission(opts)) === 'granted') return true
  const result = await handle.requestPermission(opts)
  return result === 'granted'
}

export async function setupBackupFolder(): Promise<boolean> {
  if (!('showDirectoryPicker' in window)) return false
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
    await saveDirHandle(handle)
    return true
  } catch {
    return false // user cancelled
  }
}

// ---- Silent auto-backup ----

export async function autoBackup(): Promise<boolean> {
  try {
    const handle = await loadDirHandle()
    if (!handle) return false
    if (!(await verifyPermission(handle))) return false

    const backup = await exportBackupData()
    const date = new Date().toISOString().slice(0, 10)
    const filename = `backup-${date}.json`

    const fileHandle = await handle.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(JSON.stringify(backup, null, 2))
    await writable.close()

    markBackupDone()
    return true
  } catch {
    return false
  }
}

// ---- Manual download fallback ----

export async function downloadBackup() {
  const backup = await exportBackupData()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `backup-${date}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  markBackupDone()
}

// ---- Data export/import ----

async function exportBackupData(): Promise<BackupData> {
  // Try server snapshot first for up-to-date data
  try {
    const snapshot = await fetchSnapshot()
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        [STORAGE_KEYS[0]]: snapshot.versions,
        [STORAGE_KEYS[1]]: snapshot.tasks,
        [STORAGE_KEYS[2]]: snapshot.assignees,
        [STORAGE_KEYS[3]]: snapshot.projects,
      },
    }
  } catch {
    // Fallback to localStorage cache
    const data: Record<string, unknown> = {}
    for (const key of STORAGE_KEYS) {
      const raw = localStorage.getItem(key)
      data[key] = raw ? JSON.parse(raw) : null
    }
    return { version: 1, exportedAt: new Date().toISOString(), data }
  }
}

export function importBackup(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const backup: BackupData = JSON.parse(reader.result as string)
        if (!backup.version || !backup.data) throw new Error('无效的备份文件')
        await importSnapshot({
          versions: Array.isArray(backup.data.vtm_versions) ? backup.data.vtm_versions : [],
          tasks: Array.isArray(backup.data.vtm_tasks) ? backup.data.vtm_tasks : [],
          assignees: Array.isArray(backup.data.vtm_assignees) ? backup.data.vtm_assignees : [],
          projects: Array.isArray(backup.data.vtm_projects) ? backup.data.vtm_projects : [],
        })
        for (const key of STORAGE_KEYS) {
          if (backup.data[key] != null) {
            localStorage.setItem(key, JSON.stringify(backup.data[key]))
          }
        }
        window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { key: 'backup-import' } }))
        resolve(true)
      } catch {
        resolve(false)
      }
    }
    reader.onerror = () => resolve(false)
    reader.readAsText(file)
  })
}

// ---- Scheduling ----

function markBackupDone() {
  const today = new Date().toISOString().slice(0, 10)
  localStorage.setItem(LAST_BACKUP_KEY, today)
}

export function getLastBackupDate(): string | null {
  return localStorage.getItem(LAST_BACKUP_KEY)
}

export function isBackupDue(): boolean {
  const now = new Date()
  const hour = now.getHours()
  const lastDate = getLastBackupDate()
  const today = now.toISOString().slice(0, 10)
  if (lastDate === today) return false
  return hour >= 20
}
