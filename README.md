# Tiny Note

Tiny Note 是一个本地优先的 Tauri 2 + Rust + Vue 3 笔记与知识库桌面应用。

## 开发

```bash
npm install
npm run tauri:dev
```

仅预览前端：

```bash
npm run dev
```

Vite 实时预览地址为 `http://localhost:1420/#/notes`，修改 Vue/CSS 后会热更新；只有需要验证原生窗口、Rust 命令或安装包时才运行 Tauri 命令。

## 验证

```bash
npm run test:unit
npm run lint
npm run typecheck
npm run check:components
npm run check:styles
npm run build
cd src-tauri
cargo fmt --check
cargo test
cargo clippy --all-targets --all-features -- -D warnings
```

也可使用 `npm run check` 一次执行 lint、三套 TypeScript 检查、全部单测、组件结构门禁、路由样式隔离检查、生产构建与首页资源预算。

本地 `npm run tauri:build` 会生成当前系统支持的安装包。CI 覆盖 Windows x64 NSIS、Linux x64 AppImage/DEB，以及 macOS Intel/Apple Silicon DMG；完整发布和在线升级流程见 [构建说明](docs/05-operations/build.md)。

Windows release 构建后可运行 `npm run measure:startup` 执行 5 次独立进程启动并检查 500ms 静态外壳 / 1.5s 首页可操作预算。该命令只在测量进程中写入系统临时目录，不触碰用户数据。

前端运行时代码、Vue 组件与测试统一使用 TypeScript；`npm run build` 会在 Vite 构建后检查首页关键路径预算（minified JS 500KB、CSS 100KB），并阻止 TipTap、CodeMirror、Mermaid 或 html2pdf 进入启动依赖闭包。启动性能与验收方式见 [启动性能与 TypeScript 迁移](docs/04-quality/startup-performance-and-typescript.md)。

## 当前实现

- SQLite 多级笔记本树、独立标签工作区、三表示（原始 Markdown、安全 HTML、纯文本）原子保存、800ms 自动保存、搜索、拖放/复制/移动、最近删除恢复和 Markdown/TXT 导入；Windows/macOS 安装包注册 `.md/.markdown` 打开方式，双击后直接编辑并保存回源文件，再次打开时以 MD5 判断复用缓存或重新加载。
- TipTap 提供 Notion 式即时编辑，Markdown 快捷输入和粘贴立即呈现格式；处理后的源码可切到 CodeMirror 6 继续编辑，并通过固定版本的 `@tiptap/markdown` 与即时编辑双向同步。
- 文章主模式为即时编辑和 Markdown；默认使用 `Ctrl+/`（macOS 为 `⌘+/`）在两种模式间切换，快捷键可在设置中自定义并仅保存在当前设备。Markdown 内可开关实时预览，分栏支持 30%–70% 拖拽、窄宽度上下布局和双向滚动联动；文章可分别打印、直接导出 PDF，或导出带内嵌阅读样式的 HTML。
- 个人/本地知识库、文件夹、相对路径安全校验、文本导入、递归名称搜索、预览和系统回收站。
- 主题/语言，以及一对多的 SQLite 模型服务：厂商连接统一保存 Base URL、API Key 和端点协议，其下可通过 `/models` 自由选择多个模型。支持 OpenAI Responses、OpenAI Chat Completions、Anthropic Messages；编辑连接时 API Key 始终留空且不向前端回显，留空获取模型或保存时由 Rust 继续使用 SQLite 中的原密钥。
- 首页对话模式与笔记 AI 共用 Rust 流式请求层；请求路径、请求体、认证头和 SSE 事件解析由模型配置的端点类型决定。首页请求按 `chat` 来源写入用量统计，笔记 AI 按 `note_ai` 来源统计。模型返回的 prompt、completion、reasoning 和 total token 会记录到本地 SQLite。
- Agent 模式已经接入：Rust 负责 OpenAI-compatible Tool Calling 循环、运行状态、审批/用户输入恢复、工具审计和用户审批策略；Agent 可通过 `request_user_input` 发起可恢复的结构化单选，Vue 会以内联卡片提供 A–D 快捷键、推荐项和“其他”输入。当前工具包括普通笔记列表/搜索/增删改查、笔记本层级增删改查与移动、知识库元数据管理、记忆更新、SANDBOX 文件工具、按需加载的本地 Skills、stdio MCP 工具桥接、隔离式子 Agent 和纯计算脚本沙箱。设置页可按单个工具或业务分类批量切换“每次审批/无需审批”并恢复系统默认，真实执行始终由 Rust 读取当前策略。

AI 未配置模型时使用离线演示流；配置模型后请求只从 Rust 发出，API Key 不返回前端。

## 范围

当前版本聚焦笔记、笔记本、个人/本地知识库文件管理、预览、可审阅的笔记 AI 写作和本地 Agent。普通对话与 Agent 不会自动检索或注入本地内容；只有用户本轮手动选择的笔记或知识库文件会作为不可信参考传给模型。不包含全文索引、RAG、任意系统 Shell/Python 执行、日程、自动化、云同步或 Friday 数据迁移。

笔记与知识库页面采用 Friday 前端的页面骨架、间距、状态和样式变量迁移，数据与桌面能力仍由 Tiny Note 自己的 Tauri/Rust 层提供。

设置页“关于”已接入 GitHub Release 在线升级：客户端下载后校验 SHA-256，再打开对应平台安装包。该方案不需要个人开发者配置 Tauri updater 私钥；公开 macOS 分发仍建议配置 Developer ID 签名与公证，Windows 公开分发建议配置 Authenticode。
