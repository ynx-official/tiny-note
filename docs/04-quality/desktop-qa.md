# 隔离桌面与真实浏览器验收

更新：2026-09-06。真实后端联调、原生桌面验收和安装升级分别记录，不能互相替代。

## 启动隔离环境

在后端仓库 `/Users/yunanxing/project/tiny-blog-go` 运行：

```sh
python3 scripts/tiny-note-e2e.py --desktop
```

脚本创建独立 MySQL、Redis、私有对象存储、两个 Go 实例和确定性测试 Provider，先执行接口验收，再输出 `desktop-session.json`。保持终端运行，结束后按 Enter 清理服务和容器卷。临时账号为 `tiny-note-e2e-a`，密码为 `tiny-note-test-only`，仅用于脚本创建的测试数据。已有 QA 包需要固定后端地址时可添加 `--desktop-port 60932`；若端口已被其他服务占用则退出，不复用或终止已有服务。

在前端仓库使用报告中的 `baseUrl` 打包，例如：

```sh
node scripts/build-desktop-qa.mjs http://127.0.0.1:60932
```

脚本只接受本机 HTTP 地址，输出 `build.json` 和临时目录中的 `Tiny Note QA.app`。应用标识为 `com.tinynote.qa`，隔离 WebView 数据、文件历史、单实例路由及系统凭据库；正式版继续使用 `com.tinynote.desktop`。QA 包不注册文件关联。打包会重建 Tauri 中间产物，交付正式包前仍需正式构建。

浏览器联调使用同一个后端：

```sh
VITE_API_BASE_URL=http://127.0.0.1:60932 npx vite --mode production --host 127.0.0.1 --port 1431
```

替换示例端口为当前报告值。隔离后端仅允许 `tauri://localhost`、`http://tauri.localhost` 和 `http://127.0.0.1:1431` 三个客户端来源。集成测试同时验证合法预检及未知来源拒绝。

## 本轮证据

- 真实浏览器连接隔离后端完成登录，未启用设备持久登录。
- 私有知识库文本展示英文和中文；图片实际解码为 640 × 360。
- 两页 PDF 使用真实对象存储原文件，完成第二页切换、150% 缩放及文字展开。
- 总结任务输出半截内容时，对浏览器连接中的后端执行 SIGKILL，重启后页面自动恢复；没有刷新页面或再次点击任务。任务最终变为已完成，输出精确为 `mock streamed response`，旧的 `stale partial` 已清除，列表仍为同一条任务。任务 ID 为 `7d60bf81-dc86-4409-927e-46b6eac503d8`，耗时 65 秒。
- QA 包和正式 Apple Silicon DMG 构建成功；Rust 11 个测试、fmt、clippy 全部通过。正式包仍为本机 ad-hoc 签名，未公证、安装或发布。
- 后端全量 test/vet、logic/mcpworker race 和本地 CI 等效接口、双实例崩溃恢复、并发、千篇/万篇分页验收通过。工作流尚未推送到 GitHub，远程 CI 尚未执行。

本轮日志：`/tmp/tiny-note-desktop-cors.log`、`/tmp/tiny-note-desktop-go.log`、`/tmp/tiny-note-ci-race.log`、`/tmp/tiny-note-ci-e2e.log`、`/tmp/tiny-note-qa-rust.log`、`/tmp/tiny-note-qa-production-rebuild.log`。完整 CI 等效证据目录：`/tmp/tiny-note-ci-evidence/tiny-note-e2e-30_adtrm`。临时文件可能被清理，发布前须在 CI 留存对应证据。

## 待验收与限制

- 原生控制权限现已开放，已在 QA 应用完成真实登录及 Finder 外部 Markdown 打开；文件完整写回、冲突和下载仍在继续验收。
- 外部 Markdown 原生打开、BOM/CRLF 写回、外部修改冲突及云端隔离需要在 QA 应用中验收。
- Tauri WebView 阅读、原生选择目录和下载落盘尚未验收。浏览器点击下载后未捕获下载完成事件，本轮不计为落盘通过；服务端原文件及越权用例已有接口证据。
- 千篇/万篇实际桌面延迟、RSS、四平台安装与上一版本升级仍待执行。
- 旧 SQLite 不读取、不迁移、不删除；旧版已上传的外部文件副本不自动删除。

## 恢复验收

此前因原生控制权限未开启而停止过隔离服务。权限开放后已重新建立隔离环境；旧报告中的临时端口、数据库和登录会话不能直接当作当前服务。恢复时重新运行后端 `--desktop`（已有 QA 包可指定 `--desktop-port`），按新报告连接 QA 应用。跨平台实际安装升级及远程 CI 证据仍须分别补齐。

## 原生实测发现的修正

- CodeMirror 提交 LF，旧写回命令原样写出，实际丢失源文件 CRLF。已改为按源文件首个换行恢复 LF/CRLF，并按实际落盘字节计算指纹及检查大小；BOM、权限、冲突检查保留。回归改为输入 LF 后断言 CRLF 字节，并验证重启后的重复保存指纹。
- 真实接口重跑发现正常 AI 生成路径漏存 `baseVersion`，同秒修改时可能通过时间戳回退检查。已补上冻结版本，集成测试显式检查字段；缺少有效版本的旧提案统一要求重新生成，不再用秒级时间戳证明内容未变。
- 本轮修正后的 Rust 测试/fmt/clippy、Go test/vet/race 已通过；重建后的原生交互和真实接口结果继续记录，不能以此前通过记录代替。
