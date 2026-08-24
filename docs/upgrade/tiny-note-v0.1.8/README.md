# Tiny Note tiny-note-v0.1.8

> 发布日期：2026-08-23

## 版本概述

本版本调整 GitHub Actions 构建触发规则：普通 `main` 分支 push 也会生成四个平台的安装包 artifact，正式版本仍通过 `tiny-note-vX.Y.Z` tag 发布 GitHub Release。

## 改进与修复

- `main` 分支 push 会执行 Windows、Linux、macOS Intel 和 macOS Apple Silicon 四组 Tauri 打包。
- 非 tag 构建上传 workflow artifacts，便于直接下载测试包；不会创建正式 GitHub Release。
- 正式 tag 继续生成 Release、安装包和 SHA-256 `update-manifest.json`。

## 兼容性

- 本版本不改变笔记、知识库和本地 SQLite 数据格式。
- macOS 仍使用 ad-hoc signing，公开分发仍需 Developer ID 签名与公证。
