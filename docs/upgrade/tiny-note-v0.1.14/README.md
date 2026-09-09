# Tiny Note tiny-note-v0.1.14

> 发布日期：2026-09-04

## 版本概述

本版本修复跨平台安装包的发布流程。发布任务现在只上传实际安装包，不再把 Tauri 生成的 macOS 辅助文件作为 Release 资产，从而避免不同架构的同名文件导致发布中断。

## 修复

- 仅收集 DMG、NSIS、AppImage 和 DEB 安装包作为 GitHub Release 资产。
- 避免 Intel Mac 与 Apple Silicon Mac 打包目录中的同名辅助文件发生上传冲突。
- 重新发布 Windows、Linux、Intel Mac 和 Apple Silicon Mac 的完整安装包，并生成在线更新清单。

## 兼容性

- 本版本包含 `tiny-note-v0.1.13` 的全部功能和数据格式变更。
- 无需迁移本地数据或修改后端配置。

## 验证说明

- 执行前端单元测试、Lint、类型检查、契约检查、组件检查、样式检查和生产构建。
- 执行 Rust 格式检查、单元测试和 Clippy 检查。
- 由 GitHub Actions 执行四平台安装包构建、Release 上传和更新清单生成。

[返回版本总览](../README.md)
