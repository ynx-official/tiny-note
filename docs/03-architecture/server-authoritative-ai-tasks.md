# 服务端权威 AI 与后台任务架构

状态：Approved  
最后更新：2026-09-02  
关联文档：[产品需求](../01-requirements/prd.md)、[业务规则](../01-requirements/business-rules.md)、[MVP 验收标准](../01-requirements/acceptance/mvp.md)、[架构概览](overview.md)、[数据模型](data-model.md)、[命令契约](api-contracts.md)、[威胁模型](threat-model.md)、[远程后端契约](../backend-migration-contract.md)

## 1. 决策摘要

Tiny Note 的 AI 标题、对话总结、笔记 AI 和图片生成改为服务端权威任务：桌面客户端只创建、订阅、取消、重试和展示任务，不执行模型调用、不推进任务状态，也不在本地完成业务结果落库。

MySQL 是任务、输入快照、租约、状态和结果的唯一权威来源。Redis Stream 只负责降低实时事件分发延迟；Redis 数据丢失或客户端断线不能影响任务恢复和最终结果。

已确认的产品与架构决策：

- 关闭 Tiny Note、切换页面或断开 SSE 后，服务端任务继续执行。
- 服务端进程异常退出后，未完成任务由其他 Worker 或重启后的 Worker 自动恢复。
- 每位用户最多同时运行两个本架构任务，包括不可见的标题任务；同一对话或同一笔记上的任务串行执行。Tiny Agent 使用独立运行体系，不占这两个槽。
- 标题生成是不可见的内部任务；对话总结、笔记 AI 和图片生成是任务中心可见任务。
- 普通对话和 Tiny Agent 暂时保留现有即时 SSE 链路，不进入本次任务重构。
- 服务端类型化任务入口取代通用客户端任务负载和客户端状态转换。
- 总结笔记、编辑提案和图片结果必须幂等落库。

## 2. 背景与现状问题

迁移到 Go 后端后，任务表、租约、心跳和恢复扫描已经存在，但执行责任没有完整迁移：

- 会话标题从“模型概括并在失败时回退”退化为截取第一条用户消息，模型配置没有参与标题生成。
- 笔记 AI 的 `action` 未在 Go 后端映射为对应写作指令，`summarize`、`polish`、`translate`、`generate_plan` 等快捷功能不能保证获得正确结果。
- 对话总结的模型输出由服务端生成，但创建总结笔记、转换 Markdown 和完成任务仍依赖前端 Store。
- 前端内存负责最多两个并发任务和 `resourceKey` 串行；多设备、多实例或客户端离线后规则不成立。
- 通用任务创建允许客户端提供任意任务类型、资源键和 JSON；旧实现具备的敏感字段检查、标题限制和活动总结唯一性未完整迁移。
- 客户端可调用任务状态转换接口，任务输出和终态不再具有服务端权威性。
- 现有 Approved 文档仍描述 SQLite/Rust 任务和“应用重启后中断”，与远程 Go Worker 的目标语义冲突。

## 3. 目标与非目标

### 3.1 目标

- 统一标题、总结、笔记 AI 和图片任务的服务端执行框架。
- 保证客户端退出后任务继续运行并可恢复展示。
- 在多 Worker 环境下可靠实施并发槽、资源串行、租约和重试。
- 保证同一个任务的业务结果最多落库一次。
- 恢复笔记 AI 动作提示词、标题模型生成和安全回退行为。
- 收紧任务 API、用户归属、敏感输入和状态转换边界。
- 建立可由 MySQL 集成测试和确定性 Provider 验证的契约。

### 3.2 非目标

- 不把普通即时对话改造成任务中心任务。
- 不重写 Tiny Agent 的审批、结构化输入和运行时间线。
- 不引入新的独立消息队列产品；Redis 不成为任务权威队列。
- 不在本轮实现超长对话的分层摘要或 Map/Reduce 摘要。
- 不改变 Friday 桌面外壳、任务中心三栏布局或 Notion 补充视觉规范。

## 4. 总体架构

