# 威胁模型

状态：Review

- 所有文件命令只接受知识库 ID 与相对路径，拒绝越界路径和符号链接穿透。
- HTML/Markdown/AI 输出经过清洗，HTML 预览禁用脚本。
- 模型 Key 只进入本地 SQLite 和 Rust HTTP 请求；错误、日志和前端 DTO 均脱敏。SQLite 数据库文件需要按本机敏感数据保护。
- WebView 不开放任意 Shell、任意目录读写或远程页面导航。
