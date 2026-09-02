import { apiRequest, ApiError } from './apiClient'
import type { CommandArgs, CommandName, CommandResult } from './commandMap'
import type { ModelProfile, Note } from '../types/domain'
import type { AgentRun, BackgroundTask } from '../types/domain'
import type { ImageAsset } from '../types/domain'
import type { EventChannel } from './eventChannel'
import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import type { ExternalMarkdownSource } from '../types/domain'

function query(values: Record<string, unknown>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  const result = params.toString()
  return result ? `?${result}` : ''
}

async function runAI(request: Record<string, unknown>, channel: EventChannel<unknown>, kind: string): Promise<string> {
  const requestId = String(request.requestId || crypto.randomUUID())
  await apiRequest<BackgroundTask>('/ai/runs', { method: 'POST', body: { ...request, requestId, kind } })
  await channel.connect(requestId)
  const task = await apiRequest<BackgroundTask | null>(`/tasks/${encodeURIComponent(requestId)}`)
  if (!task) throw new ApiError('task_not_found', 'AI 任务不存在', 404)
  if (task.status !== 'succeeded') throw new ApiError(task.errorCode || 'ai_request_failed', task.errorMessage || 'AI 任务执行失败', 500, task)
  return task.output || ''
}

async function runAgent(request: Record<string, unknown>, channel: EventChannel<unknown>): Promise<AgentRun> {
  const run = await apiRequest<AgentRun>('/agent/runs', { method: 'POST', body: request })
  await channel.connect(run.id)
  const completed = await apiRequest<AgentRun | null>(`/agent/runs/${encodeURIComponent(run.id)}`)
  if (!completed) throw new ApiError('agent_run_not_found', 'Agent 运行不存在', 404)
  return completed
}

function reconnectAgentStream(channel: EventChannel<unknown>, runId: string): void {
  void channel.connect(runId).catch(cause => {
    channel.emit({
      type: 'error',
      runId,
      message: cause instanceof Error ? cause.message : 'Agent 事件流连接失败'
    })
  })
}

async function readRemoteImageAsset(assetId: string): Promise<ImageAsset> {
  const asset = await apiRequest<ImageAsset & { downloadUrl: string }>(`/image-assets/${encodeURIComponent(assetId)}`)
  const response = await fetch(asset.downloadUrl)
  if (!response.ok) throw new ApiError('image_download_failed', '图片内容下载失败', response.status)
  const blob = await response.blob()
  const dataUri = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('图片内容读取失败'))
    reader.readAsDataURL(blob)
  })
  return { ...asset, dataUri }
}

function bytesToBase64(bytes: number[]): string {
  let binary = ''
  const values = Uint8Array.from(bytes)
  for (let offset = 0; offset < values.length; offset += 0x8000) binary += String.fromCharCode(...values.subarray(offset, offset + 0x8000))
  return btoa(binary)
}

function knowledgeBasePath(id: unknown): string {
  if (!id) throw new ApiError('knowledge_base_required', '请选择知识库', 400)
  return `/knowledge-bases/${encodeURIComponent(String(id))}/library`
}

async function openExternalMarkdown(input: Record<string, unknown>): Promise<Note> {
  if (!window.__TAURI_INTERNALS__) throw new ApiError('desktop_capability_required', '外部 Markdown 仅支持桌面应用', 400)
  const fingerprint = await tauriInvoke<string>('external_markdown_validate', { input })
  const sources = await tauriInvoke<ExternalMarkdownSource[]>('external_markdown_list')
  const source = sources.find(item => item.path === input.path)
  let note = source ? await apiRequest<Note | null>(`/notes/${encodeURIComponent(source.id)}`) : null
  if (note) {
    note = await apiRequest<Note>(`/notes/${encodeURIComponent(note.id)}`, { method: 'PUT', body: { ...input, path: undefined, version: note.version } })
  } else {
    note = await apiRequest<Note>('/notes', { method: 'POST', body: { ...input, path: undefined } })
  }
  await tauriInvoke('external_markdown_bind', { id: note.id, path: input.path, title: note.title, fingerprint })
  return note
}

