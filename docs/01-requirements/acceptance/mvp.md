# MVP 验收标准（Approved）

最后更新：2026-08-24

- Given 首次启动，When 创建笔记并输入内容，Then 800ms 内重启后可恢复标题和正文。
- Given 笔记已删除，When 在最近删除选择恢复，Then 笔记回到原笔记本；超过 30 天的记录不再显示。
- Given 知识库根目录，When 请求 `../` 或符号链接越界路径，Then Rust 返回稳定错误码。
- Given 同名导入，When 未指定替换，Then 原文件保留且新文件使用冲突后缀。
- Given 已安装 Windows 或 macOS 版本，When 用户从 `.md/.markdown` 的打开方式选择 Tiny Note 或将其设为默认后双击文件，Then 应用被唤起、文件导入为本地笔记并进入编辑页；应用已运行时复用现有实例，原文件保持不变。
- Given HTML/Markdown 预览，When 内容含脚本，Then 预览 DOM 不执行脚本。
- Given FIM 未开启，When 光标停顿 2 秒，Then 不发起网络请求。
- Given 模型请求取消，When 点击停止，Then 前端收到 `cancelled` 且不插入半截结果。
- Given 首次打开文章编辑器，When 未主动选择模式，Then 文章处于即时编辑；选择 Markdown 后切换文章仍保持 Markdown 和当前预览布局。
- Given 使用即时编辑，When 输入 `# ` 等 Markdown 快捷语法或粘贴 Markdown，Then 内容立即以对应格式呈现；粘贴后可通过“查看源码”进入 Markdown。
- Given 进入 Markdown，When 修改源码，Then 150ms 后实时预览、HTML 和纯文本同步，并在 800ms 自动保存中原样保留源码换行；切回即时编辑后呈现同一内容。
- Given 正在 Markdown 源码中输入，When 内容短暂为空、只有 `1. ` 或只有 `> `，Then 不提示解析失败，源码仍按原文保存，后续继续输入时预览正常恢复。
- Given Markdown 实时预览已打开，When 拖动分隔条或滚动任一栏，Then 比例始终处于 30%–70%，另一栏按滚动百分比联动；窄宽度使用上下布局；关闭预览后只显示源码。
- Given 进入阅读模式，When 查看标题和正文，Then 两者不可修改但可选择复制，格式工具、Bubble Menu 和 FIM 不显示。
- Given 源码包含脚本、事件属性、危险 URL 或非白名单样式，When 生成预览，Then 原始源码可保留，但持久化 HTML 不包含可执行内容。
- Given 修改独立标题，When 切换任一模式或导出 Markdown，Then 标题保持保存且正文 Markdown 不被静默添加标题 H1。
- Given AI 提供全文替换，When 用户在任意模式应用替换，Then 三种内容表示同步且模式不变；非即时编辑模式的“应用插入”不可用。
- Given 对话或笔记 AI 正在生成，When 用户切换到其他 Tab 后再返回，Then 任务继续执行并从持久状态恢复进度和结果。
- Given 用户点击“总结为笔记”，When 后台任务成功，Then 只创建一篇基于点击时快照的笔记，原对话不新增总结问答消息。
- Given 应用在任务运行期间退出，When 再次启动，Then 任务显示为“已中断”且不会自动重复模型调用或写操作，用户可以手动重试。
- Given Agent 等待审批或结构化输入，When 用户仍在或重新打开原对话，Then 可以在对话时间线内处理请求并继续运行，任务中心中不出现该 Agent 对话。
- Given 任一后台任务已开始执行，When 用户查看任务中心，Then 运行中任务的执行时间逐秒更新，结束后保留该次尝试的最终耗时。
- Given 已存在模型服务，When 用户编辑连接名称、厂商、端点类型或 Base URL，Then 该连接下的模型共同使用更新后的连接信息，且空白 API Key 不覆盖已有凭据；原“其他”类型明确显示为“OpenAI 兼容服务”。
- Given 一个模型服务包含多个模型，When 用户查看模型设置，Then 界面只展示一个厂商连接卡片并在其下列出模型，不重复显示 Base URL 与凭据状态。
- Given 已存在带 Key 的模型配置，When 打开编辑页且不填写新 Key，Then 输入框保持空白并明确提示；获取模型列表和保存均由 Rust 使用原 Key，前端不会收到原 Key 明文。
- Given 模型选择 OpenAI Responses、OpenAI Chat 或 Anthropic，When 发起普通生成、Agent 或子 Agent 请求，Then Rust 使用对应的路径、认证头、请求体和流事件格式；旧配置继续使用 OpenAI Chat。
