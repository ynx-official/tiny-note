<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertCircle, BarChart3, Loader2, RefreshCw, Trash2, X } from 'lucide-vue-next'
import { invoke } from '../services/tauri'
import { requestConfirmation, showToast } from '../services/appFeedback'
import { errorMessage, type UsageStats } from '../types/domain'

const { t, locale } = useI18n()
const emit = defineEmits(['close'])
const range = ref('today')
const stats = ref<UsageStats | null>(null)
const loading = ref(false)
const error = ref('')
let loadSequence = 0
const ranges = computed(() => [
  { value: 'today', label: t('today') },
  { value: '7d', label: t('last7Days') },
  { value: '30d', label: t('last30Days') },
  { value: 'all', label: t('allTime') }
])
const hasData = computed(() => Number(stats.value?.summary?.totalRequests || 0) > 0)
const summary = computed(() => stats.value?.summary || {})
const byModel = computed(() => stats.value?.byModel || [])
const bySource = computed(() => stats.value?.bySource || [])
const trend = computed(() => {
  const values = stats.value?.byDay || []
  const max = Math.max(1, ...values.map(item => Number(item.totalTokens) || 0))
  return values.slice(-7).map(item => ({ ...item, height: Math.max(3, Math.round((Number(item.totalTokens || 0) / max) * 100)), shortDate: String(item.date || '').slice(5) }))
})

async function loadStats() {
  const sequence = ++loadSequence
  loading.value = true
  error.value = ''
  try {
    const result = await invoke('usage_get_stats', { range: range.value, timezoneOffsetMinutes: -new Date().getTimezoneOffset() })
    if (sequence === loadSequence) stats.value = result
  } catch (cause) {
    if (sequence === loadSequence) error.value = errorMessage(cause, '用量统计读取失败')
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

async function clearRecords() {
  if (!(await requestConfirmation({ title: '清理用量记录', message: t('clearUsageConfirm'), tone: 'danger', confirmLabel: t('clearUsage') }))) return
  await invoke('usage_clear')
  await loadStats()
  showToast('用量记录已清理', { tone: 'success' })
}

function formatNumber(value: unknown) {
  return Number(value || 0).toLocaleString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US')
}

function formatShort(value: unknown) {
  const number = Number(value || 0)
  return number >= 1000000 ? (number / 1000000).toFixed(1) + 'M' : number >= 1000 ? (number / 1000).toFixed(1) + 'k' : String(number)
}

const sourceLabels: Record<string, string> = { chat: '对话', note_ai: '笔记 AI', fim: '智能续写', agent: '助手', rag: '知识库' }
const sourceLabel = (source: string) => sourceLabels[source] || source || '其他'
const colors = ['#6d5dfc', '#ef6b8a', '#f2a93b', '#35aa8b', '#5b8def']
onMounted(loadStats)
</script>

<template>
  <section class="assistant-panel usage-panel">
    <header class="assistant-panel-header">
      <h2>{{ t('usageStatistics') }}</h2>
      <div class="assistant-header-actions"><button type="button" class="assistant-icon-button" :title="t('refresh')" :disabled="loading" @click="loadStats"><RefreshCw :size="15" :class="{ spinning: loading }" /></button><button type="button" class="assistant-close" :aria-label="t('close')" @click="emit('close')"><X :size="18" /></button></div>
    </header>
    <div class="assistant-panel-body usage-body">
      <div class="usage-range-bar"><span>{{ t('usageRange') }}</span><div class="usage-range-tabs"><button v-for="item in ranges" :key="item.value" type="button" :class="{ active: range === item.value }" @click="range = item.value; loadStats()">{{ item.label }}</button></div><button type="button" class="usage-clear-button" :disabled="loading || !hasData" @click="clearRecords"><Trash2 :size="13" />{{ t('clearUsage') }}</button></div>
      <div v-if="loading && !stats" class="assistant-state"><Loader2 :size="23" class="spinning" />正在读取…</div>
      <div v-else-if="error" class="assistant-state assistant-error"><AlertCircle :size="22" />{{ error }}<button type="button" class="assistant-link-button" @click="loadStats">{{ t('refresh') }}</button></div>
      <div v-else-if="!hasData" class="assistant-state"><div class="usage-empty-icon"><BarChart3 :size="34" /></div><span>{{ t('usageEmpty') }}</span><small>{{ t('usageHint') }}</small></div>
      <template v-else>
        <div class="usage-summary-grid"><div class="usage-summary-card primary"><small>{{ t('totalTokens') }}</small><strong>{{ formatNumber(summary.totalTokens) }}</strong></div><div class="usage-summary-card"><small>{{ t('promptTokens') }}</small><strong>{{ formatNumber(summary.totalPrompt) }}</strong></div><div class="usage-summary-card"><small>{{ t('completionTokens') }}</small><strong>{{ formatNumber(summary.totalCompletion) }}</strong></div><div class="usage-summary-card"><small>{{ t('reasoningTokens') }}</small><strong>{{ formatNumber(summary.totalReasoning) }}</strong></div><div class="usage-summary-card"><small>{{ t('requests') }}</small><strong>{{ formatNumber(summary.totalRequests) }}</strong></div></div>
        <section v-if="trend.length" class="usage-section"><div class="usage-section-title"><h3>{{ t('dailyTrend') }}</h3><span>{{ t('last7Days') }}</span></div><div class="usage-trend"><div v-for="item in trend" :key="item.date" class="usage-trend-column" :title="item.date + ': ' + formatNumber(item.totalTokens)"><div class="usage-trend-bar-wrap"><div class="usage-trend-bar" :style="{ height: item.height + '%' }"></div></div><small>{{ item.shortDate }}</small><em>{{ formatShort(item.totalTokens) }}</em></div></div></section>
        <section v-if="byModel.length" class="usage-section"><h3>{{ t('byModel') }}</h3><div class="usage-list"><div v-for="(item, index) in byModel" :key="item.key" class="usage-list-row"><div class="usage-list-name"><i :style="{ background: colors[index % colors.length] }"></i>{{ item.label }}</div><div class="usage-list-value"><strong>{{ formatNumber(item.totalTokens) }}</strong><small>{{ formatNumber(item.requests) }} {{ t('requests') }}</small></div><div class="usage-list-bar"><span :style="{ width: Math.max(3, Math.round(item.totalTokens / Math.max(1, byModel[0]?.totalTokens || 1) * 100)) + '%', background: colors[index % colors.length] }"></span></div></div></div></section>
        <section v-if="bySource.length" class="usage-section"><h3>{{ t('bySource') }}</h3><div class="usage-source-tags"><span v-for="item in bySource" :key="item.key"><b>{{ sourceLabel(item.source) }}</b><em>{{ formatNumber(item.totalTokens) }}</em></span></div></section>
      </template>
    </div>
  </section>
</template>
