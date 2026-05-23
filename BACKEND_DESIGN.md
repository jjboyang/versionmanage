# 后端设计方案

## 目标

- 多人共用同一份权威数据，不再依赖各自浏览器的 `localStorage`。
- 写入集中到后端，避免两端各存各的数据。
- 页面实时感知其他人修改，自动刷新本地缓存和看板。
- 保留浏览器缓存：后端临时不可用时，页面仍能读取最近一次数据。

## 当前实现

- 后端：`server/index.js`
- 数据库文件：`data/app-data.sqlite`
- 前端 API 客户端：`src/api.ts`
- 前端数据层：`src/store.ts`
- 实时同步：`/api/events` 使用 SSE 推送变更，前端收到后拉取 `/api/snapshot`
- 冲突检测：写入请求携带 `baseRevision`，后端发现不是最新修订时返回 `409`
- 操作审计：`operation_log` 记录每次新增、更新、删除、导入、回滚
- 历史回滚：`history` 保存每次修订快照，可通过系统记录页面回滚

## 数据模型

业务数据仍保持快照结构，存入 SQLite：

```json
{
  "versions": [],
  "tasks": [],
  "assignees": [],
  "projects": [],
  "revision": 0,
  "updatedAt": "2026-05-22T00:00:00.000Z"
}
```

`revision` 每次写入递增，用于实时同步和冲突检测。

SQLite 表：

- `app_state`：当前权威快照
- `history`：每次修订的完整快照
- `operation_log`：面向人的操作日志

## 接口

- `GET /api/snapshot` 获取完整数据快照
- `POST /api/versions` 新建版本
- `PUT /api/versions/:id` 更新版本
- `DELETE /api/versions/:id` 删除版本及其任务
- `POST /api/tasks` 新建任务
- `PUT /api/tasks/:id` 更新任务
- `DELETE /api/tasks/:id` 删除任务及子任务
- `POST /api/assignees` 新增负责人
- `POST /api/projects` 新增项目
- `POST /api/import` 导入备份数据
- `GET /api/events` 订阅数据变化
- `GET /api/logs` 获取操作日志
- `GET /api/history` 获取历史修订
- `POST /api/rollback` 回滚到指定修订

## 后续可升级

- SQLite 换 PostgreSQL，以支持更大规模和更细粒度事务。
- 增加登录和权限。
- 增加更细的字段级冲突合并提示。
