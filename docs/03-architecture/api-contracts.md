# 命令契约（Draft）

所有 DTO 使用 camelCase。成功返回结构化 JSON，失败返回 `{ code, message }`；`message` 不包含系统路径、密钥或原始网络响应。

命令组：`note_*`、`notebook_*`、`knowledge_base_*`、`library_*`、`model_*`、`settings_*`、`note_ai_stream/cancel`、`note_fim_stream/cancel`。路径命令只接受 `knowledgeBaseId + relativePath`。

Agent 命令：`agent_invoke`、`agent_resume`、`agent_cancel`、`agent_get_run`、`agent_get_pending_run`、`agent_list_tools`。流事件包括 `started`、`textDelta`、`reasoningDelta`、`toolCall`、`approvalRequired`、`toolResult`、`sources`、`editProposal`、`completed`、`cancelled` 和 `error`。`chat_conversations.mode` 标识 `chat | memoryless | agent`，助手消息可通过 `agentRunId` 关联持久化时间线。

Skills 命令：`agent_skill_list`、`agent_skill_read`、`agent_skill_upsert`、`agent_skill_delete`。列表只返回名称、描述、文件名、内置标记和更新时间；完整 `SKILL.md` 通过读取命令按需加载。

MCP 命令：`agent_mcp_list`、`agent_mcp_upsert`、`agent_mcp_delete`、`agent_mcp_refresh`。`refresh` 通过 stdio 完成 initialize 与 tools/list，并缓存工具清单；Agent 通过 `list_mcp_tools` 和 `call_mcp_tool` 两个网关工具访问，实际调用逐次审批。

高级 Agent 工具：`delegate_task` 使用当前模型执行无工具权限的隔离子任务；`run_sandbox_script` 在资源受限的 Rhai 引擎中执行纯计算。两者都会进入持久化审批。

上下文与索引：`context_search`、`search_index_status/rebuild/retry_failed`。AI 请求可携带 `mode`、结构化 `references`、`scope`、`targetNoteId`、`selection` 和 `autoRetrieve`；流事件增加 `sources` 与 `editProposal`，旧事件保持兼容。

安全编辑：`note_edit_get/apply/discard`、`note_revision_list/get/restore`。`note_edit_apply` 只接受提案 ID、期望更新时间及编辑器生成的最终 HTML/纯文本；Rust 校验提案、版本和内容哈希后事务化写入。
