<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { AlertCircle, Check, Clipboard, Copy, Download, ImagePlus, LoaderCircle, MoreHorizontal, RefreshCw, Settings, Sparkles, Trash2, X } from 'lucide-vue-next'
import { useImagesStore } from '../stores/images'
import { useNotesStore } from '../stores/notes'
import { useTasksStore } from '../stores/tasks'
import { sanitizeEditorHtml } from '../utils/noteMarkdown'
import { requestConfirmation, showToast } from '../services/appFeedback'

const route = useRoute()
const router = useRouter()
const images = useImagesStore()
const notes = useNotesStore()
const tasks = useTasksStore()
const { models, generations, loading, error, defaultModel } = storeToRefs(images)

const prompt = ref('')
const size = ref('square')
const count = ref(1)
const selectedModelId = ref('')
const submitting = ref(false)
const loadingAssets = ref(new Set())
const pickerOpen = ref(false)
const pickerSearch = ref('')
const pickerAsset = ref(null)
const selectedNoteId = ref('')
const menuGenerationId = ref('')
const highlightedGenerationId = ref('')

const sizeOptions = [
  { value: 'square', label: '1:1', description: '适合头像、图标和卡片' },
  { value: 'landscape', label: '横向', description: '1536 × 1024' },
  { value: 'portrait', label: '纵向', description: '1024 × 1536' }
]
const configuredModels = computed(() => models.value.filter(model => model.apiKeyConfigured))
const visibleNotes = computed(() => {
  const query = pickerSearch.value.trim().toLowerCase()
  return notes.notes.filter(note => !note.deletedAt && (!query || `${note.title} ${note.contentText || ''}`.toLowerCase().includes(query))).slice(0, 80)
})
const activeTasks = computed(() => tasks.tasks.filter(task => task.kind === 'image_generation' && ['queued', 'running'].includes(task.status)))
const selectedModel = computed(() => models.value.find(model => model.id === selectedModelId.value) || defaultModel.value)

function setDefaultModel() {
  if (!selectedModelId.value || !models.value.some(model => model.id === selectedModelId.value)) selectedModelId.value = defaultModel.value?.id || models.value[0]?.id || ''
}
function generationAssetUrl(asset) {
  return images.assetCache[asset.id]?.dataUri || ''
}
async function ensureAssets(generation) {
  const assets = generation?.assets || []
  await Promise.all(assets.map(async asset => {
    if (images.assetCache[asset.id] || loadingAssets.value.has(asset.id)) return
    loadingAssets.value = new Set([...loadingAssets.value, asset.id])
    try { await images.readAsset(asset.id) } catch { /* broken asset is shown as an empty tile */ }
    const next = new Set(loadingAssets.value)
    next.delete(asset.id)
    loadingAssets.value = next
  }))
}
async function refresh() {
  await images.load()
  setDefaultModel()
  await Promise.all(generations.value.slice(0, 8).map(ensureAssets))
}
async function submit() {
  const value = prompt.value.trim()
  if (!value || submitting.value) return
  if (!selectedModel.value) {
    showToast('请先在设置中勾选可用于生图的模型', { tone: 'error' })
    router.push('/settings')
    return
  }
  if (!selectedModel.value.apiKeyConfigured) {
    showToast('当前图片模型还没有配置 API Key', { tone: 'error' })
    router.push('/settings')
    return
  }
  submitting.value = true
  try {
    await images.enqueue({ prompt: value, modelId: selectedModel.value.id, size: size.value, count: count.value })
    prompt.value = ''
    showToast('已加入任务中心，生成完成后会出现在历史记录中')
  } catch (err) {
    showToast(err?.message || '生图任务创建失败', { tone: 'error' })
  } finally {
    submitting.value = false
  }
}
function regenerate(generation) {
  prompt.value = generation.prompt
  size.value = generation.size || 'square'
  count.value = Math.min(4, Math.max(1, Number(generation.count) || 1))
  selectedModelId.value = generation.imageModelProfileId || selectedModelId.value
  window.scrollTo?.({ top: 0, behavior: 'smooth' })
  nextTick(() => document.querySelector('.image-prompt-input')?.focus())
}
async function copyPrompt(generation) {
  try { await navigator.clipboard.writeText(generation.prompt); showToast('描述已复制') } catch { showToast('复制失败，请手动选择描述', { tone: 'error' }) }
}
async function download(asset, generation) {
  const item = await images.readAsset(asset.id)
  if (!item?.dataUri) return
  const link = document.createElement('a')
  link.href = item.dataUri
  link.download = `tiny-note-${generation.id.slice(0, 8)}-${asset.id.slice(0, 6)}.${item.mimeType?.split('/')[1] || 'png'}`
  link.click()
}
function escapeHtml(value) {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}
function markdownLabel(value) { return String(value || '').replaceAll('[', '\\[').replaceAll(']', '\\]') }
function openInsert(asset, generation) {
  pickerAsset.value = { asset, generation }
  pickerSearch.value = ''
  selectedNoteId.value = notes.activeId || notes.notes[0]?.id || ''
  pickerOpen.value = true
  menuGenerationId.value = ''
}
async function insertIntoNote() {
  const item = await images.readAsset(pickerAsset.value?.asset?.id)
  if (!item?.dataUri) return
  const generation = pickerAsset.value.generation
  const alt = escapeHtml(generation.prompt.slice(0, 120))
  const imageHtml = `<p><img src="${item.dataUri}" alt="${alt}" /></p>`
  const markdown = `![${markdownLabel(generation.prompt.slice(0, 120))}](${item.dataUri})`
  const note = notes.notes.find(value => value.id === selectedNoteId.value)
  try {
    if (note) {
      note.contentHtml = `${note.contentHtml || '<p></p>'}${imageHtml}`
      note.contentMarkdown = `${note.contentMarkdown || ''}\n\n${markdown}`.trim()
      await notes.save(note)
    } else {
      await notes.createFromContent({ title: generation.prompt.slice(0, 40) || '生图结果', contentHtml: imageHtml, contentText: '', contentMarkdown: markdown })
    }
    pickerOpen.value = false
    showToast('图片已插入笔记')
    if (note) router.push({ path: '/notes', query: { note: note.id } })
    else if (notes.activeId) router.push({ path: '/notes', query: { note: notes.activeId } })
  } catch (err) { showToast(err?.message || '插入笔记失败', { tone: 'error' }) }
}
async function removeGeneration(generation) {
  const confirmed = await requestConfirmation({ title: '删除生图记录', message: '删除后会同时移除本地图片文件，确定继续吗？', tone: 'danger', confirmLabel: '删除' })
  if (!confirmed) return
  try { await images.deleteGeneration(generation.id); showToast('生图记录已删除') } catch (err) { showToast(err?.message || '删除失败', { tone: 'error' }) }
}
function handleTaskUpdate(event) {
  const task = event.detail
  if (task?.kind !== 'image_generation') return
  if (task.status === 'succeeded') window.setTimeout(refresh, 150)
}
function generationClass(generation) { return { 'is-highlighted': highlightedGenerationId.value === generation.id } }

