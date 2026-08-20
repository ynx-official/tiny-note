# 数据模型（Approved）

SQLite 表：`notebooks`、`notes`、`knowledge_bases`、`model_profiles`、`settings`。笔记同时存 `content_html`、`content_text`；知识库文件保存在 app data 下的 `knowledge/<category>/<id>/`，隐藏 `.tiny-note.json` 记录稳定 ID 和类别。

模型密钥由 `keyring` 写入 Windows Credential Manager 或 macOS Keychain；SQLite 只存非敏感配置。
