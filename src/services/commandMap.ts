import type {
  AgentRun, AgentSkill, AgentTool, AppSettings, BackgroundTask, CalendarEvent,
  ChatConversation, ChatMessage, ChatThread, EditProposal, ExportWriteResult,
  ExternalMarkdownFile, ExternalMarkdownSelection, ExternalMarkdownSource, ImageAsset, ImageGeneration,
  JsonValue, KnowledgeBase, LibraryEntry, LibraryPreview, McpServer, MemoryFile,
  ModelOption, ModelProfile, ModelTestResult, Note, Notebook, NoteLink,
  NoteTemplate, Reminder, Tag, Todo, TodoList, UpdateInfo, UsageStats
} from '../types/domain'
import type { Channel } from '@tauri-apps/api/core'

export interface CommandDefinition<Args extends object, Result> { args: Args; result: Result }
type Command<Args extends object, Result = void> = CommandDefinition<Args, Result>
export type NoCommandArgs = Record<string, never>
type NoArgs<Result = void> = Command<NoCommandArgs, Result>
type IdArgs = { id: string }
type JsonObject = { [key: string]: JsonValue }
type CommandChannel = Channel<never>

export interface ModelFetchRequest { provider: string; profileId: string | null; baseUrl: string; apiKey: string | null; endpointType: string }
export interface BalanceData { supported: boolean; available: boolean | null; currency: string | null; totalBalance: number; grantedBalance: number; toppedUpBalance: number; voucherBalance: number; cashBalance: number; updatedAt: string }
export interface BackgroundTaskFilter { statuses: string[]; kinds: string[] }
export interface BackgroundTaskTransition { id: string; status: string; outputDelta?: string | null; result?: JsonValue | null; errorCode?: string | null; errorMessage?: string | null; agentRunId?: string | null }
export interface ImageInput { name: string; mimeType: string; dataUrl: string }
export interface ImageGenerateRequest { requestId: string; imageModelProfileId: string; prompt: string; size: string; count: number; mode?: string; inputImages?: ImageInput[]; maskImage?: ImageInput | null }
export interface ImageGenerateResult { generationId: string; assets: ImageAsset[]; usage: JsonValue | null }
export interface ChatReferenceInput { key: string; type: string; name: string; noteId?: string; knowledgeBaseId?: string | null; baseId?: string | null; baseName?: string; relativePath?: string }
export interface ChatAddMessage { conversationId: string; role: string; content: string; references?: ChatReferenceInput[]; sources?: JsonValue[]; proposalId?: string | null; agentRunId?: string | null }
export interface AgentInvokeRequest { requestId: string; conversationId: string; message: string; modelProfileId: string | null; thinkingMode: string | null; references: JsonValue[] }
export interface AgentResumeRequest { runId: string; toolCallId: string; approvalHash: string; decision: string; reason: string | null }
export interface AgentInputResponseRequest { runId: string; toolCallId: string; inputHash: string; outcome: string; selectedOptionId?: string | null; otherText?: string | null }
export interface McpServerRequest { id: string; name: string; command: string; args: string[]; enabled: boolean }
export interface AiRequest { requestId: string; action: string; text: string; instruction: string | null; modelProfileId: string | null; thinkingMode?: string | null; source?: string | null; conversationId?: string | null; mode?: string | null; references?: JsonValue[]; targetNoteId?: string | null; selection?: JsonObject | null; targetLanguage?: string | null }
export interface ExportWriteRequest { directory: string; fileName: string; contentBase64: string }

export interface CommandMap {
  settings_get: NoArgs<AppSettings>
  settings_update: Command<{ settings: Partial<AppSettings> }, AppSettings>
  model_list: NoArgs<ModelProfile[]>
  model_upsert: Command<{ profile: ModelProfile; apiKey: string | null }, ModelProfile>
  model_delete: Command<IdArgs>
  model_fetch_models: Command<{ request: ModelFetchRequest }, ModelOption[]>
  model_test: Command<{ modelId: string }, ModelTestResult>
  model_query_balance: Command<{ modelId: string }, BalanceData>

