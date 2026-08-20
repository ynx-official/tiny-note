# 假设与待验证项（Review）

- 首版单用户，不提供跨设备同步。
- PDF/EPUB/HTML/TXT/JSON/XML/Markdown/.note 由内置预览处理，Office 文件交给系统默认程序。
- WebView 浏览器测试可使用 mock invoke；桌面集成测试使用 Tauri WebDriver。
- macOS 构建需在 macOS runner 验证，当前 Windows 开发机不能声称已验证。
