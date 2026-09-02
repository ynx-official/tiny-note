# 服务端权威 AI 与后台任务实施计划

状态：Review（代码完成，空库多 Worker 验收待执行）  
最后更新：2026-09-02  
设计依据：[服务端权威 AI 与后台任务架构](../03-architecture/server-authoritative-ai-tasks.md)

## 实施原则

- 以 `D:/study/tiny-blog-go` 为任务执行和业务结果权威端，以 `D:/study/tiny-note` 为纯客户端投影端。
- 每个行为变更先增加失败测试，再实现最小代码使其通过，最后重构并重新验证。
- 保留两个仓库已有脏工作区；不覆盖认证、模型配置和桌面账号入口等无关修改。
- 后端新增独立任务测试文件，避免改写当前有未提交变化的 `integration/tiny_note_e2e_test.go` 和 `model_logic.go`。
- 不兼容历史任务数据或旧表结构，直接以当前建库脚本和类型化 API 为准。
- 只有最新运行证据可以用于声称完成。

## 阶段 1：锁定任务领域契约

### 测试先行

- 为任务类型、状态、动作白名单、敏感字段拒绝、资源键和标题限制增加 Go 单元测试。
- 为标题候选清理、回退标题和 11 个笔记 AI 动作指令增加表驱动测试。
- 为公开任务 DTO 不泄露冻结输入增加测试。

### 实现

- 新增类型化任务定义、输入结构、公开投影和 Handler 注册表。
- 抽出版本化标题与笔记 AI 提示词目录。
- 类型化任务的类型、资源键、可见性和 Handler 版本只能由服务端生成，不暴露通用创建入口。

### 验证

- `go test ./internal/modules/tinynote/logic -run 'Task|Title|WritingAction'`
- `go test ./internal/modules/tinynote/model/...`

## 阶段 2：当前数据库结构与幂等结果

### 测试先行

- 增加 SQL 架构测试，断言任务新字段、活动去重唯一索引、任务锁表和业务结果来源唯一键存在。
- 增加 NoteContentService 的 Markdown、HTML 清洗、纯文本和 50 字标题测试。
- 增加总结 finalization 重放测试，证明同一 `source_task_id` 只产生一篇笔记。

### 实现

- 直接更新 `manifest/sql/tiny_note.sql`。
- 新增 `tn_task_locks`。
- 为笔记、编辑提案和图片生成记录增加可空唯一 `source_task_id`。
- 新增 NoteContentService；总结和后续 Agent 创建笔记复用同一内容规范化能力。

### 验证

- `go test ./internal/modules/tinynote/dao ./internal/modules/tinynote/logic`
- 在空 MySQL 8 测试库执行完整建表检查。

## 阶段 3：服务端 Scheduler、租约和状态机

### 测试先行

- 两个用户并发槽、同资源串行、不同资源并行。
- 多 Worker 只能有一个获得任务。
- running 租约过期后清除半截输出并重新执行。
- finalizing 租约过期后只恢复业务落库。
- 取消、自动重试、重试耗尽和手动重试链。

### 实现

- 重构 `task_worker.go` 为 Scheduler + claim + heartbeat + release。
- 同一事务获取用户槽、资源锁和任务租约。
- 增加 `finalizing`、`cancelling`、`scheduled_at` 和错误分类。
- Provider 瞬时错误使用三次总尝试及退避；配置和输入错误立即失败。

### 验证

- MySQL 多连接集成测试。
- `go test -race ./internal/modules/tinynote/logic`

## 阶段 4：类型化 Handler 与 API

### 测试先行

- 创建总结时由服务端冻结会话快照，重复活动总结返回冲突。
- 保存首轮助手消息自动创建不可见标题任务。
- 标题只更新“新对话”，模型失败使用回退值。
- 笔记 AI 全文和选区版本校验、引用归属、动作提示词及编辑提案结果。
- HTTP 层不存在客户端任务 transition 接口。

### 实现

- `ChatTitleHandler`。
- `ConversationSummaryHandler`。
- `NoteAiHandler`。
- 将图片任务接入相同状态机。
- 新增总结、笔记 AI 和图片类型化创建接口。
- 消息创建响应增加可空 `titleTaskId`。
- 任务列表区分列表投影和详情投影。

### 验证

- Controller/Logic 单元测试。
- 新增独立 Tiny Note 任务集成测试，使用确定性 Provider。

## 阶段 5：前端改为纯任务投影

### 测试先行

- Store 不再调用 `background_task_transition` 或为任务调用 `note_ai_stream/image_generate`。
- 类型化创建入口携带幂等键。
- 初始化重新订阅活动任务。
- 终态后刷新权威详情并使用 `noteId/proposalId/generationId`。
- 标题任务在线更新，离线重开读取最终标题。

### 实现

- 重构 `src/stores/tasks.ts`。
- 更新 `remoteCommands.ts`、`commandMap.ts` 和领域 DTO。
- 更新会话总结、笔记 AI、图片生成和标题调用路径。
- 补充 finalizing、cancelling 和延迟重试提示，不改变 Friday/Notion 主布局。

### 验证

- 相关 Vitest 测试。
- `npm run lint`
- `npm run typecheck`
- `npm run check:contracts`
- `npm run check:components`
- `npm run check:styles`
- `npm run build`

## 阶段 6：文档和端到端验收

- 删除通用任务创建、客户端 transition 和任务中心对 `/ai/runs` 的执行依赖。
- 更新 PRD、业务规则、验收标准、架构概览、数据模型、API 契约、威胁模型、远程后端契约和测试计划。
- 执行客户端退出后总结完成、Worker running/finalizing 重启、SSE 恢复、多 Worker 竞争和跨用户拒绝的端到端测试。
- 记录未能在当前环境执行的验证及原因。

## 完成标准

- 服务端是任务输入、状态、输出和结果的唯一权威。
- 客户端退出不影响任务完成。
- 总结、标题和 11 个笔记 AI 动作使用服务端版本化指令。
- 同一总结只创建一篇笔记，同资源任务串行，每位用户最多两个本架构任务。
- 新任务不能由客户端伪造状态或结果。
- 两个仓库的相关测试、静态检查和构建有最新通过证据。

## 2026-09-02 实施记录

- 已完成类型化任务 API、服务端私有输入、任务锁/租约、退避重试、恢复执行、结果幂等、自动标题和客户端纯投影改造。
- 前端 `npm run test:unit` 通过 70 个测试文件、298 个用例；lint、typecheck、contracts、components、styles、build 与 bundle budget 均通过。
- 后端 Tiny Note logic/controller/service 和 assembly 测试通过；全 Tiny Note 包回归仅 `mcpworker` 的既有 Windows 容器运行时绝对路径断言失败，与本次任务改动无关。当前 Go 环境为 Windows/386，不支持 `go test -race`，竞态检查须在 amd64 CI 或 Linux 环境补跑。
- 未连接或修改生产数据库。发布前须在空 MySQL 8 验证库执行当前 `tiny_note.sql`，并完成双 Worker、进程中断恢复和真实 Provider 的端到端验收。
