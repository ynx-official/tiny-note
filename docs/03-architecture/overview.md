# 架构概览

状态：Approved

Vue 3 负责页面与编辑器，Pinia 负责客户端状态；Tauri commands 是唯一的本地能力边界；Rust 模块负责 SQLite、路径校验、文件监听、回收站、模型请求和系统凭据；知识库文件以应用数据目录中的相对路径管理。
