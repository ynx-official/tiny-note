# 命令契约（Draft）

所有 DTO 使用 camelCase。成功返回结构化 JSON，失败返回 `{ code, message }`；`message` 不包含系统路径、密钥或原始网络响应。

命令组：`note_*`、`notebook_*`、`knowledge_base_*`、`library_*`、`model_*`、`settings_*`、`note_ai_stream/cancel`、`note_fim_stream/cancel`。路径命令只接受 `knowledgeBaseId + relativePath`。