```text
Vue 客户端
  │ 创建 / 查询 / 取消 / 重试 / 订阅
  ▼
类型化任务 API
  │ 校验业务参数、冻结输入、创建任务
  ▼
Task Application Service
  │ 单事务写入任务和 queued 事件
  ▼
Scheduler / Worker
  │ 用户并发槽、资源锁、任务租约、心跳
  ▼
类型化 Handler Registry
  ├─ ChatTitleHandler
  ├─ ConversationSummaryHandler
  ├─ NoteAiHandler
  └─ ImageGenerationHandler
  │
  ▼
AI Provider / Note Domain / Image Domain
  │ 单事务写入结果、终态和持久事件
  ▼
MySQL ── Redis Stream ── SSE ── Vue 投影
```

组件职责：

| 组件 | 职责 | 明确不负责 |
| --- | --- | --- |
| Vue `tasks` Store | 创建、订阅、刷新、取消、重试、通知和已读状态 | 调用模型、调度、转换 Markdown、创建笔记、推进状态 |
| 类型化任务 API | 鉴权、输入校验、幂等键、冻结快照、创建任务 | 执行模型调用 |
| Task Application Service | 任务聚合、状态机、事件和重试链 | 具体 AI 提示词 |
| Scheduler | 选择候选任务并原子获取并发槽、资源锁和任务租约 | 业务结果解释 |
| Handler | 解释类型化输入、调用领域能力、产生类型化结果 | 信任客户端状态或资源键 |
| NoteContentService | Markdown、安全 HTML、纯文本和标题派生 | 保存客户端 DOM |
| MySQL | 任务、输入、锁、事件和结果权威状态 | 实时推送优化 |
| Redis Stream | 跨实例实时事件通知 | 持久恢复权威 |

## 5. 任务类型

| Kind | 可见性 | Resource Key | Dedupe Key | 结果 |
| --- | --- | --- | --- | --- |
| `chat_title` | `internal` | `conversation:{id}` | `title:{id}` | `conversationId`, `title` |
| `conversation_summary` | `user` | `conversation:{id}` | `summary:{id}` | `noteId` |
| `note_ai` | `user` | `note:{id}` | 无 | `proposalId` 或只读 `content` |
| `image_generation` | `user` | `image-request:{requestKey}` | 请求幂等键 | `generationId`, `assetIds` |

普通对话和 Tiny Agent 不写入用户任务中心。Agent 继续使用 `agent_runs` 和 `agent_steps`；其内部模型运行不得占用用户任务中心的两个并发槽。

## 6. 数据模型

### 6.1 `tn_background_tasks`

当前建库脚本直接定义以下任务字段：

| 字段 | 说明 |
| --- | --- |
| `visibility` | `user` 或 `internal` |
| `handler_version` | 创建任务时固定的处理器和提示词版本 |
| `request_key` | 客户端幂等键；同一用户和任务入口唯一 |
| `dedupe_key` | 对话总结和标题的业务去重键 |
| `active_dedupe_key` | MySQL 生成列；仅活动状态映射 `dedupe_key` |
| `input_json` | 服务端生成的私有、类型化、冻结输入 |
| `public_meta_json` | 列表可展示的标题、动作、目标和安全预览 |
| `scheduled_at` | 首次执行或自动重试的最早时间 |
| `max_attempts` | 默认 3；包含第一次执行 |

类型化后台任务只把冻结输入写入 `input_json`；`payload_json` 仅供普通对话和 Agent 等服务端内部即时运行使用，不作为客户端任务输入入口。

`active_dedupe_key` 在 `queued/running/finalizing/cancelling` 状态下等于 `dedupe_key`，其他状态为 `NULL`。唯一索引 `(owner_user_id, active_dedupe_key)` 从数据库层保证同一对话最多一个活动总结或标题任务。

公开 DTO 不返回 `input_json`、内部提示词、租约所有者或锁信息：

- 列表返回标题、类型、状态、安全输出预览、结果摘要、错误和时间。
- 详情可按需返回完整输出，但仍不返回冻结输入和提示词。
- 内部任务默认不出现在 `/tasks`；只有持有精确任务 ID 的消息响应方可以订阅其事件。

### 6.2 `tn_task_locks`

新增统一租约锁表：

```text
owner_user_id
lock_key
task_id
lease_owner
lease_expires_at
create_time
update_time
PRIMARY KEY (owner_user_id, lock_key)
INDEX (task_id)
INDEX (lease_expires_at)
```

锁键分为：

- `slot:1`、`slot:2`：每位用户的两个并发槽，用户可见任务和内部标题任务共同竞争。
- `resource:conversation:{id}`、`resource:note:{id}` 等：同一业务资源串行锁。

