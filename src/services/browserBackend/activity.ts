import type { BrowserArgs, BrowserItem, BrowserState } from './types'
import type { BrowserHandlerResult } from './planner'

function item(value: Record<string, unknown>): BrowserItem {
  return value as BrowserItem
}

function bumpVersion(value: BrowserItem): void {
  value.version = Number(value.version || 0) + 1
}

export function handleActivityCommand(command: string, args: BrowserArgs, state: BrowserState, now: string): BrowserHandlerResult | null {
  if (command === 'background_task_list') return { result: state.backgroundTasks.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }
  if (command === 'background_task_get') return { result: state.backgroundTasks.find(task => task.id === args.id) || null }
  if (['conversation_summary_task_create', 'note_ai_task_create', 'image_generation_task_create'].includes(command)) {
    const id = crypto.randomUUID()
    const kind = command === 'conversation_summary_task_create' ? 'conversation_summary' : command === 'note_ai_task_create' ? 'note_ai' : 'image_generation'
    const conversationId = kind === 'conversation_summary' ? args.conversationId : null
    const targetNoteId = kind === 'note_ai' ? args.noteId : null
    const resourceKey = conversationId ? `conversation:${conversationId}` : targetNoteId ? `note:${targetNoteId}` : `task:${args.requestKey || id}`
    if (kind === 'conversation_summary' && state.backgroundTasks.some(task => task.kind === kind && task.conversationId === conversationId && ['queued', 'running', 'finalizing', 'cancelling'].includes(task.status))) throw new Error('当前对话已有正在处理的总结任务')
    const title = kind === 'conversation_summary' ? '总结为笔记' : kind === 'note_ai' ? 'AI 写作' : '图片生成'
    const task = item({ id, kind, title, status: 'queued', visibility: 'user', handlerVersion: 1, payload: {}, publicMeta: { title }, output: '', result: null, errorCode: null, errorMessage: null, conversationId, targetNoteId, resourceKey, modelProfileId: args.modelProfileId || args.imageModelProfileId || null, agentRunId: null, retryOf: null, createdAt: now, startedAt: null, completedAt: null, updatedAt: now })
    state.backgroundTasks.unshift(task)
    return { result: task }
  }
  if (command === 'background_task_cancel') { const task = state.backgroundTasks.find(value => value.id === args.id); if (!task) throw new Error('后台任务不存在'); Object.assign(task, { status: 'cancelled', completedAt: now, updatedAt: now }); return { result: { ...task } } }
  if (command === 'background_task_retry') { const original = state.backgroundTasks.find(value => value.id === args.id); if (!original) throw new Error('后台任务不存在'); const task = item({ ...original, id: crypto.randomUUID(), status: 'queued', output: '', result: null, errorCode: null, errorMessage: null, agentRunId: null, retryOf: original.id, createdAt: now, startedAt: null, completedAt: null, updatedAt: now }); state.backgroundTasks.unshift(task); return { result: task } }
  if (command === 'background_task_clear_finished') { const before = state.backgroundTasks.length; state.backgroundTasks = state.backgroundTasks.filter(task => !['succeeded', 'failed', 'cancelled', 'interrupted'].includes(task.status)); return { result: before - state.backgroundTasks.length } }
  if (command === 'chat_list') return { result: state.chatConversations.map(conversation => { const messages = state.chatMessages.filter(message => message.conversationId === conversation.id); return { ...conversation, messageCount: messages.length, preview: messages.at(-1)?.content || '' } }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }
  if (command === 'chat_create') { const conversation = item({ id: crypto.randomUUID(), title: '新对话', modelProfileId: args.modelProfileId || null, mode: args.mode || 'chat', messageCount: 0, preview: '', version: 1, createdAt: now, updatedAt: now }); state.chatConversations.unshift(conversation); return { result: conversation } }
  if (command === 'chat_set_mode') { const conversation = state.chatConversations.find(value => value.id === args.id); if (!conversation) throw new Error('对话不存在'); if (!['chat', 'memoryless', 'agent'].includes(args.mode)) throw new Error('无效的对话模式'); conversation.mode = args.mode; conversation.updatedAt = now; bumpVersion(conversation); return { result: { ...conversation } } }
  if (command === 'chat_get') { const conversation = state.chatConversations.find(value => value.id === args.id); return { result: conversation ? { conversation: { ...conversation, messageCount: state.chatMessages.filter(message => message.conversationId === conversation.id).length, preview: state.chatMessages.filter(message => message.conversationId === conversation.id).at(-1)?.content || '' }, messages: state.chatMessages.filter(message => message.conversationId === conversation.id) } : null } }
  if (command === 'chat_add_message') { const conversation = state.chatConversations.find(value => value.id === args.conversationId); const message = item({ id: crypto.randomUUID(), conversationId: args.conversationId, role: args.role, content: args.content, references: args.references || [], sources: args.sources || [], proposalId: args.proposalId || null, agentRunId: args.agentRunId || null, createdAt: now }); state.chatMessages.push(message); if (conversation) { conversation.updatedAt = now; bumpVersion(conversation) } return { result: message } }
  if (command === 'chat_delete') { state.chatConversations = state.chatConversations.filter(value => value.id !== args.id); state.chatMessages = state.chatMessages.filter(value => value.conversationId !== args.id); return { result: null } }
  if (command === 'chat_generate_title') { const conversation = state.chatConversations.find(value => value.id === args.conversationId); const firstRound = state.chatMessages.filter(value => value.conversationId === args.conversationId).slice(0, 2); const first = firstRound.find(value => value.role === 'user'); const compact = String(first?.content || '').replace(/\s+/g, ' ').trim(); const title = firstRound.length < 2 ? '新对话' : compact.length > 24 ? `${compact.slice(0, 24)}…` : compact || '新对话'; if (conversation) { if (conversation.title === '新对话' && title !== '新对话') conversation.title = title; conversation.updatedAt = now; bumpVersion(conversation) } return { result: title } }
  return null
}
