import http from 'node:http'
import { mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '..', 'data')
const JSON_FILE = path.join(DATA_DIR, 'app-data.json')
const DB_FILE = path.join(DATA_DIR, 'app-data.sqlite')
const PORT = Number(process.env.PORT || 8787)
const HOST = process.env.HOST || '127.0.0.1'

const emptyData = {
  versions: [],
  tasks: [],
  assignees: [],
  projects: [],
  revision: 0,
  updatedAt: new Date().toISOString(),
}

let db
const clients = new Set()

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

async function initDb() {
  await mkdir(DATA_DIR, { recursive: true })
  db = new DatabaseSync(DB_FILE)
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      revision INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS history (
      revision INTEGER PRIMARY KEY,
      data TEXT NOT NULL,
      operation TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS operation_log (
      id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL,
      operation TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `)

  const state = db.prepare('SELECT id FROM app_state WHERE id = 1').get()
  if (!state) {
    const migrated = await loadLegacyJson()
    db.prepare('INSERT INTO app_state (id, data, revision, updated_at) VALUES (1, ?, ?, ?)')
      .run(JSON.stringify(migrated), migrated.revision, migrated.updatedAt)
    db.prepare('INSERT OR IGNORE INTO history (revision, data, operation, created_at) VALUES (?, ?, ?, ?)')
      .run(migrated.revision, JSON.stringify(migrated), 'init', migrated.updatedAt)
  }
}

async function loadLegacyJson() {
  if (!existsSync(JSON_FILE)) return { ...emptyData }
  try {
    const parsed = JSON.parse(await readFile(JSON_FILE, 'utf8'))
    return {
      versions: Array.isArray(parsed.versions) ? parsed.versions : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      assignees: Array.isArray(parsed.assignees) ? parsed.assignees : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      revision: Number(parsed.revision || 0),
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    }
  } catch {
    return { ...emptyData }
  }
}

function getState() {
  const row = db.prepare('SELECT data, revision, updated_at FROM app_state WHERE id = 1').get()
  const data = JSON.parse(row.data)
  return {
    versions: Array.isArray(data.versions) ? data.versions : [],
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
    assignees: Array.isArray(data.assignees) ? data.assignees : [],
    projects: Array.isArray(data.projects) ? data.projects : [],
    revision: Number(row.revision),
    updatedAt: row.updated_at,
  }
}

function assertRevision(body, state) {
  if (body.baseRevision === undefined) return
  if (Number(body.baseRevision) !== state.revision) {
    const error = new Error('数据已被其他人修改，请刷新后再保存')
    error.status = 409
    error.payload = { error: error.message, currentRevision: state.revision }
    throw error
  }
}

function commit(state, operation, targetType, targetId, summary) {
  const nextRevision = state.revision + 1
  const updatedAt = new Date().toISOString()
  const nextState = { ...state, revision: nextRevision, updatedAt }
  try {
    db.exec('BEGIN IMMEDIATE')
    db.prepare('UPDATE app_state SET data = ?, revision = ?, updated_at = ? WHERE id = 1')
      .run(JSON.stringify(nextState), nextRevision, updatedAt)
    db.prepare('INSERT INTO history (revision, data, operation, created_at) VALUES (?, ?, ?, ?)')
      .run(nextRevision, JSON.stringify(nextState), operation, updatedAt)
    db.prepare('INSERT INTO operation_log (id, revision, operation, target_type, target_id, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(uid(), nextRevision, operation, targetType, targetId || null, summary, updatedAt)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  broadcast(nextRevision, updatedAt)
  return nextState
}

function broadcast(revision, updatedAt) {
  const payload = `event: change\ndata: ${JSON.stringify({ revision, updatedAt })}\n\n`
  for (const res of clients) res.write(payload)
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(data))
}

function notFound(res) {
  sendJson(res, 404, { error: 'Not found' })
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 1_000_000) req.destroy()
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function recalcParentHours(state, parentId) {
  const parent = state.tasks.find((task) => task.id === parentId)
  if (!parent) return
  const children = state.tasks.filter((task) => task.parentId === parentId)
  parent.estimatedHours = children.reduce((sum, task) => sum + Number(task.estimatedHours || 0), 0)
  parent.actualHours = children.reduce((sum, task) => sum + Number(task.actualHours || 0), 0)
}

function collectTaskIds(state, taskId, ids) {
  ids.add(taskId)
  state.tasks
    .filter((task) => task.parentId === taskId)
    .forEach((task) => collectTaskIds(state, task.id, ids))
}

function upsertName(list, name) {
  const value = String(name || '').trim()
  if (value && !list.includes(value)) list.push(value)
}

function listLogs(limit) {
  return db.prepare('SELECT * FROM operation_log ORDER BY revision DESC LIMIT ?').all(limit)
}

function listHistory(limit) {
  return db.prepare('SELECT revision, operation, created_at FROM history ORDER BY revision DESC LIMIT ?').all(limit)
}

async function handleApi(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)
  const parts = url.pathname.split('/').filter(Boolean)

  if (req.method === 'OPTIONS') return sendJson(res, 204, {})

  if (url.pathname === '/api/events') {
    const state = getState()
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })
    res.write(`event: change\ndata: ${JSON.stringify({ revision: state.revision, updatedAt: state.updatedAt })}\n\n`)
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }

  if (url.pathname === '/api/snapshot' && req.method === 'GET') {
    return sendJson(res, 200, getState())
  }

  if (url.pathname === '/api/logs' && req.method === 'GET') {
    return sendJson(res, 200, listLogs(Number(url.searchParams.get('limit') || 50)))
  }

  if (url.pathname === '/api/history' && req.method === 'GET') {
    return sendJson(res, 200, listHistory(Number(url.searchParams.get('limit') || 50)))
  }

  if (url.pathname === '/api/rollback' && req.method === 'POST') {
    const body = await readBody(req)
    const state = getState()
    assertRevision(body, state)
    const row = db.prepare('SELECT data FROM history WHERE revision = ?').get(Number(body.revision))
    if (!row) return notFound(res)
    const target = JSON.parse(row.data)
    target.revision = state.revision
    const nextState = commit(target, 'rollback', 'revision', String(body.revision), `回滚到修订 ${body.revision}`)
    return sendJson(res, 200, nextState)
  }

  if (url.pathname === '/api/import' && req.method === 'POST') {
    const body = await readBody(req)
    const state = getState()
    assertRevision(body, state)
    state.versions = Array.isArray(body.versions) ? body.versions : []
    state.tasks = Array.isArray(body.tasks) ? body.tasks : []
    state.assignees = Array.isArray(body.assignees) ? body.assignees : []
    state.projects = Array.isArray(body.projects) ? body.projects : []
    return sendJson(res, 200, commit(state, 'import', 'snapshot', null, '导入备份数据'))
  }

  if (parts[0] === 'api' && parts[1] === 'versions') {
    const id = parts[2]
    const state = getState()
    if (req.method === 'POST' && !id) {
      const body = await readBody(req)
      assertRevision(body, state)
      const version = {
        id: uid(),
        name: String(body.name || '').trim(),
        group: String(body.group || '').trim(),
      status: body.status || '未开始',
      startDate: String(body.startDate || ''),
      endDate: String(body.endDate || ''),
        createdAt: new Date().toISOString(),
      }
      if (!version.name) return sendJson(res, 400, { error: 'Version name required' })
      state.versions.push(version)
      commit(state, 'create', 'version', version.id, `创建版本：${version.name}`)
      return sendJson(res, 201, version)
    }
    if (req.method === 'PUT' && id) {
      const body = await readBody(req)
      assertRevision(body, state)
      const version = state.versions.find((item) => item.id === id)
      if (!version) return notFound(res)
      if (body.name !== undefined) version.name = String(body.name).trim()
      if (body.group !== undefined) version.group = String(body.group).trim()
      if (body.status !== undefined) version.status = body.status
      if (body.startDate !== undefined) version.startDate = String(body.startDate)
      if (body.endDate !== undefined) version.endDate = String(body.endDate)
      commit(state, 'update', 'version', id, `更新版本：${version.name}`)
      return sendJson(res, 200, version)
    }
    if (req.method === 'DELETE' && id) {
      const body = await readBody(req)
      assertRevision(body, state)
      const version = state.versions.find((item) => item.id === id)
      state.versions = state.versions.filter((item) => item.id !== id)
      state.tasks = state.tasks.filter((task) => task.versionId !== id)
      commit(state, 'delete', 'version', id, `删除版本：${version?.name || id}`)
      return sendJson(res, 200, { ok: true })
    }
  }

  if (parts[0] === 'api' && parts[1] === 'tasks') {
    const id = parts[2]
    const state = getState()
    if (req.method === 'POST' && !id) {
      const body = await readBody(req)
      assertRevision(body, state)
      const task = {
        id: uid(),
        versionId: String(body.versionId || ''),
        parentId: body.parentId ? String(body.parentId) : undefined,
        name: String(body.name || '').trim(),
        assignee: String(body.assignee || '').trim(),
        startDate: String(body.startDate || ''),
        completedDate: body.completedDate ? String(body.completedDate) : undefined,
        estimatedHours: Number(body.estimatedHours || 0),
        actualHours: Number(body.actualHours || 0),
        status: body.status || '未开始',
        project: String(body.project || '').trim(),
        priority: body.priority || 'P2',
        createdAt: new Date().toISOString(),
      }
      if (!task.name) return sendJson(res, 400, { error: 'Task name required' })
      state.tasks.push(task)
      upsertName(state.assignees, task.assignee)
      upsertName(state.projects, task.project)
      if (task.parentId) recalcParentHours(state, task.parentId)
      commit(state, 'create', 'task', task.id, `创建任务：${task.name}`)
      return sendJson(res, 201, task)
    }
    if (req.method === 'PUT' && id) {
      const body = await readBody(req)
      assertRevision(body, state)
      const task = state.tasks.find((item) => item.id === id)
      if (!task) return notFound(res)
      const oldParentId = task.parentId
      Object.assign(task, {
        name: body.name !== undefined ? String(body.name).trim() : task.name,
        assignee: body.assignee !== undefined ? String(body.assignee).trim() : task.assignee,
        project: body.project !== undefined ? String(body.project).trim() : task.project,
        estimatedHours: body.estimatedHours !== undefined ? Number(body.estimatedHours) : task.estimatedHours,
        actualHours: body.actualHours !== undefined ? Number(body.actualHours) : task.actualHours,
        parentId: 'parentId' in body ? (body.parentId ? String(body.parentId) : undefined) : task.parentId,
        status: body.status || task.status,
        priority: body.priority || task.priority,
        startDate: body.startDate !== undefined ? String(body.startDate) : task.startDate,
        completedDate: 'completedDate' in body ? (body.completedDate ? String(body.completedDate) : undefined) : task.completedDate,
      })
      upsertName(state.assignees, task.assignee)
      upsertName(state.projects, task.project)
      if (oldParentId && oldParentId !== task.parentId) recalcParentHours(state, oldParentId)
      if (task.parentId) recalcParentHours(state, task.parentId)
      commit(state, 'update', 'task', id, `更新任务：${task.name}`)
      return sendJson(res, 200, task)
    }
    if (req.method === 'DELETE' && id) {
      const body = await readBody(req)
      assertRevision(body, state)
      const task = state.tasks.find((item) => item.id === id)
      if (!task) return notFound(res)
      const ids = new Set()
      collectTaskIds(state, id, ids)
      state.tasks = state.tasks.filter((item) => !ids.has(item.id))
      if (task.parentId) recalcParentHours(state, task.parentId)
      commit(state, 'delete', 'task', id, `删除任务：${task.name}`)
      return sendJson(res, 200, { ok: true })
    }
  }

  if (parts[0] === 'api' && parts[1] === 'assignees' && req.method === 'POST') {
    const body = await readBody(req)
    const state = getState()
    assertRevision(body, state)
    upsertName(state.assignees, body.name)
    const name = String(body.name || '').trim()
    commit(state, 'create', 'assignee', name, `新增负责人：${name}`)
    return sendJson(res, 200, state.assignees)
  }

  if (parts[0] === 'api' && parts[1] === 'projects' && req.method === 'POST') {
    const body = await readBody(req)
    const state = getState()
    assertRevision(body, state)
    upsertName(state.projects, body.name)
    const name = String(body.name || '').trim()
    commit(state, 'create', 'project', name, `新增项目：${name}`)
    return sendJson(res, 200, state.projects)
  }

  notFound(res)
}

await initDb()

http.createServer((req, res) => {
  handleApi(req, res).catch((error) => {
    console.error(error)
    sendJson(res, error.status || 500, error.payload || { error: 'Server error' })
  })
}).listen(PORT, HOST, () => {
  console.log(`API server listening on http://${HOST}:${PORT}`)
})
