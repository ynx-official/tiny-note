# Tiny Note tiny-note-v0.1.9

> 发布日期：2026-08-24

## 版本概述

本版本修复 GitHub Actions Ubuntu Runner 上的跨平台路径单测失败，恢复 Windows、Linux 和 macOS 安装包的持续集成与正式发布流程。

## 改进与修复

- 将外部 Markdown 文件打开队列测试改为使用平台原生路径拼接。
- 避免测试写死 Windows 路径分隔符导致 Linux CI 失败。
- Rust 单测、格式检查和 Clippy 均已通过。

## 兼容性

- 本版本不改变笔记、知识库和本地 SQLite 数据格式。
- 不改变外部 Markdown 文件绑定协议和已有安装包配置。
