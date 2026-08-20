# MVP 验收标准（Approved）

- Given 首次启动，When 创建笔记并输入内容，Then 800ms 内重启后可恢复标题和正文。
- Given 笔记已删除，When 在最近删除选择恢复，Then 笔记回到原笔记本；超过 30 天的记录不再显示。
- Given 知识库根目录，When 请求 `../` 或符号链接越界路径，Then Rust 返回稳定错误码。
- Given 同名导入，When 未指定替换，Then 原文件保留且新文件使用冲突后缀。
- Given HTML/Markdown 预览，When 内容含脚本，Then 预览 DOM 不执行脚本。
- Given FIM 未开启，When 光标停顿 2 秒，Then 不发起网络请求。
- Given 模型请求取消，When 点击停止，Then 前端收到 `cancelled` 且不插入半截结果。