任务租约继续保存在 `tn_background_tasks`。Scheduler 必须在同一 MySQL 事务中取得一个用户槽、一个资源锁和任务租约；任一步失败都回滚。心跳同时延长三者，终态时按 `task_id` 释放，进程死亡后由租约超时回收。

### 6.3 业务结果幂等键

- `tn_notes` 增加可空、唯一的 `source_task_id`。
- 总结 Handler 先按 `source_task_id` 查找，再创建笔记；重复 finalization 返回已有 `noteId`。
- 编辑提案和图片生成记录使用等价的唯一任务来源键；已有表可以增加 `source_task_id`，不能只依靠先查后写。
- 手动重试创建新任务 ID，并通过 `retry_of` 关联原尝试；失败任务本身不会被复活。

## 7. 状态机与恢复

```text
queued → running → finalizing → succeeded
   │         │           │
   ├─────────┴───────────┴→ cancelling → cancelled
   └─────────┴───────────┴→ failed
```

状态语义：

- `queued`：输入已冻结，等待 `scheduled_at` 和锁资源。
- `running`：Worker 正在调用 Provider；输出增量持续写入 MySQL。
- `finalizing`：Provider 已完整结束，只等待领域结果事务落库。
- `cancelling`：已记录取消请求，等待持有租约的 Worker 停止。
- `succeeded/failed/cancelled`：终态。

恢复规则：

- 客户端状态不参与恢复。
- `queued` 任务保持排队。
- `running` 任务租约过期后，清除旧的半截输出、增加 `attempt_count` 并重新调用 Provider。
- `finalizing` 任务租约过期后，只重跑领域落库，不再次调用 Provider。
- 自动执行最多三次。网络超时、HTTP 429 和 Provider 5xx 使用带抖动的退避；建议首次等待 5 秒、第二次等待 30 秒。
- Provider 鉴权、无效模型配置、非法输入和用户资源不存在立即失败，不自动重试。
- 45 秒任务租约和 15 秒心跳沿用现有实现；所有 Worker 使用同一数据库时间语义。
- `failed/cancelled` 的手动重试创建新的 `queued` 任务并复制已经冻结且仍合法的类型化输入。

本架构提供“外部模型调用至少一次、业务结果最多落库一次”。进程可能在 Provider 已接受请求但本地尚未记录完成时退出，因此不能承诺外部计费恰好一次；`finalizing` 和业务唯一键保证不会重复创建用户结果。

## 8. API 契约

### 8.1 创建总结任务

```http
POST /chats/{conversationId}/summary-tasks
Idempotency-Key: <uuid>
Content-Type: application/json

{
  "modelProfileId": null,
  "thinkingMode": "fast"
}
```

服务端在创建事务中验证会话归属，按创建时间读取消息，并把点击时快照写入 `input_json`。客户端不再上传拼接后的对话文本。

工程保护上限为 500 条消息、1 MiB UTF-8 快照和 2 MiB 模型输出；超限返回 `task_input_too_large` 或 `task_output_too_large`，不静默截断。超长对话分层摘要不在本轮范围。

### 8.2 创建笔记 AI 任务

```http
POST /notes/{noteId}/ai-tasks
Idempotency-Key: <uuid>
Content-Type: application/json

{
  "action": "summarize",
  "scope": "selection",
  "selectedText": "用户明确选择的文字",
  "instruction": null,
  "targetLanguage": null,
  "expectedVersion": 12,
  "references": [],
  "modelProfileId": null,
  "thinkingMode": "disabled"
}
```

规则：

- `action` 只能是服务端动作白名单。
- `scope=full` 时服务端从目标笔记读取内容，客户端不上传全文。
- `scope=selection` 时服务端验证 `expectedVersion`，并确认规范化后的 `selectedText` 存在于当前纯文本中；不匹配返回 `note_selection_stale`。
- 最多八个显式引用，服务端验证归属并冻结有大小上限的引用内容和内容哈希。
- 用户 `instruction` 保持用户输入角色，不提升为 system 指令。
- 编辑型动作创建持久编辑提案；解读等只读动作将内容写入任务输出和结果。

动作白名单：`interpret`、`refine`、`polish`、`expand`、`translate`、`summarize`、`continue_write`、`fix_grammar`、`generate_plan`、`generate_table`、`custom`。

### 8.3 会话标题

