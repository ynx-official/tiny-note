# 更新日志

本文件记录 Tiny Note 各版本面向用户的主要变化，版本号遵循 Semantic Versioning。完整的升级说明统一维护在 [`docs/upgrade/`](docs/upgrade/README.md)，Release Notes 从对应版本详情自动生成。

## [0.1.7] - 2026-08-23

### 新增

- 新增不依赖个人开发者 Secrets 的 SHA-256 更新清单方案。
- 设置页“关于”支持检查更新、下载对应平台安装包、校验摘要并打开安装程序。
- Release 流水线明确上传四个平台构建产物，并生成 `update-manifest.json`。

### 改进与修复

- 统一 `package.json`、Tauri 配置、Cargo 和发布 tag 的版本校验规则。
- CI 和 Release 均会检查安装包产物是否实际生成，避免“构建成功但没有产物”。

[0.1.7]: docs/upgrade/tiny-note-v0.1.7/README.md
