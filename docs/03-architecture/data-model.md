# 数据模型（Approved）

SQLite 核心表：`notebooks`、`notes`、`knowledge_bases`、`model_profiles`、`settings`、`chat_conversations`、`chat_messages`。笔记同时存 `content_html`、`content_text`；知识库文件保存在 app data 下的 `knowledge/<category>/<id>/`，隐藏 `.tiny-note.json` 记录稳定 ID 和类别。

AI 与检索表：`search_documents`、`search_chunks`、`search_chunks_fts`、`ai_edit_proposals`、`note_revisions`。FTS5 使用 trigram tokenizer；检索块用于匹配，`parent_content` 用于回填完整上下文。提案记录生成时的笔记时间戳和正文 SHA-256，应用时必须同时匹配；应用前在同一事务写入 `note_revisions`。

`chat_messages.references_json` 保存用户明确选择的引用，`sources_json` 保存本轮实际使用的来源元数据和内容哈希，均不重复保存完整文件正文；`proposal_id` 可关联待审阅的文章修改。

模型密钥存储在 SQLite 的 `model_profiles.api_key` 字段中。模型列表 DTO 只返回 `apiKeyConfigured`，不会把明文 Key 返回前端；Rust 请求层直接从 SQLite 读取。
