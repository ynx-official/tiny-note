# 更新日志

本文件记录 Tiny Note 各版本面向用户的主要变化，版本号遵循 Semantic Versioning。完整的升级说明统一维护在 [`docs/upgrade/`](docs/upgrade/README.md)，Release Notes 从对应版本详情自动生成。

## [0.1.10] - 2026-08-25

### 新增

- 将文章输出拆分为独立的“打印”“导出 PDF”和“导出 HTML”操作，并保留 Markdown 导出。
- 新增带内联阅读样式、当前语言和安全文件名的独立 HTML 文档导出。
- 新增 A4 PDF 直接导出、长文画布保护和远程图片安全嵌入/占位处理。

### 改进与修复

- 所有文章输出都会先同步最新 Markdown 草稿并再次清洗正文，避免导出旧内容或临时 Mermaid SVG。
- 打印改为仅输出文章快照，补齐分页样式、macOS Tauri 打印权限和异步错误处理。
- 补齐导出进度、重复操作保护、中英文文案及更多菜单键盘与焦点交互。
- 修复 Windows 下发布资料校验脚本的项目路径解析，并让关于页回退版本直接读取构建版本。

[0.1.10]: docs/upgrade/tiny-note-v0.1.10/README.md

## [0.1.9] - 2026-08-24

### 修复

- 修复 GitHub Actions Ubuntu Runner 上 Rust 跨平台路径单测失败的问题，恢复跨平台安装包构建流程。
- 使用平台原生路径拼接验证外部 Markdown 文件打开队列，避免测试写死 Windows 路径分隔符。

[0.1.9]: docs/upgrade/tiny-note-v0.1.9/README.md

## [0.1.7] - 2026-08-23

### 新增

- 新增不依赖个人开发者 Secrets 的 SHA-256 更新清单方案。
- 设置页“关于”支持检查更新、下载对应平台安装包、校验摘要并打开安装程序。
- Release 流水线明确上传四个平台构建产物，并生成 `update-manifest.json`。

### 改进与修复

- 统一 `package.json`、Tauri 配置、Cargo 和发布 tag 的版本校验规则。
- CI 和 Release 均会检查安装包产物是否实际生成，避免“构建成功但没有产物”。

[0.1.7]: docs/upgrade/tiny-note-v0.1.7/README.md

## [0.1.8] - 2026-08-23

### 改进与修复

- 普通 `main` 分支 push 现在也会触发四平台安装包构建并上传为 GitHub Actions artifact，不再必须先创建版本 tag。
- 正式发布继续使用 `tiny-note-vX.Y.Z` tag，并沿用 SHA-256 更新清单流程。

[0.1.8]: docs/upgrade/tiny-note-v0.1.8/README.md
