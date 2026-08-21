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
npm run build
cd src-tauri
cargo fmt --check
cargo test
cargo clippy --all-targets --all-features -- -D warnings
```

Windows x64 NSIS 安装包由 `npm run tauri:build` 生成在：
`src-tauri/target/release/bundle/nsis/Tiny Note_0.1.0_x64-setup.exe`。

## 当前实现

- SQLite 笔记/笔记本、三表示（原始 Markdown、安全 HTML、纯文本）原子保存、800ms 自动保存、搜索、复制/移动、最近删除恢复和 Markdown/TXT 导入。
- TipTap 提供 Notion 式即时编辑，Markdown 快捷输入和粘贴立即呈现格式；处理后的源码可切到 CodeMirror 6 继续编辑，并通过固定版本的 `@tiptap/markdown` 与即时编辑双向同步。
- 文章主模式为即时编辑、Markdown、阅读；Markdown 内可开关实时预览，分栏支持 30%–70% 拖拽、窄宽度上下布局和双向滚动联动。阅读模式锁定独立标题与正文，但保留选择、复制、目录、知识库和全文助理。
- 个人/本地知识库、文件夹、相对路径安全校验、文本导入、递归名称搜索、预览和系统回收站。
- 主题/语言、SQLite 模型配置（包含 API Key）、OpenAI-compatible SSE、停止/插入/替换/复制/放弃和默认关闭的 FIM。
- 首页对话模式与笔记 AI 共用 OpenAI-compatible SSE；首页请求按 `chat` 来源写入用量统计，笔记 AI 按 `note_ai` 来源统计。模型返回的 prompt、completion、reasoning 和 total token 会记录到本地 SQLite。
- Agent 模式已经接入：Rust 负责 OpenAI-compatible Tool Calling 循环、运行状态、审批恢复和工具审计；当前提供知识检索、笔记搜索/读取、笔记创建/修改提案、记忆更新、SANDBOX 文件工具、按需加载的本地 Skills、stdio MCP 工具桥接、隔离式子 Agent 和纯计算脚本沙箱，前端展示可恢复的工具调用时间线和参数级审批。

AI 未配置模型时使用离线演示流；配置模型后请求只从 Rust 发出，API Key 不返回前端。

## 范围

当前版本聚焦笔记、笔记本、个人/本地知识库文件管理、预览、FTS5 本地知识检索、可审阅的笔记 AI 写作和本地 Agent。不包含任意系统 Shell/Python 执行、向量 RAG、日程、自动化、云同步或 Friday 数据迁移。

笔记与知识库页面采用 Friday 前端的页面骨架、间距、状态和样式变量迁移，数据与桌面能力仍由 Tiny Note 自己的 Tauri/Rust 层提供。

正式 macOS 分发仍需代码签名与公证；首版构建产物用于开发和内部测试。
