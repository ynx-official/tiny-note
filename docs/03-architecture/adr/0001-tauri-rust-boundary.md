# ADR 0001：Rust 作为唯一系统边界

状态：Approved

WebView 仅调用白名单 Tauri commands；SQLite、文件系统、系统回收站、凭据和网络请求均在 Rust 完成。这样可以把路径校验和秘密处理集中在一个边界，并避免前端获得任意文件读写权限。
