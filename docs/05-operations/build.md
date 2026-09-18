# 构建、发布与在线升级（Review）

最后更新：2026-09-18
关联配置：`.github/workflows/ci.yml`、`.github/workflows/release.yml`、`src-tauri/tauri.conf.json`

## 生产 API 联调

`make prod` 启动 Tauri 开发窗口和 production 模式的 Vite，页面来源仍是 `http://127.0.0.1:1420`，请求目标为 `https://go.mrsunshine.cn/prod-api`。它与打包安装后的 Tauri Origin 不同。

后端 `tiny-blog-go` 的 `manifest/config/config.prod.yaml` 明确允许 `http://127.0.0.1:1420`、`http://localhost:1420` 以及现有 Tauri Origin。部署更新后的配置并重启 Go 服务后生效；配置打包在 Docker 镜像中时须重建镜像和容器，重启旧镜像不会应用本地仓库变更。前端无需修改 API 地址或重新打包。

如果登录出现 CORS 错误，检查 `/prod-api/auth/login` 的 OPTIONS 请求：预期返回 `204` 和与页面 Origin 完全一致的 `Access-Control-Allow-Origin`。`403` 且缺少该响应头时，核对线上配置是否更新。额外 Origin 可通过后端 `CORS_ALLOWED_ORIGINS` 追加（逗号分隔，保留已有值）；不要把它写到前端 `.env.production`。部署与完整验证步骤以服务端 `docs/Tiny Note部署与安全.md` 为准。

## 产物矩阵

| 平台 | 架构 | 安装包 | 在线升级资产 |
| --- | --- | --- | --- |
| Windows | x86_64 | NSIS `.exe` | 同一 NSIS `.exe` + 清单中的 SHA-256 |
| Linux | x86_64 | AppImage、DEB | 同一 AppImage/DEB + 清单中的 SHA-256 |
| macOS | Intel x86_64 | DMG | 同一 DMG + 清单中的 SHA-256 |
| macOS | Apple Silicon aarch64 | DMG | 同一 DMG + 清单中的 SHA-256 |

普通 push/PR 由 `Tiny Note CI` 执行测试、lint、Rust 检查和四组安装包构建，并把产物保存为 workflow artifacts。正式发布由 `tiny-note-v*` tag 触发。CI 和 Release 均使用仓库锁定的 npm 依赖与项目内 Tauri CLI；Release 矩阵串行上传，随后生成 `update-manifest.json`。

## 在线升级方案

应用使用 TinyShell 风格的自定义更新器：设置页“关于”中由用户手动检查更新，Rust 从 GitHub Release 获取清单，按当前平台选择安装包，下载后校验 SHA-256，再打开安装包供系统安装。更新元数据来自：

```text
https://github.com/ynx-official/tiny-note/releases/latest/download/update-manifest.json
```

Release 流水线通过固定版本的 `tauri-action` 上传各平台安装包，再由 `scripts/update-manifest.mjs` 下载已发布资产、计算 SHA-256 并上传清单。GitHub Release 必须是非草稿、非 prerelease，才能被 `/releases/latest/` 稳定发现。该方案不需要 Tauri updater 签名 Secrets。

## macOS 正式签名与公证

未配置 Apple 凭据时，当前 `signingIdentity: "-"` 只做 ad-hoc 签名，适合内部验证，不等同于 Developer ID 签名和 notarization。公开分发前配置：

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

SHA-256 校验可以发现下载损坏或资产被替换，但不等同于发布者签名；若要提高供应链防护，后续仍可增加 Tauri 签名或平台代码签名。

## 发布步骤

1. 在 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 中同步修改 SemVer。
2. 新建 `docs/upgrade/tiny-note-vX.Y.Z/README.md`，并同步更新 `docs/upgrade/README.md` 与 `CHANGELOG.md`。
3. 本地运行 `npm run release:check`，确认版本详情、日期和索引全部一致。
4. 创建并 push 完全匹配的 tag，例如 `tiny-note-v0.2.0`。
5. 等待四个 release matrix job 和 `publish-manifest` 完成，确认 Release 包含各平台安装包和 `update-manifest.json`。
6. 从上一版本安装包中执行一次真实“检查更新 → 下载 → 校验 → 打开安装包”验收。

## Linux CI 依赖

Ubuntu runner 需要 `libwebkit2gtk-4.1-dev`、GTK、AppIndicator、`librsvg2-dev`、`patchelf` 和 `xdg-utils`。本地 Linux 构建也需要安装相同依赖。
