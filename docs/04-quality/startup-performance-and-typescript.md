# 启动性能与 TypeScript 迁移（Review）

最后更新：2026-08-27

## 目标与边界

Windows 安装包冷启动以同机独立进程 5 次的中位数验收：500ms 内出现完整非白屏外壳，1.5s 内首页输入与导航可操作。迁移不改变 Friday 桌面结构、Notion 补充规范、现有路由、Tauri 命令、SQLite schema 或用户数据目录。

## 启动链路

`index.html` 只同步加载不足 2KB 的 `public/boot.css` 静态外壳和 CSP 哈希授权的启动标记，Tauri 主窗口使用与亮色主题一致的背景色。`src/main.ts` 同步应用缓存主题与语言后立即挂载；设置与模型异步校准，失败时保留可操作界面。首页为唯一 eager route，其余页面通过动态导入切分；功能 CSS、编辑器、Mermaid 与 PDF 导出不进入首页启动闭包。SQLite schema/知识库迁移在可用状态容器注册后转入后台，托盘图标与提醒调度延后 250ms；托盘面板仍由 Rust 首次点击时创建，并走独立的 `tray` 入口。

## 自动预算

`npm run build` 生成 Vite manifest 后运行 `scripts/check-bundle-budget.mjs`。检查器从首页入口递归计算静态 imports 与 CSS，限制 minified JS 500KB、CSS 100KB，并扫描关键路径是否意外包含 TipTap、CodeMirror、Mermaid 或 html2pdf。gzip 仅作观察值，不作为预算判定值。

## TypeScript 契约

应用、测试和 Node 工具有独立 tsconfig；`allowJs` 已关闭，`src/` 只保留 `.ts` 与 TypeScript Vue SFC。领域 DTO 位于 `src/types/domain.ts`，Tauri 调用通过 `src/services/commandMap.ts` 的命令映射约束返回值。浏览器模拟后端只在非 Tauri 环境加载，全局运行时标记定义在 `src/types/global.d.ts`。

## Release 实测与未通过项

`npm run measure:startup` 在不启用 CDP 的情况下，通过仅在测量环境变量存在时生效的 Tauri 启动探针记录浏览器绝对时间。2026-08-27 最终 NSIS 打包完成后，对 release 可执行文件执行 5 次独立进程启动：静态外壳为 1282/522/648/537/599ms，中位数 599ms；首页 ready 为 1385/609/818/691/684ms，中位数 691ms。此前三轮外壳/ready 中位数分别为 548/628ms、570/646ms 和 635/745ms，说明本机 WebView2/安全扫描存在明显波动。

首页 1.5s 可操作目标已通过；最终静态外壳仍比 500ms 目标慢 99ms，因此本项保持 Review，不标记为完成。release profile 将 exe 从 25,327,616B 缩小至约 15.2MB，但不足以消除 WebView2 启动下限。正式验收仍需对实际安装后的 NSIS 程序复测；指标超限时不得以开发服务器或原生背景色出现时间替代完整外壳时间。

## 当前验证证据

- 2026-08-27 构建：首页关键路径 minified JS 327,599B，CSS 65,968B；重型编辑器、CodeMirror、Mermaid 和 html2pdf 未进入启动闭包。原 232.85KB 通用功能样式已拆为 notes、library、chat、settings、images、tasks 路由样式，日历、待办和标签直接使用组件共置样式。
- `npm run test:unit`：61 个测试文件、274 个测试通过；lint 零 warning，应用/测试/Node 三套 typecheck 与生产构建通过。生产 SFC 全部不超过 300 行，结构门禁无历史例外。
- Rust：105 个测试通过，`cargo fmt --check` 与 clippy `-D warnings` 通过。
- 真实 Tauri WebView2：`/`、notes、library、chat、settings、images、todos、calendar、tasks 在 1280×800 均有有效布局，1024×700 无整页横向溢出，控制台异常和未处理 Promise 为零。Todos 拆分产生的 scoped 样式回归已由截图检查发现并修复。

## 迁移完成项

- 浏览器模拟后端按 planner、activity、media、notes、library、agent 分域，持久化输入先以 `unknown` 读取并收窄；不存在 `@ts-nocheck` 或全局 `any` 兜底。
- AppShell、Notes、Chat、Settings、Images、Todos、Mermaid 和 NoteEditor 已按页面装配、交互区与逻辑层拆分；所有生产 SFC 受 300 行自动门禁约束。
- NoteEditor 测试已按基础契约、编辑模式、保存同步、AI 和内容编辑拆为独立套件，保留全部回归行为。