export async function remoteInvoke<K extends CommandName>(command: K, args: CommandArgs<K>): Promise<CommandResult<K>> {
  // CommandMap validates the shape at every call site; the router intentionally
  // uses a dynamic record so a single exhaustive switch can bridge legacy names.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const input = args as Record<string, any>
  let result: unknown
  switch (command) {
    case 'settings_get': result = await apiRequest('/settings'); break
    case 'settings_update': result = await apiRequest('/settings', { method: 'PUT', body: input.settings }); break
    case 'model_list': result = await apiRequest('/models'); break
    case 'image_model_list': result = (await apiRequest<ModelProfile[]>('/models')).filter(model => model.imageEnabled); break
    case 'model_upsert': result = await apiRequest(`/models/${encodeURIComponent(input.profile.id)}`, { method: 'PUT', body: { ...input.profile, apiKey: input.apiKey } }); break
    case 'model_delete': result = await apiRequest(`/models/${encodeURIComponent(input.id)}`, { method: 'DELETE' }); break
    case 'model_fetch_models': result = await apiRequest('/models/discover', { method: 'POST', body: input.request }); break
    case 'model_test': result = await apiRequest(`/models/${encodeURIComponent(input.modelId)}/test`, { method: 'POST' }); break
    case 'model_query_balance': result = await apiRequest(`/models/${encodeURIComponent(input.modelId)}/balance`); break
    case 'note_list': result = await apiRequest(`/notes${query(input)}`); break
    case 'note_get': result = await apiRequest(`/notes/${encodeURIComponent(input.id)}`); break
    case 'note_create': result = await apiRequest('/notes', { method: 'POST', body: input.input }); break
    case 'note_update': result = await apiRequest(`/notes/${encodeURIComponent(input.id)}`, { method: 'PUT', body: input.input }); break
    case 'note_copy': result = await apiRequest(`/notes/${encodeURIComponent(input.id)}/copy`, { method: 'POST' }); break
    case 'note_delete': result = await apiRequest(`/notes/${encodeURIComponent(input.id)}${query({ version: input.version })}`, { method: 'DELETE' }); break
    case 'note_purge': result = await apiRequest(`/notes/${encodeURIComponent(input.id)}/purge`, { method: 'DELETE' }); break
    case 'note_purge_expired': result = await apiRequest('/notes/purge-expired', { method: 'DELETE' }); break
    case 'note_restore': result = await apiRequest(`/notes/${encodeURIComponent(input.id)}/restore`, { method: 'POST', body: { version: input.version } }); break
    case 'note_set_pinned': result = await apiRequest(`/notes/${encodeURIComponent(input.id)}`, { method: 'PUT', body: { version: input.version, pinned: input.pinned } }); break
    case 'note_move': result = await apiRequest(`/notes/${encodeURIComponent(input.id)}`, { method: 'PUT', body: { version: input.version, notebookId: input.notebookId } }); break
    case 'note_move_to_knowledge_base': result = await apiRequest(`/notes/${encodeURIComponent(input.id)}`, { method: 'PUT', body: { version: input.version, knowledgeBaseId: input.knowledgeBaseId } }); break
    case 'note_open_external_markdown': result = await openExternalMarkdown(input.input); break
    case 'note_template_list': result = await apiRequest('/note-templates'); break
    case 'note_template_upsert': { const id = input.template.id || crypto.randomUUID(); result = await apiRequest(`/note-templates/${encodeURIComponent(id)}`, { method: 'PUT', body: { ...input.template, id } }); break }
    case 'note_template_delete': result = await apiRequest(`/note-templates/${encodeURIComponent(input.id)}`, { method: 'DELETE' }); break
    case 'note_link_list': result = await apiRequest(`/notes/${encodeURIComponent(input.noteId)}/links`); break
    case 'note_revision_list': result = await apiRequest(`/notes/${encodeURIComponent(input.noteId)}/revisions`); break
    case 'note_revision_get': result = await apiRequest(`/note-revisions/${encodeURIComponent(input.id)}`); break
    case 'note_revision_restore': result = await apiRequest(`/note-revisions/${encodeURIComponent(input.id)}/restore`, { method: 'POST' }); break
    case 'note_edit_get': result = await apiRequest(`/edit-proposals/${encodeURIComponent(input.proposalId)}`); break
    case 'note_edit_apply': result = await apiRequest(`/edit-proposals/${encodeURIComponent(input.proposalId)}/apply`, { method: 'POST', body: input }); break
    case 'note_edit_discard': result = await apiRequest(`/edit-proposals/${encodeURIComponent(input.proposalId)}`, { method: 'DELETE' }); break
    case 'notebook_list': result = await apiRequest('/notebooks'); break
    case 'notebook_create': result = await apiRequest('/notebooks', { method: 'POST', body: input }); break
    case 'notebook_update': result = await apiRequest(`/notebooks/${encodeURIComponent(input.id)}`, { method: 'PUT', body: input }); break
    case 'notebook_move': result = await apiRequest(`/notebooks/${encodeURIComponent(input.id)}`, { method: 'PUT', body: input }); break
    case 'notebook_delete': result = await apiRequest(`/notebooks/${encodeURIComponent(input.id)}`, { method: 'DELETE' }); break
    case 'tag_list': result = await apiRequest('/tags'); break
    case 'tag_create': result = await apiRequest('/tags', { method: 'POST', body: input }); break
    case 'tag_update': result = await apiRequest(`/tags/${encodeURIComponent(input.id)}`, { method: 'PUT', body: { name: input.name, version: input.version } }); break
    case 'tag_delete': result = await apiRequest(`/tags/${encodeURIComponent(input.id)}`, { method: 'DELETE' }); break
    case 'note_tag_list': result = await apiRequest(`/notes/${encodeURIComponent(input.noteId)}/tags`); break
    case 'tag_note_list': result = await apiRequest(`/tags/notes${query(input)}`); break
    case 'tag_note_add': result = await apiRequest('/notes/tags', { method: 'POST', body: input }); break
    case 'tag_note_remove': result = await apiRequest('/notes/tags', { method: 'DELETE', body: input }); break
    case 'knowledge_base_list': result = await apiRequest('/knowledge-bases'); break
    case 'knowledge_base_create': result = await apiRequest('/knowledge-bases', { method: 'POST', body: input.input }); break
    case 'knowledge_base_update': result = await apiRequest(`/knowledge-bases/${encodeURIComponent(input.id)}`, { method: 'PUT', body: input }); break
    case 'knowledge_base_delete': result = await apiRequest(`/knowledge-bases/${encodeURIComponent(input.id)}${query({ version: input.version })}`, { method: 'DELETE' }); break
    case 'library_list': result = await apiRequest(`${knowledgeBasePath(input.knowledgeBaseId)}${query({ relativePath: input.relativePath, search: input.search })}`); break
    case 'library_preview': result = await apiRequest(`${knowledgeBasePath(input.knowledgeBaseId)}/preview${query({ relativePath: input.relativePath })}`); break
    case 'library_create_folder': result = await apiRequest(`${knowledgeBasePath(input.knowledgeBaseId)}/folders`, { method: 'POST', body: { relativePath: input.relativePath, name: input.name } }); break
    case 'library_import_url': result = await apiRequest(`${knowledgeBasePath(input.knowledgeBaseId)}/import-url`, { method: 'POST', body: { relativePath: input.relativePath, url: input.url } }); break
    case 'library_move_to_trash': result = await apiRequest(`${knowledgeBasePath(input.knowledgeBaseId)}/trash`, { method: 'POST', body: { relativePath: input.relativePath } }); break
    case 'library_rename': result = await apiRequest(`${knowledgeBasePath(input.knowledgeBaseId)}/rename`, { method: 'POST', body: { relativePath: input.relativePath, newName: input.newName } }); break
    case 'library_write_file': result = await apiRequest(`${knowledgeBasePath(input.knowledgeBaseId)}/files`, { method: 'PUT', body: { relativePath: input.relativePath, content: input.content } }); break
    case 'library_write_file_bytes': result = await apiRequest(`${knowledgeBasePath(input.knowledgeBaseId)}/files`, { method: 'PUT', body: { relativePath: input.relativePath, contentBase64: bytesToBase64(input.content) } }); break
    case 'workspace_export': result = await apiRequest('/workspace/export'); break
    case 'workspace_import': result = await apiRequest('/workspace/import', { method: 'POST', body: input.request }); break
    case 'todo_list': result = await apiRequest('/todos'); break
    case 'todo_get': result = await apiRequest(`/todos/${encodeURIComponent(input.id)}`); break
    case 'todo_create': result = await apiRequest('/todos', { method: 'POST', body: input.input }); break
    case 'todo_update': result = await apiRequest(`/todos/${encodeURIComponent(input.id)}`, { method: 'PUT', body: { ...input.input, version: input.version } }); break
    case 'todo_set_completed': result = await apiRequest(`/todos/${encodeURIComponent(input.id)}/completed`, { method: 'POST', body: { completed: input.completed, version: input.version } }); break
    case 'todo_delete': result = await apiRequest(`/todos/${encodeURIComponent(input.id)}`, { method: 'DELETE' }); break
    case 'todo_custom_list_list': result = await apiRequest('/todo-lists'); break
    case 'todo_custom_list_create': result = await apiRequest('/todo-lists', { method: 'POST', body: input.input }); break
    case 'todo_custom_list_update': result = await apiRequest(`/todo-lists/${encodeURIComponent(input.id)}`, { method: 'PUT', body: { ...input.input, version: input.version } }); break
    case 'todo_custom_list_delete': result = await apiRequest(`/todo-lists/${encodeURIComponent(input.id)}`, { method: 'DELETE' }); break
    case 'calendar_event_list': result = await apiRequest(`/calendar-events${query(input)}`); break
    case 'calendar_event_get': result = await apiRequest(`/calendar-events/${encodeURIComponent(input.id)}`); break
    case 'calendar_event_create': result = await apiRequest('/calendar-events', { method: 'POST', body: input.input }); break
    case 'calendar_event_update': result = await apiRequest(`/calendar-events/${encodeURIComponent(input.id)}`, { method: 'PUT', body: { ...input.input, version: input.version } }); break
    case 'calendar_event_delete': result = await apiRequest(`/calendar-events/${encodeURIComponent(input.id)}`, { method: 'DELETE' }); break
    case 'reminder_stop': result = await apiRequest(`/reminders/${encodeURIComponent(input.ownerType)}/${encodeURIComponent(input.ownerId)}/stop`, { method: 'POST' }); break
    case 'chat_list': result = await apiRequest('/chats'); break
    case 'chat_get': result = await apiRequest(`/chats/${encodeURIComponent(input.id)}`); break
    case 'chat_create': result = await apiRequest('/chats', { method: 'POST', body: input }); break
    case 'chat_delete': result = await apiRequest(`/chats/${encodeURIComponent(input.id)}`, { method: 'DELETE' }); break
    case 'chat_set_mode': result = await apiRequest(`/chats/${encodeURIComponent(input.id)}/mode`, { method: 'PUT', body: { mode: input.mode, version: input.version } }); break
    case 'chat_add_message': result = await apiRequest(`/chats/${encodeURIComponent(input.conversationId)}/messages`, { method: 'POST', body: input }); break
    case 'chat_generate_title': result = await apiRequest(`/chats/${encodeURIComponent(input.conversationId)}/title`, { method: 'POST' }); break
    case 'background_task_list': result = await apiRequest(`/tasks${query({ statuses: input.filter?.statuses?.join(','), kinds: input.filter?.kinds?.join(',') })}`); break
    case 'background_task_get': result = await apiRequest(`/tasks/${encodeURIComponent(String(input.id))}`); break
    case 'background_task_retry': result = await apiRequest(`/tasks/${encodeURIComponent(String(input.id))}/retry`, { method: 'POST' }); break
    case 'background_task_cancel': result = await apiRequest(`/tasks/${encodeURIComponent(String(input.id))}/cancel`, { method: 'POST' }); break
    case 'background_task_clear_finished': result = await apiRequest('/tasks/finished', { method: 'DELETE' }); break
    case 'conversation_summary_task_create': result = await apiRequest(`/chats/${encodeURIComponent(input.conversationId)}/summary-tasks`, { method: 'POST', body: input }); break
    case 'note_ai_task_create': result = await apiRequest(`/notes/${encodeURIComponent(input.noteId)}/ai-tasks`, { method: 'POST', body: input }); break
    case 'image_generation_task_create': result = await apiRequest('/images/generation-tasks', { method: 'POST', body: input }); break
    case 'agent_list_tools': result = await apiRequest('/agent/tools'); break
    case 'agent_tool_policy_update': result = await apiRequest('/agent/tool-policies', { method: 'PUT', body: input.request }); break
    case 'agent_mcp_list': result = await apiRequest('/mcp-servers'); break
    case 'agent_mcp_upsert': result = await apiRequest(`/mcp-servers/${encodeURIComponent(input.request.id || crypto.randomUUID())}`, { method: 'PUT', body: input.request }); break
    case 'agent_mcp_delete': result = await apiRequest(`/mcp-servers/${encodeURIComponent(input.id)}`, { method: 'DELETE' }); break
    case 'agent_mcp_refresh': result = await apiRequest(`/mcp-servers/${encodeURIComponent(input.id)}/refresh`, { method: 'POST' }); break
    case 'agent_skill_list': result = await apiRequest('/skills'); break
    case 'agent_skill_read': result = await apiRequest(`/skills/${encodeURIComponent(input.name)}`); break
    case 'agent_skill_upsert': result = await apiRequest(`/skills/${encodeURIComponent(input.request.name)}`, { method: 'PUT', body: input.request }); break
    case 'agent_skill_delete': result = await apiRequest(`/skills/${encodeURIComponent(input.name)}`, { method: 'DELETE' }); break
    case 'memory_list': result = await apiRequest('/memory'); break
    case 'memory_update': result = await apiRequest(`/memory/${encodeURIComponent(input.fileName)}`, { method: 'PUT', body: { content: input.content } }); break
    case 'usage_get_stats': result = await apiRequest(`/usage${query({ range: input.range, timezoneOffsetMinutes: input.timezoneOffsetMinutes })}`); break
    case 'usage_clear': result = await apiRequest('/usage', { method: 'DELETE' }); break
    case 'note_ai_stream': result = await runAI(input.request, input.onEvent, 'note_ai'); break
    case 'note_fim_stream': result = await runAI(input.request, input.onEvent, 'fim'); break
    case 'note_ai_cancel': result = await apiRequest(`/tasks/${encodeURIComponent(input.requestId)}/cancel`, { method: 'POST' }); break
    case 'agent_invoke': result = await runAgent(input.request, input.onEvent); break
    case 'agent_get_run': result = input.runId ? await apiRequest(`/agent/runs/${encodeURIComponent(input.runId)}`) : null; break
    case 'agent_get_pending_run': result = await apiRequest(`/agent/runs/pending${query({ conversationId: input.conversationId })}`); break
    case 'agent_cancel': result = await apiRequest(`/agent/runs/${encodeURIComponent(input.id || input.requestId)}/cancel`, { method: 'POST' }); break
    case 'agent_resume': {
      result = await apiRequest(`/agent/runs/${encodeURIComponent(input.request.runId)}/resume`, { method: 'POST', body: input.request })
      reconnectAgentStream(input.onEvent, input.request.runId)
      break
    }
    case 'agent_respond_input': {
      result = await apiRequest(`/agent/runs/${encodeURIComponent(input.request.runId)}/input`, { method: 'POST', body: input.request })
      reconnectAgentStream(input.onEvent, input.request.runId)
      break
    }
    case 'image_generation_list': result = await apiRequest(`/images${query({ limit: input.limit })}`); break
    case 'image_generate': result = await apiRequest('/images/generate', { method: 'POST', body: input.request }); break
    case 'image_generation_delete': result = await apiRequest(`/images/${encodeURIComponent(input.generationId)}`, { method: 'DELETE' }); break
    case 'image_asset_read': result = await readRemoteImageAsset(input.assetId); break
    case 'image_cancel': result = await apiRequest(`/tasks/${encodeURIComponent(input.requestId)}/cancel`, { method: 'POST' }); break
    default: throw new ApiError('remote_command_not_implemented', `远程命令尚未实现: ${command}`, 501)
  }
  return result as CommandResult<K>
}
