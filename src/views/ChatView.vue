<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Channel } from '@tauri-apps/api/core'
import { ArrowLeft, Copy, Plus, Send, Sparkles, Square } from 'lucide-vue-next'
import { invoke } from '../services/tauri'

const route = useRoute()
const router = useRouter()
const messages = ref([])
const draft = ref('')
const references = ref([])
const models = ref([])
const selectedModelId = ref('')
const thinkingMode = ref('fast')
const busy = ref(false)
const streamingText = ref('')
const error = ref('')
const requestId = ref('')
const messagesRef = ref(null)
const conversationId = ref('')
const conversationTitle = ref('新对话')
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
  await router.replace({ path: '/chat', query: { id: conversation.id } })
  window.dispatchEvent(new CustomEvent('tiny-note-chat-updated'))
  return conversation.id
}
async function saveMessage(role, content, messageReferences = []) {
  const id = await ensureConversation()
  const saved = await invoke('chat_add_message', { conversationId: id, role, content, references: messageReferences })
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
  } catch { /* the conversation remains usable if title generation is unavailable */ } finally { titlesGenerating.delete(id) }
}
async function pushResponse(content) {
  const text = content?.trim()
  if (!text) return
  const saved = await saveMessage('assistant', text)
  messages.value.push(saved)
}
async function completeResponse() {
  const content = streamingText.value === '正在思考…' ? '模型没有返回内容，请换个问法再试。' : streamingText.value
  streamingText.value = ''
  try {
    await pushResponse(content)
    if (messages.value.filter(message => message.role === 'assistant').length === 1) generateTitle()
  } catch (cause) { error.value = cause?.message || '回复保存失败' } finally { busy.value = false }
}
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
  if (!window.__TAURI_INTERNALS__) {
    window.setTimeout(async () => { streamingText.value = `这是浏览器预览回复：${message}`; await completeResponse() }, 500)
    return
  }
  const channel = new Channel()
  channel.onmessage = async event => {
    if (event.type === 'delta') { if (streamingText.value === '正在思考…') streamingText.value = ''; streamingText.value += event.text }
    if (event.type === 'error') { error.value = event.message || '模型请求失败'; streamingText.value = ''; busy.value = false }
    if (event.type === 'cancelled') { streamingText.value = ''; busy.value = false }
    if (event.type === 'completed') await completeResponse()
  }
  try {
    await invoke('note_ai_stream', { request: { requestId: requestId.value, action: 'custom', text: assistantContext(), instruction: message, modelProfileId: selectedModel.value?.id || null, thinkingMode: thinkingMode.value, source: 'chat', conversationId: conversationId.value }, onEvent: channel })
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
  router.replace('/chat')
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
  models.value = await invoke('model_list')
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
        <div v-if="message.role === 'assistant'" class="chat-page-message-actions"><button type="button" title="复制" @click="copyMessage(message.content)"><Copy :size="14" /></button></div>
      </article>
      <article v-if="busy" class="chat-page-message is-assistant"><div class="chat-page-assistant-head"><span class="chat-page-avatar"><Sparkles :size="13" /></span><strong>周五</strong></div><div class="chat-page-bubble">{{ streamingText || '正在思考…' }}</div></article>
      <div v-if="error" class="chat-page-error">{{ error }} <button type="button" @click="router.push('/settings')">打开模型设置</button></div>
    </main>
    <form class="chat-page-composer" @submit.prevent="submit">
      <textarea v-model="draft" rows="2" placeholder="输入消息..." @keydown.enter.exact.prevent="submit"></textarea>
      <div class="chat-page-composer-footer"><small>内容保存在你的设备上</small><button v-if="busy" type="button" class="chat-page-send is-stop" title="停止生成" @click="stop"><Square :size="15" /></button><button v-else type="submit" class="chat-page-send" :class="{ active: draft.trim() }" title="发送"><Send :size="16" /></button></div>
    </form>
  </div>
</template>