  note_list: Command<{ search?: string | null; deleted?: boolean; pinned?: boolean | null; knowledgeBaseId?: string | null }, Note[]>
  note_get: Command<IdArgs, Note | null>
  note_create: Command<{ input: Partial<Note> }, Note>
  note_update: Command<IdArgs & { input: Partial<Note> }, Note>
  note_copy: Command<IdArgs, Note>
  note_delete: Command<IdArgs>
  note_purge: Command<IdArgs>
  note_purge_expired: NoArgs<number>
  note_restore: Command<IdArgs>
  note_set_pinned: Command<IdArgs & { pinned: boolean }, Note>
  note_move: Command<IdArgs & { notebookId: string | null }>
  note_move_to_knowledge_base: Command<IdArgs & { knowledgeBaseId: string | null }, Note>
  note_open_external_markdown: Command<{ input: Partial<Note> & { path: string } }, Note>
  note_template_list: NoArgs<NoteTemplate[]>
  note_template_upsert: Command<{ template: Partial<NoteTemplate> }, NoteTemplate>
  note_template_delete: Command<IdArgs>
  note_link_list: Command<{ noteId: string }, NoteLink[]>
  note_revision_list: Command<{ noteId: string }, JsonValue[]>
  note_revision_get: Command<IdArgs, JsonValue | null>
  note_revision_restore: Command<IdArgs, Note>
  note_edit_get: Command<{ proposalId: string }, EditProposal | null>
  note_edit_apply: Command<{ proposalId: string; replacementHtml?: string; replacementText?: string; replacementMarkdown?: string; expectedUpdatedAt?: string; action?: string; contentHtml?: string; contentText?: string; contentMarkdown?: string }, Note>
  note_edit_discard: Command<{ proposalId: string }>

  notebook_list: NoArgs<Notebook[]>
  notebook_create: Command<{ name: string; description: string; parentId: string | null }, Notebook>
  notebook_update: Command<IdArgs & { name: string; description: string; parentId: string | null }, Notebook>
  notebook_move: Command<IdArgs & { parentId: string | null }, Notebook>
  notebook_delete: Command<IdArgs>
  tag_list: NoArgs<Tag[]>
  tag_create: Command<{ name: string }, Tag>
  tag_update: Command<IdArgs & { name: string }, Tag>
  tag_delete: Command<IdArgs>
  note_tag_list: Command<{ noteId: string }, Tag[]>
  tag_note_list: Command<{ tagId: string | null; untagged: boolean }, Note[]>
  tag_note_add: Command<{ tagId: string; noteIds: string[] }>
  tag_note_remove: Command<{ tagId: string; noteIds: string[] }>

  external_markdown_list: NoArgs<ExternalMarkdownSource[]>
  external_markdown_read: Command<IdArgs, ExternalMarkdownFile>
  external_markdown_pick_files: NoArgs<ExternalMarkdownSelection>
  external_markdown_pick_folder: NoArgs<ExternalMarkdownSelection>
  external_markdown_remove: Command<IdArgs>
  external_markdown_clear: NoArgs<number>
  app_take_pending_markdown_files: NoArgs<ExternalMarkdownFile[]>
  knowledge_base_list: NoArgs<KnowledgeBase[]>
  knowledge_base_create: Command<{ input: Pick<KnowledgeBase, 'name' | 'category'> & Partial<KnowledgeBase> }, KnowledgeBase>
  knowledge_base_update: Command<IdArgs & Pick<KnowledgeBase, 'name' | 'description' | 'cover'>, KnowledgeBase>
  knowledge_base_delete: Command<IdArgs>
  library_list: Command<{ knowledgeBaseId: string; relativePath: string; search?: string | null }, LibraryEntry[]>
  library_preview: Command<{ knowledgeBaseId: string | null; relativePath: string }, LibraryPreview>
  library_create_folder: Command<{ knowledgeBaseId: string | null; relativePath: string; name: string }>
  library_import_url: Command<{ knowledgeBaseId: string | null; relativePath: string | null; url: string }, LibraryEntry>
  library_move_to_trash: Command<{ knowledgeBaseId: string | null; relativePath: string }>
  library_rename: Command<{ knowledgeBaseId: string | null; relativePath: string; newName: string }>
  library_write_file: Command<{ knowledgeBaseId: string | null; relativePath: string; content: string }, LibraryEntry>
  library_write_file_bytes: Command<{ knowledgeBaseId: string | null; relativePath: string; content: number[] }, LibraryEntry>

  calendar_event_list: Command<{ start?: string; end?: string }, CalendarEvent[]>
  calendar_event_get: Command<IdArgs, CalendarEvent | null>
  calendar_event_create: Command<{ input: Omit<Partial<CalendarEvent>, 'reminder'> & { reminder?: Partial<Reminder> | null } }, CalendarEvent>
  calendar_event_update: Command<IdArgs & { input: Omit<Partial<CalendarEvent>, 'reminder'> & { reminder?: Partial<Reminder> | null } }, CalendarEvent>
  calendar_event_delete: Command<IdArgs>
  todo_list: NoArgs<Todo[]>
  todo_get: Command<IdArgs, Todo | null>
  todo_create: Command<{ input: Omit<Partial<Todo>, 'reminder'> & { reminder?: Partial<Reminder> | null } }, Todo>
  todo_update: Command<IdArgs & { input: Omit<Partial<Todo>, 'reminder'> & { reminder?: Partial<Reminder> | null } }, Todo>
  todo_set_completed: Command<IdArgs & { completed: boolean }, Todo>
  todo_delete: Command<IdArgs>
  todo_custom_list_list: NoArgs<TodoList[]>
  todo_custom_list_create: Command<{ input: Partial<TodoList> }, TodoList>
  todo_custom_list_update: Command<IdArgs & { input: Partial<TodoList> }, TodoList>
  todo_custom_list_delete: Command<IdArgs>
  reminder_stop: Command<{ ownerType: string; ownerId: string }>

