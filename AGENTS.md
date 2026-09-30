# Tiny Note 项目约定

## 技术栈

- 前端：TypeScript、Vue 3、Vite、Vue Router 4、Pinia、Vue I18n
- 桌面：Tauri 2
- 业务后端：`/Users/yunanxing/project/tiny-blog-go` 中的 GoFrame、MySQL 8、Redis、S3 兼容对象存储
- 桌面薄壳：Rust，仅保留窗口/托盘/更新/通知/文件授权/安全凭据库能力，不实现业务 CRUD、AI 或 Agent

## UI design system

- Skill: `awesome-design-md`
- Source: `VoltAgent/awesome-design-md`
- Style ID: `notion`
- Style reference: `C:/Users/Administrator/.codex/skills/awesome-design-md/references/design-md/notion/DESIGN.md`
- Product visual override: Friday 的桌面外壳、三栏布局、标签栏、间距和交互优先；Notion 规范只补充 Friday 未定义的状态、可访问性和响应式细节。
- Approved refinement: 按产品方确认的笔记布局效果图，顶部展示已打开的工作区；2026-09-30 确认编辑区采用两行布局，第一行是独立笔记名称、保存状态与文档操作，第二行是正文格式工具；目录采用分组和底部辅助入口，正文与代码块统一阅读排版。具体规范见 `docs/02-design/design-system.md`。

## Friday 前端迁移边界

根据产品方最新确认，笔记/知识库前端直接采用 Friday 的页面骨架、尺寸、状态处理和样式变量作为迁移基线；`CommandMap` 和 Tiny Note 品牌标识保持独立。Friday 的 Electron 主进程、原有数据目录和用户数据不迁入。Tiny Note 旧 SQLite 数据不迁移也不主动删除。

## Validation

- 前端：`npm run test:unit`、`npm run lint`、`npm run typecheck`、`npm run check:contracts`、`npm run check:components`、`npm run check:styles`、`npm run build`
- Rust：`cargo fmt --check`、`cargo test`、`cargo clippy --all-targets --all-features -- -D warnings`
- Tauri：`npm run tauri:build`

## 2026-09-30 Vditor 编辑器约定

- 两个文章模式统一 Vditor：即时编辑 IR、Markdown SV，同实例切换；Markdown 为权威正文，保留独立名称行。
- 用户在效果图预览后确认采用 Tiny Note 的 Vditor 专用主题，替代临时纯原生样式：中文无衬线正文 16px/1.75、960px 阅读宽度、靠左工具栏、低干扰代码/图表及明暗主题。保留原生编辑和标记折叠机制；禁止挂载旧 `note-prose` / `editor-content` 类。移除重复的“笔记本路径 / 文章标题”行。
- AI 选区使用 Markdown UTF-16 偏移，继续走现有服务端任务与提案原子应用接口。
- 编辑器资源本地打包；集成与验证见 `docs/03-architecture/vditor-editor.md`、`docs/04-quality/vditor-editor.md`。
