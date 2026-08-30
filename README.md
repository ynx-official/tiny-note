# Tiny Note

Tiny Note 是一个必须登录联网的 Tauri 2 + Vue 3 桌面笔记客户端。业务数据、AI、Agent 和后台任务统一由 `/Users/yunanxing/project/tiny-blog-go` 的 GoFrame 服务提供；Rust 仅保留桌面平台能力。

## 架构

- 前端：TypeScript、Vue 3、Vite、Vue Router、Pinia、Vue I18n。
- 桌面薄壳：Tauri 2/Rust，负责窗口、托盘、更新、通知、文件对话框、本机 Markdown 授权和 OS 安全凭据库。
- 业务后端：GoFrame + MySQL 8 + Redis + S3 兼容对象存储。
- 传输兼容：前端保留 127 个 `CommandMap` 命令，业务命令路由到 REST/SSE，平台命令路由到 Tauri invoke。

不读取、迁移或删除旧 SQLite 数据目录。新版登录后使用当前账户的服务端空间。

## 开发

先启动 `tiny-blog-go`，再启动客户端：

```bash
VITE_API_BASE_URL=http://127.0.0.1:8080 npm run tauri:dev
```

仅预览前端：

```bash
VITE_API_BASE_URL=http://127.0.0.1:8080 npm run dev
```

浏览器模式也调用远程后端；`browserBackend` 只在单元测试模式作为可注入的内存适配器。

## 认证与安全

认证使用服务端签发的单一长效访问令牌。运行时令牌保存在前端内存；用户选择“保持登录”时，令牌只能通过薄 Rust 命令保存到 macOS Keychain、Windows Credential Manager 或 Linux Secret Service。安全凭据库不可用时禁用“保持登录”，不回退到 localStorage；HTTP 401 直接清理会话并返回登录页，不再刷新或重试。

发布包必须将 `VITE_API_BASE_URL` 与 `src-tauri/tauri.conf.json` 的 CSP `connect-src` 同时设为同一个明确 HTTPS API Origin，不得使用通配符。

## 验证

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run check:contracts
npm run check:components
npm run check:styles
npm run build
cd src-tauri
cargo fmt --check
cargo test
cargo clippy --all-targets --all-features -- -D warnings
```

`npm run tauri:build` 生成当前平台安装包。命令和 SSE 契约见 [远程后端契约](docs/backend-migration-contract.md)。
