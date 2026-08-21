# 测试计划（Draft）

最后更新：2026-08-21

- Rust：旧库自动增加两处 `content_markdown`、三表示行映射、CRUD/复制、AI 应用、版本创建与恢复、软删除清理、笔记本删除、路径穿越/符号链接、导入冲突、SSE 事件和取消。
- Markdown：GFM、代码语言、图片、任务列表、普通/复杂表格、下划线、高亮、颜色、彩色高亮、对齐、上下标和混合 HTML 往返；脚本、事件属性、危险 URL/Data URL 和非白名单样式清洗。
- Vue：三主模式默认值与菜单顺序、模式跨文章保持、Markdown 预览开关、键盘导航、阅读只读、格式栏显隐、即时 Markdown 输入规则、粘贴后查看源码、CodeMirror 150ms 解析与 800ms 保存、空白/空列表/空引用等编辑中间态容错、双向切换、独立标题、旧笔记延迟回填、AI 全文同步和非即时编辑插入限制。
- Markdown 预览：横竖布局、30%–70% 拖动边界、双向百分比滚动及来源锁防循环。
- 浏览器：1280×800 与 1024×700、亮/暗主题、笔记侧栏展开/折叠、全文助理开/关；检查溢出、遮挡、焦点和可读性。
- E2E：首次启动、重启恢复、导入预览、删除恢复、模型配置和拖放。

在 Windows 开发机运行 `npm run test:unit`、`npm run lint`、`npm run build`、`cargo fmt --check`、`cargo test`、`cargo clippy --all-targets --all-features -- -D warnings` 和 `npm run tauri:build`；Windows、Linux、macOS 双架构安装包需 CI runner 证据，在线升级还需从上一正式版本完成一次真实检查、下载、安装和重启验收。
