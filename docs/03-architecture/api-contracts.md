# 命令契约（Draft）

最后更新：2026-08-24

所有 DTO 使用 camelCase。成功返回结构化 JSON，失败返回 `{ code, message }`；`message` 不包含系统路径、密钥或原始网络响应。

命令组：`note_*`、`notebook_*`、`knowledge_base_*`、`library_*`、`model_*`、`settings_*`、`note_ai_stream/cancel`、`note_fim_stream/cancel`。路径命令只接受 `knowledgeBaseId + relativePath`。文件导入区分文本与二进制：`library_write_file_bytes` 接收字节数组，图片返回安全的 data URI 预览，PDF/EPUB 保存但明确标记为暂不支持预览/全文索引；`library_import_url` 只允许 HTTP/HTTPS，响应体上限 5MB。系统文件打开由 Rust 暂存启动参数或 macOS URL，再通过 `app_take_pending_markdown_files` 一次性返回 `{ fileName, content, error }`；只接受 `.md/.markdown`、UTF-8 和不超过 10 MB 的普通文件，不向前端暴露绝对路径。

模型命令：`model_list/upsert/delete/fetch_models/test/query_balance`。`model_upsert` 接收共享的 `providerId`、`connectionName`、厂商连接字段和单个模型字段；多个模型使用同一 `providerId` 时只维护一份 Base URL、API Key 与端点协议。`endpointType` 必须是 `openaiChat`、`openaiResponses` 或 `anthropicMessages`；列表返回展开后的连接字段供既有模型调用，同时返回 `providerId` 与 `connectionName` 供设置页分组。编辑表单不接收明文旧 Key：`model_fetch_models` 可接收任一子模型的 `profileId`，当 `apiKey` 为空时由 Rust 从关联连接读取已保存 Key；`model_upsert` 同样在空 Key 时保留连接原值，只有非空新值才替换。`model_test` 只接收模型配置 ID，由 Rust 使用连接的已保存 Key 按端点协议发起带 30 秒超时的低输出连接测试，前端不会取得明文凭据。Rust 分别使用 `/chat/completions` + Bearer、`/responses` + Bearer、`/messages` + `x-api-key`/`anthropic-version`，并按协议转换普通文本、流式内容、用量及 Agent 工具调用。未携带 `providerId` 的旧客户端请求会自动创建独立连接，未携带端点类型时按 `openaiChat` 处理。

后台任务命令：`background_task_enqueue/list/get/transition/cancel/retry/clear_finished`。`enqueue` 的 `kind` 仅为 `conversation_summary` 或 `note_ai`；普通对话继续使用页面内 `note_ai_stream`，Tiny Agent 使用页面内 `agent_invoke`，两者都不创建任务中心记录。任务输入只引用模型配置 ID，不接受名称包含 api-key、token、password 或 secret 的字段。`transition` 校验状态机并追加流式输出；`retry` 只接受失败、取消或中断任务并创建带 `retryOf` 的新尝试；启动时自动清理超过 30 天的终态记录，`clear_finished` 立即清理全部终态记录。

