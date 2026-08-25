<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Channel } from '@tauri-apps/api/core'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { AlertCircle, Brush, Check, Clipboard, Copy, Download, ImagePlus, Images, LoaderCircle, MoreHorizontal, Pencil, RefreshCw, Settings, Sparkles, Trash2, Undo2, Upload, X } from 'lucide-vue-next'
import { useImagesStore } from '../stores/images'
import { useNotesStore } from '../stores/notes'
import { useTasksStore } from '../stores/tasks'
import { invoke } from '../services/tauri'
import { sanitizeEditorHtml } from '../utils/noteMarkdown'
import { requestConfirmation, showToast } from '../services/appFeedback'

const route = useRoute()
const router = useRouter()
const images = useImagesStore()
const notes = useNotesStore()
const tasks = useTasksStore()
const { models, generations, loading, error, defaultModel } = storeToRefs(images)

const prompt = ref('')
const mode = ref('generate')
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
const inputImages = ref([])
const inputFile = ref(null)
const maskCanvas = ref(null)
const maskTouched = ref(false)
const maskBrushSize = ref(48)
const drawingMask = ref(false)
const optimizing = ref(false)
const previousPrompt = ref('')
const historyPickerOpen = ref(false)
const historyPickerLoading = ref(false)
const previewItem = ref(null)

const modeOptions = [
  { value: 'generate', label: '文字生图', description: '只根据描述创建新图片', icon: Sparkles },
  { value: 'reference', label: '参考图生图', description: '参考主体、风格或构图，最多 4 张', icon: Images },
  { value: 'edit', label: '图片编辑', description: '上传原图，用文字描述整体修改', icon: Pencil },
  { value: 'inpaint', label: '局部重绘', description: '在原图上涂出需要重绘的区域', icon: Brush }
]

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
const currentMode = computed(() => modeOptions.find(option => option.value === mode.value) || modeOptions[0])
const promptPlaceholder = computed(() => ({
  generate: '例如：雨后的城市书店，暖黄色灯光，窗边有一只橘猫，电影感摄影，画面干净克制',
  reference: '例如：保留参考图中的角色特征，改成春日公园场景，清新插画风格',
  edit: '例如：把背景改成日落海边，保持人物姿势、面部和整体构图不变',
  inpaint: '例如：在选中区域添加一盏暖黄色的落地灯，光影自然、符合原图透视'
}[mode.value]))
const requiredImageCountText = computed(() => mode.value === 'reference' ? `${inputImages.value.length}/4 张参考图` : inputImages.value.length ? '已选择原图' : '尚未选择原图')
const reusableHistoryAssets = computed(() => generations.value.slice(0, 30).flatMap(generation => (generation.assets || []).map(asset => ({ asset, generation }))).slice(0, 80))

function setDefaultModel() {
  if (!selectedModelId.value || !models.value.some(model => model.id === selectedModelId.value)) selectedModelId.value = defaultModel.value?.id || models.value[0]?.id || ''
}
function generationAssetUrl(asset) {
  return images.assetCache[asset.id]?.dataUri || ''
}
async function openImagePreview(asset, generation) {
  try {
    const item = await images.readAsset(asset.id)
    if (!item?.dataUri) throw new Error('图片内容无法读取')
    previewItem.value = { asset: item, generation }
  } catch (error) { showToast(error?.message || '图片读取失败', { tone: 'error' }) }
}
function closeImagePreview() { previewItem.value = null }

function loadBrowserImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片无法读取'))
    image.src = dataUrl
  })
}
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const dataUrl = String(reader.result || '')
        const image = await loadBrowserImage(dataUrl)
        resolve({ id: crypto.randomUUID(), name: file.name || 'image', mimeType: file.type, dataUrl, width: image.naturalWidth, height: image.naturalHeight, byteSize: file.size })
      } catch (error) { reject(error) }
    }
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}
async function normalizeToPng(input) {
  if (!input) return null
  const source = await loadBrowserImage(input.dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = source.naturalWidth
  canvas.height = source.naturalHeight
  canvas.getContext('2d').drawImage(source, 0, 0)
  const dataUrl = canvas.toDataURL('image/png')
  return { ...input, name: `${String(input.name || 'image').replace(/\.[^.]+$/, '')}.png`, mimeType: 'image/png', dataUrl, width: canvas.width, height: canvas.height }
}
async function setMode(value) {
  if (mode.value === value) return
  mode.value = value
  maskTouched.value = false
  if (value === 'generate') inputImages.value = []
  else if (value !== 'reference') inputImages.value = inputImages.value.slice(0, 1)
  if (value === 'inpaint' && inputImages.value[0]) {
    try { inputImages.value = [await normalizeToPng(inputImages.value[0])] } catch { inputImages.value = [] }
  }
  await nextTick()
  if (value === 'inpaint') initializeMask()
}
function openInputPicker() { inputFile.value?.click() }
async function handleInputFiles(event) {
  const allowed = new Set(['image/png', 'image/jpeg', 'image/webp'])
  const files = [...(event.target.files || [])]
  event.target.value = ''
  if (!files.length) return
  if (files.some(file => !allowed.has(file.type))) return showToast('仅支持 PNG、JPEG 或 WebP 图片', { tone: 'error' })
  if (files.some(file => file.size > 20 * 1024 * 1024)) return showToast('单张图片不能超过 20 MB', { tone: 'error' })
  const selected = mode.value === 'reference' ? files.slice(0, Math.max(0, 4 - inputImages.value.length)) : files.slice(0, 1)
  if (!selected.length) return showToast('参考图最多添加 4 张', { tone: 'error' })
  try {
    let next = await Promise.all(selected.map(readFile))
    if (mode.value === 'inpaint') next = [await normalizeToPng(next[0])]
    inputImages.value = mode.value === 'reference' ? [...inputImages.value, ...next].slice(0, 4) : next
    const totalBytes = inputImages.value.reduce((sum, image) => sum + Number(image.byteSize || 0), 0)
    if (totalBytes > 50 * 1024 * 1024) {
      inputImages.value = mode.value === 'reference' ? inputImages.value.slice(0, -next.length) : []
      return showToast('上传图片总大小不能超过 50 MB', { tone: 'error' })
    }
    maskTouched.value = false
    await nextTick()
    if (mode.value === 'inpaint') initializeMask()
  } catch (error) { showToast(error?.message || '图片读取失败', { tone: 'error' }) }
}
function removeInputImage(id) {
  inputImages.value = inputImages.value.filter(image => image.id !== id)
  maskTouched.value = false
  nextTick(() => { if (mode.value === 'inpaint') initializeMask() })
}
async function openHistoryPicker() {
  historyPickerOpen.value = true
  historyPickerLoading.value = true
  try { await Promise.all(generations.value.slice(0, 30).map(ensureAssets)) } finally { historyPickerLoading.value = false }
}
async function selectHistoryAsset(asset, generation) {
  if (mode.value === 'reference' && inputImages.value.length >= 4) return showToast('参考图最多添加 4 张', { tone: 'error' })
  if (mode.value === 'reference' && inputImages.value.some(image => image.sourceAssetId === asset.id)) return showToast('这张图片已经添加过了')
  try {
    const item = await images.readAsset(asset.id)
    if (!item?.dataUri) throw new Error('图片内容无法读取')
    let input = { id: crypto.randomUUID(), sourceAssetId: asset.id, name: `生成结果-${asset.id.slice(0, 6)}.${item.mimeType?.split('/')[1] || 'png'}`, mimeType: item.mimeType || 'image/png', dataUrl: item.dataUri, width: item.width, height: item.height, byteSize: item.byteSize }
    if (!input.width || !input.height) {
      const loaded = await loadBrowserImage(input.dataUrl)
      Object.assign(input, { width: loaded.naturalWidth, height: loaded.naturalHeight })
    }
    if (mode.value === 'inpaint') input = await normalizeToPng(input)
    inputImages.value = mode.value === 'reference' ? [...inputImages.value, input] : [input]
    size.value = generation.size || size.value
    maskTouched.value = false
    historyPickerOpen.value = false
    await nextTick()
    if (mode.value === 'inpaint') initializeMask()
    showToast(mode.value === 'reference' ? '已添加到参考图' : '已选用生成结果')
  } catch (error) { showToast(error?.message || '图片读取失败', { tone: 'error' }) }
}
function initializeMask() {
  const canvas = maskCanvas.value
  const source = inputImages.value[0]
  if (!canvas || !source) return
  canvas.width = source.width
  canvas.height = source.height
  const context = canvas.getContext('2d')
  context.globalCompositeOperation = 'source-over'
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  maskTouched.value = false
}
function maskPoint(event) {
  const canvas = maskCanvas.value
  const bounds = canvas.getBoundingClientRect()
  return { x: (event.clientX - bounds.left) * canvas.width / bounds.width, y: (event.clientY - bounds.top) * canvas.height / bounds.height, scale: canvas.width / bounds.width }
}
function paintMask(event) {
  if (!drawingMask.value || !maskCanvas.value) return
  const context = maskCanvas.value.getContext('2d')
  const point = maskPoint(event)
  context.globalCompositeOperation = 'destination-out'
  context.beginPath()
  context.arc(point.x, point.y, maskBrushSize.value * point.scale / 2, 0, Math.PI * 2)
  context.fill()
  maskTouched.value = true
}
function startMask(event) {
  drawingMask.value = true
  event.currentTarget.setPointerCapture?.(event.pointerId)
  paintMask(event)
}
function finishMask() { drawingMask.value = false }
function resetMask() { initializeMask() }
function compactOptimizedPrompt(value) {
  return String(value || '').trim().replace(/^```(?:text)?\s*/i, '').replace(/\s*```$/, '').replace(/^[“"]|[”"]$/g, '').trim()
}
function previewOptimizedPrompt(value) {
  const modeAdvice = {
    generate: '明确主体、环境、构图、光线、镜头和视觉风格，画面自然，细节完整',
    reference: '保持参考图的关键主体特征和视觉一致性，同时明确新场景、构图与风格变化',
    edit: '清楚区分需要保留和需要修改的内容，保持未指定区域、主体身份和构图稳定',
    inpaint: '只修改涂抹区域，说明新增或替换内容，并保持边缘、透视、光线和原图自然衔接'
  }[mode.value]
  return `${value.trim()}。${modeAdvice}。避免文字、水印、畸变和多余元素。`
}
function imageOptimizationInstruction(value) {
  return `你是专业的图片生成提示词编辑器。当前模式是“${currentMode.value.label}”。

下面是用户的原始描述，必须完整保留其中的主体、动作、数量、位置、颜色、文字、风格、构图要求、限制条件和否定要求；只能补充有助于生成图片的细节，不得删除、替换或改变任何用户要求。若原描述含糊，保守地补足，不要自行改主题。
--- 原始描述开始 ---
${value}
--- 原始描述结束 ---

请把它优化成清晰、具体、可直接用于图片模型的中文提示词。补足主体、环境、构图、光线、镜头、材质和风格；编辑模式需明确保留项与修改项；局部重绘需强调只改变选中区域。不要解释，不要使用 Markdown，只返回优化后的提示词。`
}
async function optimizePrompt() {
  const value = prompt.value.trim()
  if (!value || optimizing.value) return
  optimizing.value = true
  previousPrompt.value = value
  try {
    if (!window.__TAURI_INTERNALS__) {
      prompt.value = previewOptimizedPrompt(value).slice(0, 4000)
      showToast('描述已优化，可在生成前继续修改')
      return
    }
    const requestId = crypto.randomUUID()
    const channel = new Channel()
    let output = ''
    const optimized = await new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('提示词优化超时')), 90000)
      const finish = callback => value => { window.clearTimeout(timer); callback(value) }
      const resolveOnce = finish(resolve)
      const rejectOnce = finish(reject)
      channel.onmessage = event => {
        if (event.type === 'delta' || event.type === 'textDelta') output += event.text || ''
        if (event.type === 'completed') resolveOnce(output)
        if (event.type === 'error') rejectOnce(new Error(event.message || '提示词优化失败'))
        if (event.type === 'cancelled') rejectOnce(new Error('提示词优化已取消'))
      }
      invoke('note_ai_stream', { request: { requestId, action: 'custom', mode: 'chat', text: value, instruction: imageOptimizationInstruction(value), references: [], autoRetrieve: false, modelProfileId: null, thinkingMode: 'fast', source: 'image_prompt' }, onEvent: channel }).catch(rejectOnce)
    })
    const next = compactOptimizedPrompt(optimized)
    if (!next) throw new Error('模型没有返回可用的优化结果')
    prompt.value = next.slice(0, 4000)
    showToast('描述已优化，可在生成前继续修改')
  } catch (error) {
    previousPrompt.value = ''
    showToast(error?.message || '提示词优化失败', { tone: 'error' })
  } finally { optimizing.value = false }
}
function undoPromptOptimization() {
  if (!previousPrompt.value) return
  const current = prompt.value
  prompt.value = previousPrompt.value
  previousPrompt.value = current
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
  if (!value || submitting.value || optimizing.value) return
  if (mode.value === 'reference' && !inputImages.value.length) return showToast('请先添加至少 1 张参考图', { tone: 'error' })
  if (['edit', 'inpaint'].includes(mode.value) && inputImages.value.length !== 1) return showToast('请先选择需要编辑的原图', { tone: 'error' })
  if (mode.value === 'inpaint' && !maskTouched.value) return showToast('请在原图上涂出需要重绘的区域', { tone: 'error' })
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
    const uploaded = inputImages.value.map(({ name, mimeType, dataUrl }) => ({ name, mimeType, dataUrl }))
    const maskImage = mode.value === 'inpaint' ? { name: 'mask.png', mimeType: 'image/png', dataUrl: maskCanvas.value.toDataURL('image/png') } : null
    await images.enqueue({ prompt: value, modelId: selectedModel.value.id, size: size.value, count: count.value, mode: mode.value, inputImages: uploaded, maskImage })
    prompt.value = ''
    previousPrompt.value = ''
    showToast('已加入任务中心，生成完成后会出现在历史记录中')
  } catch (err) {
    showToast(err?.message || '生图任务创建失败', { tone: 'error' })
  } finally {
    submitting.value = false
  }
}
async function useAssetAsInput(asset, generation, targetMode = 'edit') {
  try {
    const item = await images.readAsset(asset?.id)
    if (!item?.dataUri) throw new Error('图片内容无法读取')
    let input = { id: crypto.randomUUID(), name: `tiny-note-${asset.id}.${item.mimeType?.split('/')[1] || 'png'}`, mimeType: item.mimeType || 'image/png', dataUrl: item.dataUri, width: item.width, height: item.height, byteSize: item.byteSize }
    if (!input.width || !input.height) {
      const loaded = await loadBrowserImage(input.dataUrl)
      Object.assign(input, { width: loaded.naturalWidth, height: loaded.naturalHeight })
    }
    if (targetMode === 'inpaint') input = await normalizeToPng(input)
    mode.value = targetMode
    inputImages.value = targetMode === 'reference' ? [...inputImages.value, input].slice(-4) : [input]
    prompt.value = targetMode === 'reference' ? '' : generation.prompt
    maskTouched.value = false
    menuGenerationId.value = ''
    window.scrollTo?.({ top: 0, behavior: 'smooth' })
    await nextTick()
    if (targetMode === 'inpaint') initializeMask()
    document.querySelector('.image-prompt-input')?.focus()
  } catch (error) { showToast(error?.message || '图片读取失败', { tone: 'error' }) }
}
function regenerate(generation) {
  mode.value = 'generate'
  inputImages.value = []
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
function handleImagePageKeydown(event) {
  if (event.key === 'Escape' && previewItem.value) closeImagePreview()
}
function generationClass(generation) { return { 'is-highlighted': highlightedGenerationId.value === generation.id } }
function generationModeLabel(value) { return ({ reference: '参考图', edit: '图片编辑', inpaint: '局部重绘' }[value] || '文字生图') }

watch(models, setDefaultModel)
watch(() => route.query.generation, value => {
  highlightedGenerationId.value = String(value || '')
  if (value) nextTick(() => [...document.querySelectorAll('[data-generation-id]')].find(element => element.dataset.generationId === String(value))?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
}, { immediate: true })
onMounted(async () => { window.addEventListener('tiny-note-task-updated', handleTaskUpdate); window.addEventListener('keydown', handleImagePageKeydown); await refresh() })
onUnmounted(() => { window.removeEventListener('tiny-note-task-updated', handleTaskUpdate); window.removeEventListener('keydown', handleImagePageKeydown) })
</script>

<template>
  <section class="image-page">
    <header class="image-page-header">
      <div><div class="image-kicker"><ImagePlus :size="14" />创作工具</div><h1>AI 图片创作</h1><p>从文字生成新画面，也可以参考、编辑或局部重绘已有图片。</p></div>
      <button type="button" class="image-settings-link" @click="router.push('/settings')"><Settings :size="15" />图片模型设置</button>
    </header>

    <section class="image-compose-card">
      <nav class="image-mode-tabs" aria-label="图片创作模式">
        <button v-for="option in modeOptions" :key="option.value" type="button" :class="{ active: mode === option.value }" @click="setMode(option.value)"><component :is="option.icon" :size="15" /><span><strong>{{ option.label }}</strong><small>{{ option.description }}</small></span></button>
      </nav>

      <input ref="inputFile" class="image-input-file" type="file" accept="image/png,image/jpeg,image/webp" :multiple="mode === 'reference'" @change="handleInputFiles" />
      <section v-if="mode !== 'generate'" class="image-input-workspace">
        <div class="image-input-heading"><div><strong>{{ currentMode.label }}</strong><span>{{ requiredImageCountText }}</span></div><div class="image-input-actions"><button type="button" :disabled="!reusableHistoryAssets.length" @click="openHistoryPicker"><Images :size="14" />从最近生成选择</button><button v-if="mode === 'reference' ? inputImages.length < 4 : !inputImages.length" type="button" @click="openInputPicker"><Upload :size="14" />上传图片</button></div></div>
        <button v-if="!inputImages.length" type="button" class="image-upload-empty" @click="reusableHistoryAssets.length ? openHistoryPicker() : openInputPicker()"><span><Images v-if="reusableHistoryAssets.length" :size="20" /><Upload v-else :size="20" /></span><strong>{{ reusableHistoryAssets.length ? '选择之前生成的图片' : mode === 'reference' ? '添加参考图片' : '选择需要编辑的原图' }}</strong><small>{{ reusableHistoryAssets.length ? '直接复用文生图结果，也可以点击右上角上传本地图片' : mode === 'reference' ? '支持 1–4 张 PNG、JPEG 或 WebP，每张不超过 20 MB' : '暂无生成记录，可以先上传一张本地图片' }}</small></button>
        <div v-else-if="mode === 'reference'" class="image-reference-list"><figure v-for="image in inputImages" :key="image.id"><img :src="image.dataUrl" :alt="image.name" /><button type="button" aria-label="移除参考图" @click="removeInputImage(image.id)"><X :size="13" /></button><figcaption>{{ image.name }}</figcaption></figure><button v-if="inputImages.length < 4" type="button" class="image-reference-add" @click="openInputPicker"><Upload :size="18" /><span>添加参考图</span></button></div>
        <div v-else-if="mode === 'edit'" class="image-source-preview"><img :src="inputImages[0].dataUrl" :alt="inputImages[0].name" /><div><strong>{{ inputImages[0].name }}</strong><span>{{ inputImages[0].width }} × {{ inputImages[0].height }}</span><button type="button" @click="removeInputImage(inputImages[0].id)"><X :size="13" />移除原图</button></div></div>
        <div v-else class="image-mask-section">
          <div class="image-mask-stage" :style="{ aspectRatio: `${inputImages[0].width} / ${inputImages[0].height}` }"><img :src="inputImages[0].dataUrl" :alt="inputImages[0].name" /><canvas ref="maskCanvas" aria-label="局部重绘蒙版画布" @pointerdown.prevent="startMask" @pointermove.prevent="paintMask" @pointerup="finishMask" @pointercancel="finishMask" @pointerleave="finishMask"></canvas><span v-if="!maskTouched">在图片上涂抹需要重绘的区域</span></div>
          <aside class="image-mask-tools"><div><strong>重绘画笔</strong><span>透明区域会交给模型重新生成</span></div><label><span>画笔大小</span><input v-model.number="maskBrushSize" type="range" min="16" max="140" step="4" /></label><button type="button" @click="resetMask"><RefreshCw :size="13" />清除涂抹</button><button type="button" @click="removeInputImage(inputImages[0].id)"><X :size="13" />更换原图</button></aside>
        </div>
      </section>

      <div class="image-compose-label"><Sparkles :size="15" /><span>{{ mode === 'generate' ? '描述你想生成的画面' : '描述你想要的变化' }}</span><small>支持中文或英文，越具体越容易得到稳定结果</small><div class="image-prompt-tools"><button v-if="previousPrompt" type="button" @click="undoPromptOptimization"><Undo2 :size="13" />撤销优化</button><button type="button" :disabled="optimizing || !prompt.trim()" @click="optimizePrompt"><LoaderCircle v-if="optimizing" class="spinning" :size="13" /><Sparkles v-else :size="13" />{{ optimizing ? '优化中' : '智能优化' }}</button></div></div>
      <textarea v-model="prompt" class="image-prompt-input" maxlength="4000" rows="4" :placeholder="promptPlaceholder" @keydown.meta.enter.prevent="submit" @keydown.ctrl.enter.prevent="submit"></textarea>
      <div class="image-compose-toolbar">
        <label class="image-control image-model-control"><span>图片模型</span><select v-model="selectedModelId"><option value="" disabled>选择模型</option><option v-for="model in models" :key="model.id" :value="model.id">{{ model.name }}{{ model.apiKeyConfigured ? '' : '（未配置）' }}</option></select></label>
        <div class="image-control"><span>比例</span><div class="image-segmented"><button v-for="option in sizeOptions" :key="option.value" type="button" :class="{ active: size === option.value }" :title="option.description" @click="size = option.value">{{ option.label }}</button></div></div>
        <label class="image-control image-count-control"><span>张数</span><select v-model.number="count"><option v-for="value in 4" :key="value" :value="value">{{ value }} 张</option></select></label>
        <button type="button" class="image-submit-button" :disabled="submitting || optimizing || !prompt.trim()" @click="submit"><LoaderCircle v-if="submitting" class="spinning" :size="16" /><ImagePlus v-else :size="16" />{{ submitting ? '已提交' : mode === 'generate' ? '开始生成' : '开始处理' }}<small>⌘↵</small></button>
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
          <div class="image-card-grid" :class="`is-${generation.size || 'square'}`"><div v-for="asset in generation.assets" :key="asset.id" class="image-result-tile"><button v-if="generationAssetUrl(asset)" type="button" class="image-preview-trigger" title="点击查看大图" @click="openImagePreview(asset, generation)"><img :src="generationAssetUrl(asset)" :alt="generation.prompt" /></button><span v-else><LoaderCircle class="spinning" :size="18" /></span><div v-if="generationAssetUrl(asset)" class="image-tile-actions"><button type="button" title="编辑图片" @click="useAssetAsInput(asset, generation, 'edit')"><Pencil :size="14" /></button><button type="button" title="插入笔记" @click="openInsert(asset, generation)"><Check :size="14" /></button><button type="button" title="下载图片" @click="download(asset, generation)"><Download :size="14" /></button></div></div></div>
          <div class="image-card-body"><div class="image-card-meta"><span>{{ generationModeLabel(generation.mode) }} · {{ generation.size === 'landscape' ? '横向' : generation.size === 'portrait' ? '纵向' : '1:1' }} · {{ generation.count }} 张</span><span>{{ new Date(generation.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</span></div><p>{{ generation.prompt }}</p><div class="image-card-footer"><button type="button" @click="openInsert(generation.assets[0], generation)" :disabled="!generation.assets?.length"><Check :size="14" />插入笔记</button><button type="button" title="复制描述" @click="copyPrompt(generation)"><Clipboard :size="14" /></button><button type="button" title="重新生成" @click="regenerate(generation)"><RefreshCw :size="14" /></button><button type="button" title="更多操作" @click="menuGenerationId = menuGenerationId === generation.id ? '' : generation.id"><MoreHorizontal :size="14" /></button></div></div>
          <div v-if="menuGenerationId === generation.id" class="image-card-menu"><button type="button" @click="useAssetAsInput(generation.assets[0], generation, 'reference')"><Images :size="13" />作为参考图</button><button type="button" @click="useAssetAsInput(generation.assets[0], generation, 'edit')"><Pencil :size="13" />编辑这张图</button><button type="button" @click="useAssetAsInput(generation.assets[0], generation, 'inpaint')"><Brush :size="13" />局部重绘</button><button type="button" @click="copyPrompt(generation); menuGenerationId = ''"><Copy :size="13" />复制描述</button><button type="button" class="is-danger" @click="removeGeneration(generation); menuGenerationId = ''"><Trash2 :size="13" />删除记录</button></div>
        </article>
      </div>
    </section>

    <div v-if="pickerOpen" class="image-picker-backdrop" @click.self="pickerOpen = false"><section class="image-picker-modal" role="dialog" aria-modal="true"><header><div><strong>插入到笔记</strong><span>选择目标笔记，图片会追加到正文末尾</span></div><button type="button" aria-label="关闭" @click="pickerOpen = false"><X :size="18" /></button></header><div class="image-picker-search"><input v-model="pickerSearch" type="search" placeholder="搜索笔记" /><span>{{ visibleNotes.length }} 条</span></div><div class="image-picker-list"><button v-for="note in visibleNotes" :key="note.id" type="button" :class="{ active: selectedNoteId === note.id }" @click="selectedNoteId = note.id"><span class="image-picker-radio"><Check v-if="selectedNoteId === note.id" :size="12" /></span><span><strong>{{ note.title || '未命名笔记' }}</strong><small>{{ note.contentText || '暂无正文' }}</small></span></button><div v-if="!visibleNotes.length" class="image-picker-empty">没有匹配的笔记</div></div><footer><button type="button" class="image-picker-cancel" @click="pickerOpen = false">取消</button><button type="button" class="image-picker-confirm" :disabled="!selectedNoteId" @click="insertIntoNote">插入图片</button></footer></section></div>
    <div v-if="historyPickerOpen" class="image-picker-backdrop" @click.self="historyPickerOpen = false"><section class="image-history-picker-modal" role="dialog" aria-modal="true" aria-label="选择最近生成的图片"><header><div><strong>选择生成结果</strong><span>{{ mode === 'reference' ? '选择一张加入参考图，可重复打开继续添加' : mode === 'edit' ? '选择一张作为整图编辑的原图' : '选择一张作为局部重绘的原图' }}</span></div><button type="button" aria-label="关闭生成结果选择" @click="historyPickerOpen = false"><X :size="18" /></button></header><div v-if="historyPickerLoading" class="image-history-picker-state"><LoaderCircle class="spinning" :size="18" />正在读取图片…</div><div v-else-if="!reusableHistoryAssets.length" class="image-history-picker-state"><ImagePlus :size="22" />还没有可引用的生成结果</div><div v-else class="image-history-picker-grid"><button v-for="entry in reusableHistoryAssets" :key="entry.asset.id" type="button" :disabled="!generationAssetUrl(entry.asset)" @click="selectHistoryAsset(entry.asset, entry.generation)"><span class="image-history-picker-thumb"><img v-if="generationAssetUrl(entry.asset)" :src="generationAssetUrl(entry.asset)" :alt="entry.generation.prompt" /><LoaderCircle v-else class="spinning" :size="16" /></span><span class="image-history-picker-copy"><strong>{{ entry.generation.prompt }}</strong><small>{{ generationModeLabel(entry.generation.mode) }} · {{ entry.generation.size === 'landscape' ? '横向' : entry.generation.size === 'portrait' ? '纵向' : '1:1' }}</small></span></button></div></section></div>
    <div v-if="previewItem" class="image-preview-backdrop" @click.self="closeImagePreview"><section class="image-preview-modal" role="dialog" aria-modal="true" aria-label="图片大图预览"><header><div><strong>图片预览</strong><span>{{ generationModeLabel(previewItem.generation.mode) }} · {{ previewItem.generation.size === 'landscape' ? '横向' : previewItem.generation.size === 'portrait' ? '纵向' : '1:1' }}</span></div><div><button type="button" title="下载图片" @click="download(previewItem.asset, previewItem.generation)"><Download :size="16" /></button><button type="button" aria-label="关闭图片预览" @click="closeImagePreview"><X :size="18" /></button></div></header><div class="image-preview-stage"><img :src="previewItem.asset.dataUri" :alt="previewItem.generation.prompt" /></div><footer>{{ previewItem.generation.prompt }}</footer></section></div>
  </section>
</template>
