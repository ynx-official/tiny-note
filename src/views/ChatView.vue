<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { Channel } from '@tauri-apps/api/core'
import { marked } from 'marked'
import { ArrowLeft, BookOpen, ChevronDown, Copy, File, FileText, LoaderCircle, MessageCircle, NotebookPen, Paperclip, Plus, Save, Send, Square, Wrench, X } from 'lucide-vue-next'
import { invoke } from '../services/tauri'
import { useNotesStore } from '../stores/notes'
import { useLibraryStore } from '../stores/library'
import { useAppStore } from '../stores/app'
import { useTasksStore } from '../stores/tasks'
import { modelProviderLabel } from '../utils/modelProvider'
import MarkdownMessage from '../components/MarkdownMessage.vue'
import AgentInputCard from '../components/AgentInputCard.vue'
import { isConversationSummaryIntent, isNoteEditIntent, parseNoteCommand } from '../utils/noteChatCommands'
import { sanitizeEditorHtml, textFromEditorHtml } from '../utils/noteMarkdown'
import tinyAgentAvatar from '../../src-tauri/icons/128x128.png'

const route = useRoute()
const router = useRouter()
const notesStore = useNotesStore()
const library = useLibraryStore()
const appStore = useAppStore()
const tasksStore = useTasksStore()
const { models } = storeToRefs(appStore)
const messages = ref([])
const draft = ref('')
const references = ref([])
const selectedModelId = ref('')
const thinkingMode = ref('fast')
const busy = ref(false)
const streamingText = ref('')
const error = ref('')
const requestId = ref('')
const messagesRef = ref(null)
const conversationId = ref('')
const conversationTitle = ref('新对话')
const referenceMenuOpen = ref(false)
const responseSources = ref([])
const responseProposal = ref(null)
const pendingSummary = ref(false)
const savedNote = ref(null)
const currentMode = ref('chat')
const modeSaving = ref(false)
const agentSegments = ref([])
const currentAgentRunId = ref('')
const pendingApproval = ref(null)
const pendingInput = ref(null)
const agentTools = ref([])
const approvalBusy = ref(false)
const approvalError = ref('')
const titlesGenerating = new Set()
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
  conversationTitle.value = conversation.title
  await router.replace({ path: '/chat', query: { id: conversation.id, ...(fromHome.value ? { from: 'home' } : {}) } })
  window.dispatchEvent(new CustomEvent('tiny-note-chat-updated'))
  return conversation.id
}
async function saveMessage(role, content, messageReferences = [], sources = [], proposalId = null, agentRunId = null) {
  const id = await ensureConversation()
  const saved = await invoke('chat_add_message', { conversationId: id, role, content, references: messageReferences, sources, proposalId, agentRunId })
  window.dispatchEvent(new CustomEvent('tiny-note-chat-updated'))
  return saved
}
async function generateTitle() {
  const id = conversationId.value
  if (!id || conversationTitle.value !== '新对话' || titlesGenerating.has(id)) return
  titlesGenerating.add(id)
  try {
    const title = await invoke('chat_generate_title', { conversationId: id, modelProfileId: selectedModel.value?.id || null })
    if (conversationId.value === id) conversationTitle.value = title
    window.dispatchEvent(new CustomEvent('tiny-note-chat-updated'))
  } catch (cause) {
    console.warn('Conversation title generation failed', cause)
  } finally { titlesGenerating.delete(id) }
}
async function pushResponse(content) {
  const text = content?.trim()
  if (!text) return
  const saved = await saveMessage('assistant', text, [], responseSources.value, responseProposal.value?.id || null, currentAgentRunId.value || null)
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
    if (messages.value.filter(message => message.role === 'assistant').length === 1) generateTitle()
  } catch (cause) { error.value = cause?.message || '回复保存失败' } finally { busy.value = false; responseSources.value = []; responseProposal.value = null; pendingSummary.value = false; agentSegments.value = []; currentAgentRunId.value = ''; pendingApproval.value = null; pendingInput.value = null; approvalBusy.value = false; approvalError.value = ''; responseFinalizing = false }
}
function mapAgentStep(step) {
  if (step.kind === 'text' && step.output) return { id: step.id, type: 'text', content: step.output, status: step.status || 'completed' }
  if (step.kind === 'input') return { id: step.toolCallId || step.id, type: 'input', toolName: step.toolName, arguments: step.arguments || {}, response: parseInputResponse(step.output), status: step.status }
  if (step.kind !== 'tool') return null
  return { id: step.toolCallId || step.id, type: 'tool', toolName: step.toolName, arguments: step.arguments || {}, output: step.output || '', status: step.status }
}
function appendAgentText(text) {
  if (!text) return
  const last = agentSegments.value.at(-1)
  if (last?.type === 'text' && last.status === 'streaming') last.content += text
  else agentSegments.value.push({ id: `text-${++agentTextSequence}`, type: 'text', content: text, status: 'streaming' })
}
function finishStreamingAgentText() {
  const last = agentSegments.value.at(-1)
  if (last?.type === 'text' && last.status === 'streaming') last.status = 'completed'
}
function hasAgentText(segments) { return Boolean(segments?.some(segment => segment.type === 'text')) }
function agentMessageTail(message) {
  if (!hasAgentText(message.agentSegments)) return message.content
  const recordedText = message.agentSegments.filter(segment => segment.type === 'text').map(segment => segment.content).join('')
  return recordedText === message.content ? '' : message.content
}
function markActiveAgentSteps(status) {
  agentSegments.value = agentSegments.value.map(segment =>
    segment.status === 'running' || segment.status === 'awaiting_approval' || segment.status === 'awaiting_input'
      ? { ...segment, status }
      : segment
  )
}
async function retainInterruptedAgentRun(status, message) {
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
function parseInputResponse(output) {
  if (!output) return null
  if (typeof output === 'object') return output
  try { return JSON.parse(output) } catch { return null }
}
function ensureContextConsent() {
  const modelId = selectedModel.value?.id
  if (!modelId) return false
  const consentKey = `tiny-note-context-consent:${modelId}`
  if (localStorage.getItem(consentKey) === 'granted') return true
  const allowed = window.confirm('Tiny Note 会把本轮命中的本地笔记或知识库片段发送给当前模型。只发送相关片段，并在回答下方展示来源。是否允许？')
  if (allowed) localStorage.setItem(consentKey, 'granted')
  return allowed
}
function noteHtml(text) { return sanitizeEditorHtml(marked.parse(String(text || ''))) }
function noteTitle(text, fallback = '对话笔记') {
  const heading = String(text || '').match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim()
  return (heading || fallback).slice(0, 80)
}
async function createNoteFromText(content, fallbackTitle = '对话笔记') {
  const contentHtml = noteHtml(content)
  const note = await notesStore.createFromContent({ title: noteTitle(content, fallbackTitle), contentHtml, contentText: textFromEditorHtml(contentHtml), contentMarkdown: content })
  savedNote.value = note
  return note
}
async function refreshDataAfterAgent() {
  // Agent tools write through Rust directly, so the Pinia lists need an
  // explicit reload before the user navigates back to Notes or Library.
  const activeBaseId = library.activeId
  const activePath = library.path
  await Promise.allSettled([notesStore.load(), library.load()])
  if (activeBaseId && library.activeId === activeBaseId && activePath) {
    await library.navigate(activePath, false)
  }
}
async function saveAssistantAsNote(message) {
  try { error.value = ''; await createNoteFromText(message.content, conversationTitle.value === '新对话' ? '对话笔记' : conversationTitle.value) }
  catch (cause) { error.value = cause?.message || '保存笔记失败' }
}
function openSavedNote() { if (savedNote.value) router.push({ path: '/notes', query: { note: savedNote.value.id } }) }
async function addAssistantNotice(content) {
  const saved = await saveMessage('assistant', content)
  messages.value.push(saved)
}
async function performNoteCommand(command, messageReferences) {
  if (!command) return false
  if (command.action === 'create') {
    const note = await createNoteFromText(command.content, command.title)
    if (command.title && command.title !== '未命名笔记' && note.title !== command.title) await notesStore.rename(note.id, command.title)
    await addAssistantNotice(`已创建笔记「${command.title || note.title}」。`)
    return true
  }
  const targets = messageReferences.filter(item => item.type === 'note')
  if (targets.length !== 1) {
    await addAssistantNotice('请先用输入框左下角的回形针引用一篇笔记，我才能准确执行这个操作。')
    return true
  }
  const target = notesStore.notes.find(note => note.id === targets[0].noteId)
  if (!target) { await addAssistantNotice('这篇笔记不存在或已被删除。'); return true }
  if (command.action === 'rename') {
    await notesStore.rename(target.id, command.value)
    await addAssistantNotice(`已将笔记重命名为「${command.value}」。`)
  } else if (command.action === 'duplicate') {
    const copy = await notesStore.duplicate(target.id)
    savedNote.value = copy
    await addAssistantNotice(`已创建「${copy.title}」。`)
  } else if (command.action === 'move') {
    const notebook = notesStore.notebooks.find(item => item.name.trim().toLowerCase() === command.value.toLowerCase())
    if (!notebook) await addAssistantNotice(`没有找到名为「${command.value}」的笔记本，请先创建该笔记本。`)
    else { await notesStore.move(target.id, notebook.id); await addAssistantNotice(`已将「${target.title}」移动到「${notebook.name}」。`) }
  } else if (command.action === 'delete') {
    if (!window.confirm(`确定把「${target.title}」移到最近删除吗？`)) await addAssistantNotice('已取消删除。')
    else { await notesStore.remove(target.id); references.value = references.value.filter(item => item.noteId !== target.id); await addAssistantNotice(`已将「${target.title}」移到最近删除，可在 30 天内恢复。`) }
  }
  return true
}

function createResponseChannel() {
  const channel = new Channel()
  channel.onmessage = async event => {
    if (event.type === 'delta' || event.type === 'textDelta') {
      if (streamingText.value === '正在思考…') streamingText.value = ''
      streamingText.value += event.text
      if (currentMode.value === 'agent') appendAgentText(event.text)
    }
    if (event.type === 'started' && event.runId) currentAgentRunId.value = event.runId
    if (event.type === 'toolCall') {
      finishStreamingAgentText()
      const existing = agentSegments.value.find(item => item.id === event.toolCallId)
      if (!existing) agentSegments.value.push({ id: event.toolCallId, type: 'tool', toolName: event.toolName, arguments: event.arguments || {}, status: 'running', output: '' })
    }
    if (event.type === 'approvalRequired') {
      const segment = agentSegments.value.find(item => item.id === event.toolCallId)
      if (segment) segment.status = 'awaiting_approval'
      approvalError.value = ''
      pendingApproval.value = { runId: event.runId, toolCallId: event.toolCallId, toolName: event.toolName, arguments: event.arguments || {}, approvalHash: event.approvalHash, description: event.description || 'Tiny Agent 请求执行写操作' }
    }
    if (event.type === 'inputRequired') {
      finishStreamingAgentText()
      let segment = agentSegments.value.find(item => item.id === event.toolCallId)
      if (!segment) {
        segment = { id: event.toolCallId, type: 'input', toolName: 'request_user_input', arguments: event.request || {}, response: null, status: 'awaiting_input' }
        agentSegments.value.push(segment)
      } else {
        Object.assign(segment, { type: 'input', arguments: event.request || {}, status: 'awaiting_input' })
      }
      pendingInput.value = { runId: event.runId, toolCallId: event.toolCallId, inputHash: event.inputHash, request: event.request || {} }
    }
    if (event.type === 'toolResult') {
      const segment = agentSegments.value.find(item => item.id === event.toolCallId)
      if (segment) Object.assign(segment, { status: event.status || 'completed', output: event.output || '', response: segment.type === 'input' ? parseInputResponse(event.output) : segment.response })
    }
    if (event.type === 'sources') responseSources.value = event.sources || []
    if (event.type === 'editProposal') responseProposal.value = event.proposal
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

async function decideApproval(decision) {
  const approval = pendingApproval.value
  if (!approval || approvalBusy.value) return
  error.value = ''
  approvalError.value = ''
  approvalBusy.value = true
  // A Tauri Channel is closed when the worker that emitted ApprovalRequired
  // returns. Every resume starts a new worker and therefore needs a new channel.
  const channel = createResponseChannel()
  const segment = agentSegments.value.find(item => item.id === approval.toolCallId)
  if (segment) segment.status = decision === 'approve' ? 'running' : 'rejected'
  try {
    await invoke('agent_resume', { request: { runId: approval.runId, toolCallId: approval.toolCallId, approvalHash: approval.approvalHash, decision, reason: decision === 'reject' ? '用户拒绝执行此操作' : null }, onEvent: channel })
    if (pendingApproval.value?.toolCallId === approval.toolCallId) pendingApproval.value = null
  } catch (cause) {
    approvalError.value = (typeof cause === 'string' && cause.trim()) ? cause : cause?.message || cause?.code || '审批回传失败'
    error.value = approvalError.value
    pendingApproval.value = approval
    if (segment) segment.status = 'awaiting_approval'
  } finally { approvalBusy.value = false }
}

async function sendMessage(value, messageReferences = references.value) {
  const message = String(value || '').trim()
  if (!message || isBusy.value) return
  references.value = messageReferences || []
  const messageReferenceCopies = references.value.map(item => ({ ...item }))
  let savedUserMessage
  try {
    savedUserMessage = await saveMessage('user', message, messageReferenceCopies)
  } catch (cause) {
    error.value = cause?.message || cause?.code || '消息保存失败'
    return
  }
  messages.value.push(savedUserMessage)
  draft.value = ''
  error.value = ''
  try {
    if (currentMode.value !== 'agent' && await performNoteCommand(parseNoteCommand(message), messageReferenceCopies)) return
  } catch (cause) {
    error.value = cause?.message || '笔记操作失败'
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
  const contextAllowed = ensureContextConsent()
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
      await invoke('note_ai_stream', { request: { requestId: requestId.value, action: 'custom', mode: editMode ? 'edit' : 'chat', text: assistantContext(), instruction: message, references: contextAllowed ? messageReferenceCopies : [], autoRetrieve: contextAllowed, targetNoteId: targetNotes.length === 1 ? targetNotes[0].noteId : null, modelProfileId: selectedModel.value?.id || null, thinkingMode: thinkingMode.value, source: 'chat', conversationId: conversationId.value }, onEvent: channel })
    }
  } catch (cause) {
    const message = cause?.message || cause?.code || (typeof cause === 'string' ? cause : '') || '模型请求失败'
    error.value = message
    if (!await retainInterruptedAgentRun('error', `Tiny Agent 执行失败：${message}`)) { streamingText.value = ''; busy.value = false }
  }
}
function submit() { if (!isBusy.value) sendMessage(draft.value, references.value) }
async function summarizeConversation(event) {
  if (isBusy.value || messages.value.length < 2 || tasksStore.activeSummaryForConversation(conversationId.value)) return
  const snapshot = messages.value.map(item => `${item.role === 'user' ? '用户' : '助手'}：${item.content}`).join('\n\n')
  try {
    await tasksStore.enqueue({
      kind: 'conversation_summary',
      title: `${conversationTitle.value === '新对话' ? '对话' : conversationTitle.value} · 总结为笔记`,
      conversationId: conversationId.value,
      modelProfileId: selectedModel.value?.id || null,
      payload: {
        fallbackTitle: `${conversationTitle.value === '新对话' ? '对话总结' : conversationTitle.value} · 总结`,
        snapshot,
        request: { action: 'custom', mode: 'chat', text: snapshot, instruction: '请把以下对话整理为一篇结构清晰的 Markdown 笔记：提炼主题、关键结论、重要细节和待办事项；不要添加对话中没有的信息。', references: [], autoRetrieve: false, modelProfileId: selectedModel.value?.id || null, thinkingMode: thinkingMode.value, source: 'conversation_summary', conversationId: conversationId.value }
      }
    }, { sourceElement: event?.currentTarget })
  } catch (cause) { error.value = cause?.message || '总结任务创建失败' }
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

async function respondInput(answer) {
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
    error.value = (typeof cause === 'string' && cause.trim()) ? cause : cause?.message || cause?.code || '回答回传失败'
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
function addNoteReference(note) {
  const value = { key: `note:${note.id}`, type: 'note', name: note.title || '未命名笔记', noteId: note.id }
  if (!references.value.some(item => item.key === value.key)) references.value.push(value)
  referenceMenuOpen.value = false
}
function addFileReference(entry) {
  const value = { key: `file:${library.activeId}:${entry.relativePath}`, type: 'file', name: entry.name, knowledgeBaseId: library.activeId, baseId: library.activeId, baseName: library.active?.name || '', relativePath: entry.relativePath }
  if (!references.value.some(item => item.key === value.key)) references.value.push(value)
  referenceMenuOpen.value = false
}
function removeReference(key) { references.value = references.value.filter(item => item.key !== key) }
async function reviewProposal(proposalId) {
  const proposal = await invoke('note_edit_get', { proposalId })
  router.push({ path: '/notes', query: { note: proposal.noteId, proposal: proposal.id } })
}
async function copyMessage(content) {
  if (!content || !navigator.clipboard) return
  const source = String(content)
  const html = DOMPurify.sanitize(marked.parse(source, { breaks: true, gfm: true }))
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

async function loadConversation(id, force = false) {
  if (!id || (!force && id === conversationId.value)) return
  busy.value = false
  streamingText.value = ''
  try {
    const thread = await invoke('chat_get', { id })
    if (!thread) throw new Error('对话不存在')
    conversationId.value = thread.conversation.id
    conversationTitle.value = thread.conversation.title
    currentMode.value = thread.conversation.mode || 'chat'
    selectedModelId.value = thread.conversation.modelProfileId || selectedModelId.value
    messages.value = thread.messages || []
    await Promise.all(messages.value.filter(message => message.agentRunId).map(async message => {
      try {
        const run = await invoke('agent_get_run', { runId: message.agentRunId })
        message.agentSegments = (run.steps || []).map(mapAgentStep).filter(Boolean)
      } catch {}
    }))
    if (currentMode.value === 'agent') {
      try {
        const pendingRun = await invoke('agent_get_pending_run', { conversationId: conversationId.value })
        if (pendingRun) {
          const pendingStep = [...(pendingRun.steps || [])].reverse().find(step => step.status === 'awaiting_approval' || step.status === 'awaiting_input')
          currentAgentRunId.value = pendingRun.id
          requestId.value = pendingRun.requestId
          agentSegments.value = (pendingRun.steps || []).map(mapAgentStep).filter(Boolean)
          streamingText.value = (pendingRun.steps || []).filter(step => step.kind === 'text').map(step => step.output || '').join('')
          if (pendingStep?.status === 'awaiting_approval') pendingApproval.value = { runId: pendingRun.id, toolCallId: pendingStep.toolCallId, toolName: pendingStep.toolName, arguments: pendingStep.arguments || {}, approvalHash: pendingStep.approvalHash, description: `${toolLabel(pendingStep.toolName)}需要你的确认` }
          if (pendingStep?.status === 'awaiting_input') pendingInput.value = { runId: pendingRun.id, toolCallId: pendingStep.toolCallId, inputHash: pendingStep.approvalHash, request: pendingStep.arguments || {} }
          busy.value = Boolean(pendingStep)
        }
      } catch {}
    }
    references.value = messages.value.filter(item => item.role === 'user').at(-1)?.references || []
    draft.value = ''
    error.value = ''
    if (conversationTitle.value === '新对话' && messages.value.some(message => message.role === 'user') && messages.value.some(message => message.role === 'assistant')) generateTitle()
  } catch (cause) {
    error.value = cause?.message || '历史对话读取失败'
    conversationId.value = ''
    messages.value = []
  }
}
function handleDeleted(event) { if (event.detail?.id === conversationId.value) newChat() }
watch(() => [messages.value.length, streamingText.value, busy.value], scrollToBottom, { flush: 'post' })
watch(() => route.query.id, id => { if (id) loadConversation(String(id)); else if (conversationId.value && !isBusy.value) { conversationId.value = ''; conversationTitle.value = '新对话'; messages.value = [] } })
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
  let pending = null
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

async function selectMode(mode) {
  if (isBusy.value || modeSaving.value || mode === currentMode.value) return
  if (!conversationId.value) {
    currentMode.value = mode
    return
  }
  modeSaving.value = true
  try {
    await invoke('chat_set_mode', { id: conversationId.value, mode })
    currentMode.value = mode
    window.dispatchEvent(new CustomEvent('tiny-note-chat-updated'))
  } catch (cause) {
    error.value = cause?.message || cause?.code || '对话模式切换失败'
  } finally {
    modeSaving.value = false
  }
}

function toolLabel(name) {
  return ({ create_knowledge_base: '创建知识库', list_knowledge_bases: '读取知识库目录', update_knowledge_base: '更新知识库', delete_knowledge_base: '删除知识库', retrieve_knowledge: '检索知识库', search_notes: '搜索笔记', get_note: '读取笔记', get_current_time: '获取当前时间', create_note: '创建笔记', update_note: '生成修改提案', delete_note: '删除笔记', update_memory: '更新记忆', list_agent_files: '浏览工作区', read_agent_file: '读取工作区文件', write_agent_file: '写入工作区文件', read_skill: '读取技能', write_skill: '更新技能', list_mcp_tools: '查找 MCP 工具', call_mcp_tool: '调用 MCP 工具', delegate_task: '委派子 Agent', run_sandbox_script: '运行隔离脚本' })[name] || name || '调用工具'
}
function toolEventLabel(segment) {
  if (segment.toolName !== 'call_mcp_tool') return toolLabel(segment.toolName)
  const server = segment.arguments?.serverId || '未知服务'
  const tool = segment.arguments?.toolName || '未知工具'
  return `MCP · ${server} / ${tool}`
}
function toolEventTitle(segment) {
  const label = toolEventLabel(segment)
  if (segment.status === 'completed') return segment.toolName === 'call_mcp_tool' ? `已调用 ${label}` : `已${label}`
  if (segment.status === 'error') return `${label}失败`
  if (segment.status === 'rejected') return `已拒绝 · ${label}`
  if (segment.status === 'cancelled') return `已停止 · ${label}`
  if (segment.status === 'awaiting_approval') return `等待确认 · ${label}`
  return `正在${label}`
}

function formatToolDetail(value) {
  if (!value) return ''
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return text.length > 500 ? `${text.slice(0, 500)}…` : text
}
</script>

<template>
  <div class="chat-page">
    <header class="chat-page-header">
      <div class="chat-page-header-side"><button v-if="fromHome" type="button" class="chat-page-back" title="返回首页" @click="goBack"><ArrowLeft :size="17" /><span>返回</span></button></div>
      <div class="chat-page-title"><span class="chat-page-avatar tiny-agent-avatar"><img class="tiny-agent-avatar-image" :src="tinyAgentAvatar" alt="" /></span><div><strong>{{ conversationTitle === '新对话' ? 'Tiny Agent' : conversationTitle }}</strong><small>{{ currentMode === 'agent' ? 'Tiny Agent · ' : '' }}{{ selectedModel ? `${modelProviderLabel(selectedModel.provider)} · ${selectedModel.model}` : 'Tiny Note 助手' }}</small></div></div>
      <div class="chat-page-header-side is-right"><button type="button" class="chat-page-summary" :disabled="isBusy || messages.length < 2 || tasksStore.activeSummaryForConversation(conversationId)" title="将当前对话总结并保存为笔记" @click="summarizeConversation"><NotebookPen :size="15" /><span>{{ tasksStore.activeSummaryForConversation(conversationId) ? '正在后台总结' : '总结为笔记' }}</span></button><button type="button" class="chat-page-icon" title="新对话" @click="newChat"><Plus :size="18" /></button></div>
    </header>
    <main ref="messagesRef" class="chat-page-messages" aria-live="polite">
      <div v-if="!messages.length && !isBusy" class="chat-page-empty"><span class="chat-page-empty-avatar tiny-agent-avatar"><img class="tiny-agent-avatar-image" :src="tinyAgentAvatar" alt="" /></span><strong>你好，我是 Tiny Agent</strong><p>我可以总结对话，也能创建、查询和修改你的笔记。</p><small class="chat-experimental-note">实验功能：写入、删除和外部工具调用会先请求审批。</small><div class="chat-page-suggestions"><button type="button" @click="draft = '创建笔记《项目想法》，内容：'">创建一篇笔记</button><button type="button" @click="draft = '查找关于 ' ">查询已有笔记</button></div></div>
      <article v-for="(message, index) in messages" :key="`${index}-${message.role}`" class="chat-page-message" :class="`is-${message.role}`">
        <div v-if="message.role === 'assistant'" class="chat-page-assistant-head"><span class="chat-page-avatar tiny-agent-avatar"><img class="tiny-agent-avatar-image" :src="tinyAgentAvatar" alt="" /></span><strong>Tiny Agent</strong></div>
        <div v-if="message.agentSegments?.length" class="agent-timeline agent-event-timeline">
          <template v-for="segment in message.agentSegments" :key="segment.id">
            <div v-if="segment.type === 'text'" class="agent-event agent-text-event" data-agent-event="text"><MarkdownMessage :content="segment.content" /></div>
            <AgentInputCard v-else-if="segment.type === 'input'" :request="segment.arguments" :status="segment.status" :response="segment.response" data-agent-event="input" />
            <details v-else class="agent-event agent-tool-step" :class="`status-${segment.status}`" data-agent-event="tool">
              <summary><span class="agent-tool-status-dot"><span v-if="segment.status === 'running'" class="agent-tool-dot-pulse"></span></span><Wrench class="agent-tool-glyph" :size="13" /><span>{{ toolEventTitle(segment) }}</span><ChevronDown :size="12" /></summary>
              <div><strong>参数</strong><pre>{{ formatToolDetail(segment.arguments) }}</pre><strong v-if="segment.output">真实返回</strong><pre v-if="segment.output">{{ formatToolDetail(segment.output) }}</pre></div>
            </details>
          </template>
        </div>
        <div v-if="message.role === 'user'" class="chat-page-bubble">{{ message.content }}</div>
        <MarkdownMessage v-else-if="agentMessageTail(message)" :content="agentMessageTail(message)" />
        <div v-if="message.sources?.length" class="chat-source-list"><span v-for="(source, sourceIndex) in message.sources" :key="source.id" class="chat-source-chip" :title="source.snippet">[{{ sourceIndex + 1 }}] {{ source.title }}<small v-if="source.truncated">已截取</small></span></div>
        <button v-if="message.proposalId" type="button" class="chat-review-proposal" @click="reviewProposal(message.proposalId)">在文章中审阅修改</button>
        <div v-if="message.role === 'assistant'" class="chat-page-message-actions"><button type="button" title="复制" @click="copyMessage(message.content)"><Copy :size="14" /></button><button type="button" title="保存这条回复为笔记" @click="saveAssistantAsNote(message)"><Save :size="14" /></button></div>
      </article>
      <article v-if="isBusy" class="chat-page-message is-assistant"><div class="chat-page-assistant-head"><span class="chat-page-avatar tiny-agent-avatar"><img class="tiny-agent-avatar-image" :src="tinyAgentAvatar" alt="" /></span><strong>Tiny Agent</strong><small v-if="currentMode === 'agent'" class="agent-mode-badge">Tiny Agent</small></div><div v-if="currentMode === 'agent' && agentSegments.length" class="agent-timeline agent-event-timeline"><template v-for="segment in agentSegments" :key="segment.id"><div v-if="segment.type === 'text'" class="agent-event agent-text-event" data-agent-event="text"><MarkdownMessage :content="segment.content" streaming /></div><AgentInputCard v-else-if="segment.type === 'input'" :request="segment.arguments" :status="segment.status" :response="segment.response" :interactive="segment.status === 'awaiting_input'" data-agent-event="input" @answer="respondInput" /><details v-else class="agent-event agent-tool-step" :class="`status-${segment.status}`" data-agent-event="tool"><summary><span class="agent-tool-status-dot"><span v-if="segment.status === 'running'" class="agent-tool-dot-pulse"></span></span><Wrench class="agent-tool-glyph" :size="13" /><span>{{ toolEventTitle(segment) }}</span><ChevronDown :size="12" /></summary><div><strong>参数</strong><pre>{{ formatToolDetail(segment.arguments) }}</pre><strong v-if="segment.output">真实返回</strong><pre v-if="segment.output">{{ formatToolDetail(segment.output) }}</pre></div></details></template></div><MarkdownMessage v-else :content="streamingText || '正在思考…'" streaming /></article>
      <div v-if="error" class="chat-page-error">{{ error }} <button type="button" @click="router.push('/settings')">打开模型设置</button></div>
      <div v-if="savedNote" class="chat-page-saved"><FileText :size="15" /><span>已保存为「{{ savedNote.title }}」</span><button type="button" @click="openSavedNote">打开笔记</button><button type="button" class="is-close" title="关闭" @click="savedNote = null"><X :size="13" /></button></div>
    </main>
    <Teleport to="body">
      <div v-if="pendingApproval" class="agent-approval-overlay" role="presentation" @pointerdown.stop @click.stop>
        <section class="agent-approval-dialog" role="dialog" aria-modal="true" aria-labelledby="agent-approval-title">
          <div class="agent-approval-heading"><span><Wrench :size="18" /></span><div><strong id="agent-approval-title">确认 Tiny Agent 操作</strong><small>{{ pendingApproval.description }}</small></div></div>
          <div class="agent-approval-tool"><b>{{ toolLabel(pendingApproval.toolName) }}</b><pre>{{ formatToolDetail(pendingApproval.arguments) }}</pre></div>
          <p>批准仅对以上参数生效；如果参数发生变化，Tiny Agent 会重新请求确认。</p>
          <p v-if="approvalError" class="agent-approval-error">{{ approvalError }}</p>
          <div class="agent-approval-actions"><button type="button" class="is-reject" :disabled="approvalBusy" @click="decideApproval('reject')">拒绝</button><button type="button" class="is-approve" :disabled="approvalBusy" @click="decideApproval('approve')"><LoaderCircle v-if="approvalBusy" class="is-spinning" :size="14" />{{ approvalBusy ? '正在继续…' : '批准并继续' }}</button></div>
        </section>
      </div>
    </Teleport>
    <form class="chat-page-composer" @submit.prevent="submit">
      <div v-if="references.length" class="chat-reference-tags"><span v-for="reference in references" :key="reference.key"><FileText v-if="reference.type === 'note'" :size="13" /><File v-else :size="13" />{{ reference.name }}<button type="button" @click="removeReference(reference.key)"><X :size="12" /></button></span></div>
      <textarea v-model="draft" rows="2" placeholder="输入消息..." @keydown.enter.exact.prevent="submit"></textarea>
      <div class="chat-page-composer-footer"><div class="chat-composer-left"><div class="chat-mode-switch" :class="{ 'is-locked': isBusy || modeSaving }"><button type="button" :class="{ active: currentMode === 'chat' }" :disabled="isBusy || modeSaving" title="普通对话" @click="selectMode('chat')"><MessageCircle :size="14" />对话</button><button type="button" :class="{ active: currentMode === 'agent' }" :disabled="isBusy || modeSaving" title="实验功能：自主调用工具完成任务" @click="selectMode('agent')"><Wrench :size="14" />Tiny Agent · 实验</button></div><div class="chat-reference-anchor"><button type="button" class="chat-attach-button" title="引用笔记或文件" @click="toggleReferenceMenu"><Paperclip :size="15" /></button><div v-if="referenceMenuOpen" class="chat-reference-menu"><strong>引用内容</strong><small>笔记</small><button v-for="note in notesStore.notes" :key="note.id" type="button" @click="addNoteReference(note)"><FileText :size="13" />{{ note.title || '未命名笔记' }}</button><small v-if="library.entries.some(item => item.kind === 'file')">{{ library.active?.name || '知识库文件' }}</small><button v-for="entry in library.entries.filter(item => item.kind === 'file')" :key="entry.relativePath" type="button" @click="addFileReference(entry)"><BookOpen :size="13" />{{ entry.name }}</button></div></div><small v-if="currentMode === 'agent'" data-testid="agent-tool-summary" class="chat-agent-tool-summary">{{ agentTools.length }} 个工具可用 · {{ agentApprovalCount }} 个操作需审批</small><small v-else>{{ modeSaving ? '正在切换模式…' : isBusy ? '正在生成回复，请留在当前页面' : '内容保存在你的设备上' }}</small></div><button v-if="isBusy" type="button" class="chat-page-send is-stop" aria-label="停止生成" title="停止生成" @click="stop"><Square :size="15" /></button><button v-else type="submit" class="chat-page-send" :class="{ active: draft.trim() }" :disabled="!draft.trim()" aria-label="发送消息" title="发送消息"><Send :size="16" /></button></div>
    </form>
  </div>
</template>
