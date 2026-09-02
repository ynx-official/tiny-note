import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { EventChannel } from '../services/eventChannel'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { invoke } from '../services/tauri'
import { requestConfirmation } from '../services/appFeedback'
import { useNotesStore } from '../stores/notes'
import { useLibraryStore } from '../stores/library'
import { useAppStore } from '../stores/app'
import { useTasksStore } from '../stores/tasks'
import { modelProviderLabel } from '../utils/modelProvider'
import { isConversationSummaryIntent, isNoteEditIntent, parseNoteCommand } from '../utils/noteChatCommands'
import { sanitizeEditorHtml, textFromEditorHtml } from '../utils/noteMarkdown'
import tinyAgentAvatar from '../../src-tauri/icons/128x128.png'
import { errorMessage, type AgentStep, type AgentTool, type ChatMessage, type JsonValue, type LibraryEntry, type Note } from '../types/domain'

export function useChatWorkspace() {
  interface ChatReference { key: string; type: 'note' | 'file'; name: string; noteId?: string; knowledgeBaseId?: string | null; baseId?: string | null; baseName?: string; relativePath?: string }
  
  interface AgentSegment { id: string; type: 'text' | 'tool' | 'input'; content?: string; toolName?: string | null; arguments?: JsonValue; output?: string; response?: JsonValue | null; status: string }
  
  interface ViewMessage extends ChatMessage { agentSegments?: AgentSegment[] }
  
  interface EditProposal { id: string; noteId: string }
  
  interface PendingApproval { runId: string; toolCallId: string; toolName: string; arguments: JsonValue; approvalHash: string; description: string }
  
  interface PendingInput { runId: string; toolCallId: string; inputHash: string; request: JsonValue; busy?: boolean }
  
  interface AgentEvent { type: string; text?: string; runId?: string; toolCallId?: string; toolName?: string; arguments?: JsonValue; output?: string; status?: string; approvalHash?: string; description?: string; request?: JsonValue; inputHash?: string; sources?: JsonValue[]; proposal?: EditProposal; message?: string; content?: string }
  
  const route = useRoute()
  
  const router = useRouter()
  
  const notesStore = useNotesStore()
  
  const library = useLibraryStore()
  
  const appStore = useAppStore()
  
  const tasksStore = useTasksStore()
  
  const { models } = storeToRefs(appStore)
  
  const messages = ref<ViewMessage[]>([])
  
  const draft = ref('')
  
  const references = ref<ChatReference[]>([])
  
  const selectedModelId = ref('')
  
  const thinkingMode = ref('fast')
  
  const busy = ref(false)
  
  const streamingText = ref('')
  
  const error = ref('')
  
  const requestId = ref('')
  
  const messagesRef = ref<HTMLElement | null>(null)
  
  const conversationId = ref('')

  const conversationVersion = ref(0)
  
  const conversationTitle = ref('新对话')
  
  const referenceMenuOpen = ref(false)
  
  const responseSources = ref<JsonValue[]>([])
  
  const responseProposal = ref<EditProposal | null>(null)
  
  const pendingSummary = ref(false)
  
  const savedNote = ref<Note | null>(null)
  
  const currentMode = ref('chat')
  
  const modeSaving = ref(false)
  
  const agentSegments = ref<AgentSegment[]>([])
  
  const currentAgentRunId = ref('')
  
  const pendingApproval = ref<PendingApproval | null>(null)
  
  const pendingInput = ref<PendingInput | null>(null)
  
  const agentTools = ref<AgentTool[]>([])
  
  const approvalBusy = ref(false)
  
  const approvalError = ref('')
  
  
  let responseFinalizing = false
  
  let agentTextSequence = 0
  
  const fromHome = computed(() => route.query.from === 'home')
  
  const selectedModel = computed(() => models.value.find(model => model.id === selectedModelId.value) || models.value.find(model => model.isDefault) || models.value[0] || null)
  
  const agentApprovalCount = computed(() => agentTools.value.filter(tool => tool.requireApproval).length)
  
  const isBusy = computed(() => busy.value)
  
  function scrollToBottom() {
    nextTick(() => {
      if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    })
  }
  
  function assistantContext() {
    const referenceText = references.value.map(item => `${item.type === 'note' ? '笔记' : '文件'}：${item.name}`).join('\n')
    const history = messages.value.slice(-8).map(item => `${item.role === 'user' ? '用户' : '助手'}：${item.content}`).join('\n')
    return [referenceText ? `用户选择的引用：\n${referenceText}` : '', history ? `此前对话：\n${history}` : ''].filter(Boolean).join('\n\n') || '无额外上下文'
  }
  
  async function ensureConversation() {
    if (conversationId.value) return conversationId.value
    const conversation = await invoke('chat_create', { modelProfileId: selectedModel.value?.id || null, mode: currentMode.value })
    conversationId.value = conversation.id
    conversationVersion.value = conversation.version || 0
    conversationTitle.value = conversation.title
    await router.replace({ path: '/chat', query: { id: conversation.id, ...(fromHome.value ? { from: 'home' } : {}) } })
    window.dispatchEvent(new CustomEvent('tiny-note-chat-updated'))
    return conversation.id
  }
  
  async function saveMessage(role: string, content: string, messageReferences: ChatReference[] = [], sources: JsonValue[] = [], proposalId: string | null = null, agentRunId: string | null = null): Promise<ViewMessage> {
    const id = await ensureConversation()
    const saved = await invoke('chat_add_message', { conversationId: id, role, content, references: messageReferences, sources, proposalId, agentRunId })
    conversationVersion.value += 1
    window.dispatchEvent(new CustomEvent('tiny-note-chat-updated'))
    if (saved.titleTaskId) watchTitleTask(id, saved.titleTaskId)
    return saved
  }

  function watchTitleTask(id: string, taskId: string) {
    const channel = new EventChannel<{ type?: string }>()
    channel.onmessage = event => {
      if (!['completed', 'error', 'cancelled'].includes(event.type || '')) return
      void invoke('chat_get', { id }).then(thread => {
        if (conversationId.value === id) {
          conversationTitle.value = thread.conversation.title
          conversationVersion.value = thread.conversation.version || conversationVersion.value
        }
        window.dispatchEvent(new CustomEvent('tiny-note-chat-updated'))
      })
    }
    void channel.connect(taskId).catch(() => undefined)
  }
  
  async function pushResponse(content: string) {
    const text = content?.trim()
    if (!text) return
    const saved = await saveMessage('assistant', text, [], responseSources.value, responseProposal.value?.id || null, currentAgentRunId.value || null) as ViewMessage
    if (currentAgentRunId.value) saved.agentSegments = agentSegments.value.map(segment => ({ ...segment }))
    messages.value.push(saved)
  }
  
  async function completeResponse() {
    if (responseFinalizing) return
    responseFinalizing = true
    const content = streamingText.value === '正在思考…' ? '模型没有返回内容，请换个问法再试。' : streamingText.value
    streamingText.value = ''
    try {
      await pushResponse(content)
      if (pendingSummary.value && content.trim()) await createNoteFromText(content, `${conversationTitle.value === '新对话' ? '对话总结' : conversationTitle.value} · 总结`)
    } catch (cause) { error.value = errorMessage(cause, '回复保存失败') } finally { busy.value = false; responseSources.value = []; responseProposal.value = null; pendingSummary.value = false; agentSegments.value = []; currentAgentRunId.value = ''; pendingApproval.value = null; pendingInput.value = null; approvalBusy.value = false; approvalError.value = ''; responseFinalizing = false }
  }
  
  function mapAgentStep(step: AgentStep): AgentSegment | null {
    if (step.kind === 'text' && step.output) return { id: step.id, type: 'text', content: step.output, status: step.status || 'completed' }
    if (step.kind === 'input') return { id: step.toolCallId || step.id, type: 'input', toolName: step.toolName, arguments: step.arguments || {}, response: parseInputResponse(step.output), status: step.status }
    if (step.kind !== 'tool') return null
    return { id: step.toolCallId || step.id, type: 'tool', toolName: step.toolName, arguments: step.arguments || {}, output: step.output || '', status: step.status }
  }
  
  function appendAgentText(text: string) {
    if (!text) return
    const last = agentSegments.value.at(-1)
    if (last?.type === 'text' && last.status === 'streaming') last.content += text
    else agentSegments.value.push({ id: `text-${++agentTextSequence}`, type: 'text', content: text, status: 'streaming' })
  }
  
  function finishStreamingAgentText() {
    const last = agentSegments.value.at(-1)
    if (last?.type === 'text' && last.status === 'streaming') last.status = 'completed'
  }
  
  function hasAgentText(segments: AgentSegment[] | undefined) { return Boolean(segments?.some(segment => segment.type === 'text')) }
  
  function agentMessageTail(message: ViewMessage) {
    const segments = message.agentSegments
    if (!hasAgentText(segments)) return message.content
    const recordedText = (segments || []).filter(segment => segment.type === 'text').map(segment => segment.content).join('')
    return recordedText === message.content ? '' : message.content
  }
  
  function markActiveAgentSteps(status: string) {
    agentSegments.value = agentSegments.value.map(segment =>
      segment.status === 'running' || segment.status === 'awaiting_approval' || segment.status === 'awaiting_input'
        ? { ...segment, status }
        : segment
    )
  }
  
  async function retainInterruptedAgentRun(status: string, message: string) {
    if (currentMode.value !== 'agent' || !currentAgentRunId.value) return false
    finishStreamingAgentText()
    markActiveAgentSteps(status)
    pendingSummary.value = false
    pendingApproval.value = null
    pendingInput.value = null
    streamingText.value = message
    await completeResponse()
    return true
  }
  
  function parseInputResponse(output: JsonValue | string | null | undefined): JsonValue | null {
    if (!output) return null
    if (typeof output === 'object') return output
    try { return JSON.parse(String(output)) as JsonValue } catch { return null }
  }
  
  async function ensureContextConsent() {
    const modelId = selectedModel.value?.id
    if (!modelId) return false
    const consentKey = `tiny-note-context-consent:${modelId}`
    if (localStorage.getItem(consentKey) === 'granted') return true
    const allowed = await requestConfirmation({ title: '允许发送相关片段', message: 'Tiny Note 会把本轮命中的本地笔记或知识库片段发送给当前模型，只发送相关片段，并在回答下方展示来源。', confirmLabel: '允许' })
    if (allowed) localStorage.setItem(consentKey, 'granted')
    return allowed
  }
  
  function noteHtml(text: string) { return sanitizeEditorHtml(String(marked.parse(String(text || '')))) }
  
  function noteTitle(text: string, fallback = '对话笔记') {
    const heading = String(text || '').match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim()
    return (heading || fallback).slice(0, 80)
  }
  
  async function createNoteFromText(content: string, fallbackTitle = '对话笔记') {
    const contentHtml = noteHtml(content)
    const note = await notesStore.createFromContent({ title: noteTitle(content, fallbackTitle), contentHtml, contentText: textFromEditorHtml(contentHtml), contentMarkdown: content })
    savedNote.value = note
    return note
  }
  
  async function refreshDataAfterAgent() {
    // Agent tools write through the remote service, so the Pinia lists need an
    // explicit reload before the user navigates back to Notes or Library.
    const activeBaseId = library.activeId
    const activePath = library.path
    await Promise.allSettled([notesStore.load(), library.load()])
    if (activeBaseId && library.activeId === activeBaseId && activePath) {
      await library.navigate(activePath, false)
    }
  }
  
  async function saveAssistantAsNote(message: ViewMessage) {
    try { error.value = ''; await createNoteFromText(message.content, conversationTitle.value === '新对话' ? '对话笔记' : conversationTitle.value) }
    catch (cause) { error.value = errorMessage(cause, '保存笔记失败') }
  }
  
  function openSavedNote() { if (savedNote.value) router.push({ path: '/notes', query: { note: savedNote.value.id } }) }
  
  async function addAssistantNotice(content: string) {
    const saved = await saveMessage('assistant', content)
    messages.value.push(saved)
  }
  
  async function performNoteCommand(command: ReturnType<typeof parseNoteCommand>, messageReferences: ChatReference[]) {
    if (!command) return false
    if (command.action === 'create') {
      const note = await createNoteFromText(command.content || '', command.title)
      if (command.title && command.title !== '未命名笔记' && note.title !== command.title) await notesStore.rename(note.id, command.title)
      await addAssistantNotice(`已创建笔记「${command.title || note.title}」。`)
      return true
    }
    const targets = messageReferences.filter(item => item.type === 'note')
    if (targets.length !== 1) {
      await addAssistantNotice('请先用输入框左下角的回形针引用一篇笔记，我才能准确执行这个操作。')
      return true
    }
    const target = notesStore.notes.find(note => note.id === targets[0]?.noteId)
    if (!target) { await addAssistantNotice('这篇笔记不存在或已被删除。'); return true }
    if (command.action === 'rename') {
      if (!command.value) return true
      await notesStore.rename(target.id, command.value)
      await addAssistantNotice(`已将笔记重命名为「${command.value}」。`)
    } else if (command.action === 'duplicate') {
      const copy = await notesStore.duplicate(target.id)
      savedNote.value = copy
      await addAssistantNotice(`已创建「${copy.title}」。`)
    } else if (command.action === 'move') {
      if (!command.value) return true
      const notebook = notesStore.notebooks.find(item => item.name.trim().toLowerCase() === command.value!.toLowerCase())
      if (!notebook) await addAssistantNotice(`没有找到名为「${command.value}」的笔记本，请先创建该笔记本。`)
      else { await notesStore.move(target.id, notebook.id); await addAssistantNotice(`已将「${target.title}」移动到「${notebook.name}」。`) }
    } else if (command.action === 'delete') {
      if (!(await requestConfirmation({ title: '移入最近删除', message: `确定把「${target.title}」移到最近删除吗？`, tone: 'danger', confirmLabel: '删除' }))) await addAssistantNotice('已取消删除。')
      else { await notesStore.remove(target.id); references.value = references.value.filter(item => item.noteId !== target.id); await addAssistantNotice(`已将「${target.title}」移到最近删除，可在 30 天内恢复。`) }
    }
    return true
  }
  
  function createResponseChannel() {
    const channel = new EventChannel<AgentEvent>()
    channel.onmessage = async event => {
      if (event.type === 'delta' || event.type === 'textDelta') {
        if (streamingText.value === '正在思考…') streamingText.value = ''
        streamingText.value += event.text || ''
        if (currentMode.value === 'agent') appendAgentText(event.text || '')
      }
      if (event.type === 'started' && event.runId) currentAgentRunId.value = event.runId
      if (event.type === 'toolCall') {
        finishStreamingAgentText()
        const existing = agentSegments.value.find(item => item.id === event.toolCallId)
        if (!existing && event.toolCallId) agentSegments.value.push({ id: event.toolCallId, type: 'tool', toolName: event.toolName, arguments: event.arguments || {}, status: 'running', output: '' })
      }
      if (event.type === 'approvalRequired') {
        const segment = agentSegments.value.find(item => item.id === event.toolCallId)
        if (segment) segment.status = 'awaiting_approval'
        approvalError.value = ''
        if (event.runId && event.toolCallId && event.toolName && event.approvalHash) pendingApproval.value = { runId: event.runId, toolCallId: event.toolCallId, toolName: event.toolName, arguments: event.arguments || {}, approvalHash: event.approvalHash, description: event.description || 'Tiny Agent 请求执行写操作' }
      }
      if (event.type === 'inputRequired') {
        finishStreamingAgentText()
        let segment = agentSegments.value.find(item => item.id === event.toolCallId)
        if (!segment) {
          if (event.toolCallId) {
            segment = { id: event.toolCallId, type: 'input', toolName: 'request_user_input', arguments: event.request || {}, response: null, status: 'awaiting_input' }
            agentSegments.value.push(segment)
          }
        } else {
          Object.assign(segment, { type: 'input', arguments: event.request || {}, status: 'awaiting_input' })
        }
        if (event.runId && event.toolCallId && event.inputHash) pendingInput.value = { runId: event.runId, toolCallId: event.toolCallId, inputHash: event.inputHash, request: event.request || {} }
      }
      if (event.type === 'toolResult') {
        const segment = agentSegments.value.find(item => item.id === event.toolCallId)
        if (segment) Object.assign(segment, { status: event.status || 'completed', output: event.output || '', response: segment.type === 'input' ? parseInputResponse(event.output) : segment.response })
      }
      if (event.type === 'sources') responseSources.value = event.sources || []
      if (event.type === 'editProposal') responseProposal.value = event.proposal || null
      if (event.type === 'error') {
        const message = event.message || '模型请求失败'
        error.value = message
        if (!await retainInterruptedAgentRun('error', `Tiny Agent 执行失败：${message}`)) { streamingText.value = ''; busy.value = false; pendingApproval.value = null; pendingInput.value = null }
      }
      if (event.type === 'cancelled') {
        if (!await retainInterruptedAgentRun('cancelled', '已停止 Tiny Agent 执行。')) { streamingText.value = ''; busy.value = false; pendingApproval.value = null; pendingInput.value = null }
      }
      if (event.type === 'completed') {
        if ((!streamingText.value || streamingText.value === '正在思考…') && event.content) { streamingText.value = event.content; if (currentMode.value === 'agent') appendAgentText(event.content) }
        finishStreamingAgentText()
        if (currentMode.value === 'agent') await refreshDataAfterAgent()
        await completeResponse()
      }
    }
    return channel
  }
  
  async function decideApproval(decision: 'approve' | 'reject') {
    const approval = pendingApproval.value
    if (!approval || approvalBusy.value) return
    error.value = ''
    approvalError.value = ''
    approvalBusy.value = true
    // 审批后的续跑使用新的 SSE 连接，并从服务端持久化事件序列恢复。
    const channel = createResponseChannel()
    const segment = agentSegments.value.find(item => item.id === approval.toolCallId)
    if (segment) segment.status = decision === 'approve' ? 'running' : 'rejected'
    try {
      await invoke('agent_resume', { request: { runId: approval.runId, toolCallId: approval.toolCallId, approvalHash: approval.approvalHash, decision, reason: decision === 'reject' ? '用户拒绝执行此操作' : null }, onEvent: channel })
      if (pendingApproval.value?.toolCallId === approval.toolCallId) pendingApproval.value = null
    } catch (cause) {
      approvalError.value = errorMessage(cause, '审批回传失败')
      error.value = approvalError.value
      pendingApproval.value = approval
      if (segment) segment.status = 'awaiting_approval'
    } finally { approvalBusy.value = false }
  }
  
  async function sendMessage(value: string, messageReferences: ChatReference[] = references.value) {
    const message = String(value || '').trim()
    if (!message || isBusy.value) return
    references.value = messageReferences || []
    const messageReferenceCopies = references.value.map(item => ({ ...item }))
    let savedUserMessage: ViewMessage
    try {
      savedUserMessage = await saveMessage('user', message, messageReferenceCopies)
    } catch (cause) {
      error.value = errorMessage(cause, '消息保存失败')
      return
    }
    messages.value.push(savedUserMessage)
    draft.value = ''
    error.value = ''
    try {
      if (currentMode.value !== 'agent' && await performNoteCommand(parseNoteCommand(message), messageReferenceCopies)) return
    } catch (cause) {
      error.value = errorMessage(cause, '笔记操作失败')
      return
    }
    busy.value = true
    streamingText.value = '正在思考…'
    requestId.value = crypto.randomUUID()
    responseSources.value = []
    responseProposal.value = null
    agentSegments.value = []
    agentTextSequence = 0
    currentAgentRunId.value = ''
    pendingSummary.value = isConversationSummaryIntent(message)
    const contextAllowed = await ensureContextConsent()
    try {
      if (currentMode.value === 'agent') {
        if (!window.__TAURI_INTERNALS__) {
          window.setTimeout(async () => { streamingText.value = `这是浏览器预览回复：${message}`; await completeResponse() }, 500)
          return
        }
        const channel = createResponseChannel()
        await invoke('agent_invoke', { request: { requestId: requestId.value, conversationId: conversationId.value, message, references: contextAllowed ? messageReferenceCopies : [], modelProfileId: selectedModel.value?.id || null, thinkingMode: thinkingMode.value }, onEvent: channel })
      } else {
        const targetNotes = messageReferenceCopies.filter(item => item.type === 'note')
        const editMode = targetNotes.length === 1 && isNoteEditIntent(message)
        if (!window.__TAURI_INTERNALS__) {
          window.setTimeout(async () => { streamingText.value = `这是浏览器预览回复：${message}`; await completeResponse() }, 500)
          return
        }
        const channel = createResponseChannel()
        await invoke('note_ai_stream', { request: { requestId: requestId.value, action: 'custom', mode: editMode ? 'edit' : 'chat', text: assistantContext(), instruction: message, references: contextAllowed ? messageReferenceCopies : [], targetNoteId: targetNotes.length === 1 ? targetNotes[0].noteId : null, modelProfileId: selectedModel.value?.id || null, thinkingMode: thinkingMode.value, source: 'chat', conversationId: conversationId.value }, onEvent: channel })
      }
    } catch (cause) {
      const message = errorMessage(cause, '模型请求失败')
      error.value = message
      if (!await retainInterruptedAgentRun('error', `Tiny Agent 执行失败：${message}`)) { streamingText.value = ''; busy.value = false }
    }
  }
  
  function submit() { if (!isBusy.value) sendMessage(draft.value, references.value) }
  
  async function summarizeConversation(event: MouseEvent) {
    if (isBusy.value || messages.value.length < 2 || tasksStore.activeSummaryForConversation(conversationId.value)) return
    try {
      await tasksStore.createConversationSummary({ conversationId: conversationId.value, requestKey: crypto.randomUUID(), modelProfileId: selectedModel.value?.id || null, thinkingMode: thinkingMode.value }, { sourceElement: event.currentTarget instanceof Element ? event.currentTarget : null })
    } catch (cause) { error.value = errorMessage(cause, '总结任务创建失败') }
  }
  
  async function stop() {
    if (!busy.value || !requestId.value) return
    if (window.__TAURI_INTERNALS__) { try { await invoke(currentMode.value === 'agent' ? 'agent_cancel' : 'note_ai_cancel', { requestId: requestId.value }) } catch {} }
    if (await retainInterruptedAgentRun('cancelled', '已停止 Tiny Agent 执行。')) return
    busy.value = false
    streamingText.value = ''
    pendingApproval.value = null
    pendingInput.value = null
  }
  
  async function respondInput(answer: { outcome: string; selectedOptionId?: string | null; otherText?: string | null }) {
    const input = pendingInput.value
    if (!input || input.busy) return
    error.value = ''
    input.busy = true
    const segment = agentSegments.value.find(item => item.id === input.toolCallId)
    if (segment) segment.status = 'submitting'
    const channel = createResponseChannel()
    try {
      await invoke('agent_respond_input', {
        request: {
          runId: input.runId,
          toolCallId: input.toolCallId,
          inputHash: input.inputHash,
          outcome: answer.outcome,
          selectedOptionId: answer.selectedOptionId,
          otherText: answer.otherText
        },
        onEvent: channel
      })
      if (pendingInput.value?.toolCallId === input.toolCallId) pendingInput.value = null
    } catch (cause) {
      error.value = errorMessage(cause, '回答回传失败')
      input.busy = false
      pendingInput.value = input
      if (segment) segment.status = 'awaiting_input'
    }
  }
  
  function goBack() { router.push('/') }
  
  function newChat() {
    if (isBusy.value) return
    messages.value = []
    references.value = []
    draft.value = ''
    error.value = ''
    conversationId.value = ''
    conversationVersion.value = 0
    conversationTitle.value = '新对话'
    currentMode.value = 'chat'
    agentSegments.value = []
    agentTextSequence = 0
    currentAgentRunId.value = ''
    pendingApproval.value = null
    pendingInput.value = null
    router.replace({ path: '/chat', query: fromHome.value ? { from: 'home' } : {} })
  }
  
  async function toggleReferenceMenu() {
    referenceMenuOpen.value = !referenceMenuOpen.value
    if (!referenceMenuOpen.value) return
    if (!notesStore.notes.length) await notesStore.load()
    if (!library.bases.length) await library.load()
  }
  
  function addNoteReference(note: Note) {
    const value: ChatReference = { key: `note:${note.id}`, type: 'note', name: note.title || '未命名笔记', noteId: note.id }
    if (!references.value.some(item => item.key === value.key)) references.value.push(value)
    referenceMenuOpen.value = false
  }
  
  function addFileReference(entry: LibraryEntry) {
    const value: ChatReference = { key: `file:${library.activeId}:${entry.relativePath}`, type: 'file', name: entry.name, knowledgeBaseId: library.activeId, baseId: library.activeId, baseName: library.active?.name || '', relativePath: entry.relativePath }
    if (!references.value.some(item => item.key === value.key)) references.value.push(value)
    referenceMenuOpen.value = false
  }
  
  function removeReference(key: string) { references.value = references.value.filter(item => item.key !== key) }
  
  async function reviewProposal(proposalId: string) {
    const proposal = await invoke('note_edit_get', { proposalId })
    if (!proposal) return
    router.push({ path: '/notes', query: { note: proposal.noteId, proposal: proposal.id } })
  }
  
  async function copyMessage(content: string) {
    if (!content || !navigator.clipboard) return
    const source = String(content)
    const html = DOMPurify.sanitize(String(marked.parse(source, { breaks: true, gfm: true })))
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
        const clipboardItem = new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([source], { type: 'text/plain' })
        })
        await navigator.clipboard.write([clipboardItem])
      } else {
        await navigator.clipboard.writeText(source)
      }
    } catch {
      await navigator.clipboard.writeText(source)
    }
  }
  
  async function loadConversation(id: string, force = false) {
    if (!id || (!force && id === conversationId.value)) return
    busy.value = false
    streamingText.value = ''
    try {
      const thread = await invoke('chat_get', { id })
      if (!thread) throw new Error('对话不存在')
      conversationId.value = thread.conversation.id
      conversationVersion.value = thread.conversation.version || 0
      conversationTitle.value = thread.conversation.title
      currentMode.value = thread.conversation.mode || 'chat'
      selectedModelId.value = thread.conversation.modelProfileId || selectedModelId.value
      messages.value = thread.messages || []
      await Promise.all(messages.value.filter(message => message.agentRunId).map(async message => {
        try {
          const run = await invoke('agent_get_run', { runId: message.agentRunId })
          message.agentSegments = (run.steps || []).map(mapAgentStep).filter((segment): segment is AgentSegment => Boolean(segment))
        } catch {}
      }))
      if (currentMode.value === 'agent') {
        try {
          const pendingRun = await invoke('agent_get_pending_run', { conversationId: conversationId.value })
          if (pendingRun) {
            const pendingStep = [...(pendingRun.steps || [])].reverse().find(step => step.status === 'awaiting_approval' || step.status === 'awaiting_input')
            currentAgentRunId.value = pendingRun.id
            requestId.value = pendingRun.requestId
            agentSegments.value = (pendingRun.steps || []).map(mapAgentStep).filter((segment): segment is AgentSegment => Boolean(segment))
            streamingText.value = (pendingRun.steps || []).filter(step => step.kind === 'text').map(step => step.output || '').join('')
            if (pendingStep?.status === 'awaiting_approval' && pendingStep.toolCallId && pendingStep.toolName && pendingStep.approvalHash) pendingApproval.value = { runId: pendingRun.id, toolCallId: pendingStep.toolCallId, toolName: pendingStep.toolName, arguments: pendingStep.arguments || {}, approvalHash: pendingStep.approvalHash, description: `${toolLabel(pendingStep.toolName)}需要你的确认` }
            if (pendingStep?.status === 'awaiting_input' && pendingStep.toolCallId && pendingStep.approvalHash) pendingInput.value = { runId: pendingRun.id, toolCallId: pendingStep.toolCallId, inputHash: pendingStep.approvalHash, request: pendingStep.arguments || {} }
            busy.value = Boolean(pendingStep)
          }
        } catch {}
      }
      const storedReferences = messages.value.filter(item => item.role === 'user').at(-1)?.references || []
      references.value = (storedReferences as JsonValue[]).filter((item: JsonValue): item is ChatReference & JsonValue => Boolean(item && typeof item === 'object' && !Array.isArray(item) && typeof item.key === 'string' && (item.type === 'note' || item.type === 'file') && typeof item.name === 'string'))
      draft.value = ''
      error.value = ''
    } catch (cause) {
      error.value = errorMessage(cause, '历史对话读取失败')
      conversationId.value = ''
      conversationVersion.value = 0
      messages.value = []
    }
  }
  
  function handleDeleted(event: Event) { if ((event as CustomEvent<{ id?: string }>).detail?.id === conversationId.value) newChat() }
  
  watch(() => [messages.value.length, streamingText.value, busy.value], scrollToBottom, { flush: 'post' })
  
  watch(() => route.query.id, id => { if (id) loadConversation(String(id)); else if (conversationId.value && !isBusy.value) { conversationId.value = ''; conversationVersion.value = 0; conversationTitle.value = '新对话'; messages.value = [] } })
  
  onMounted(async () => {
    await appStore.initialize()
    await Promise.allSettled([
      notesStore.notes.length ? Promise.resolve() : notesStore.load(),
      library.bases.length ? Promise.resolve() : library.load(),
      invoke('agent_list_tools').then(value => { agentTools.value = value || [] })
    ])
    window.addEventListener('tiny-note-chat-deleted', handleDeleted)
    await tasksStore.initialize()
    if (route.query.id) {
      selectedModelId.value = models.value.find(model => model.isDefault)?.id || models.value[0]?.id || ''
      await loadConversation(String(route.query.id))
      return
    }
    let pending: { modelProfileId?: string; thinkingMode?: string; mode?: string; references?: ChatReference[]; message?: string } | null = null
    try {
      pending = JSON.parse(sessionStorage.getItem('tiny-note-chat-pending') || 'null')
      sessionStorage.removeItem('tiny-note-chat-pending')
    } catch {}
    selectedModelId.value = pending?.modelProfileId || models.value.find(model => model.isDefault)?.id || models.value[0]?.id || ''
    thinkingMode.value = pending?.thinkingMode || 'fast'
    currentMode.value = pending?.mode || 'chat'
    references.value = pending?.references || []
    if (pending?.message) await sendMessage(pending.message, references.value)
  })
  
  onUnmounted(() => { window.removeEventListener('tiny-note-chat-deleted', handleDeleted) })
  
  async function selectMode(mode: string) {
    if (isBusy.value || modeSaving.value || mode === currentMode.value) return
    if (!conversationId.value) {
      currentMode.value = mode
      return
    }
    modeSaving.value = true
    try {
      const updated = await invoke('chat_set_mode', { id: conversationId.value, mode, version: conversationVersion.value })
      currentMode.value = mode
      conversationVersion.value = updated.version || conversationVersion.value + 1
      window.dispatchEvent(new CustomEvent('tiny-note-chat-updated'))
    } catch (cause) {
      error.value = errorMessage(cause, '对话模式切换失败')
    } finally {
      modeSaving.value = false
    }
  }
  
  const toolLabels: Record<string, string> = { create_knowledge_base: '创建知识库', list_knowledge_bases: '读取知识库目录', update_knowledge_base: '更新知识库', delete_knowledge_base: '删除知识库', list_notes: '列出笔记', search_notes: '搜索笔记', get_note: '读取笔记', list_notebooks: '列出笔记本', create_notebook: '创建笔记本', update_notebook: '更新笔记本', move_notebook: '移动笔记本', delete_notebook: '删除笔记本', get_current_time: '获取当前时间', create_note: '创建笔记', update_note: '生成修改提案', delete_note: '删除笔记', update_memory: '更新记忆', list_agent_files: '浏览工作区', read_agent_file: '读取工作区文件', write_agent_file: '写入工作区文件', read_skill: '读取技能', write_skill: '更新技能', list_mcp_tools: '查找 MCP 工具', call_mcp_tool: '调用 MCP 工具', delegate_task: '委派子 Agent', run_sandbox_script: '运行隔离脚本' }
  
  function toolLabel(name: string | null | undefined) {
    return (name ? toolLabels[name] : '') || name || '调用工具'
  }
  
  function jsonStringField(value: JsonValue | undefined, key: string): string {
    if (!value || Array.isArray(value) || typeof value !== 'object') return ''
    const field = value[key]
    return typeof field === 'string' ? field : ''
  }
  
  function toolEventLabel(segment: AgentSegment) {
    if (segment.toolName !== 'call_mcp_tool') return toolLabel(segment.toolName)
    const server = jsonStringField(segment.arguments, 'serverId') || '未知服务'
    const tool = jsonStringField(segment.arguments, 'toolName') || '未知工具'
    return `MCP · ${server} / ${tool}`
  }
  
  function toolEventTitle(segment: AgentSegment) {
    const label = toolEventLabel(segment)
    if (segment.status === 'completed') return segment.toolName === 'call_mcp_tool' ? `已调用 ${label}` : `已${label}`
    if (segment.status === 'error') return `${label}失败`
    if (segment.status === 'rejected') return `已拒绝 · ${label}`
    if (segment.status === 'cancelled') return `已停止 · ${label}`
    if (segment.status === 'awaiting_approval') return `等待确认 · ${label}`
    return `正在${label}`
  }
  
  function formatToolDetail(value: unknown) {
    if (!value) return ''
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    return text.length > 500 ? `${text.slice(0, 500)}…` : text
  }

  return {
    route, router, notesStore, library, appStore, tasksStore, models, messages,
    draft, references, selectedModelId, thinkingMode, busy, streamingText, error, requestId,
    messagesRef, conversationId, conversationTitle, referenceMenuOpen, responseSources, responseProposal, pendingSummary, savedNote,
    currentMode, modeSaving, agentSegments, currentAgentRunId, pendingApproval, pendingInput, agentTools, approvalBusy,
    approvalError, responseFinalizing, agentTextSequence, fromHome, selectedModel, agentApprovalCount, isBusy,
    scrollToBottom, assistantContext, ensureConversation, saveMessage, pushResponse, completeResponse, mapAgentStep,
    appendAgentText, finishStreamingAgentText, hasAgentText, agentMessageTail, markActiveAgentSteps, retainInterruptedAgentRun, parseInputResponse, ensureContextConsent,
    noteHtml, noteTitle, createNoteFromText, refreshDataAfterAgent, saveAssistantAsNote, openSavedNote, addAssistantNotice, performNoteCommand,
    createResponseChannel, decideApproval, sendMessage, submit, summarizeConversation, stop, respondInput, goBack,
    newChat, toggleReferenceMenu, addNoteReference, addFileReference, removeReference, reviewProposal, copyMessage, loadConversation,
    handleDeleted, selectMode, toolLabels, toolLabel, jsonStringField, toolEventLabel, toolEventTitle,
    formatToolDetail, modelProviderLabel, tinyAgentAvatar
  }
}

export type ChatWorkspace = ReturnType<typeof useChatWorkspace>
