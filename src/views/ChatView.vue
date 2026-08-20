<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
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
function pushResponse(content) {
  if (content?.trim()) messages.value.push({ role: 'assistant', content: content.trim() })
}
async function sendMessage(value, messageReferences = references.value) {
  const message = String(value || '').trim()
  if (!message || busy.value) return
  references.value = messageReferences || []
  messages.value.push({ role: 'user', content: message, references: references.value.map(item => ({ ...item })) })
  draft.value = ''
  error.value = ''
  busy.value = true
  streamingText.value = '正在思考…'
  requestId.value = crypto.randomUUID()
  if (!window.__TAURI_INTERNALS__) {
    window.setTimeout(() => { pushResponse(`这是浏览器预览回复：${message}`); streamingText.value = ''; busy.value = false }, 500)
    return
  }
  const channel = new Channel()
  channel.onmessage = event => {
    if (event.type === 'delta') { if (streamingText.value === '正在思考…') streamingText.value = ''; streamingText.value += event.text }
    if (event.type === 'error') { error.value = event.message || '模型请求失败'; streamingText.value = ''; busy.value = false }
    if (event.type === 'cancelled') { streamingText.value = ''; busy.value = false }
    if (event.type === 'completed') { pushResponse(streamingText.value === '正在思考…' ? '模型没有返回内容，请换个问法再试。' : streamingText.value); streamingText.value = ''; busy.value = false }
  }
  try {
    await invoke('note_ai_stream', { request: { requestId: requestId.value, action: 'custom', text: assistantContext(), instruction: message, modelProfileId: selectedModel.value?.id || null, thinkingMode: thinkingMode.value, source: 'chat' }, onEvent: channel })
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
}
async function copyMessage(content) { if (content) await navigator.clipboard?.writeText(content) }

watch(() => [messages.value.length, streamingText.value, busy.value], scrollToBottom, { flush: 'post' })
onMounted(async () => {
  models.value = await invoke('model_list')
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
</script>

<template>
  <div class="chat-page">
    <header class="chat-page-header">
      <div class="chat-page-header-side"><button v-if="fromHome" type="button" class="chat-page-back" title="返回首页" @click="goBack"><ArrowLeft :size="17" /><span>返回</span></button></div>
      <div class="chat-page-title"><span class="chat-page-avatar"><Sparkles :size="15" /></span><div><strong>周五</strong><small>{{ selectedModel ? `${selectedModel.provider} · ${selectedModel.model}` : 'Tiny Note 助手' }}</small></div></div>
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