保存第一条助手消息时，服务端在同一事务中检查会话仍为“新对话”且首轮消息完整，然后自动创建 `chat_title` 内部任务。消息创建响应升级为：

```json
{
  "message": { "id": "...", "role": "assistant", "content": "..." },
  "titleTaskId": "..."
}
```

`titleTaskId` 可空。在线客户端订阅该任务，在 `completed` 后更新当前标题；离线或未订阅不会影响任务，重新打开会话即可读取最终标题。

标题 Handler 使用首轮用户和助手内容、会话模型和低随机性短输出请求。返回内容必须去除引号、`标题:` 前缀、尾部标点和多余行，并执行硬长度限制。模型不可用、超时、返回空值或非法内容时，从首条用户消息生成安全截断标题并仍将任务标记成功。更新使用 `WHERE title='新对话'`，不能覆盖未来的手动标题。

### 8.4 任务管理

保留：

```text
GET    /tasks
GET    /tasks/{id}
POST   /tasks/{id}/cancel
POST   /tasks/{id}/retry
DELETE /tasks/finished
GET    /streams/{taskId}
```

不提供以下客户端入口：

```text
POST /tasks
POST /tasks/{id}/transition
POST /ai/runs（任务中心场景）
```

普通对话和 Tiny Agent 的即时接口保持不变；任务中心不使用 `/ai/runs` 执行任务。

### 8.5 SSE 事件

事件继续先写 `tn_stream_events` 再发布 Redis Stream。任务事件至少包括：

- `queued`
- `started`
- `delta`
- `finalizing`
- `retryScheduled`
- `completed`
- `error`
- `cancelled`

终态事件的 payload 包含 `taskId`、最终状态和类型化 `result`。SSE 断开只影响实时显示；客户端用 `Last-Event-ID` 恢复，终态后再读取任务详情进行校准。

## 9. Handler 设计

### 9.1 `ChatTitleHandler`

1. 读取冻结的首轮消息和会话模型引用。
2. 使用版本化标题提示词发起短文本请求。
3. 清理并验证候选标题；失败则执行本地回退。
4. 在会话仍为“新对话”时更新标题。
5. 写入 `{ conversationId, title }` 并完成内部任务。

### 9.2 `ConversationSummaryHandler`

1. 使用冻结消息构造不允许补充事实的版本化总结提示词。
2. 输出结构清晰的 Markdown，至少覆盖主题、关键结论、重要细节和待办；没有对应内容时不虚构章节内容。
3. Provider 完成后进入 `finalizing`。
4. 使用 `NoteContentService` 派生最多 50 字标题、安全 HTML 和纯文本。
5. 在一个领域事务中按 `source_task_id` 创建或读取笔记、写任务 `result.noteId`、写终态和完成事件。

总结不会向原对话追加指令或总结正文消息。

### 9.3 `NoteAiHandler`

服务端维护版本化动作提示词目录。每个动作明确输出形式、事实保持、目标语言和编辑范围。基础规则：

- system 内容只包含 Tiny Note 固定规则、动作规则和不可信上下文边界。
- 用户自定义要求作为 user 内容。
- 明确选中的笔记和文件引用作为不可信参考，不能覆盖系统规则。
- 编辑模式只返回完整替换 Markdown，不添加解释。
- `targetNoteId` 和基准版本在创建任务与 finalization 时均检查。
- 编辑结果创建提案，不直接覆盖笔记。

### 9.4 `ImageGenerationHandler`

图片生成使用相同 Scheduler、锁、状态机和取消语义。图片二进制继续落 S3 兼容对象存储；MySQL 只保存任务结果、生成记录和私有对象元数据。任务完成必须在资产和生成记录均持久化后发生。

## 10. NoteContentService

服务端新增单一内容规范化服务，供总结、Agent 创建笔记和后续服务端导入复用：

- Markdown 渲染为安全 HTML。
- HTML 白名单清洗，拒绝脚本、事件属性和危险 URL。
- 从安全内容生成纯文本。
- 从首个 Markdown 标题或首个非空内容行派生标题。
- 标题去除 Markdown 标记并限制为 50 个 Unicode 字符。
- 同时产出 `contentMarkdown`、`contentHtml`、`contentText`。

客户端 DOM、临时 NodeView 和事件处理器不能作为服务端笔记内容来源。具体 Go Markdown 与清洗库在实施时选择官方维护且支持当前 Go 版本的实现，并通过固定依赖版本和安全测试锁定行为。

