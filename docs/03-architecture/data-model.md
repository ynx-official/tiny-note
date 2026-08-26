# 数据模型（Approved）

最后更新：2026-08-26

SQLite 核心表：`notebooks`、`notes`、`knowledge_bases`、`model_providers`、`model_profiles`、`settings`、`chat_conversations`、`chat_messages`。`notes.title` 是由正文首个非空内容行派生、最多 50 个字符的列表、搜索和文件名元数据，并随正文原子保存，不再由独立标题输入框维护。即时编辑的首块以 Friday 同构的 TipTap `noteTitle` 节点和 `data-note-title` 属性持久化；正文原子保存三种表示：`content_markdown` 是 Markdown 模式中的用户源码（即时编辑产生正文变更后可规范化为语义等价写法），`content_html` 是经过白名单清洗的 TipTap 渲染内容，`content_text` 是搜索与 AI 使用的纯文本。`notes.tags_json` 保存规范化的小写标签，`notes.is_pinned` 保存置顶状态；标签和置顶参与列表筛选及排序。旧库通过 `PRAGMA table_info` 检测后执行兼容迁移，Markdown 初始默认空字符串。

`note_revisions` 同样保存 `content_markdown`、`content_html` 和 `content_text`，因此 AI 应用前快照与版本恢复不会丢失源码。复制、导入、Agent 创建笔记及 AI 应用必须在一次逻辑操作中同步三种表示。旧记录保持可读，Markdown 在首次实际源码编辑或保存时延迟回填。

`external_markdown_sources` 以 `note_id` 一对一关联从系统打开的 Markdown，保存规范化绝对路径和上次同步内容的 SHA-256；路径唯一，避免同一源文件产生多个笔记记录。源路径属于设备本地状态，不进入工作区备份。保存时先比较当前磁盘哈希，匹配后以同目录临时文件原子替换并更新哈希；冲突、文件丢失、非 UTF-8 或超过 10 MB 时不得更新笔记持久状态或覆盖磁盘。

知识库文件保存在 app data 下的 `knowledge/<category>/<id>/`，隐藏 `.tiny-note.json` 记录稳定 ID 和类别。

AI 与检索表：`search_documents`、`search_chunks`、`search_chunks_fts`、`ai_edit_proposals`、`note_revisions`。FTS5 使用 trigram tokenizer；检索块用于匹配，`parent_content` 用于回填完整上下文。提案记录生成时的笔记时间戳和正文 SHA-256，应用时必须同时匹配；应用前在同一事务写入 `note_revisions`。

`chat_messages.references_json` 保存用户明确选择的引用，`sources_json` 保存本轮实际使用的来源元数据和内容哈希，均不重复保存完整文件正文；`proposal_id` 可关联待审阅的文章修改。

Agent 使用 `agent_runs` 保存每轮请求、模型、状态、循环次数、可恢复 continuation 和错误，运行状态包含与危险操作审批分离的 `awaiting_input`。`agent_steps` 按顺序保存文本、工具调用或结构化输入请求的参数、结果、内容哈希和状态，因此应用重启后仍可恢复待回答卡片，回答后则作为只读摘要保留。`agent_tool_policies` 只保存用户明确覆盖的工具审批值；缺少记录时使用 Rust 注册表中的系统默认值，恢复默认即删除覆盖记录。`chat_messages.agent_run_id` 将可见助手消息关联到审计时间线；`chat_conversations.mode` 持久化会话模式。

`background_tasks` 只保存对话总结和笔记 AI 的类型、状态、经校验的输入快照、增量输出、结构化结果、资源键、关联对象、重试来源和时间戳；普通对话与 Tiny Agent 均不写入该表。状态为 `queued/running/awaiting_approval/awaiting_input/succeeded/failed/cancelled/interrupted`。`started_at` 与 `completed_at` 分别记录每次尝试的实际开始和结束时间，执行耗时由两者计算；运行中的任务以当前时间动态计算，重试任务独立计时。模型凭据只通过 `model_profile_id` 间接引用，禁止写入任务 JSON；删除任务记录不级联删除业务结果。

Skills 不写入 SQLite，保存在应用数据目录的 `agent/SKILL/<skill-name>/SKILL.md`。启动时仅补齐缺失的内置技能，不覆盖用户已编辑内容。

MCP 服务配置保存在应用数据目录的 `agent/mcp.json`，包含直接启动命令、参数、启用状态和最近一次发现的工具清单；命令与参数分开存储，不经过 Shell 拼接。

模板保存在 `note_templates`，内置模板使用 `builtin=1` 并禁止删除，自定义模板可导入/导出。笔记间的 `[[笔记标题]]` 引用解析为 `note_links`，保存出链和入链，笔记正文或标题变化后同步重算。

工作区备份是版本化 JSON：笔记、笔记本、知识库元数据、知识库文件以 Base64 保存、模板、链接和界面设置均可恢复；模型 API Key、Agent 凭据和运行时缓存明确排除在备份之外。恢复是用户确认后的全量替换，并在完成后重建搜索索引。

模型服务采用一对多结构：`model_providers` 保存连接名称、厂商、Base URL、API Key 与端点协议，`model_profiles.provider_id` 关联其下的多个模型。端点协议白名单为 `openaiChat`、`openaiResponses`、`anthropicMessages`。旧的扁平模型记录会按“厂商 + Base URL + Key + 端点协议”无损归并，同一连接只保留一份凭据；旧配置默认 `openaiChat`，避免改变请求行为。模型列表 DTO 为兼容调用方返回展开后的连接元数据以及 `providerId`、`connectionName`、`apiKeyConfigured`，但不会返回明文 Key；Rust 请求层通过关联表直接读取。
