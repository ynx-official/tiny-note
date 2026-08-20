# 构建说明（Draft）

Windows x64 使用 NSIS，macOS 使用 Intel 和 Apple Silicon DMG。首版不配置签名、公证和自动更新，仅供开发/内部测试。发布前需在目标 runner 配置证书和 notarization。

## Linux CI 依赖

GitHub Actions 的 Ubuntu 检查任务会先安装 Tauri 2 所需的 WebKit、GTK、GLib 和构建工具。直接在 Ubuntu runner 上运行 `cargo test` 或 `tauri build` 时，也需要安装同一组依赖；否则 `glib-sys` 会因找不到 `glib-2.0.pc` 而失败。

```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev libglib2.0-dev libgtk-3-dev \
  build-essential curl wget file libxdo-dev libssl-dev \
  libayatana-appindicator3-dev librsvg2-dev
```

Ubuntu 22.04 若没有 `libwebkit2gtk-4.1-dev`，使用 `libwebkit2gtk-4.0-dev`。