## 11. 前端调整

`src/stores/tasks.ts` 删除：

- `activeExecutions`
- `eventChains` 中用于客户端写回状态的部分
- `dispatch`
- `execute`
- `executePreview` 的生产执行语义
- `transition`
- `complete` 中创建笔记、提案和图片结果的逻辑
- `fail` 中由客户端写入失败终态的逻辑

Store 保留并增强：

- 类型化创建任务。
- 加载列表和详情。
- 对新任务以及应用启动时的活动任务连接 SSE。
- 收到终态后刷新权威任务，并依据 `noteId/proposalId/generationId` 打开结果。
- 取消、重试、清理、通知和设备本地已读状态。
- 网络中断后的退避重连和重新加载。

任务中心保持现有 Friday 密度与 Notion 状态样式。新增 `finalizing`、`cancelling` 状态文案，并为带延迟重试计划的 queued 任务显示 `retryScheduled` 提示；不新增卡片套卡片或装饰性流程 UI。

## 12. 安全与隐私

- 所有任务、会话、笔记、引用、模型和结果操作按 `owner_user_id` 校验。
- `resource_key`、`dedupe_key`、任务类型、可见性和 Handler 版本由服务端生成。
- `input_json` 递归拒绝字段名规范化后为 `apikey`、`token`、`password` 或 `secret` 的内容。
- 任务只引用模型配置 ID，Provider 凭据在执行时通过服务端安全存储解析。
- 冻结输入不通过普通任务 DTO、日志、SSE 或错误响应返回。
- 日志只记录任务 ID、类型、状态、尝试次数、耗时和稳定错误码，不记录正文、提示词、引用内容、Provider 原始响应或密钥。
- Provider 原始错误最多在服务端受控日志中记录清理后的摘要；客户端只接收稳定错误码和非敏感说明。
- 客户端不能调用 Worker 状态转换能力，也不能提供完成结果。

## 13. 错误契约

稳定错误码至少包括：

| 错误码 | HTTP | 语义 |
| --- | --- | --- |
| `task_already_active` | 409 | 同一业务去重键已有活动任务 |
| `task_request_replayed` | 200 | 相同幂等键返回原任务，不创建新任务 |
| `task_input_too_large` | 422 | 冻结输入超过保护上限 |
| `task_output_too_large` | 502 | Provider 输出超过保护上限 |
| `task_not_cancellable` | 409 | 任务已经进入终态 |
| `task_not_retryable` | 409 | 活动任务不能手动重试 |
| `task_retry_exhausted` | 500 | 自动恢复次数耗尽 |
| `note_version_conflict` | 409 | 目标笔记版本变化 |
| `note_selection_stale` | 409 | 选区不再属于目标版本 |
| `model_profile_unavailable` | 422 | 没有可用模型配置 |
| `provider_rate_limited` | 503 | Provider 限流且自动重试耗尽 |
| `provider_request_failed` | 502 | Provider 请求失败 |
| `task_finalization_failed` | 500 | 业务结果落库失败且恢复耗尽 |

## 14. 可观测性

服务端至少记录以下指标，不包含用户正文：

- 各任务类型的排队时间、执行时间和 finalization 时间。
- queued、running、finalizing、失败和取消数量。
- 自动重试、租约恢复和锁竞争次数。
- Provider 请求次数、限流次数和稳定错误分类。
- 总结笔记幂等命中次数。
- SSE 活跃连接、重连和事件回放数量。

日志统一携带 `taskId`、`kind`、`attempt`、`workerId` 和请求追踪 ID。不得把完整 `owner_user_id`、消息正文、笔记正文或模型响应写入普通日志。

## 15. 实现与发布顺序

1. 以当前 `manifest/sql/tiny_note.sql` 直接创建 23 张 Tiny Note 表，不处理旧任务数据或旧表结构。
2. 上线 Scheduler、Handler、任务锁、类型化创建接口和服务端结果收尾。
3. 前端切换为纯投影，并删除通用任务创建、客户端状态迁移及任务中心的本地执行代码。
4. 在空 MySQL 8 验证库完成建库、双 Worker、进程中断恢复、SSE 重连和真实 Provider 验收后发布。

## 16. 测试策略

### 16.1 Go 单元测试

