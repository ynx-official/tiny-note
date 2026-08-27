<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Clock3, Loader2, MessageSquare, Trash2, X } from 'lucide-vue-next'
import { invoke } from '../services/tauri'
import { requestConfirmation } from '../services/appFeedback'
import { errorMessage, type ChatConversation } from '../types/domain'

const props = withDefaults(defineProps<{ modelValue?: boolean }>(), { modelValue: false })
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; open: [id: string] }>()
const conversations = ref<ChatConversation[]>([])
const loading = ref(false)
const error = ref('')
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })

async function load() {
  loading.value = true
  error.value = ''
  try { conversations.value = await invoke('chat_list') } catch (cause) { error.value = errorMessage(cause, '历史记录读取失败') } finally { loading.value = false }
}
function openConversation(id: string) { emit('open', id); visible.value = false }
function modeLabel(mode: string) { return mode === 'agent' ? 'Tiny Agent' : '对话' }
async function remove(event: MouseEvent, id: string) {
  event.stopPropagation()
  if (!(await requestConfirmation({ title: '删除对话', message: '确定删除这条对话及全部消息吗？删除后无法恢复。', tone: 'danger', confirmLabel: '删除' }))) return
  await invoke('chat_delete', { id })
  window.dispatchEvent(new CustomEvent('tiny-note-chat-deleted', { detail: { id } }))
  await load()
}
function formatTime(value: string) {
  const date = new Date(value)
  const today = new Date()
  return date.toDateString() === today.toDateString() ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}
function handleEscape(event: KeyboardEvent) { if (event.key === 'Escape' && visible.value) visible.value = false }
watch(visible, value => { if (value) load() })
onMounted(() => { document.addEventListener('keydown', handleEscape); window.addEventListener('tiny-note-chat-updated', load) })
onUnmounted(() => { document.removeEventListener('keydown', handleEscape); window.removeEventListener('tiny-note-chat-updated', load) })
</script>

<template>
  <Transition name="history-pop">
    <section v-if="visible" class="history-drawer" role="dialog" aria-label="对话历史记录">
      <header><div><Clock3 :size="17" /><strong>历史记录</strong></div><button type="button" title="关闭" @click="visible = false"><X :size="17" /></button></header>
      <div class="history-drawer-body">
        <div v-if="loading && !conversations.length" class="history-state"><Loader2 :size="20" class="spinning" />正在读取…</div>
        <div v-else-if="error" class="history-state is-error">{{ error }}<button type="button" @click="load">重试</button></div>
        <div v-else-if="!conversations.length" class="history-state"><MessageSquare :size="25" /><strong>还没有历史对话</strong><small>发送第一条消息后会自动保存在这里</small></div>
        <div v-for="conversation in conversations" v-else :key="conversation.id" class="history-row" role="button" tabindex="0" @click="openConversation(conversation.id)" @keydown.enter="openConversation(conversation.id)">
          <span class="history-row-main"><strong>{{ conversation.title || '新对话' }}</strong><small>{{ conversation.preview || '暂无消息' }}</small></span>
          <span class="history-row-meta"><span class="history-mode-badge" :class="{ 'is-agent': conversation.mode === 'agent' }">{{ modeLabel(conversation.mode) }}</span><time>{{ formatTime(conversation.updatedAt) }}</time><button type="button" title="删除对话" @click="remove($event, conversation.id)"><Trash2 :size="13" /></button></span>
        </div>
      </div>
    </section>
  </Transition>
</template>
