# 构建、发布与在线升级（Review）

最后更新：2026-08-21  
关联配置：`.github/workflows/ci.yml`、`.github/workflows/release.yml`、`src-tauri/tauri.conf.json`

## 产物矩阵

| 平台 | 架构 | 安装包 | 在线升级包 |
| --- | --- | --- | --- |
| Windows | x86_64 | NSIS `.exe` | NSIS `.exe` + `.sig` |
| Linux | x86_64 | AppImage、DEB | AppImage + `.sig` |
| macOS | Intel x86_64 | DMG | `.app.tar.gz` + `.sig` |
| macOS | Apple Silicon aarch64 | DMG | `.app.tar.gz` + `.sig` |

普通 push/PR 由 `Tiny Note CI` 执行测试、lint、Rust 检查和四组无更新签名的安装包构建，并把产物保存为 workflow artifacts。正式发布只由 `tiny-note-v*` tag 或手动运行 `Release Tiny Note` 触发。

## 在线升级方案

应用使用 Tauri 2 updater：设置页“关于”中由用户手动检查更新、确认下载并安装，安装完成后再由用户选择重启。更新元数据来自：

```text
https://github.com/ynx-official/tiny-note/releases/latest/download/latest.json
```

正式发布流水线通过 `tauri-action` 聚合各平台签名产物并生成 `latest.json`。更新包必须通过 Tauri updater 公钥校验，不能关闭签名验证。GitHub Release 必须是非草稿、非 prerelease，才能被 `/releases/latest/` 稳定发现。

## 首次启用更新签名

密钥属于发布敏感凭据，必须由仓库维护者在安全设备上生成并备份；不要把私钥、密码或 `.env` 提交到仓库。

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.tauri" | Out-Null
npx tauri signer generate -w "$env:USERPROFILE\.tauri\tiny-note.key"
```

把生成结果配置到 GitHub Actions Secrets：

- `TAURI_SIGNING_PRIVATE_KEY`：`tiny-note.key` 私钥文件的完整内容。
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：生成密钥时输入的密码。
- `TAURI_UPDATER_PUBKEY`：`tiny-note.key.pub` 的完整内容；公钥本身可公开，但流水线统一从 Secret 注入。

私钥一旦用于首个正式版本，就必须长期安全保留。丢失私钥后，已安装的旧版本无法信任用新密钥签发的更新。

## macOS 正式签名与公证

未配置 Apple 凭据时，当前 `signingIdentity: "-"` 只做 ad-hoc 签名，适合内部验证，不等同于 Developer ID 签名和 notarization。公开分发前配置：

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

Windows updater 签名只保证 Tiny Note 校验更新来源；若要避免 SmartScreen 未知发布者提示，仍需另行配置 Authenticode 代码签名证书。

## 发布步骤

1. 同步修改 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 的 SemVer。
2. 本地运行 `node scripts/check-release-version.mjs` 和相关验证。
3. 创建并 push 完全匹配的 tag，例如 `tiny-note-v0.2.0`。
4. 等待四个 release matrix job 完成，确认 Release 包含各平台安装包、`.sig` 文件和 `latest.json`。
5. 从上一版本安装包中执行一次真实“检查更新 → 下载 → 安装 → 重启”验收。没有这一步证据时，不应把在线升级标记为生产验证完成。

## Linux CI 依赖

Ubuntu runner 需要 `libwebkit2gtk-4.1-dev`、GTK、AppIndicator、`librsvg2-dev`、`patchelf` 和 `xdg-utils`。本地 Linux 构建也需要安装相同依赖。
