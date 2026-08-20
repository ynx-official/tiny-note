# 数据模型（Approved）

SQLite 表：`notebooks`、`notes`、`knowledge_bases`、`model_profiles`、`settings`。笔记同时存 `content_html`、`content_text`；知识库文件保存在 app data 下的 `knowledge/<category>/<id>/`，隐藏 `.tiny-note.json` 记录稳定 ID 和类别。

模型密钥存储在 SQLite 的 `model_profiles.api_key` 字段中。模型列表 DTO 只返回 `apiKeyConfigured`，不会把明文 Key 返回前端；Rust 请求层直接从 SQLite 读取。
