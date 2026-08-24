<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { AlertCircle, CheckCircle2, CircleStop, Clock3, FileText, ImagePlus, LoaderCircle, RefreshCw, Sparkles, Trash2 } from 'lucide-vue-next'
import { useTasksStore } from '../stores/tasks'
import { formatTaskDuration } from '../utils/taskDuration'

const router = useRouter()
const store = useTasksStore()
const { tasks, loading, error } = storeToRefs(store)
const filter = ref('all')
const expanded = ref('')
const retrying = ref([])
const now = ref(Date.now())
let durationTimer

const filters = [
  ['all', '全部'], ['active', '进行中'], ['attention', '待处理'], ['succeeded', '已完成'], ['failed', '失败']
]
const visibleTasks = computed(() => tasks.value.filter(task => {
  if (filter.value === 'active') return ['queued', 'running'].includes(task.status)
  if (filter.value === 'attention') return ['awaiting_approval', 'awaiting_input'].includes(task.status)
  if (filter.value === 'failed') return ['failed', 'interrupted'].includes(task.status)
  if (filter.value === 'succeeded') return task.status === 'succeeded'
  return true
}))
const counts = computed(() => Object.fromEntries(filters.map(([key]) => [key, tasks.value.filter(task => {
  if (key === 'active') return ['queued', 'running'].includes(task.status)
  if (key === 'attention') return ['awaiting_approval', 'awaiting_input'].includes(task.status)
  if (key === 'failed') return ['failed', 'interrupted'].includes(task.status)
  if (key === 'succeeded') return task.status === 'succeeded'
  return true
}).length])))

const kindMeta = {
  conversation_summary: ['总结为笔记', Sparkles], note_ai: ['笔记 AI', FileText], image_generation: ['生图', ImagePlus]
}
const statusLabels = { queued: '排队中', running: '执行中', awaiting_approval: '等待确认', awaiting_input: '等待回答', succeeded: '已完成', failed: '失败', cancelled: '已取消', interrupted: '已中断' }
const statusIcons = { queued: Clock3, running: LoaderCircle, awaiting_approval: Clock3, awaiting_input: Clock3, succeeded: CheckCircle2, failed: AlertCircle, cancelled: CircleStop, interrupted: AlertCircle }
function formatTime(value) { if (!value) return ''; return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function executionTime(task) { return formatTaskDuration(task, now.value) }
function hasRetryAttempt(task) { return tasks.value.some(item => item.retryOf === task.id) }
function openResult(task) {
  if (task.result?.noteId) router.push({ path: '/notes', query: { note: task.result.noteId } })
  else if (task.result?.proposalId && task.targetNoteId) router.push({ path: '/notes', query: { note: task.targetNoteId, proposal: task.result.proposalId } })
  else if (task.kind === 'image_generation') router.push({ path: '/images', query: { generation: task.result?.generationId || '' } })
  else if (task.conversationId) router.push({ path: '/chat', query: { id: task.conversationId } })
  else if (task.targetNoteId) router.push({ path: '/notes', query: { note: task.targetNoteId } })
}
async function quickRetry(task) {
  if (retrying.value.includes(task.id)) return
  retrying.value = [...retrying.value, task.id]
  try { await store.retry(task.id) } finally { retrying.value = retrying.value.filter(id => id !== task.id) }
}
onMounted(async () => {
  durationTimer = window.setInterval(() => { now.value = Date.now() }, 1000)
  await store.initialize()
  store.markResultsSeen()
})
onUnmounted(() => window.clearInterval(durationTimer))
</script>

<template>
  <section class="tasks-page">
    <header class="tasks-header">
      <div><h1>任务中心</h1><p>后台 AI 操作会在这里继续执行，切换页面不会中断。</p></div>
      <button class="tasks-clear" type="button" title="立即清理所有已结束的任务记录" @click="store.clearFinished"><Trash2 :size="14" />清理记录</button>
    </header>
    <nav class="tasks-filters" aria-label="任务筛选">
      <button v-for="([key, label]) in filters" :key="key" type="button" :class="{ active: filter === key }" @click="filter = key"><span>{{ label }}</span><small>{{ counts[key] }}</small></button>
    </nav>
    <div v-if="loading" class="tasks-state"><LoaderCircle class="spin" :size="20" />正在读取任务…</div>
    <div v-else-if="error" class="tasks-state is-error"><AlertCircle :size="20" />{{ error }}<button type="button" @click="store.initialize({ force: true })">重试</button></div>
    <div v-else-if="!visibleTasks.length" class="tasks-empty"><CheckCircle2 :size="28" /><strong>这里暂时没有任务</strong><span>发起“总结为笔记”、笔记 AI 或生图后，可以在这里查看进度和结果。</span></div>
    <div v-else class="tasks-list">
      <article v-for="task in visibleTasks" :key="task.id" class="task-row" :class="`is-${task.status}`">
        <button class="task-row-main" type="button" :aria-expanded="expanded === task.id" @click="expanded = expanded === task.id ? '' : task.id">
          <span class="task-kind-icon"><component :is="kindMeta[task.kind]?.[1] || Clock3" :size="17" /></span>
          <span class="task-copy"><strong>{{ task.title }}</strong><small>{{ kindMeta[task.kind]?.[0] || task.kind }} · {{ formatTime(task.createdAt) }}</small></span>
          <span class="task-state">
            <span class="task-status"><component :is="statusIcons[task.status] || Clock3" :class="{ spin: task.status === 'running' }" :size="14" />{{ statusLabels[task.status] || task.status }}</span>
            <span class="task-duration"><Clock3 :size="12" />{{ executionTime(task) }}</span>
          </span>
        </button>
        <div class="task-actions">
          <button v-if="['queued','running','awaiting_approval','awaiting_input'].includes(task.status)" type="button" title="取消任务" @click="store.cancel(task.id)"><CircleStop :size="14" />取消</button>
          <span v-if="['failed','cancelled','interrupted'].includes(task.status) && hasRetryAttempt(task)" class="task-retried">已重试</span>
          <button v-else-if="['failed','cancelled','interrupted'].includes(task.status)" class="task-quick-retry" type="button" :disabled="retrying.includes(task.id)" @click="quickRetry(task)"><LoaderCircle v-if="retrying.includes(task.id)" class="spin" :size="14" /><RefreshCw v-else :size="14" />{{ retrying.includes(task.id) ? '重试中' : '快速重试' }}</button>
          <button v-if="task.status === 'succeeded'" type="button" @click="openResult(task)">打开结果</button>
        </div>
        <div v-if="expanded === task.id" class="task-detail">
          <p v-if="task.errorMessage" class="task-error"><AlertCircle :size="14" />{{ task.errorMessage }}</p>
          <pre v-if="task.output">{{ task.output }}</pre>
        </div>
      </article>
    </div>
  </section>
</template>
