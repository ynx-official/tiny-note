<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { Channel } from '@tauri-apps/api/core'
import { ArrowLeft, BookOpen, Copy, File, FileText, Paperclip, Plus, Send, Sparkles, Square, X } from 'lucide-vue-next'
import { invoke } from '../services/tauri'
import { useNotesStore } from '../stores/notes'
import { useLibraryStore } from '../stores/library'
import { useAppStore } from '../stores/app'

const route = useRoute()
const router = useRouter()
const notesStore = useNotesStore()
const library = useLibraryStore()
const appStore = useAppStore()
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
const titlesGenerating = new Set()
const fromHome = computed(() => route.query.from === 'home')
const selectedModel = computed(() => models.value.find(model => model.id === selectedModelId.value) || models.value.find(model => model.isDefault) || models.value[0] || null)

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
  const conversation = await invoke('chat_create', { modelProfileId: selectedModel.value?.id || null })
  conversationId.value = conversation.id
  conversationTitle.value = conversation.title
  await router.replace({ path: '/chat', query: { id: conversation.id, ...(fromHome.value ? { from: 'home' } : {}) } })
  window.dispatchEvent(new CustomEvent('tiny-note-chat-updated'))
  return conversation.id
}
async function saveMessage(role, content, messageReferences = [], sources = [], proposalId = null) {
  const id = await ensureConversation()
  const saved = await invoke('chat_add_message', { conversationId: id, role, content, references: messageReferences, sources, proposalId })
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
  const saved = await saveMessage('assistant', text, [], responseSources.value, responseProposal.value?.id || null)
  messages.value.push(saved)
}
async function completeResponse() {
  const content = streamingText.value === '正在思考…' ? '模型没有返回内容，请换个问法再试。' : streamingText.value
  streamingText.value = ''
  try {
    await pushResponse(content)
    if (messages.value.filter(message => message.role === 'assistant').length === 1) generateTitle()
  } catch (cause) { error.value = cause?.message || '回复保存失败' } finally { busy.value = false; responseSources.value = []; responseProposal.value = null }
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
function isEditIntent(message) { return /(扩写|改写|修改|润色|精炼|替换|翻译|续写|修正|重写|rewrite|translate|polish|edit)/i.test(message) }
async function sendMessage(value, messageReferences = references.value) {
  const message = String(value || '').trim()
  if (!message || busy.value) return
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
  busy.value = true
  streamingText.value = '正在思考…'
  requestId.value = crypto.randomUUID()
  responseSources.value = []
  responseProposal.value = null
  const contextAllowed = ensureContextConsent()
  if (!window.__TAURI_INTERNALS__) {
    window.setTimeout(async () => { streamingText.value = `这是浏览器预览回复：${message}`; await completeResponse() }, 500)
    return
  }
  const channel = new Channel()
  channel.onmessage = async event => {
    if (event.type === 'delta') { if (streamingText.value === '正在思考…') streamingText.value = ''; streamingText.value += event.text }
    if (event.type === 'sources') responseSources.value = event.sources || []
    if (event.type === 'editProposal') responseProposal.value = event.proposal
    if (event.type === 'error') { error.value = event.message || '模型请求失败'; streamingText.value = ''; busy.value = false }
    if (event.type === 'cancelled') { streamingText.value = ''; busy.value = false }
    if (event.type === 'completed') await completeResponse()
  }
  try {
    const targetNotes = messageReferenceCopies.filter(item => item.type === 'note')
    const editMode = targetNotes.length === 1 && isEditIntent(message)
    await invoke('note_ai_stream', { request: { requestId: requestId.value, action: 'custom', mode: editMode ? 'edit' : 'chat', text: assistantContext(), instruction: message, references: contextAllowed ? messageReferenceCopies : [], autoRetrieve: contextAllowed, targetNoteId: targetNotes.length === 1 ? targetNotes[0].noteId : null, modelProfileId: selectedModel.value?.id || null, thinkingMode: thinkingMode.value, source: 'chat', conversationId: conversationId.value }, onEvent: channel })
  } catch (cause) { error.value = cause?.message || cause?.code || '模型请求失败'; streamingText.value = ''; busy.value = false }
}
function submit() { if (!busy.value) sendMessage(draft.value) }
async function stop() {
  if (!busy.value || !requestId.value) return
  if (window.__TAURI_INTERNALS__) { try { await invoke('note_ai_cancel', { requestId: requestId.value }) } catch {} }
  busy.value = false
  streamingText.value = ''
}
function goBack() { router.push('/') }
function newChat() {
  if (busy.value) return
  messages.value = []
  references.value = []
  draft.value = ''
  error.value = ''
  conversationId.value = ''
  conversationTitle.value = '新对话'
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
async function copyMessage(content) { if (content) await navigator.clipboard?.writeText(content) }

async function loadConversation(id) {
  if (!id || id === conversationId.value) return
  if (busy.value) await stop()
  try {
    const thread = await invoke('chat_get', { id })
    if (!thread) throw new Error('对话不存在')
    conversationId.value = thread.conversation.id
    conversationTitle.value = thread.conversation.title
    selectedModelId.value = thread.conversation.modelProfileId || selectedModelId.value
    messages.value = thread.messages || []
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
watch(() => route.query.id, id => { if (id) loadConversation(String(id)); else if (conversationId.value && !busy.value) { conversationId.value = ''; conversationTitle.value = '新对话'; messages.value = [] } })
onMounted(async () => {
  await appStore.initialize()
  await Promise.allSettled([
    notesStore.notes.length ? Promise.resolve() : notesStore.load(),
    library.bases.length ? Promise.resolve() : library.load()
  ])
  window.addEventListener('tiny-note-chat-deleted', handleDeleted)
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
  references.value = pending?.references || []
  if (pending?.message) await sendMessage(pending.message, references.value)
})
onUnmounted(() => window.removeEventListener('tiny-note-chat-deleted', handleDeleted))
</script>

<template>
  <div class="chat-page">
    <header class="chat-page-header">
      <div class="chat-page-header-side"><button v-if="fromHome" type="button" class="chat-page-back" title="返回首页" @click="goBack"><ArrowLeft :size="17" /><span>返回</span></button></div>
      <div class="chat-page-title"><span class="chat-page-avatar"><Sparkles :size="15" /></span><div><strong>{{ conversationTitle === '新对话' ? '周五' : conversationTitle }}</strong><small>{{ selectedModel ? `${selectedModel.provider} · ${selectedModel.model}` : 'Tiny Note 助手' }}</small></div></div>
      <div class="chat-page-header-side is-right"><button type="button" class="chat-page-icon" title="新对话" @click="newChat"><Plus :size="18" /></button></div>
    </header>
    <main ref="messagesRef" class="chat-page-messages" aria-live="polite">
      <div v-if="!messages.length && !busy" class="chat-page-empty"><span class="chat-page-empty-avatar"><Sparkles :size="23" /></span><strong>你好，我是周五</strong><p>我可以帮你整理知识、查询笔记和处理文档。</p></div>
      <article v-for="(message, index) in messages" :key="`${index}-${message.role}`" class="chat-page-message" :class="`is-${message.role}`">
        <div v-if="message.role === 'assistant'" class="chat-page-assistant-head"><span class="chat-page-avatar"><Sparkles :size="13" /></span><strong>周五</strong></div>
        <div class="chat-page-bubble">{{ message.content }}</div>
        <div v-if="message.sources?.length" class="chat-source-list"><span v-for="(source, sourceIndex) in message.sources" :key="source.id" class="chat-source-chip" :title="source.snippet">[{{ sourceIndex + 1 }}] {{ source.title }}<small v-if="source.truncated">已截取</small></span></div>
        <button v-if="message.proposalId" type="button" class="chat-review-proposal" @click="reviewProposal(message.proposalId)">在文章中审阅修改</button>
        <div v-if="message.role === 'assistant'" class="chat-page-message-actions"><button type="button" title="复制" @click="copyMessage(message.content)"><Copy :size="14" /></button></div>
      </article>
      <article v-if="busy" class="chat-page-message is-assistant"><div class="chat-page-assistant-head"><span class="chat-page-avatar"><Sparkles :size="13" /></span><strong>周五</strong></div><div class="chat-page-bubble">{{ streamingText || '正在思考…' }}</div></article>
      <div v-if="error" class="chat-page-error">{{ error }} <button type="button" @click="router.push('/settings')">打开模型设置</button></div>
    </main>
    <form class="chat-page-composer" @submit.prevent="submit">
      <div v-if="references.length" class="chat-reference-tags"><span v-for="reference in references" :key="reference.key"><FileText v-if="reference.type === 'note'" :size="13" /><File v-else :size="13" />{{ reference.name }}<button type="button" @click="removeReference(reference.key)"><X :size="12" /></button></span></div>
      <textarea v-model="draft" rows="2" placeholder="输入消息..." @keydown.enter.exact.prevent="submit"></textarea>
      <div class="chat-page-composer-footer"><div class="chat-reference-anchor"><button type="button" class="chat-attach-button" title="引用笔记或文件" @click="toggleReferenceMenu"><Paperclip :size="15" /></button><div v-if="referenceMenuOpen" class="chat-reference-menu"><strong>引用内容</strong><small>笔记</small><button v-for="note in notesStore.notes" :key="note.id" type="button" @click="addNoteReference(note)"><FileText :size="13" />{{ note.title || '未命名笔记' }}</button><small v-if="library.entries.some(item => item.kind === 'file')">{{ library.active?.name || '知识库文件' }}</small><button v-for="entry in library.entries.filter(item => item.kind === 'file')" :key="entry.relativePath" type="button" @click="addFileReference(entry)"><BookOpen :size="13" />{{ entry.name }}</button></div><small>内容保存在你的设备上</small></div><button v-if="busy" type="button" class="chat-page-send is-stop" title="停止生成" @click="stop"><Square :size="15" /></button><button v-else type="submit" class="chat-page-send" :class="{ active: draft.trim() }" title="发送"><Send :size="16" /></button></div>
    </form>
  </div>
</template>
