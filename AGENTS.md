# Tiny Note 项目约定

## 技术栈

- 前端：JavaScript、Vue 3、Vite、Vue Router 4、Pinia、Vue I18n
- 桌面：Tauri 2
- 后端：Rust
- 本地数据：Rust `rusqlite` + SQLite

## UI design system

- Skill: `awesome-design-md`
- Source: `VoltAgent/awesome-design-md`
- Style ID: `notion`
- Style reference: `C:/Users/Administrator/.codex/skills/awesome-design-md/references/design-md/notion/DESIGN.md`
- Product visual override: Friday 的桌面外壳、三栏布局、标签栏、间距和交互优先；Notion 规范只补充 Friday 未定义的状态、可访问性和响应式细节。

## Friday 前端迁移边界

根据产品方最新确认，笔记/知识库前端直接采用 Friday 的页面骨架、尺寸、状态处理和样式变量作为迁移基线；Tauri/Rust 数据层、命令契约和 Tiny Note 品牌标识保持独立。Friday 的 Electron 主进程、聊天/日程/自动化模块和原有数据目录不迁入，也不读取 Friday 数据；侧栏头像仅作为静态页面视觉参考，不承载 Friday 用户数据。

## Validation

- 前端：`npm run test:unit`、`npm run build`
- Rust：`cargo fmt --check`、`cargo test`、`cargo clippy --all-targets --all-features -- -D warnings`
- Tauri：`npm run tauri:build`
