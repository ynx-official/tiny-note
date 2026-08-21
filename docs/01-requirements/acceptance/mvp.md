# MVP 验收标准（Approved）

最后更新：2026-08-21

- Given 首次启动，When 创建笔记并输入内容，Then 800ms 内重启后可恢复标题和正文。
- Given 笔记已删除，When 在最近删除选择恢复，Then 笔记回到原笔记本；超过 30 天的记录不再显示。
- Given 知识库根目录，When 请求 `../` 或符号链接越界路径，Then Rust 返回稳定错误码。
- Given 同名导入，When 未指定替换，Then 原文件保留且新文件使用冲突后缀。
- Given HTML/Markdown 预览，When 内容含脚本，Then 预览 DOM 不执行脚本。
- Given FIM 未开启，When 光标停顿 2 秒，Then 不发起网络请求。
- Given 模型请求取消，When 点击停止，Then 前端收到 `cancelled` 且不插入半截结果。
- Given 打开任意文章，When 未主动选择模式，Then 文章处于富文本模式；切换文章后再次回到富文本。
- Given 进入源码模式，When 修改 Markdown，Then 150ms 后预览、HTML 和纯文本同步，并在 800ms 自动保存中原样保留源码换行。
- Given 进入源码 + 预览，When 拖动分隔条或滚动任一栏，Then 比例始终处于 30%–70%，另一栏按滚动百分比联动；窄宽度使用上下布局。
- Given 进入阅读模式，When 查看标题和正文，Then 两者不可修改但可选择复制，格式工具、Bubble Menu 和 FIM 不显示。
- Given 源码包含脚本、事件属性、危险 URL 或非白名单样式，When 生成预览，Then 原始源码可保留，但持久化 HTML 不包含可执行内容。
- Given AI 提供全文替换，When 用户在任意模式应用替换，Then 三种内容表示同步且模式不变；非富文本模式的“应用插入”不可用。
