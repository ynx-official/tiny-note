import type { BrowserArgs, BrowserItem, BrowserState } from './types'
import type { BrowserHandlerResult } from './planner'

function item(value: Record<string, unknown>): BrowserItem {
  return value as BrowserItem
}

export function handleActivityCommand(command: string, args: BrowserArgs, state: BrowserState, now: string): BrowserHandlerResult | null {
  if (command === 'background_task_list') return { result: state.backgroundTasks.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }
  if (command === 'background_task_get') return { result: state.backgroundTasks.find(task => task.id === args.id) || null }
  if (command === 'background_task_enqueue') {
    const input = args.input
    if (!['conversation_summary', 'note_ai', 'image_generation'].includes(input.kind)) throw new Error('无效的后台任务类型')
    const id = crypto.randomUUID()
    const resourceKey = input.conversationId ? `conversation:${input.conversationId}` : input.targetNoteId ? `note:${input.targetNoteId}` : `task:${id}`
    if (input.kind === 'conversation_summary' && state.backgroundTasks.some(task => task.kind === input.kind && task.conversationId === input.conversationId && ['queued', 'running', 'awaiting_approval', 'awaiting_input'].includes(task.status))) throw new Error('当前对话已有正在处理的总结任务')
    const task = item({ id, kind: input.kind, title: input.title, status: 'queued', payload: input.payload || {}, output: '', result: null, errorCode: null, errorMessage: null, conversationId: input.conversationId || null, targetNoteId: input.targetNoteId || null, resourceKey, modelProfileId: input.modelProfileId || null, agentRunId: null, retryOf: null, createdAt: now, startedAt: null, completedAt: null, updatedAt: now })
    state.backgroundTasks.unshift(task)
    return { result: task }
  }
  if (command === 'background_task_transition') { const input = args.input; const task = state.backgroundTasks.find(value => value.id === input.id); if (!task) throw new Error('后台任务不存在'); Object.assign(task, { status: input.status, output: task.output + (input.outputDelta || ''), result: input.result ?? task.result, errorCode: input.errorCode || null, errorMessage: input.errorMessage || null, agentRunId: input.agentRunId || task.agentRunId, startedAt: task.startedAt || (input.status === 'running' ? now : null), completedAt: ['succeeded', 'failed', 'cancelled'].includes(input.status) ? now : task.completedAt, updatedAt: now }); return { result: { ...task } } }
  if (command === 'background_task_cancel') { const task = state.backgroundTasks.find(value => value.id === args.id); if (!task) throw new Error('后台任务不存在'); Object.assign(task, { status: 'cancelled', completedAt: now, updatedAt: now }); return { result: { ...task } } }
  if (command === 'background_task_retry') { const original = state.backgroundTasks.find(value => value.id === args.id); if (!original) throw new Error('后台任务不存在'); const task = item({ ...original, id: crypto.randomUUID(), status: 'queued', output: '', result: null, errorCode: null, errorMessage: null, agentRunId: null, retryOf: original.id, createdAt: now, startedAt: null, completedAt: null, updatedAt: now }); state.backgroundTasks.unshift(task); return { result: task } }
  if (command === 'background_task_clear_finished') { const before = state.backgroundTasks.length; state.backgroundTasks = state.backgroundTasks.filter(task => !['succeeded', 'failed', 'cancelled', 'interrupted'].includes(task.status)); return { result: before - state.backgroundTasks.length } }
  if (command === 'chat_list') return { result: state.chatConversations.map(conversation => { const messages = state.chatMessages.filter(message => message.conversationId === conversation.id); return { ...conversation, messageCount: messages.length, preview: messages.at(-1)?.content || '' } }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }
  if (command === 'chat_create') { const conversation = item({ id: crypto.randomUUID(), title: '新对话', modelProfileId: args.modelProfileId || null, mode: args.mode || 'chat', messageCount: 0, preview: '', createdAt: now, updatedAt: now }); state.chatConversations.unshift(conversation); return { result: conversation } }
  if (command === 'chat_set_mode') { const conversation = state.chatConversations.find(value => value.id === args.id); if (!conversation) throw new Error('对话不存在'); if (!['chat', 'memoryless', 'agent'].includes(args.mode)) throw new Error('无效的对话模式'); conversation.mode = args.mode; conversation.updatedAt = now; return { result: { ...conversation } } }
  if (command === 'chat_get') { const conversation = state.chatConversations.find(value => value.id === args.id); return { result: conversation ? { conversation: { ...conversation, messageCount: state.chatMessages.filter(message => message.conversationId === conversation.id).length, preview: state.chatMessages.filter(message => message.conversationId === conversation.id).at(-1)?.content || '' }, messages: state.chatMessages.filter(message => message.conversationId === conversation.id) } : null } }
  if (command === 'chat_add_message') { const conversation = state.chatConversations.find(value => value.id === args.conversationId); const message = item({ id: crypto.randomUUID(), conversationId: args.conversationId, role: args.role, content: args.content, references: args.references || [], sources: args.sources || [], proposalId: args.proposalId || null, agentRunId: args.agentRunId || null, createdAt: now }); state.chatMessages.push(message); if (conversation) conversation.updatedAt = now; return { result: message } }
  if (command === 'chat_delete') { state.chatConversations = state.chatConversations.filter(value => value.id !== args.id); state.chatMessages = state.chatMessages.filter(value => value.conversationId !== args.id); return { result: null } }
  if (command === 'chat_generate_title') { const conversation = state.chatConversations.find(value => value.id === args.conversationId); const firstRound = state.chatMessages.filter(value => value.conversationId === args.conversationId).slice(0, 2); const first = firstRound.find(value => value.role === 'user'); const compact = String(first?.content || '').replace(/\s+/g, ' ').trim(); const title = firstRound.length < 2 ? '新对话' : compact.length > 24 ? `${compact.slice(0, 24)}…` : compact || '新对话'; if (conversation?.title === '新对话' && title !== '新对话') { conversation.title = title; conversation.updatedAt = now } return { result: title } }
  return null
}