  background_task_list: Command<{ filter?: BackgroundTaskFilter | null }, BackgroundTask[]>
  background_task_get: Command<IdArgs, BackgroundTask | null>
  background_task_enqueue: Command<{ input: Partial<BackgroundTask> }, BackgroundTask>
  background_task_transition: Command<{ input: BackgroundTaskTransition }, BackgroundTask>
  background_task_retry: Command<IdArgs, BackgroundTask>
  background_task_cancel: Command<IdArgs, BackgroundTask>
  background_task_clear_finished: NoArgs<number>
  image_model_list: NoArgs<ModelProfile[]>
  image_generation_list: Command<{ limit?: number }, ImageGeneration[]>
  image_generation_delete: Command<{ generationId: string }>
  image_generate: Command<{ request: ImageGenerateRequest }, ImageGenerateResult>
  image_asset_read: Command<{ assetId: string }, ImageAsset>

  chat_list: NoArgs<ChatConversation[]>
  chat_get: Command<IdArgs, ChatThread>
  chat_create: Command<{ modelProfileId?: string | null; mode?: string }, ChatConversation>
  chat_delete: Command<IdArgs>
  chat_set_mode: Command<IdArgs & { mode: string }, ChatConversation>
  chat_add_message: Command<ChatAddMessage, ChatMessage>
  chat_generate_title: Command<{ conversationId: string; modelProfileId?: string | null }, string>
  agent_list_tools: NoArgs<AgentTool[]>
  agent_tool_policy_update: Command<{ request: { toolNames: string[]; requireApproval?: boolean | null } }, AgentTool[]>
  agent_invoke: Command<{ request: AgentInvokeRequest; onEvent: CommandChannel }, AgentRun>
  agent_resume: Command<{ request: AgentResumeRequest; onEvent: CommandChannel }, AgentRun>
  agent_get_run: Command<{ runId: string | null }, AgentRun>
  agent_get_pending_run: Command<{ conversationId?: string }, AgentRun | null>
  agent_respond_input: Command<{ request: AgentInputResponseRequest; onEvent: CommandChannel }, AgentRun>
  agent_cancel: Command<IdArgs>

  agent_mcp_list: NoArgs<McpServer[]>
  agent_mcp_upsert: Command<{ request: McpServerRequest }, McpServer>
  agent_mcp_delete: Command<IdArgs>
  agent_mcp_refresh: Command<IdArgs, McpServer>
  agent_skill_list: NoArgs<AgentSkill[]>
  agent_skill_read: Command<{ name: string }, AgentSkill>
  agent_skill_upsert: Command<{ request: { name: string; content: string } }, AgentSkill>
  agent_skill_delete: Command<{ name: string }>
  memory_list: NoArgs<MemoryFile[]>
  memory_update: Command<{ fileName: string; content: string }, MemoryFile>
  usage_get_stats: Command<{ range: string }, UsageStats>
  usage_clear: NoArgs

  note_ai_stream: Command<{ request: AiRequest; onEvent: CommandChannel }, string>
  note_ai_cancel: Command<{ requestId: string }>
  note_fim_stream: Command<{ request: AiRequest; onEvent: CommandChannel }, string>
  image_cancel: Command<{ requestId: string }>
  workspace_export: NoArgs<JsonValue>
  workspace_import: Command<{ request: { backup: JsonValue; replaceExisting: boolean } }>
  export_write_file: Command<{ request: ExportWriteRequest }, ExportWriteResult>
  export_open_file: Command<{ path: string }>
  export_reveal_file: Command<{ path: string }>
  app_update_check: NoArgs<UpdateInfo>
  app_update_download: Command<{ assetName?: string; version?: string }>
  tray_open_main: Command<{ route?: string }>
}

export type CommandName = keyof CommandMap
export type CommandArgs<K extends CommandName> = CommandMap[K]['args']
export type CommandResult<K extends CommandName> = CommandMap[K]['result']
