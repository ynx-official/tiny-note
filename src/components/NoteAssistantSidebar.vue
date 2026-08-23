<script setup>
import { nextTick, ref, watch } from 'vue'
import { BookOpen, Copy, FileText, Send, Sparkles, Square, X } from 'lucide-vue-next'
import MarkdownMessage from './MarkdownMessage.vue'

const props = defineProps({
  note: { type: Object, default: null },
  selection: { type: Object, default: null },
  messages: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
  streamingText: { type: String, default: '' }
})
const emit = defineEmits(['close', 'send', 'stop', 'copy'])
const input = ref('')
const messagesRef = ref(null)

function scrollToBottom() {
  nextTick(() => {
    const container = messagesRef.value
    if (container) container.scrollTop = container.scrollHeight
  })
}
function submit() {
  const text = input.value.trim()
  if (!text || props.busy) return
  emit('send', text)
  input.value = ''
}
function selectionPreview(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  return value.length > 92 ? `${value.slice(0, 92)}…` : value
}
watch(() => [props.messages.length, props.streamingText, props.busy], scrollToBottom, { flush: 'post' })
</script>

<template>
  <aside class="tiny-note-assistant-sidebar" aria-label="Tiny Note 助理">
    <header class="tiny-note-assistant-header">
      <div class="tiny-note-assistant-title">
        <span class="tiny-note-assistant-avatar"><Sparkles :size="16" /></span>
        <div><strong>Tiny Note 助理</strong><small>基于当前文章回答</small></div>
      </div>
      <button class="tiny-note-assistant-close" type="button" title="关闭助理" aria-label="关闭助理" @click="emit('close')"><X :size="17" /></button>
    </header>

    <div ref="messagesRef" class="tiny-note-assistant-messages">
      <div v-if="!messages.length && !busy" class="tiny-note-assistant-empty">
        <span class="tiny-note-assistant-empty-icon"><Sparkles :size="25" /></span>
        <strong>需要我帮你做些什么？</strong>
        <span>我会参考当前文章和你选中的文字。</span>
      </div>

      <div v-for="(message, index) in messages" :key="`${index}-${message.role}`" class="tiny-note-assistant-message" :class="`is-${message.role}`">
        <div v-if="message.role === 'user'" class="tiny-note-assistant-user">
          <div v-if="message.references?.length" class="tiny-note-reference-list">
            <div v-for="reference in message.references" :key="reference.key" class="tiny-note-reference-chip">
              <FileText v-if="reference.type === 'selection'" :size="13" />
              <BookOpen v-else :size="13" />
              <span>{{ reference.label }}</span>
              <small v-if="reference.preview">{{ reference.preview }}</small>
            </div>
          </div>
          <div class="tiny-note-user-bubble">{{ message.content }}</div>
        </div>
        <div v-else class="tiny-note-assistant-response">
          <span class="tiny-note-response-avatar"><Sparkles :size="14" /></span>
          <div class="tiny-note-response-content">
            <MarkdownMessage class="tiny-note-response-markdown" :content="message.content" />
            <div v-if="message.sources?.length" class="tiny-note-assistant-sources"><span v-for="(source, sourceIndex) in message.sources" :key="source.id" :title="source.snippet">[{{ sourceIndex + 1 }}] {{ source.title }}<small v-if="source.truncated">已截取</small></span></div>
            <div v-if="message.proposal" class="tiny-note-assistant-proposal-state">修改建议已在文章中打开，请审阅后应用。</div>
            <button v-if="message.content" class="tiny-note-copy-response" type="button" title="复制" @click="emit('copy', message.content)"><Copy :size="13" /></button>
          </div>
        </div>
      </div>

      <div v-if="busy" class="tiny-note-assistant-response is-streaming">
        <span class="tiny-note-response-avatar"><Sparkles :size="14" /></span>
        <div class="tiny-note-response-content">
          <MarkdownMessage v-if="streamingText" class="tiny-note-response-markdown" :content="streamingText" streaming />
          <div v-else class="tiny-note-response-text">正在思考…<span class="tiny-note-thinking-dots">•••</span></div>
        </div>
      </div>
    </div>

    <section class="tiny-note-assistant-context" aria-label="引用内容">
      <div class="tiny-note-assistant-context-label">引用内容</div>
      <div v-if="note" class="tiny-note-assistant-context-card">
        <BookOpen :size="15" />
        <div><strong>{{ note.title || '未命名笔记' }}</strong><span>当前文章全文</span></div>
      </div>
      <div v-if="selection?.text" class="tiny-note-assistant-context-card is-selection">
        <FileText :size="15" />
        <div><strong>选中文字</strong><span>{{ selectionPreview(selection.text) }}</span></div>
      </div>
    </section>

    <form class="tiny-note-assistant-composer" @submit.prevent="submit">
      <textarea v-model="input" rows="2" placeholder="询问当前文章…" :disabled="busy" @keydown.enter.exact.prevent="submit"></textarea>
      <div class="tiny-note-assistant-composer-actions">
        <span>文章与选区会作为上下文发送</span>
        <div>
          <button v-if="busy" class="tiny-note-assistant-stop" type="button" title="停止生成" @click="emit('stop')"><Square :size="14" /></button>
          <button v-else class="tiny-note-assistant-send" type="submit" :disabled="!input.trim()" title="发送"><Send :size="15" /></button>
        </div>
      </div>
    </form>
  </aside>
</template>