Agent 命令：`agent_invoke`、`agent_resume`、`agent_respond_input`、`agent_cancel`、`agent_get_run`、`agent_get_pending_run`、`agent_list_tools`、`agent_tool_policy_update`。`request_user_input` 接受标题、问题、2–4 个带稳定语义 ID 的互斥选项、至多一个推荐项和 `allowOther`；它不进入危险操作审批，而是把运行置为 `awaiting_input` 并发出 `inputRequired`。`agent_respond_input` 使用 `runId`、`toolCallId` 与内容哈希绑定当前请求，接受 `answered`、`skipped` 或 `cancelled`，防止旧卡片重复或错位提交。工具调用预算以 12 个模型回合为一批；一批耗尽后运行进入可恢复的 `awaiting_input`，展示“继续执行”和“终止任务”。继续会保留上下文并追加 12 个工具回合，终止、跳过或取消选择会结束当前运行；该选择与普通输入请求一样持久化，应用重启后仍可回答。`agent_list_tools` 是设置页“工具与权限”和对话页能力摘要的权威来源，返回技术名称、说明、`defaultRequireApproval` 和当前生效的 `requireApproval`。`agent_tool_policy_update` 接受 `toolNames` 与 `requireApproval`：布尔值用于单个或按业务分类批量覆盖，`null` 删除覆盖并恢复系统默认；未知工具会使整批请求失败。笔记工具覆盖 `create_note`、`create_note_in_knowledge_base`、`move_note_to_knowledge_base`、`search_notes`、`get_note`、`update_note` 和 `delete_note`。`create_note` 未指定笔记本时归入“未分类”；`create_note_in_knowledge_base` 同时创建笔记和 `.note` 引用；`move_note_to_knowledge_base` 只移动唯一引用，不改变正文或笔记本归属；更新只生成待审阅提案，删除只移入最近删除。知识库工具另覆盖 `create_knowledge_base`、`list_knowledge_bases`、`retrieve_knowledge`、`update_knowledge_base` 和 `delete_knowledge_base`；删除会移除数据库记录与索引，并将 Tiny Note 受管目录移入系统回收站。`list_knowledge_bases` 返回名称、分类、描述以及 indexed/failed/unsupported 文件统计。流事件包括 `started`、`textDelta`、`reasoningDelta`、`toolCall`、`approvalRequired`、`inputRequired`、`toolResult`、`sources`、`editProposal`、`completed`、`cancelled` 和 `error`。

Skills 命令：`agent_skill_list`、`agent_skill_read`、`agent_skill_upsert`、`agent_skill_delete`。列表只返回名称、描述、文件名、内置标记和更新时间；完整 `SKILL.md` 通过读取命令按需加载。内置 `knowledge-research` 与 `note-organizer` 明确记录 CRUD 意图到上述工具的映射；版本升级只替换内容完全等于历史模板的文件，不覆盖用户编辑。

MCP 命令：`agent_mcp_list`、`agent_mcp_upsert`、`agent_mcp_delete`、`agent_mcp_refresh`。`refresh` 通过 stdio 完成 initialize 与 tools/list，并缓存工具清单；Agent 通过 `list_mcp_tools` 和 `call_mcp_tool` 两个网关工具访问，实际调用遵循当前 `call_mcp_tool` 审批策略。

高级 Agent 工具：`delegate_task` 使用当前模型执行无工具权限的隔离子任务；`run_sandbox_script` 在资源受限的 Rhai 引擎中执行纯计算。两者默认进入持久化审批，也允许用户通过正式权限入口覆盖。

上下文与索引：`context_search`、`search_index_status/rebuild/retry_failed`。AI 请求可携带 `mode`、结构化 `references`、`scope`、`targetNoteId`、`selection` 和 `autoRetrieve`；流事件增加 `sources` 与 `editProposal`，旧事件保持兼容。

笔记 DTO：`NoteDto.contentMarkdown`、`tags`、`pinned` 始终存在。`note_create` 可接收 `contentMarkdown`、`tags`、`pinned`；`note_update` 必须同时接收 `contentMarkdown`、`contentHtml`、`contentText`、`tags` 和 `pinned`。`note_set_pinned`、`note_link_list`、`note_template_list/upsert/delete` 提供置顶、双向链接和模板能力。复制、Markdown/TXT 导入、浏览器适配层和 Agent `create_note` 维持相同三表示契约。

工作区命令：`workspace_export` 返回 `format=tiny-note-workspace`、`version=1` 的可迁移备份；`workspace_import` 接收备份和 `replaceExisting=true`，只在明确确认后执行全量替换，并重建知识库文件索引。备份不包含模型 API Key。

安全编辑：`note_edit_get/apply/discard`、`note_revision_list/get/restore`。`note_edit_apply` 接受提案 ID、期望更新时间及编辑器生成的最终 Markdown/HTML/纯文本；Rust 校验提案、版本和内容哈希后，在同一事务写入带三种表示的旧版本并更新笔记。版本列表与恢复 DTO 也始终返回 `contentMarkdown`。