watch(models, setDefaultModel)
watch(() => route.query.generation, value => {
  highlightedGenerationId.value = String(value || '')
  if (value) nextTick(() => [...document.querySelectorAll('[data-generation-id]')].find(element => element.dataset.generationId === String(value))?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
}, { immediate: true })
onMounted(async () => { window.addEventListener('tiny-note-task-updated', handleTaskUpdate); await refresh() })
onUnmounted(() => window.removeEventListener('tiny-note-task-updated', handleTaskUpdate))
</script>

<template>
  <section class="image-page">
    <header class="image-page-header">
      <div><div class="image-kicker"><ImagePlus :size="14" />创作工具</div><h1>根据描述生图</h1><p>把一句想法变成可以保存、下载并放进笔记的图片。</p></div>
      <button type="button" class="image-settings-link" @click="router.push('/settings')"><Settings :size="15" />图片模型设置</button>
    </header>

    <section class="image-compose-card">
      <div class="image-compose-label"><Sparkles :size="15" /><span>描述你想生成的画面</span><small>支持中文或英文，越具体越容易得到稳定结果</small></div>
      <textarea v-model="prompt" class="image-prompt-input" maxlength="4000" rows="4" placeholder="例如：雨后的城市书店，暖黄色灯光，窗边有一只橘猫，电影感摄影，画面干净克制" @keydown.meta.enter.prevent="submit" @keydown.ctrl.enter.prevent="submit"></textarea>
      <div class="image-compose-toolbar">
        <label class="image-control"><span>图片模型</span><select v-model="selectedModelId"><option value="" disabled>选择模型</option><option v-for="model in models" :key="model.id" :value="model.id">{{ model.name }}{{ model.apiKeyConfigured ? '' : '（未配置）' }}</option></select></label>
        <div class="image-control"><span>比例</span><div class="image-segmented"><button v-for="option in sizeOptions" :key="option.value" type="button" :class="{ active: size === option.value }" :title="option.description" @click="size = option.value">{{ option.label }}</button></div></div>
        <label class="image-control image-count-control"><span>张数</span><select v-model.number="count"><option v-for="value in 4" :key="value" :value="value">{{ value }} 张</option></select></label>
        <button type="button" class="image-submit-button" :disabled="submitting || !prompt.trim()" @click="submit"><LoaderCircle v-if="submitting" class="spinning" :size="16" /><ImagePlus v-else :size="16" />{{ submitting ? '已提交' : '开始生成' }}<small>⌘↵</small></button>
      </div>
      <div v-if="!models.length" class="image-config-hint"><AlertCircle :size="15" /><span>还没有可用于生图的模型。请先在已有模型配置中获取模型列表，并勾选“生图”。</span><button type="button" @click="router.push('/settings')">去设置</button></div>
      <div v-else-if="!configuredModels.length" class="image-config-hint"><AlertCircle :size="15" /><span>已勾选的生图模型还没有配置 API Key。</span><button type="button" @click="router.push('/settings')">去设置</button></div>
    </section>

    <div v-if="activeTasks.length" class="image-running-strip"><LoaderCircle class="spinning" :size="16" /><span>正在生成 {{ activeTasks.length }} 个任务，切换页面也不会中断。</span><button type="button" @click="router.push('/tasks')">查看任务中心</button></div>
    <div v-if="loading" class="image-state"><LoaderCircle class="spinning" :size="20" />正在读取生图历史…</div>
    <div v-else-if="error" class="image-state is-error"><AlertCircle :size="20" />{{ error }}<button type="button" @click="refresh">重试</button></div>
    <section v-else class="image-history-section">
      <div class="image-history-heading"><div><h2>最近生成</h2><span>{{ generations.length ? `${generations.length} 条记录` : '还没有生成记录' }}</span></div><button type="button" class="image-refresh-button" title="刷新历史" @click="refresh"><RefreshCw :size="14" /></button></div>
      <div v-if="!generations.length" class="image-empty"><div class="image-empty-icon"><ImagePlus :size="26" /></div><strong>从一句描述开始</strong><span>生成结果会自动保存在本地附件中，也可以随时插入笔记。</span></div>
      <div v-else class="image-history-grid">
        <article v-for="generation in generations" :key="generation.id" :data-generation-id="generation.id" class="image-history-card" :class="generationClass(generation)">
          <div class="image-card-grid" :class="`is-${generation.size || 'square'}`"><div v-for="asset in generation.assets" :key="asset.id" class="image-result-tile"><img v-if="generationAssetUrl(asset)" :src="generationAssetUrl(asset)" :alt="generation.prompt" /><span v-else><LoaderCircle class="spinning" :size="18" /></span><div v-if="generationAssetUrl(asset)" class="image-tile-actions"><button type="button" title="插入笔记" @click="openInsert(asset, generation)"><Check :size="14" /></button><button type="button" title="下载图片" @click="download(asset, generation)"><Download :size="14" /></button></div></div></div>
          <div class="image-card-body"><div class="image-card-meta"><span>{{ generation.size === 'landscape' ? '横向' : generation.size === 'portrait' ? '纵向' : '1:1' }} · {{ generation.count }} 张</span><span>{{ new Date(generation.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</span></div><p>{{ generation.prompt }}</p><div class="image-card-footer"><button type="button" @click="openInsert(generation.assets[0], generation)" :disabled="!generation.assets?.length"><Check :size="14" />插入笔记</button><button type="button" title="复制描述" @click="copyPrompt(generation)"><Clipboard :size="14" /></button><button type="button" title="重新生成" @click="regenerate(generation)"><RefreshCw :size="14" /></button><button type="button" title="更多操作" @click="menuGenerationId = menuGenerationId === generation.id ? '' : generation.id"><MoreHorizontal :size="14" /></button></div></div>
          <div v-if="menuGenerationId === generation.id" class="image-card-menu"><button type="button" @click="copyPrompt(generation); menuGenerationId = ''"><Copy :size="13" />复制描述</button><button type="button" @click="removeGeneration(generation); menuGenerationId = ''"><Trash2 :size="13" />删除记录</button></div>
        </article>
      </div>
    </section>

    <div v-if="pickerOpen" class="image-picker-backdrop" @click.self="pickerOpen = false"><section class="image-picker-modal" role="dialog" aria-modal="true"><header><div><strong>插入到笔记</strong><span>选择目标笔记，图片会追加到正文末尾</span></div><button type="button" aria-label="关闭" @click="pickerOpen = false"><X :size="18" /></button></header><div class="image-picker-search"><input v-model="pickerSearch" type="search" placeholder="搜索笔记" /><span>{{ visibleNotes.length }} 条</span></div><div class="image-picker-list"><button v-for="note in visibleNotes" :key="note.id" type="button" :class="{ active: selectedNoteId === note.id }" @click="selectedNoteId = note.id"><span class="image-picker-radio"><Check v-if="selectedNoteId === note.id" :size="12" /></span><span><strong>{{ note.title || '未命名笔记' }}</strong><small>{{ note.contentText || '暂无正文' }}</small></span></button><div v-if="!visibleNotes.length" class="image-picker-empty">没有匹配的笔记</div></div><footer><button type="button" class="image-picker-cancel" @click="pickerOpen = false">取消</button><button type="button" class="image-picker-confirm" :disabled="!selectedNoteId" @click="insertIntoNote">插入图片</button></footer></section></div>
  </section>
</template>
