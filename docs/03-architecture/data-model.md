# 数据模型（Approved）

最后更新：2026-08-21

SQLite 核心表：`notebooks`、`notes`、`knowledge_bases`、`model_profiles`、`settings`、`chat_conversations`、`chat_messages`。`notes.title` 是独立元数据，不自动写入正文 H1。正文原子保存三种表示：`content_markdown` 是 Markdown 模式中的用户源码（即时编辑产生正文变更后可规范化为语义等价写法），`content_html` 是经过白名单清洗的 TipTap 渲染内容，`content_text` 是搜索与 AI 使用的纯文本。三个字段均为非空文本；旧库通过 `PRAGMA table_info` 检测后执行兼容 `ALTER TABLE`，Markdown 初始默认空字符串。

`note_revisions` 同样保存 `content_markdown`、`content_html` 和 `content_text`，因此 AI 应用前快照与版本恢复不会丢失源码。复制、导入、Agent 创建笔记及 AI 应用必须在一次逻辑操作中同步三种表示。旧记录保持可读，Markdown 在首次实际源码编辑或保存时延迟回填。

知识库文件保存在 app data 下的 `knowledge/<category>/<id>/`，隐藏 `.tiny-note.json` 记录稳定 ID 和类别。

AI 与检索表：`search_documents`、`search_chunks`、`search_chunks_fts`、`ai_edit_proposals`、`note_revisions`。FTS5 使用 trigram tokenizer；检索块用于匹配，`parent_content` 用于回填完整上下文。提案记录生成时的笔记时间戳和正文 SHA-256，应用时必须同时匹配；应用前在同一事务写入 `note_revisions`。

`chat_messages.references_json` 保存用户明确选择的引用，`sources_json` 保存本轮实际使用的来源元数据和内容哈希，均不重复保存完整文件正文；`proposal_id` 可关联待审阅的文章修改。

Agent 使用 `agent_runs` 保存每轮请求、模型、状态、循环次数、可恢复 continuation 和错误，运行状态包含与危险操作审批分离的 `awaiting_input`。`agent_steps` 按顺序保存文本、工具调用或结构化输入请求的参数、结果、内容哈希和状态，因此应用重启后仍可恢复待回答卡片，回答后则作为只读摘要保留。`agent_tool_policies` 只保存用户明确覆盖的工具审批值；缺少记录时使用 Rust 注册表中的系统默认值，恢复默认即删除覆盖记录。`chat_messages.agent_run_id` 将可见助手消息关联到审计时间线；`chat_conversations.mode` 持久化会话模式。

Skills 不写入 SQLite，保存在应用数据目录的 `agent/SKILL/<skill-name>/SKILL.md`。启动时仅补齐缺失的内置技能，不覆盖用户已编辑内容。

MCP 服务配置保存在应用数据目录的 `agent/mcp.json`，包含直接启动命令、参数、启用状态和最近一次发现的工具清单；命令与参数分开存储，不经过 Shell 拼接。

模型密钥存储在 SQLite 的 `model_profiles.api_key` 字段中。模型列表 DTO 只返回 `apiKeyConfigured`，不会把明文 Key 返回前端；Rust 请求层直接从 SQLite 读取。
