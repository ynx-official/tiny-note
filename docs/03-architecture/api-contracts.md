# 命令契约（Draft）

最后更新：2026-08-28

所有 DTO 使用 camelCase。成功返回结构化 JSON，失败返回 `{ code, message }`；`message` 不包含系统路径、密钥或原始网络响应。

命令组：`note_*`、`notebook_*`、`knowledge_base_*`、`library_*`、`model_*`、`settings_*`、`note_ai_stream/cancel`、`note_fim_stream/cancel`。路径命令只接受 `knowledgeBaseId + relativePath`。文件导入区分文本与二进制：`library_write_file_bytes` 接收字节数组，图片返回安全的 data URI 预览，PDF/EPUB 保存但明确标记为暂不支持预览；`library_import_url` 只允许 HTTP/HTTPS，响应体上限 5MB。系统文件打开由 Rust 暂存启动参数或 macOS URL，`app_take_pending_markdown_files` 一次性返回经过规范化的 `{ path, fileName, content, error, changed }` 并把该路径加入单次授权；`external_markdown_pick_files` 通过原生文件选择器多选 Markdown，`external_markdown_pick_folder` 通过原生目录选择器递归扫描 `.md/.markdown` 且不跟随符号链接，两者返回 `{ selected, files }` 并仅授权选择器或递归扫描得到的规范化路径，前端不得传入任意路径；`note_open_external_markdown` 只接受此次授权路径及与磁盘一致的 Markdown/安全 HTML/纯文本，同一路径只绑定一条临时记录，并在磁盘 MD5 未变化时保留 SQLite 缓存、变化时刷新三种内容表示。`external_markdown_list` 返回独立历史；`external_markdown_read` 返回 `{ path, fileName, content, error, changed }`，MD5 相同时 `changed=false, content=null`，前端随后通过 `note_get` 激活缓存，变化时返回磁盘正文并生成一次打开授权；`external_markdown_remove(id)` 只删除单条绑定及关联临时笔记，`external_markdown_clear` 删除全部临时记录，两者均不接触源文件。`note_list`、Agent 普通笔记列表/搜索、标签列表、双向链接和工作区导出均排除带外部源绑定的记录；前端显式“导入到笔记”通过 `note_create` 创建独立副本并切换路由。后续对临时文档执行 `note_update`、AI 应用和版本恢复时，写入前校验源文件 MD5，冲突返回 `external_file_changed`，不覆盖磁盘内容。

模型命令：`model_list/upsert/delete/fetch_models/test/query_balance`。`model_upsert` 接收共享的 `providerId`、`connectionName`、厂商连接字段和单个模型字段；多个模型使用同一 `providerId` 时只维护一份 Base URL、API Key 与端点协议。`endpointType` 必须是 `openaiChat`、`openaiResponses` 或 `anthropicMessages`；列表返回展开后的连接字段供既有模型调用，同时返回 `providerId` 与 `connectionName` 供设置页分组。编辑表单不接收明文旧 Key：`model_fetch_models` 可接收任一子模型的 `profileId`，当 `apiKey` 为空时由 Rust 从关联连接读取已保存 Key；`model_upsert` 同样在空 Key 时保留连接原值，只有非空新值才替换。`model_test` 只接收模型配置 ID，由 Rust 使用连接的已保存 Key 按端点协议发起带 30 秒超时的低输出连接测试，前端不会取得明文凭据。Rust 分别使用 `/chat/completions` + Bearer、`/responses` + Bearer、`/messages` + `x-api-key`/`anthropic-version`，并按协议转换普通文本、流式内容、用量及 Agent 工具调用。未携带 `providerId` 的旧客户端请求会自动创建独立连接，未携带端点类型时按 `openaiChat` 处理。

后台任务命令：`background_task_enqueue/list/get/transition/cancel/retry/clear_finished`。`enqueue` 的 `kind` 仅为 `conversation_summary` 或 `note_ai`；普通对话继续使用页面内 `note_ai_stream`，Tiny Agent 使用页面内 `agent_invoke`，两者都不创建任务中心记录。任务输入只引用模型配置 ID，不接受名称包含 api-key、token、password 或 secret 的字段。`transition` 校验状态机并追加流式输出；`retry` 只接受失败、取消或中断任务并创建带 `retryOf` 的新尝试；启动时自动清理超过 30 天的终态记录，`clear_finished` 立即清理全部终态记录。

Agent 命令：`agent_invoke`、`agent_resume`、`agent_respond_input`、`agent_cancel`、`agent_get_run`、`agent_get_pending_run`、`agent_list_tools`、`agent_tool_policy_update`。`request_user_input` 接受标题、问题、2–4 个带稳定语义 ID 的互斥选项、至多一个推荐项和 `allowOther`；它不进入危险操作审批，而是把运行置为 `awaiting_input` 并发出 `inputRequired`。`agent_respond_input` 使用 `runId`、`toolCallId` 与内容哈希绑定当前请求，接受 `answered`、`skipped` 或 `cancelled`，防止旧卡片重复或错位提交。工具调用预算以 12 个模型回合为一批；一批耗尽后运行进入可恢复的 `awaiting_input`，展示“继续执行”和“终止任务”。继续会保留上下文并追加 12 个工具回合，终止、跳过或取消选择会结束当前运行；该选择与普通输入请求一样持久化，应用重启后仍可回答。`agent_list_tools` 是设置页“工具与权限”和对话页能力摘要的权威来源，返回技术名称、说明、`defaultRequireApproval` 和当前生效的 `requireApproval`。`agent_tool_policy_update` 接受 `toolNames` 与 `requireApproval`：布尔值用于单个或按业务分类批量覆盖，`null` 删除覆盖并恢复系统默认；未知工具会使整批请求失败。

