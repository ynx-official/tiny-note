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

## Friday 前端迁移边界

根据产品方最新确认，笔记/知识库前端直接采用 Friday 的页面骨架、尺寸、状态处理和样式变量作为迁移基线；`CommandMap` 和 Tiny Note 品牌标识保持独立。Friday 的 Electron 主进程、原有数据目录和用户数据不迁入。Tiny Note 旧 SQLite 数据不迁移也不主动删除。

## Validation

- 前端：`npm run test:unit`、`npm run lint`、`npm run typecheck`、`npm run check:contracts`、`npm run check:components`、`npm run check:styles`、`npm run build`
- Rust：`cargo fmt --check`、`cargo test`、`cargo clippy --all-targets --all-features -- -D warnings`
- Tauri：`npm run tauri:build`
