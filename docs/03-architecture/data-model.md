# 数据模型（Approved）

SQLite 核心表：`notebooks`、`notes`、`knowledge_bases`、`model_profiles`、`settings`、`chat_conversations`、`chat_messages`。笔记同时存 `content_html`、`content_text`；知识库文件保存在 app data 下的 `knowledge/<category>/<id>/`，隐藏 `.tiny-note.json` 记录稳定 ID 和类别。

AI 与检索表：`search_documents`、`search_chunks`、`search_chunks_fts`、`ai_edit_proposals`、`note_revisions`。FTS5 使用 trigram tokenizer；检索块用于匹配，`parent_content` 用于回填完整上下文。提案记录生成时的笔记时间戳和正文 SHA-256，应用时必须同时匹配；应用前在同一事务写入 `note_revisions`。

`chat_messages.references_json` 保存用户明确选择的引用，`sources_json` 保存本轮实际使用的来源元数据和内容哈希，均不重复保存完整文件正文；`proposal_id` 可关联待审阅的文章修改。

Agent 使用 `agent_runs` 保存每轮请求、模型、状态、循环次数、可恢复 continuation 和错误，使用 `agent_steps` 按顺序保存文本与工具调用参数、结果、审批哈希和状态。`chat_messages.agent_run_id` 将可见助手消息关联到审计时间线；`chat_conversations.mode` 持久化会话模式。

Skills 不写入 SQLite，保存在应用数据目录的 `agent/SKILL/<skill-name>/SKILL.md`。启动时仅补齐缺失的内置技能，不覆盖用户已编辑内容。

MCP 服务配置保存在应用数据目录的 `agent/mcp.json`，包含直接启动命令、参数、启用状态和最近一次发现的工具清单；命令与参数分开存储，不经过 Shell 拼接。

模型密钥存储在 SQLite 的 `model_profiles.api_key` 字段中。模型列表 DTO 只返回 `apiKeyConfigured`，不会把明文 Key 返回前端；Rust 请求层直接从 SQLite 读取。
