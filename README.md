# Version Task Manager (版本任务管理系统)

Multi-user version-based task management with real-time sync, audit trail, and auto-backup.

## Architecture

```
browser (React 18 + TS)  ←→  Vite dev proxy  ←→  Node.js API server (port 8787)
        ↕ localStorage cache                       ↕ SQLite (data/app-data.sqlite)
        ↕ SSE /api/events (real-time push)         ↕ app-data.json (legacy fallback)
```

- **Frontend**: React 18, TypeScript, Vite 5, single CSS file (no UI lib)
- **Backend**: Node.js built-in `http` + `node:sqlite` — zero npm dependencies
- **Real-time**: Server-Sent Events pushes `change` events to all connected clients
- **Conflict detection**: Optimistic locking via `baseRevision` header → 409 on conflict
- **Cache layer**: `localStorage` keeps last-known-good snapshot; survives backend restart

## Requirements

- **Node.js ≥ 22** (uses `node:sqlite` DatabaseSync API)
- npm or pnpm

## Quick Start

```bash
# Install dependencies
npm install

# Start API server (port 8787)
npm run api

# Start dev server (port 5173, proxies /api → 8787)
npm run dev
```

Open `http://localhost:5173`. Accessible from LAN when using `--host`.

## Production Build

```bash
npm run build   # tsc + vite build → dist/
npm run preview # serve dist/ locally
```

Serve `dist/` as static files with `/api` proxied to `server/index.js`.

## Project Structure

```
├── index.html              # Entry HTML
├── vite.config.ts          # Vite config + API proxy
├── tsconfig.json
├── package.json
├── server/
│   └── index.js            # API server (HTTP + SQLite + SSE)
├── src/
│   ├── main.tsx            # React entry
│   ├── App.tsx             # Layout, routing, backup orchestration
│   ├── App.css             # All styles (responsive)
│   ├── types.ts            # Version, Task, enums
│   ├── api.ts              # HTTP client, snapshot fetch, CRUD
│   ├── store.ts            # localStorage cache + optimistic mutations
│   ├── backup.ts           # Auto-backup (File System Access API), import/export
│   ├── fsa.d.ts            # Type declarations for File System Access API
│   └── components/
│       ├── VersionList.tsx      # Version CRUD, groups, drag-and-drop
│       ├── TaskList.tsx         # Task table, subtasks, filters, inline edit
│       ├── Overview.tsx         # Multi-version member stats dashboard
│       ├── AssigneeOverview.tsx # Per-person task view (overview/todo modes)
│       └── AuditPanel.tsx       # Operation log + history rollback
├── data/
│   ├── app-data.sqlite      # SQLite database (auto-created)
│   └── app-data.json        # Legacy JSON fallback (migrated on first run)
└── dist/                    # Production build output
```

## Data Model

All business data stored as a JSON snapshot in SQLite:

| Table | Purpose |
|-------|---------|
| `app_state` | Single-row current snapshot (id=1) |
| `history` | Full snapshot per revision, for rollback |
| `operation_log` | Human-readable audit trail |

### Types

- **Version**: `id, name, group, createdAt`
- **Task**: `id, versionId, parentId?, name, assignee, startDate, completedDate?, estimatedHours, actualHours, status, project, priority, createdAt`
- Task statuses: `未开始 | 进行中 | 已完成 | 已暂停`
- Priorities: `P0, P1, P2, P3`

Parent tasks auto-aggregate child `estimatedHours` and `actualHours` server-side.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/snapshot` | Full data snapshot |
| POST | `/api/versions` | Create version |
| PUT | `/api/versions/:id` | Update version |
| DELETE | `/api/versions/:id` | Delete version + its tasks |
| POST | `/api/tasks` | Create task |
| PUT | `/api/tasks/:id` | Update task |
| DELETE | `/api/tasks/:id` | Delete task + subtree |
| POST | `/api/assignees` | Add assignee |
| POST | `/api/projects` | Add project |
| POST | `/api/import` | Import backup snapshot |
| POST | `/api/rollback` | Rollback to revision |
| GET | `/api/events` | SSE stream for real-time updates |
| GET | `/api/logs` | Operation log (latest 50) |
| GET | `/api/history` | Revision history (latest 50) |

All write endpoints require `baseRevision` in body for conflict detection — returns `409` on mismatch.

## Features

- **Version groups**: Organize versions by group; drag-and-drop to reassign
- **Subtask tree**: Unlimited nesting, expand/collapse, auto parent-hour rollup
- **Filters**: Status, priority, assignee, project, name search
- **Overview dashboard**: Select multiple versions → per-member stats (completion rate, hour deviation)
- **Assignee view**: Overview mode (all statuses) + TODO mode (in-progress only)
- **Audit panel**: Full operation log + revision history with one-click rollback
- **Offline resilience**: localStorage cache; UI works read-only if backend is down
- **Auto-backup**: Daily at 8pm via File System Access API (choose a folder once; silent thereafter)
- **Manual export/import**: JSON file download/upload

## Limitations & Caveats

- **No authentication** — anyone on the network can read/write. Intended for trusted LAN use.
- **Single process** — no clustering. SSE connections are in-memory. Adequate for small teams (< ~20 concurrent users).
- **Snapshot-based storage** — entire dataset loaded/saved per write. Not suited for very large task volumes (10k+ tasks).
- **Backup reads from localStorage cache** — if server sync hasn't completed, backup may be stale. Export shortly after page load for best results.
- **Node.js ≥ 22 required** — `node:sqlite` is not available in older versions.
- **Chinese-only UI** — texts hardcoded in Chinese. No i18n support.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8787` | API server port |
| `HOST` | `127.0.0.1` | API server bind address |
