# Kova — 项目指南 for AI Agents

## 项目概览

Kova 是一款轻量级的本地优先桌面笔记应用，使用 **Tauri 2 + React 19 + TypeScript 6 + Rust** 构建。支持 Markdown 笔记编辑、多级文件夹管理、快捷便签窗口、AI 对话操作笔记、本地 SQLite 存储、一键备份恢复等功能。

## 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| 桌面壳 | Tauri | 2.11 |
| 前端框架 | React | 19 |
| 语言 | TypeScript | 6 |
| 构建 | Vite | 8 |
| 样式 | Tailwind CSS | 4 |
| 编辑器 | CodeMirror | 6 |
| Markdown 渲染 | react-markdown + remark-gfm + KaTeX | — |
| 后端语言 | Rust | 1.77+ |
| 数据库 | SQLite (rusqlite) | 0.32 |
| HTTP 客户端 | reqwest | 0.12 |

## 项目结构

```
Kova/
├── src/                          # React 前端
│   ├── components/
│   │   ├── layout/               # 主布局组件
│   │   │   ├── TitleBar.tsx          # 标题栏
│   │   │   ├── Sidebar/              # 侧边栏（笔记列表 + 文件夹树）
│   │   │   │   ├── index.tsx
│   │   │   │   ├── FolderItem.tsx
│   │   │   │   ├── FolderInfoDialog.tsx
│   │   │   │   ├── types.ts
│   │   │   │   └── utils.ts
│   │   │   ├── SettingsPanel/        # 设置面板
│   │   │   │   ├── index.tsx
│   │   │   │   └── ui-rows.tsx
│   │   │   └── AIChatPanel/          # AI 对话面板
│   │   │       ├── index.tsx
│   │   │       ├── ConversationList.tsx
│   │   │       ├── MessageBubble.tsx
│   │   │       ├── ProfileManager.tsx
│   │   │       ├── ThinkingBlock.tsx
│   │   │       ├── DeleteConfirmDialog.tsx
│   │   │       ├── types.ts
│   │   │       └── utils.ts
│   │   ├── detail/               # 笔记编辑器
│   │   │   └── NoteDetail.tsx
│   │   ├── shared/               # 通用组件
│   │   │   ├── CodeEditor.tsx        # CodeMirror 封装
│   │   │   ├── FormatToolbar.tsx     # 格式工具栏
│   │   │   ├── MarkdownPreview.tsx   # Markdown 渲染
│   │   │   ├── NoteList.tsx          # 笔记列表
│   │   │   ├── SearchBar.tsx         # 搜索栏
│   │   │   └── SlidingButtonGroup.tsx
│   │   └── dialog/               # 弹窗组件
│   │       ├── ConfirmDialog.tsx
│   │       ├── ContextMenu.tsx
│   │       ├── FolderPicker.tsx
│   │       └── NoteProperties.tsx
│   ├── hooks/
│   │   ├── useNotes.ts              # 笔记状态管理
│   │   ├── useDraggable.ts          # 拖拽 hook
│   │   └── usePanelResize.ts        # 面板拖拽缩放
│   ├── lib/
│   │   ├── db.ts                    # Tauri invoke 桥接层
│   │   ├── theme.ts                 # 主题/字体设置
│   │   ├── zoom.ts                  # 缩放控制
│   │   ├── windowState.ts           # 窗口状态记忆
│   │   └── dateParser.ts
│   ├── App.tsx                      # 主应用组件
│   ├── main.tsx                     # 主入口
│   ├── quick.tsx                    # 快捷便签入口
│   ├── index.css
│   └── quick.css
├── src-tauri/                   # Rust 后端
│   ├── src/
│   │   ├── main.rs                  # Rust 入口
│   │   ├── lib.rs                   # Tauri setup + command 注册
│   │   └── services/
│   │       ├── mod.rs
│   │       ├── models.rs            # 数据模型（Note, Folder, Conversation 等）
│   │       ├── ai.rs                # AI 对话 + 流式响应 + 工具调用
│   │       └── db/
│   │           ├── mod.rs           # 数据库初始化、迁移、备份恢复
│   │           ├── notes.rs         # 笔记 CRUD
│   │           ├── folders.rs       # 文件夹 CRUD
│   │           ├── conversations.rs # 对话/消息 CRUD
│   │           ├── config.rs        # AI 配置管理
│   │           └── io.rs            # 导入导出
│   └── tauri.conf.json
├── index.html                    # 主窗口 HTML
├── quick.html                    # 快捷便签 HTML
├── vite.config.ts                # Vite 配置（多入口）
├── tsconfig.json
└── package.json
```

## 两个窗口入口

项目通过 Vite 多入口配置有两个独立页面：

1. **主窗口** (`index.html` → `src/main.tsx` → `src/App.tsx`)
   - 完整笔记应用，含侧边栏、编辑器、设置、AI 面板
2. **快捷便签** (`quick.html` → `src/quick.tsx`)
   - 独立小窗口，支持写入/浏览两种模式，通过全局快捷键呼出

两个窗口独立运行，通过 Tauri Event 通信（`quick-note-saved` 事件）。

## 前后端通信方式

前端通过 `@tauri-apps/api/core` 的 `invoke` 调用 Rust command，桥接层统一封装在 `src/lib/db.ts` 中。

