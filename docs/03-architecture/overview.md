# 架构概览

状态：Approved

Vue 3 负责页面与编辑器，Pinia 负责客户端状态；Tauri commands 是唯一的本地能力边界；Rust 模块负责 SQLite、路径校验、文件监听、回收站、模型请求和系统凭据；知识库文件以应用数据目录中的相对路径管理。

文章 HTML/PDF 在前端从二次清洗后的语义快照生成，PDF 渲染依赖按需加载。目录选择使用 Tauri Dialog 的最小 `dialog:allow-open` 权限；落盘只通过 `export_write_file` 窄化命令完成，该命令接受既有绝对目录、安全单文件名和限长 Base64 内容，使用 `create_new` 自动避让同名文件，不向前端开放通用文件系统权限。记住的默认目录作为 `exportDirectory` 写入本地 settings。系统打印使用 WebView 的 `window.print()`，macOS 由 Tauri 转发为异步原生命令，因此主窗口 capability 额外放行 `core:webview:allow-print`，调用方等待命令完成并处理拒绝。

Agent 同样遵守该边界：Vue 只提交请求、呈现流式事件和管理审批策略；Rust Agent Runtime 负责模型工具调用循环、工具注册与参数校验、策略判断、执行、取消、用量记录和 SQLite 审计。系统为每个工具提供默认审批值，用户可通过“工具与权限”入口单个或批量覆盖；Rust 在每次执行前读取生效策略，前端不能自行决定是否绕过审批。Skills 由 Rust 在应用数据目录维护，并按任务需要渐进加载。

需要离开当前页面后继续执行的 AI 工作登记为 `background_tasks`，首期只包括总结为笔记和笔记 AI。普通对话与 Tiny Agent 都由 `ChatView` 即时流式处理，不进入任务中心；Agent 的运行、审批和结构化输入恢复仍由 `agent_runs`、`agent_steps` 负责。应用级 Pinia Store 持有后台任务的 Tauri Channel 并持续将状态写回 SQLite，因此路由组件卸载不会终止总结或笔记 AI 的事件消费。任务资源键保证同一对话或笔记串行，SQLite 是任务中心和重启恢复的权威来源。应用进程重启时不自动重放写操作，而是把未完成任务标记为 `interrupted`。