笔记工具覆盖 `list_notes`、`search_notes`、`get_note`、`create_note`、`create_note_in_knowledge_base`、`move_note_to_knowledge_base`、`update_note` 和 `delete_note`。`list_notes(notebookId?,limit?,offset?)` 返回总数、分页状态、ID、标题、笔记本元数据、更新时间和摘要；`search_notes(query?,notebookId?,limit?)` 的空查询或集合泛词回退列表，其他查询先完整匹配、再按规范化中英文和数字关键词宽松匹配，标题优先于正文。两者都排除外部来源与最近删除。`get_note` 返回完整 `contentMarkdown`、纯文本、标题和笔记本元数据。`create_note` 标题最多 50 个字符，未指定笔记本时归入“未分类”；更新只生成待审阅提案，删除只移入最近删除。三个读取工具默认无需审批，写操作默认逐次审批。

笔记本工具覆盖 `list_notebooks`、`create_notebook`、`update_notebook`、`move_notebook` 和 `delete_notebook`。列表返回父级、说明、直属笔记/子笔记本数量和系统标记；更新不隐式移动，移动支持 `parentId=null` 根级并拒绝自身/后代循环。“未分类”不可修改、移动或删除。删除普通笔记本时，直属笔记移到“未分类”，子笔记本提升到被删节点父级并返回影响数量。列表默认无需审批，其余默认逐次审批。知识库工具只覆盖 `create_knowledge_base`、`list_knowledge_bases`、`update_knowledge_base` 和 `delete_knowledge_base`；列表不返回索引统计，删除将 Tiny Note 受管目录移入系统回收站。流事件包括 `started`、`textDelta`、`reasoningDelta`、`toolCall`、`approvalRequired`、`inputRequired`、`toolResult`、`sources`、`editProposal`、`completed`、`cancelled` 和 `error`。

Skills 命令：`agent_skill_list`、`agent_skill_read`、`agent_skill_upsert`、`agent_skill_delete`。列表只返回名称、描述、文件名、内置标记和更新时间；完整 `SKILL.md` 通过读取命令按需加载。内置 `knowledge-research`、`note-organizer` 与 `notebook-manager` 分别管理知识库元数据、普通笔记和笔记本；版本升级只替换内容完全等于历史模板的文件，不覆盖用户编辑。

MCP 命令：`agent_mcp_list`、`agent_mcp_upsert`、`agent_mcp_delete`、`agent_mcp_refresh`。`refresh` 通过 stdio 完成 initialize 与 tools/list，并缓存工具清单；Agent 通过 `list_mcp_tools` 和 `call_mcp_tool` 两个网关工具访问，实际调用遵循当前 `call_mcp_tool` 审批策略。

高级 Agent 工具：`delegate_task` 使用当前模型执行无工具权限的隔离子任务；`run_sandbox_script` 在资源受限的 Rhai 引擎中执行纯计算。两者默认进入持久化审批，也允许用户通过正式权限入口覆盖。

AI 上下文：请求可携带 `mode`、结构化 `references`、`targetNoteId` 和 `selection`，不再接受 `scope` 或 `autoRetrieve`。只有本轮明确选择的 `references` 被直接读取并标记为不可信参考，不能扩展检索其他笔记或文件；无引用时不读取本地内容。来源仍通过 `sources` 事件返回。`context_search`、`search_index_status/rebuild/retry_failed` 已移除。

知识库文件列表的 `LibraryEntryDto` 仅返回名称、相对路径、类型、大小、扩展名和修改时间，不再包含 `indexStatus`。

笔记 DTO：`NoteDto.contentMarkdown` 与 `pinned` 始终存在，标签不再嵌入 `NoteDto`。`note_create` 可接收 `contentMarkdown` 与 `pinned`；`note_update` 必须同时接收 `contentMarkdown`、`contentHtml`、`contentText` 和 `pinned`。`note_set_pinned`、`note_link_list`、`note_template_list/upsert/delete` 提供置顶、双向链接和模板能力。复制、Markdown/TXT 导入、浏览器适配层和 Agent `create_note` 维持相同三表示契约。

笔记本命令：`notebook_list/create/update/move/delete`。`NotebookDto` 增加 `parentId`；创建、更新和移动接受可空 `parentId`，Rust 拒绝自身/后代循环。删除普通笔记本会在单一事务中把直接子笔记本提升到上一级、把直属笔记移到“未分类”；“未分类”不可重命名、移动或删除。

标签命令：`tag_list/create/update/delete`、`note_tag_list`、`tag_note_list`、`tag_note_add/remove`。`TagDto` 返回 `id/name/noteCount/createdAt/updatedAt`；批量添加或移除接收 `tagId + noteIds`。删除标签只级联删除关系，不删除笔记；`tag_note_list(untagged=true)` 提供“未添加标签”虚拟筛选。

工作区命令：`workspace_export` 返回 `format=tiny-note-workspace`、`version=3` 的可迁移备份，包含 `tags`、`noteTags` 和笔记本 `parentId`；`workspace_import` 接受 v1/v2/v3 备份和 `replaceExisting=true`，旧版本的笔记标签数组会规范化迁移。只在明确确认后执行全量替换，不执行索引重建。备份不包含模型 API Key。

安全编辑：`note_edit_get/apply/discard`、`note_revision_list/get/restore`。`note_edit_apply` 接受提案 ID、期望更新时间及编辑器生成的最终 Markdown/HTML/纯文本；Rust 校验提案、版本和内容哈希后，在同一事务写入带三种表示的旧版本并更新笔记。版本列表与恢复 DTO 也始终返回 `contentMarkdown`。
