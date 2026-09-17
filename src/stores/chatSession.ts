import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type ChatSessionStatus = 'idle' | 'running' | 'approval' | 'input' | 'error'

// Only navigation metadata lives here. The account-scoped ChatView cache owns
// the draft, messages and connection, so a tab switch does not restart a run.
export const useChatSessionStore = defineStore('chatSession', () => {
  const cacheVersion = ref(0)
  const available = ref(false)
  const conversationId = ref('')
  const fromHome = ref(false)
  const title = ref('新对话')
  const status = ref<ChatSessionStatus>('idle')
  const statusLabel = computed(() => ({ idle: '', running: '生成中', approval: '待确认', input: '待回答', error: '出错了' })[status.value])
  const target = computed(() => available.value
    ? { path: '/chat', query: { ...(conversationId.value ? { id: conversationId.value } : {}), ...(fromHome.value ? { from: 'home' } : {}) } }
    : { path: '/' })

  function $reset() {
    cacheVersion.value += 1
    available.value = false
    conversationId.value = ''
    fromHome.value = false
    title.value = '新对话'
    status.value = 'idle'
  }

  return { cacheVersion, available, conversationId, fromHome, title, status, statusLabel, target, $reset }
})