示例：
```typescript
// 前端调用
const note = await invoke<Note>("create_note", { title, content, tags, folderId: folderId ?? null });
```

```rust
// Rust command 定义
#[tauri::command]
fn create_note(title: String, content: String, tags: Vec<String>, folder_id: Option<String>) -> Result<Note, String> {
    let fid = folder_id.filter(|s| !s.is_empty());
    db().create_note(&title, &content, tags, fid)
}
```

**命名转换注意事项**：前端 invoke 参数使用 camelCase（如 `folderId`），Rust command 使用 snake_case（如 `folder_id`）。Tauri 会自动在 `invoke` 调用侧将 camelCase 转为 snake_case，但在 command 定义侧必须用 snake_case。如果手动构建 JSON 参数，需要小心。

## 数据模型

核心数据模型定义在 `src-tauri/src/services/models.rs`：

- **Note** — `id`, `title`, `content`, `tags`, `folder_id`, `created_at`, `updated_at`
- **Folder** — `id`, `name`, `parent_id`, `created_at`, `updated_at`
- **Conversation** — `id`, `title`, `summary`, `pinned`, `created_at`, `updated_at`
- **ChatMessage** — `id`, `conversation_id`, `role`, `content`, `tool_calls`, `tool_call_id`, `created_at`
- **AIProfile** — `id`, `name`, `base_url`, `api_key`, `model`, `system_prompt`, `max_context_messages`, `enable_summary`, `enable_thinking`, `temperature`, `max_tokens`
- **AppConfig** — `data_dir`, `quick_width`, `quick_height`, `ai_base_url`, `ai_api_key`, `ai_model`, `ai_profiles`, `active_ai_profile_id`

## 数据库

- 引擎：SQLite（通过 `rusqlite` bundled 模式）
- 位置：默认在可执行文件同级 `data/` 目录下，可通过设置修改
- 表：
  - `notes` — 笔记数据
  - `folders` — 文件夹（含 parent_id 支持多级嵌套）
  - `conversations` — AI 对话
  - `messages` — 对话消息
- 迁移：数据库初始化时通过 `CREATE TABLE IF NOT EXISTS` + 按需 `ALTER TABLE ADD COLUMN` 实现渐进式迁移
- 备份：打包为 ZIP（`kova.db` + `kova-config.json` + `kova-settings.json`）

## AI 功能架构

### 数据流
```
用户输入 → Frontend invoke → Rust ai::chat_stream()
  → 构建消息历史 + 系统提示词
  → 请求 OpenAI 兼容 API (SSE)
  → 流式解析：chunk / thinking / tool_call / finish
  → 通过 Tauri Event "ai-stream" 实时推送前端
  → 工具调用（AI 操作笔记/文件夹）→ 结果回传 API → 继续生成
  → 最终消息保存到数据库
```

### 工具调用
AI 拥有 17 个内置工具，定义在 `src-tauri/src/services/ai.rs` 的 `get_tools()` 方法中：
- 笔记：创建、查看、搜索、列出、更新、移动、删除、导出
- 文件夹：创建、列出、搜索、重命名、删除、笔记移至未分类
- 批量：批量创建、批量删除、批量移动

### AI 配置
支持多 profile 切换，每个 profile 独立保存 API 地址、Key、模型、系统提示词等参数。

## 关键命令

```bash
# 开发（启动 Tauri + Vite 热更新）
npx tauri dev

# 构建打包
npx tauri build

# 仅前端开发
npm run dev

# 前端构建
npm run build
```

## 样式约定

- 使用 Tailwind CSS 4 + `@tailwindcss/vite` 插件
- 项目有自定的 CSS 变量体系（通过 `lib/theme.ts` 动态注入），包括：
  - `--accent`：强调色
  - `--paper`：纸张底色
  - `--ink-*`：文字色系
  - `--font-size` 等
- 亮色/暗色双主题，通过 `data-theme` 属性切换
- 组件中使用自定义 CSS 类名如 `bg-paper`、`text-ink-faint`、`text-accent` 等

## 状态管理

- 笔记列表状态通过自定义 Hook `useNotes` (`src/hooks/useNotes.ts`) 管理
  - 包含防并行请求覆盖机制（`fetchSeq`）
  - 提供 `fetch` / `create` / `update` / `remove` 方法
- 面板拖拽缩放通过 `usePanelResize` Hook 管理
- 全局设置通过 `localStorage` 持久化（key 前缀 `fp-`）
- 主题、字体等通过 `theme.ts` 封装读写

## Event 通信

| 事件 | 方向 | 用途 |
|---|---|---|
| `quick-note-saved` | 快捷窗口 → 主窗口 | 通知主窗口刷新笔记列表 |
| `ai-stream` | Rust → 前端 | SSE 流式推送 AI 响应 |
| `fp-settings-changed` | 前端内部 | 设置面板修改后通知其他组件 |
| `drag-drop` | Tauri → 前端 | 文件拖拽导入 |

## 构建产物

构建产物位于 `src-tauri/target/release/bundle/`，支持：
- `.exe` (NSIS 安装包)
- `.msi` (Windows Installer)

## 项目状态

- 版本：0.1.0
- 核心链路完整：编辑 → 存储 → 文件夹管理 → 快捷便签 → AI 操作 → 备份恢复 → 打包发布
- 后端关键模块有基本错误处理，但缺少单元测试和集成测试
- AI API Key 以明文存储于本地 config.json
