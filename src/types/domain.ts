export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export interface Note { id: string; notebookId: string | null; knowledgeBaseId: string | null; title: string; contentHtml: string; contentText: string; contentMarkdown: string; pinned: boolean; deletedAt: string | null; createdAt: string; updatedAt: string; external?: boolean; externalPath?: string }
export interface Notebook { id: string; parentId: string | null; name: string; description: string; createdAt: string; updatedAt: string }
export interface Tag { id: string; name: string; noteCount: number; createdAt: string; updatedAt: string }
export interface KnowledgeBase { id: string; category: string; name: string; description: string; cover: string | null; rootPath: string; createdAt: string; updatedAt: string }
export interface LibraryEntry { name: string; relativePath: string; kind: 'file' | 'folder'; size: number; modifiedAt: string | null; extension: string | null }
export interface LibraryPreview { kind: string; title: string; content: string; mimeType: string }
export interface NoteTemplate { id: string; name: string; description: string; title: string; contentMarkdown: string; builtin: boolean; updatedAt: string }
export interface NoteLink { sourceNoteId: string; targetNoteId: string; targetTitle: string }
export interface ModelProfile { id: string; name: string; providerId: string | null; connectionName: string | null; provider: string; baseUrl: string; model: string; endpointType: string; apiKeyConfigured: boolean; isDefault: boolean; imageEnabled: boolean; isImageDefault: boolean }
export interface ModelOption { id: string; name: string; ownedBy: string | null }
export interface ModelTestResult { ok: boolean; message: string; latencyMs: number }
export interface AppSettings { theme: 'light' | 'dark' | 'system'; language: 'zh-CN' | 'en'; fimEnabled: boolean; exportDirectory: string }
export interface Reminder { id: string; ownerType: string; ownerId: string; mode: string; triggerAt: string | null; offsetMinutes: number | null; intervalMinutes: number | null; nextFireAt: string | null; enabled: boolean; lastFiredAt: string | null; stoppedAt: string | null; createdAt: string; updatedAt: string }
export interface CalendarEvent { id: string; title: string; startDate: string; endDate: string; startTime: string; endTime: string; allDay: boolean; description: string; color: string; priority: string; completed: boolean; reminder: Reminder | null; createdAt: string; updatedAt: string }
export interface Todo { id: string; title: string; notes: string; listId: string | null; startAt: string | null; dueAt: string | null; priority: string; completedAt: string | null; reminder: Reminder | null; createdAt: string; updatedAt: string }
export interface TodoList { id: string; name: string; color: string; createdAt: string; updatedAt: string }
export interface BackgroundTaskPayload { request?: Record<string, unknown>; previewOutput?: string; sources?: JsonValue[]; proposal?: EditProposal; fallbackTitle?: string; result?: JsonValue; [key: string]: unknown }
export interface BackgroundTask { id: string; kind: string; title: string; status: string; payload: BackgroundTaskPayload; output: string; result: JsonValue | null; errorCode: string | null; errorMessage: string | null; conversationId: string | null; targetNoteId: string | null; resourceKey: string; modelProfileId: string | null; agentRunId: string | null; retryOf: string | null; createdAt: string; startedAt: string | null; completedAt: string | null; updatedAt: string }
export interface ImageAsset { id: string; generationId: string; relativePath: string; mimeType: string; byteSize: number; width: number | null; height: number | null; createdAt: string; dataUri?: string }
export interface ImageGeneration { id: string; taskId: string; prompt: string; mode: string; imageModelProfileId: string; size: string; count: number; status: string; errorCode: string | null; errorMessage: string | null; createdAt: string; completedAt: string | null; assets: ImageAsset[] }
export interface ChatConversation { id: string; title: string; modelProfileId: string | null; mode: string; messageCount: number; preview: string; createdAt: string; updatedAt: string }
export interface ChatMessage { id: string; conversationId: string; role: string; content: string; references: JsonValue[]; sources: JsonValue[]; proposalId: string | null; agentRunId: string | null; createdAt: string }
export interface ChatThread { conversation: ChatConversation; messages: ChatMessage[] }
export interface AgentTool { name: string; description: string; requireApproval: boolean; defaultRequireApproval: boolean }
export interface AgentStep { id: string; sequence: number; kind: string; toolCallId: string | null; toolName: string | null; arguments: JsonValue; output: string | null; status: string; approvalHash: string | null; createdAt: string }
export interface AgentRun { id: string; conversationId: string; requestId: string; status: string; iterationCount: number; errorCode: string | null; startedAt: string; completedAt: string | null; steps: AgentStep[] }
export interface EditProposal { id: string; noteId: string; before?: string; after?: string; status?: string; replacementMarkdown?: string; action?: string; originalText?: string; sources?: JsonValue[]; selectionFrom?: number; selectionTo?: number; baseUpdatedAt?: string }
export interface ExternalMarkdownSource { id: string; path: string; title: string; updatedAt?: string; available?: boolean; fileName?: string }
export interface ExternalMarkdownFile { path: string; fileName: string; content?: string; changed?: boolean; error?: string }
export interface ExportWriteResult { path: string; fileName: string }
export interface UpdateInfo { available: boolean; version?: string; notes?: string; body?: string; date?: string; assetName?: string }
export interface MemoryFile { fileName: string; nameKey: string; description: string; content: string; size: number; updatedAt: string | null }
export interface McpServer { id: string; name: string; command: string; args: string[]; enabled: boolean; tools?: JsonValue[]; cachedTools?: Array<{ name?: string; description?: string }>; status?: string; error?: string; lastError?: string }
export interface AgentSkill { id?: string; name: string; fileName?: string; description?: string; content?: string; enabled?: boolean; builtin?: boolean; updatedAt?: string }
export interface UsageAggregate { key: string; label: string; provider: string; modelName: string; source: string; promptTokens: number; completionTokens: number; totalTokens: number; reasoningTokens: number; requests: number }
export interface UsageDay { date: string; promptTokens: number; completionTokens: number; totalTokens: number; requests: number }
export interface UsageStats { range: string; summary: Record<string, number>; byModel: UsageAggregate[]; byDay: UsageDay[]; bySource: UsageAggregate[] }

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' ? error.message : fallback
}
