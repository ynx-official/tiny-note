# Tiny Note 远程后端契约

`src/services/commandMap.ts` 是桌面端兼容契约的唯一权威清单。当前共 127 个命令，由 `npm run check:contracts` 强制每个命令只能归属于以下一类：

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
| `chat_` | `/chats` | 会话和消息归属在写入前验证 |
| `background_task_` | `/tasks` | MySQL 持久状态、租约、心跳、重试和取消 |
| `note_ai_`, `note_fim_` | `/ai/runs`, `/streams/{runId}` | SSE 可用 `Last-Event-ID` 续传 |
| `agent_` | `/agent`, `/mcp-servers`, `/skills`, `/memory` | 写工具审批，输入令牌一次性恢复 |
| `image_` | `/images`, `/image-assets` | 资产只通过短期预签名 URL 读取 |
| `workspace_` | `/workspace` | 导入导出不包含模型密钥 |
| `external_markdown_`, `export_`, `app_`, `tray_` | Tauri invoke | 只保留本机文件授权和桌面能力 |

## 统一错误

普通响应使用 `{ code, msg, data }`。前端统一转换为 `{ code, message, status, details? }`；401 立即清除内存与系统凭据库中的访问令牌并退出登录，不刷新、不重试，409 进入编辑冲突交互。

## SSE 事件

每个事件包含 `eventId`, `runId`, `sequence`, `type`, `payload`。终态类型只有 `completed`, `error`, `cancelled`。Agent 扩展事件为 `toolCall`, `toolResult`, `approvalRequired`, `inputRequired`。事件先持久化到 MySQL，再投递 Redis Stream，因此断线与跨实例恢复不依赖单个进程内存。