- 11 个笔记 AI 动作的提示词和输出模式。
- 标题清理、硬长度限制和失败回退。
- 类型化输入解析、敏感字段拒绝和公开 DTO 脱敏。
- 状态机、错误分类、自动退避和手动重试复制。
- NoteContentService 的 Markdown、HTML 清洗、纯文本和标题派生。

### 16.2 MySQL 集成测试

- 并发创建同一总结时只产生一个活动任务。
- 同一幂等键返回原任务。
- 每位用户最多两个运行任务。
- 同一资源严格串行，不同资源可以并行。
- 多 Worker 竞争时只有一个持有任务、槽和资源锁。
- Worker 死亡后租约过期恢复。
- `running` 恢复清除半截输出并重新调用 Provider。
- `finalizing` 恢复不重新调用 Provider。
- 任意重放下总结任务只创建一个 `source_task_id` 笔记。
- 取消、失败、自动重试和手动重试链正确。
- 用户横向越权、模型越权和引用越权被拒绝。
- 客户端不能调用状态转换接口或伪造终态。

### 16.3 确定性 Provider 端到端测试

- 标题基于首轮用户和助手内容生成，而不是复制首句。
- Provider 标题失败时保存回退标题。
- 发起总结后关闭客户端，服务端完成并创建笔记。
- `running` 时重启 Worker，任务自动恢复。
- `finalizing` 时重启 Worker，Provider 只被调用一次。
- SSE 断开并携带 `Last-Event-ID` 重连后到达终态。
- 总结、翻译、润色、任务计划和自定义动作获得对应结果或提案。

### 16.4 Vue 测试

- Store 不调用 `background_task_transition`，也不直接执行任务模型请求。
- 类型化创建入口的请求字段和幂等键正确。
- 初始化时重新订阅活动任务。
- SSE 终态后刷新任务并打开服务端结果。
- 标题任务在线更新；离线重开后读取最终标题。
- `queued/running/finalizing/cancelling` 状态，以及 queued 任务的 `retryScheduled` 提示、禁用、错误和空状态可访问。

### 16.5 验证命令

前端至少执行：

```bash
npm run test:unit
npm run lint
npm run typecheck
npm run check:contracts
npm run check:components
npm run check:styles
npm run build
```

后端执行任务模块单元测试和基于 MySQL、Redis、S3 及确定性 Provider 的 Tiny Note 集成套件。不能用 SQLite 替代 MySQL 并发、生成列、唯一约束和租约验证。

## 17. 验收标准

- Given 用户发起总结后立即关闭 Tiny Note，When 服务端任务完成，Then 只创建一篇总结笔记，重新打开应用可查看任务和笔记。
- Given 两个 Worker 同时扫描同一任务，When 尝试获取租约，Then 只有一个 Worker 调用 Provider。
- Given 同一用户已有两个运行任务，When 第三个任务排队，Then 第三个任务保持 queued，直到任一槽释放。
- Given 同一笔记有多个 AI 任务，When Scheduler 调度，Then 它们按创建顺序串行执行。
- Given Worker 在 running 阶段崩溃，When 租约过期，Then 任务清除半截输出并自动重新执行。
- Given Worker 在 finalizing 阶段崩溃，When 租约过期，Then 只恢复业务落库且不再次调用 Provider。
- Given总结 finalization 被重复执行，When 查询笔记，Then `source_task_id` 对应且只对应一篇笔记。
- Given 用户首次完成一轮对话，When 标题任务完成，Then 标题反映实际主题；模型失败时得到可读回退标题。
- Given 用户执行总结、翻译、润色或任务计划，When Worker 构造请求，Then 使用对应的服务端版本化动作提示词。
- Given 客户端尝试提交任务终态或敏感任务字段，When 服务端处理请求，Then 请求被拒绝且权威任务未改变。

## 18. 设计取舍

- 选择 MySQL 租约而不是引入独立队列，是因为现有任务量和基础设施不需要新增投递确认、消费者组和双写一致性；MySQL 已经保存权威任务。
- 保留 Redis Stream 是为了跨实例低延迟通知，不将它升级为恢复来源。
- 标题使用内部任务而不是同步阻塞消息保存，保证模型慢或客户端退出时不影响消息落库。
- 引入 `finalizing` 是为了把昂贵、不可完全去重的 Provider 调用与可幂等的业务写入分开。
- 使用类型化入口而不是继续加固通用 JSON，是为了让权限、输入、资源键、提示词和结果在服务端具有可审计契约。
