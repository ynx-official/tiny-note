# Tiny Note 远程后端契约

状态：Review

最后更新：2026-09-09

关联文档：[测试计划](04-quality/test-plan.md)

`src/services/commandMap.ts` 是桌面端契约的唯一权威清单。当前共 129 个命令，由 `npm run check:contracts` 强制每个命令只能归属于以下一类：

认证在命令映射之外直接使用 REST：应用未登录时仍进入 Friday 桌面外壳和首页；`POST /auth/login` 只发送 `username`、`password`，取得访问令牌后再调用需认证的 `POST /auth/device` 上报随机安装 ID 与应用/系统摘要。设备上报不包含硬件指纹，失败不阻断登录；401 会清理安全凭据和用户作用域的前端状态，并由左上角狗狗头像账号面板重新登录。

- 远程业务命令：由 `src/services/remoteCommands.ts` 映射到 `tiny-blog-go` REST/SSE。
- 桌面平台命令：由 `src/services/tauri.ts` 中的 `platformCommands` 映射到薄 Rust 壳。

业务分组与 REST 资源对照：

| CommandMap 前缀 | REST 资源 | 兼容要点 |
| --- | --- | --- |
| `settings_` | `/settings` | 整体设置按用户隔离 |
| `model_`, `image_model_` | `/models` | 只返回 `apiKeyConfigured`/`hasApiKey`，不返回明文 |
| `note_`, `notebook_`, `tag_` | `/notes`, `/notebooks`, `/tags` | 更新携带 `version`，冲突返回 HTTP 409 |
| `knowledge_base_`, `library_` | `/knowledge-bases` 及 `/library` | 文件位于用户私有对象存储前缀 |
| `calendar_`, `todo_`, `reminder_` | `/calendar-events`, `/todos`, `/todo-lists`, `/reminders` | 资源和提醒按用户隔离 |
| `chat_` | `/chats` | 会话和消息归属在写入前验证；Agent 请求必须携带已持久化用户消息的 `messageId`，服务端使用数据库原始时间边界避免时区偏移、对短暂读后写不可见进行有限重试，并据此装配最近 20 个用户回合及其间的回复、工具结果和失败记录 |
| `conversation_summary_task_`, `note_ai_task_`, `image_generation_task_` | `/chats/{id}/summary-tasks`, `/notes/{id}/ai-tasks`, `/images/generation-tasks` | 类型化创建；正文快照、资源键和状态由服务端生成 |
| `background_task_` | `/tasks` | 客户端只查询、订阅、取消、重试和清理；MySQL 是权威状态 |
| `note_ai_`, `note_fim_` | `/ai/runs`, `/streams/{runId}` | SSE 可用 `Last-Event-ID` 续传 |
| `agent_` | `/agent`, `/mcp-servers`, `/skills`, `/memory` | 系统技能由云端共享且只读；写工具审批，输入令牌一次性恢复 |
| `image_` | `/images`, `/image-assets` | 资产只通过短期预签名 URL 读取 |
| `workspace_` | `/workspace` | 导入导出不包含模型密钥 |
| `external_markdown_`, `export_`, `app_`, `tray_` | Tauri invoke | 只保留本机文件授权和桌面能力 |

## 统一错误

普通响应使用 `{ code, msg, data }`。前端统一转换为 `{ code, message, status, details? }`；401 立即清除内存与系统凭据库中的访问令牌并退出登录，不刷新、不重试，409 进入编辑冲突交互。

## SSE 事件

每个事件包含 `eventId`, `runId`, `sequence`, `type`, `payload`。终态类型只有 `completed`, `error`, `cancelled`。Agent 扩展事件为 `toolCall`, `toolResult`, `approvalRequired`, `inputRequired`。事件先持久化到 MySQL，再投递 Redis Stream，因此断线与跨实例恢复不依赖单个进程内存。

2026-09-09 修正 Agent 成功回复的保存责任：旧实现依赖客户端收到 `completed` 后写入消息，离开页面会使历史整条回复缺失。现在成功状态、带 `agentRunId` 的助手消息与完成事件在服务端同一事务中保存；消息保存失败不得发出成功事件。`completed.payload` 包含 `content`，首次生成标题时可带 `titleTaskId`。客户端按运行 ID 复用历史消息并订阅标题任务，保留对旧后端的保存回退。

历史读取按用户和对话查询仍保留的成功 Agent 任务：缺少助手消息时，将任务输出投影为稳定 ID 的历史回复，并通过 `agentRunId` 恢复工具步骤；已有消息不重复添加。该恢复不写数据库，不需要迁移；已被清理的运行结果无法通过此方式恢复。前后端须一起更新才能完整覆盖保存、恢复与去重。

## 知识库原文件读取

预览 DTO 统一为 `{ kind, title, content, mimeType, downloadPath? }`。图片/PDF 的 `content` 为空，通过 `downloadPath` 指向的 `GET /knowledge-bases/{id}/library/content?relativePath=...` 以 Bearer 认证读取字节，不下发可绕过当前会话的对象 URL。服务端返回 attachment、nosniff、private/no-store；跨用户无法取得字节。超过 2 MB 的文本返回 binary 类型并保留下载入口。
