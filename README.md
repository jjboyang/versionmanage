# 版本任务管理系统

面向小团队的**版本维度任务管理** Web 应用：按版本组织任务，支持子任务树、多版本总览、负责人看板与日报生成；数据经 Node.js API 持久化到 SQLite，浏览器端带本地缓存与实时同步。

仓库地址：[github.com/jjboyang/versionmanage](https://github.com/jjboyang/versionmanage)

---

## 功能概览

| 模块 | 说明 |
|------|------|
| **任务管理** | 选定版本后管理任务：卡片式列表、筛选、子任务树、新建/编辑（点击遮罩不会误关弹窗） |
| **总览看板** | 多选版本 → 按成员汇总任务数、工时、完成率 |
| **负责人看板** | 按负责人查看任务；总览 / TODO 模式；**生成日报**（进度与备注，可复制 Markdown） |
| **版本列表** | 侧栏分组展示，支持拖拽归组、分组收起、版本进度展开 |
| **主题** | 默认 · 深海剧院 · 星晶棱镜 · 琉璃茶宴（沉浸式全屏插画 + 玻璃质感 UI） |
| **备份** | 每日自动备份（File System Access API）、手动导出/导入 JSON |
| **离线容错** | `localStorage` 缓存最近快照；后端不可用时只读浏览 |

> 说明：主导航中的「系统记录」入口已隐藏；后端仍保留操作日志与历史回滚 API，需要时可自行恢复入口。

---

## 技术架构

```
浏览器 (React 18 + TypeScript)
    ↕  Vite 开发代理 /api → 8787
    ↕  SSE /api/events（多端实时刷新）
    ↕  localStorage 本地缓存
Node.js API（server/index.js，零第三方运行时依赖）
    ↕  SQLite（data/app-data.sqlite）
    ↕  app-data.json（首次运行可迁移的遗留格式）
```

- **前端**：React 18、TypeScript、Vite 5；样式为手写 CSS（`App.css` + 分主题样式表），无 UI 组件库
- **后端**：Node 内置 `http` + `node:sqlite`（需 **Node.js ≥ 22**）
- **同步**：写入带 `baseRevision` 乐观锁，冲突返回 `409`；变更通过 SSE 推送到各客户端

---

## 环境要求

- Node.js **≥ 22**（依赖 `node:sqlite` 的 `DatabaseSync`）
- npm 或 pnpm

---

## 快速开始

```bash
# 安装依赖
npm install

# 终端 1：启动 API（默认 8787）
npm run api

# 终端 2：启动前端（默认 5173，/api 代理到后端）
npm run dev
```

浏览器打开 `http://localhost:5173`。`npm run dev` 使用 `--host`，局域网内其他设备可访问（需保证 API 地址可达）。

### 生产构建

```bash
npm run build    # tsc + vite build → dist/
npm run preview  # 本地预览静态资源
```

部署时将 `dist/` 作为静态站点，并把 `/api` 反向代理到 `node server/index.js`。

---

## 界面与主题

顶部可切换四套主题（选择会写入 `localStorage`）：

| 主题 | 风格 |
|------|------|
| 默认 | 浅色清爽，适合日常办公 |
| 深海剧院 | 深蓝金调 + 剧场感插画背景 |
| 星晶棱镜 | 深空霓虹 + 棱镜丝带插画，高透玻璃面板 |
| 琉璃茶宴 | 暖胡桃木偶剧场 + 金/冰晶点缀，看板区域统一玻璃层级 |

沉浸式主题的设计说明见 `design-md/versionmanage/DESIGN.md`。

---

## 项目结构

```
├── index.html
├── vite.config.ts
├── package.json
├── server/
│   └── index.js              # HTTP API、SQLite、SSE
├── public/
│   ├── theme-stellar-bg.png  # 星晶主题背景
│   └── theme-teatime-bg.png  # 琉璃主题背景
├── src/
│   ├── main.tsx
│   ├── App.tsx               # 布局、主题、备份、Tab 路由
│   ├── App.css               # 基础样式与布局
│   ├── theme.ts              # 主题注册与切换
│   ├── themes.css            # 默认 / 深海剧院
│   ├── themes-stellar.css    # 星晶棱镜
│   ├── themes-teatime.css    # 琉璃茶宴
│   ├── themes-immersive.css  # 沉浸式主题共用玻璃层
│   ├── types.ts
│   ├── api.ts
│   ├── store.ts
│   ├── backup.ts
│   └── components/
│       ├── AppNav.tsx            # 主导航滑块
│       ├── VersionList.tsx       # 版本与分组
│       ├── TaskList.tsx          # 任务卡片列表
│       ├── Overview.tsx          # 总览看板
│       ├── AssigneeOverview.tsx  # 负责人看板 + 日报
│       ├── TaskCardItem.tsx
│       ├── GroupIcon.tsx
│       └── CollapseToggle.tsx
├── data/                     # 运行时数据（git 可忽略具体库文件）
└── dist/                     # 构建产物
```

---

## 数据模型

业务数据以 **JSON 快照** 形式存入 SQLite（单表当前态 + 历史修订）。

| 实体 | 主要字段 |
|------|----------|
| **Version** | `id, name, group?, status?, startDate?, endDate?, createdAt` |
| **Task** | `id, versionId, parentId?, name, assignee, startDate, completedDate?, estimatedHours, actualHours, status, project, priority, createdAt` |

- 任务状态：`未开始` · `进行中` · `已完成` · `已暂停`
- 优先级：`P0` · `P1` · `P2` · `P3`
- 父任务工时：服务端按子任务自动汇总 `estimatedHours` / `actualHours`

---

## API 摘要

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/snapshot` | 全量快照 |
| POST/PUT/DELETE | `/api/versions` … | 版本 CRUD |
| POST/PUT/DELETE | `/api/tasks` … | 任务 CRUD（删除含子树） |
| POST | `/api/import` | 导入备份 |
| POST | `/api/rollback` | 按 revision 回滚 |
| GET | `/api/events` | SSE 实时推送 |
| GET | `/api/logs` | 操作日志 |
| GET | `/api/history` | 修订历史 |

写操作需在请求中携带 `baseRevision`；版本不一致时返回 **409**。

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `8787` | API 监听端口 |
| `HOST` | `127.0.0.1` | API 绑定地址 |

---

## 使用限制（请务必阅读）

- **无登录鉴权**：同一网络内均可读写，仅适合可信内网或小团队。
- **单进程**：SSE 连接保存在内存，不支持多实例集群。
- **快照存储**：每次写入加载/保存整库 JSON，任务量极大（如数万级）时性能会下降。
- **自动备份来源**：备份读取浏览器 `localStorage` 缓存，若刚写入尚未同步，可能略旧；重要导出前建议刷新并稍等同步完成。
- **界面语言**：目前为中文界面，无 i18n。

---

## 开发脚本

| 命令 | 作用 |
|------|------|
| `npm run api` | 启动后端 |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | 类型检查 + 生产构建 |
| `npm run preview` | 预览 `dist/` |

---

## 许可证

私有项目；使用前请与仓库维护者确认部署与数据合规要求。
