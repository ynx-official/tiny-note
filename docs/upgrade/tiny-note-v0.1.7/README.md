# Tiny Note tiny-note-v0.1.7

> 发布日期：2026-08-23

## 版本概述

Tiny Note 现在提供 Windows、Linux 和 macOS 的正式安装包，并通过 GitHub Release 提供手动检查更新能力。

## 新增

- 新增不依赖个人开发者 Secrets 的 SHA-256 更新清单方案。
- 设置页“关于”支持检查更新、下载对应平台安装包、校验摘要并打开安装程序。
- Release 流水线明确上传四个平台构建产物，并生成 `update-manifest.json`。

## 改进与修复

- 统一 `package.json`、Tauri 配置、Cargo 和发布 tag 的版本校验规则。
- CI 和 Release 均会检查安装包产物是否实际生成，避免“构建成功但没有产物”。
- macOS 使用 ad-hoc signing，适合个人开发者内部验证；公开分发仍需 Developer ID 签名与公证。

## 兼容性

- 本版本不改变笔记、知识库和本地 SQLite 数据格式。
- SHA-256 可发现下载损坏或资产被替换，但不等同于发布者签名。

## 验证结果

- GitHub Actions CI 和 Release 流程已验证四个平台产物及 `update-manifest.json`。
