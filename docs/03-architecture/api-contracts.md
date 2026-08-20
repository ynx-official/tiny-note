# 命令契约（Draft）

所有 DTO 使用 camelCase。成功返回结构化 JSON，失败返回 `{ code, message }`；`message` 不包含系统路径、密钥或原始网络响应。

命令组：`note_*`、`notebook_*`、`knowledge_base_*`、`library_*`、`model_*`、`settings_*`、`note_ai_stream/cancel`、`note_fim_stream/cancel`。路径命令只接受 `knowledgeBaseId + relativePath`。

上下文与索引：`context_search`、`search_index_status/rebuild/retry_failed`。AI 请求可携带 `mode`、结构化 `references`、`scope`、`targetNoteId`、`selection` 和 `autoRetrieve`；流事件增加 `sources` 与 `editProposal`，旧事件保持兼容。

安全编辑：`note_edit_get/apply/discard`、`note_revision_list/get/restore`。`note_edit_apply` 只接受提案 ID、期望更新时间及编辑器生成的最终 HTML/纯文本；Rust 校验提案、版本和内容哈希后事务化写入。
