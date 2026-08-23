# 命令契约（Draft）

最后更新：2026-08-23

所有 DTO 使用 camelCase。成功返回结构化 JSON，失败返回 `{ code, message }`；`message` 不包含系统路径、密钥或原始网络响应。

命令组：`note_*`、`notebook_*`、`knowledge_base_*`、`library_*`、`model_*`、`settings_*`、`note_ai_stream/cancel`、`note_fim_stream/cancel`。路径命令只接受 `knowledgeBaseId + relativePath`。文件导入区分文本与二进制：`library_write_file_bytes` 接收字节数组，图片返回安全的 data URI 预览，PDF/EPUB 保存但明确标记为暂不支持预览/全文索引；`library_import_url` 只允许 HTTP/HTTPS，响应体上限 5MB。

Agent 命令：`agent_invoke`、`agent_resume`、`agent_cancel`、`agent_get_run`、`agent_get_pending_run`、`agent_list_tools`、`agent_tool_policy_update`。`agent_list_tools` 是设置页“工具与权限”和对话页能力摘要的权威来源，返回技术名称、说明、`defaultRequireApproval` 和当前生效的 `requireApproval`。`agent_tool_policy_update` 接受 `toolNames` 与 `requireApproval`：布尔值用于单个或按业务分类批量覆盖，`null` 删除覆盖并恢复系统默认；未知工具会使整批请求失败。笔记工具覆盖 `create_note`、`create_note_in_knowledge_base`、`move_note_to_knowledge_base`、`search_notes`、`get_note`、`update_note` 和 `delete_note`。`create_note` 未指定笔记本时归入“未分类”；`create_note_in_knowledge_base` 同时创建笔记和 `.note` 引用；`move_note_to_knowledge_base` 只移动唯一引用，不改变正文或笔记本归属；更新只生成待审阅提案，删除只移入最近删除。知识库工具另覆盖 `create_knowledge_base`、`list_knowledge_bases`、`retrieve_knowledge`、`update_knowledge_base` 和 `delete_knowledge_base`；删除会移除数据库记录与索引，并将 Tiny Note 受管目录移入系统回收站。`list_knowledge_bases` 返回名称、分类、描述以及 indexed/failed/unsupported 文件统计。流事件包括 `started`、`textDelta`、`reasoningDelta`、`toolCall`、`approvalRequired`、`toolResult`、`sources`、`editProposal`、`completed`、`cancelled` 和 `error`。

Skills 命令：`agent_skill_list`、`agent_skill_read`、`agent_skill_upsert`、`agent_skill_delete`。列表只返回名称、描述、文件名、内置标记和更新时间；完整 `SKILL.md` 通过读取命令按需加载。内置 `knowledge-research` 与 `note-organizer` 明确记录 CRUD 意图到上述工具的映射；版本升级只替换内容完全等于历史模板的文件，不覆盖用户编辑。

MCP 命令：`agent_mcp_list`、`agent_mcp_upsert`、`agent_mcp_delete`、`agent_mcp_refresh`。`refresh` 通过 stdio 完成 initialize 与 tools/list，并缓存工具清单；Agent 通过 `list_mcp_tools` 和 `call_mcp_tool` 两个网关工具访问，实际调用遵循当前 `call_mcp_tool` 审批策略。

高级 Agent 工具：`delegate_task` 使用当前模型执行无工具权限的隔离子任务；`run_sandbox_script` 在资源受限的 Rhai 引擎中执行纯计算。两者默认进入持久化审批，也允许用户通过正式权限入口覆盖。

上下文与索引：`context_search`、`search_index_status/rebuild/retry_failed`。AI 请求可携带 `mode`、结构化 `references`、`scope`、`targetNoteId`、`selection` 和 `autoRetrieve`；流事件增加 `sources` 与 `editProposal`，旧事件保持兼容。

笔记 DTO：`NoteDto.contentMarkdown`、`tags`、`pinned` 始终存在。`note_create` 可接收 `contentMarkdown`、`tags`、`pinned`；`note_update` 必须同时接收 `contentMarkdown`、`contentHtml`、`contentText`、`tags` 和 `pinned`。`note_set_pinned`、`note_link_list`、`note_template_list/upsert/delete` 提供置顶、双向链接和模板能力。复制、Markdown/TXT 导入、浏览器适配层和 Agent `create_note` 维持相同三表示契约。

工作区命令：`workspace_export` 返回 `format=tiny-note-workspace`、`version=1` 的可迁移备份；`workspace_import` 接收备份和 `replaceExisting=true`，只在明确确认后执行全量替换，并重建知识库文件索引。备份不包含模型 API Key。

安全编辑：`note_edit_get/apply/discard`、`note_revision_list/get/restore`。`note_edit_apply` 接受提案 ID、期望更新时间及编辑器生成的最终 Markdown/HTML/纯文本；Rust 校验提案、版本和内容哈希后，在同一事务写入带三种表示的旧版本并更新笔记。版本列表与恢复 DTO 也始终返回 `contentMarkdown`。
