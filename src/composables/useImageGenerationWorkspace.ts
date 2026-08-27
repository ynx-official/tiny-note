import { computed, nextTick, onMounted, onUnmounted, ref, watch, type Component } from 'vue'
import { Channel } from '@tauri-apps/api/core'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Brush, Images, Pencil, Sparkles } from 'lucide-vue-next'
import { useImagesStore } from '../stores/images'
import { useAppStore } from '../stores/app'
import { useNotesStore } from '../stores/notes'
import { useTasksStore } from '../stores/tasks'
import { saveExportBlob } from '../services/exportLocation'
import { showExportSuccess } from '../services/exportSuccess'
import { invoke } from '../services/tauri'
import { requestConfirmation, showToast } from '../services/appFeedback'
import { errorMessage, type BackgroundTask, type ImageAsset, type ImageGeneration } from '../types/domain'

export function useImageGenerationWorkspace() {
  interface InputImage { id: string; sourceAssetId?: string; name: string; mimeType: string; dataUrl: string; width: number | null; height: number | null; byteSize: number }
  
  interface ImagePreview { asset: ImageAsset; generation: ImageGeneration }
  
  interface ImageEvent { type: string; text?: string; message?: string }
  
  const route = useRoute()
  
  const router = useRouter()
  
  const appStore = useAppStore()
  
  const images = useImagesStore()
  
  const notes = useNotesStore()
  
  const tasks = useTasksStore()
  
  const { models, generations, loading, error, defaultModel } = storeToRefs(images)
  
  const prompt = ref('')
  
  type ImageMode = 'generate' | 'reference' | 'edit' | 'inpaint'
  
  const mode = ref<ImageMode>('generate')
  
  const size = ref('square')
  
  const count = ref(1)
  
  const selectedModelId = ref('')
  
  const submitting = ref(false)
  
  const loadingAssets = ref(new Set<string>())
  
  const pickerOpen = ref(false)
  
  const pickerSearch = ref('')
  
  const pickerAsset = ref<ImagePreview | null>(null)
  
  const selectedNoteId = ref('')
  
  const menuGenerationId = ref('')
  
  const highlightedGenerationId = ref('')
  
  const inputImages = ref<InputImage[]>([])
  
  const inputFile = ref<HTMLInputElement | null>(null)
  
  const maskCanvas = ref<HTMLCanvasElement | null>(null)
  
  const maskTouched = ref(false)
  
  const maskBrushSize = ref(48)
  
  const drawingMask = ref(false)
  
  const optimizing = ref(false)
  
  const previousPrompt = ref('')
  
  const historyPickerOpen = ref(false)
  
  const historyPickerLoading = ref(false)
  
  const previewItem = ref<ImagePreview | null>(null)
  
  const savingAssetIds = ref(new Set<string>())
  
  const modeOptions: Array<{ value: ImageMode; label: string; description: string; icon: Component }> = [
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
  
  function generationAssetUrl(asset: ImageAsset) {
    return images.assetCache[asset.id]?.dataUri || ''
  }
  
  async function openImagePreview(asset: ImageAsset, generation: ImageGeneration) {
    try {
      const item = await images.readAsset(asset.id)
      if (!item?.dataUri) throw new Error('图片内容无法读取')
      previewItem.value = { asset: item, generation }
    } catch (error) { showToast(errorMessage(error, '图片读取失败'), { tone: 'error' }) }
  }
  
  function closeImagePreview() { previewItem.value = null }
  
  function loadBrowserImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('图片无法读取'))
      image.src = dataUrl
    })
  }
  
  function readFile(file: File): Promise<InputImage> {
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
  
  async function normalizeToPng(input: InputImage): Promise<InputImage> {
    const source = await loadBrowserImage(input.dataUrl)
    const canvas = document.createElement('canvas')
    canvas.width = source.naturalWidth
    canvas.height = source.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前环境无法处理图片')
    context.drawImage(source, 0, 0)
    const dataUrl = canvas.toDataURL('image/png')
    return { ...input, name: `${String(input.name || 'image').replace(/\.[^.]+$/, '')}.png`, mimeType: 'image/png', dataUrl, width: canvas.width, height: canvas.height }
  }
  
  async function setMode(value: ImageMode) {
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
  
  async function handleInputFiles(event: Event) {
    const input = event.target as HTMLInputElement
    const allowed = new Set(['image/png', 'image/jpeg', 'image/webp'])
    const files = [...(input.files || [])]
    input.value = ''
    if (!files.length) return
    if (files.some(file => !allowed.has(file.type))) return showToast('仅支持 PNG、JPEG 或 WebP 图片', { tone: 'error' })
    if (files.some(file => file.size > 20 * 1024 * 1024)) return showToast('单张图片不能超过 20 MB', { tone: 'error' })
    const selected = mode.value === 'reference' ? files.slice(0, Math.max(0, 4 - inputImages.value.length)) : files.slice(0, 1)
    if (!selected.length) return showToast('参考图最多添加 4 张', { tone: 'error' })
    try {
      let next = await Promise.all(selected.map(readFile))
      if (mode.value === 'inpaint' && next[0]) next = [await normalizeToPng(next[0])]
      inputImages.value = mode.value === 'reference' ? [...inputImages.value, ...next].slice(0, 4) : next
      const totalBytes = inputImages.value.reduce((sum, image) => sum + Number(image.byteSize || 0), 0)
      if (totalBytes > 50 * 1024 * 1024) {
        inputImages.value = mode.value === 'reference' ? inputImages.value.slice(0, -next.length) : []
        return showToast('上传图片总大小不能超过 50 MB', { tone: 'error' })
      }
      maskTouched.value = false
      await nextTick()
      if (mode.value === 'inpaint') initializeMask()
    } catch (error) { showToast(errorMessage(error, '图片读取失败'), { tone: 'error' }) }
  }
  
  function removeInputImage(id: string) {
    inputImages.value = inputImages.value.filter(image => image.id !== id)
    maskTouched.value = false
    nextTick(() => { if (mode.value === 'inpaint') initializeMask() })
  }
  
  async function openHistoryPicker() {
    historyPickerOpen.value = true
    historyPickerLoading.value = true
    try { await Promise.all(generations.value.slice(0, 30).map(ensureAssets)) } finally { historyPickerLoading.value = false }
  }
  
  async function selectHistoryAsset(asset: ImageAsset, generation: ImageGeneration) {
    if (mode.value === 'reference' && inputImages.value.length >= 4) return showToast('参考图最多添加 4 张', { tone: 'error' })
    if (mode.value === 'reference' && inputImages.value.some(image => image.sourceAssetId === asset.id)) return showToast('这张图片已经添加过了')
    try {
      const item = await images.readAsset(asset.id)
      if (!item?.dataUri) throw new Error('图片内容无法读取')
      let input: InputImage = { id: crypto.randomUUID(), sourceAssetId: asset.id, name: `生成结果-${asset.id.slice(0, 6)}.${item.mimeType?.split('/')[1] || 'png'}`, mimeType: item.mimeType || 'image/png', dataUrl: item.dataUri, width: item.width, height: item.height, byteSize: item.byteSize }
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
    } catch (error) { showToast(errorMessage(error, '图片读取失败'), { tone: 'error' }) }
  }
  
  function initializeMask() {
    const canvas = maskCanvas.value
    const source = inputImages.value[0]
    if (!canvas || !source) return
    canvas.width = source.width || 1
    canvas.height = source.height || 1
    const context = canvas.getContext('2d')
    if (!context) return
    context.globalCompositeOperation = 'source-over'
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    maskTouched.value = false
  }
  
  function maskPoint(event: PointerEvent) {
    const canvas = maskCanvas.value
    if (!canvas) return { x: 0, y: 0, scale: 1 }
    const bounds = canvas.getBoundingClientRect()
    return { x: (event.clientX - bounds.left) * canvas.width / bounds.width, y: (event.clientY - bounds.top) * canvas.height / bounds.height, scale: canvas.width / bounds.width }
  }
  
  function paintMask(event: PointerEvent) {
    if (!drawingMask.value || !maskCanvas.value) return
    const context = maskCanvas.value.getContext('2d')
    if (!context) return
    const point = maskPoint(event)
    context.globalCompositeOperation = 'destination-out'
    context.beginPath()
    context.arc(point.x, point.y, maskBrushSize.value * point.scale / 2, 0, Math.PI * 2)
    context.fill()
    maskTouched.value = true
  }
  
  function startMask(event: PointerEvent) {
    drawingMask.value = true
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
    paintMask(event)
  }
  
  function finishMask() { drawingMask.value = false }
  
  function resetMask() { initializeMask() }
  
  function compactOptimizedPrompt(value: string) {
    return String(value || '').trim().replace(/^```(?:text)?\s*/i, '').replace(/\s*```$/, '').replace(/^[“"]|[”"]$/g, '').trim()
  }
  
  function previewOptimizedPrompt(value: string) {
    const modeAdvice = {
      generate: '明确主体、环境、构图、光线、镜头和视觉风格，画面自然，细节完整',
      reference: '保持参考图的关键主体特征和视觉一致性，同时明确新场景、构图与风格变化',
      edit: '清楚区分需要保留和需要修改的内容，保持未指定区域、主体身份和构图稳定',
      inpaint: '只修改涂抹区域，说明新增或替换内容，并保持边缘、透视、光线和原图自然衔接'
    }[mode.value]
    return `${value.trim()}。${modeAdvice}。避免文字、水印、畸变和多余元素。`
  }
  
  function imageOptimizationInstruction(value: string) {
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
      const channel = new Channel<ImageEvent>()
      let output = ''
      const optimized = await new Promise<string>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('提示词优化超时')), 90000)
        const resolveOnce = (result: string) => { window.clearTimeout(timer); resolve(result) }
        const rejectOnce = (reason?: unknown) => { window.clearTimeout(timer); reject(reason) }
        channel.onmessage = event => {
          if (event.type === 'delta' || event.type === 'textDelta') output += event.text || ''
          if (event.type === 'completed') resolveOnce(output)
          if (event.type === 'error') rejectOnce(new Error(event.message || '提示词优化失败'))
          if (event.type === 'cancelled') rejectOnce(new Error('提示词优化已取消'))
        }
        invoke('note_ai_stream', { request: { requestId, action: 'custom', mode: 'chat', text: value, instruction: imageOptimizationInstruction(value), references: [], modelProfileId: null, thinkingMode: 'fast', source: 'image_prompt' }, onEvent: channel }).catch(rejectOnce)
      })
      const next = compactOptimizedPrompt(optimized)
      if (!next) throw new Error('模型没有返回可用的优化结果')
      prompt.value = next.slice(0, 4000)
      showToast('描述已优化，可在生成前继续修改')
    } catch (error) {
      previousPrompt.value = ''
      showToast(errorMessage(error, '提示词优化失败'), { tone: 'error' })
    } finally { optimizing.value = false }
  }
  
  function undoPromptOptimization() {
    if (!previousPrompt.value) return
    const current = prompt.value
    prompt.value = previousPrompt.value
    previousPrompt.value = current
  }
  
  async function ensureAssets(generation: ImageGeneration) {
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
      const maskImage = mode.value === 'inpaint' && maskCanvas.value ? { name: 'mask.png', mimeType: 'image/png', dataUrl: maskCanvas.value.toDataURL('image/png') } : null
      await images.enqueue({ prompt: value, modelId: selectedModel.value.id, size: size.value, count: count.value, mode: mode.value, inputImages: uploaded, maskImage })
      prompt.value = ''
      previousPrompt.value = ''
      showToast('已加入任务中心，生成完成后会出现在历史记录中')
    } catch (err) {
      showToast(errorMessage(err, '生图任务创建失败'), { tone: 'error' })
    } finally {
      submitting.value = false
    }
  }
  
  async function useAssetAsInput(asset: ImageAsset, generation: ImageGeneration, targetMode: ImageMode = 'edit') {
    try {
      const item = await images.readAsset(asset?.id)
      if (!item?.dataUri) throw new Error('图片内容无法读取')
      let input: InputImage = { id: crypto.randomUUID(), name: `tiny-note-${asset.id}.${item.mimeType?.split('/')[1] || 'png'}`, mimeType: item.mimeType || 'image/png', dataUrl: item.dataUri, width: item.width, height: item.height, byteSize: item.byteSize }
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
      document.querySelector<HTMLElement>('.image-prompt-input')?.focus()
    } catch (error) { showToast(errorMessage(error, '图片读取失败'), { tone: 'error' }) }
  }
  
  function regenerate(generation: ImageGeneration) {
    mode.value = 'generate'
    inputImages.value = []
    prompt.value = generation.prompt
    size.value = generation.size || 'square'
    count.value = Math.min(4, Math.max(1, Number(generation.count) || 1))
    selectedModelId.value = generation.imageModelProfileId || selectedModelId.value
    window.scrollTo?.({ top: 0, behavior: 'smooth' })
    nextTick(() => document.querySelector<HTMLElement>('.image-prompt-input')?.focus())
  }
  
  async function copyPrompt(generation: ImageGeneration) {
    try { await navigator.clipboard.writeText(generation.prompt); showToast('描述已复制') } catch { showToast('复制失败，请手动选择描述', { tone: 'error' }) }
  }
  
  function imageFileName(asset: ImageAsset, generation: ImageGeneration, mimeType: string) {
    const extension = mimeType?.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
    return `tiny-note-${generation.id.slice(0, 8)}-${asset.id.slice(0, 6)}.${extension}`
  }
  
  function dataUriToBlob(dataUri: string, fallbackMimeType = 'image/png') {
    const separator = String(dataUri || '').indexOf(',')
    if (separator < 0) throw new Error('图片内容格式无效')
    const metadata = dataUri.slice(0, separator)
    const mimeType = metadata.match(/^data:([^;,]+)/)?.[1] || fallbackMimeType
    const payload = dataUri.slice(separator + 1)
    if (!metadata.includes(';base64')) return new Blob([decodeURIComponent(payload)], { type: mimeType })
    const binary = globalThis.atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return new Blob([bytes], { type: mimeType })
  }
  
  function isSavingAsset(assetId: string) { return savingAssetIds.value.has(assetId) }
  
  function imageSaveTitle(assetId: string) {
    if (isSavingAsset(assetId)) return '正在保存图片'
    const directory = String(appStore.settings.exportDirectory || '').trim()
    return directory ? `保存图片到 ${directory}` : '保存图片'
  }
  
  async function saveImage(asset: ImageAsset, generation: ImageGeneration) {
    if (!asset?.id || isSavingAsset(asset.id)) return
    savingAssetIds.value = new Set([...savingAssetIds.value, asset.id])
    try {
      const item = await images.readAsset(asset.id)
      if (!item?.dataUri) throw new Error('图片内容无法读取')
      const blob = dataUriToBlob(item.dataUri, item.mimeType)
      const result = await saveExportBlob(blob, imageFileName(asset, generation, blob.type || item.mimeType), { appStore })
      if (result?.cancelled) return
      if (result?.path) showExportSuccess(result)
      else if (result?.browserDownload) showToast('图片已下载')
    } catch (error) {
      showToast(errorMessage(error, '图片保存失败，请重试'), { tone: 'error' })
    } finally {
      const next = new Set(savingAssetIds.value)
      next.delete(asset.id)
      savingAssetIds.value = next
    }
  }
  
  function escapeHtml(value: string) {
    return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
  }
  
  function markdownLabel(value: string) { return String(value || '').replaceAll('[', '\\[').replaceAll(']', '\\]') }
  
  function openInsert(asset: ImageAsset, generation: ImageGeneration) {
    pickerAsset.value = { asset, generation }
    pickerSearch.value = ''
    selectedNoteId.value = notes.activeId || notes.notes[0]?.id || ''
    pickerOpen.value = true
    menuGenerationId.value = ''
  }
  
  async function insertIntoNote() {
    const selection = pickerAsset.value
    if (!selection) return
    const item = await images.readAsset(selection.asset.id)
    if (!item?.dataUri) return
    const generation = selection.generation
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
    } catch (err) { showToast(errorMessage(err, '插入笔记失败'), { tone: 'error' }) }
  }
  
  async function removeGeneration(generation: ImageGeneration) {
    const confirmed = await requestConfirmation({ title: '删除生图记录', message: '删除后会同时移除本地图片文件，确定继续吗？', tone: 'danger', confirmLabel: '删除' })
    if (!confirmed) return
    try { await images.deleteGeneration(generation.id); showToast('生图记录已删除') } catch (err) { showToast(errorMessage(err, '删除失败'), { tone: 'error' }) }
  }
  
  function handleTaskUpdate(event: Event) {
    const task = (event as CustomEvent<BackgroundTask>).detail
    if (task?.kind !== 'image_generation') return
    if (task.status === 'succeeded') window.setTimeout(refresh, 150)
  }
  
  function handleImagePageKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && previewItem.value) closeImagePreview()
  }
  
  function generationClass(generation: ImageGeneration) { return { 'is-highlighted': highlightedGenerationId.value === generation.id } }
  
  function generationModeLabel(value: string) { return ({ reference: '参考图', edit: '图片编辑', inpaint: '局部重绘' } as Record<string, string>)[value] || '文字生图' }
  
  watch(models, setDefaultModel)
  
  watch(() => route.query.generation, value => {
    highlightedGenerationId.value = String(value || '')
    if (value) nextTick(() => [...document.querySelectorAll<HTMLElement>('[data-generation-id]')].find(element => element.dataset.generationId === String(value))?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
  }, { immediate: true })
  
  onMounted(async () => { window.addEventListener('tiny-note-task-updated', handleTaskUpdate); window.addEventListener('keydown', handleImagePageKeydown); await refresh() })
  
  onUnmounted(() => { window.removeEventListener('tiny-note-task-updated', handleTaskUpdate); window.removeEventListener('keydown', handleImagePageKeydown) })

  return {
    route, router, appStore, images, notes, tasks, models, generations,
    loading, error, defaultModel, prompt, mode, size, count, selectedModelId,
    submitting, loadingAssets, pickerOpen, pickerSearch, pickerAsset, selectedNoteId, menuGenerationId, highlightedGenerationId,
    inputImages, inputFile, maskCanvas, maskTouched, maskBrushSize, drawingMask, optimizing, previousPrompt,
    historyPickerOpen, historyPickerLoading, previewItem, savingAssetIds, modeOptions, sizeOptions, configuredModels, visibleNotes,
    activeTasks, selectedModel, currentMode, promptPlaceholder, requiredImageCountText, reusableHistoryAssets, setDefaultModel, generationAssetUrl,
    openImagePreview, closeImagePreview, loadBrowserImage, readFile, normalizeToPng, setMode, openInputPicker, handleInputFiles,
    removeInputImage, openHistoryPicker, selectHistoryAsset, initializeMask, maskPoint, paintMask, startMask, finishMask,
    resetMask, compactOptimizedPrompt, previewOptimizedPrompt, imageOptimizationInstruction, optimizePrompt, undoPromptOptimization, ensureAssets, refresh,
    submit, useAssetAsInput, regenerate, copyPrompt, imageFileName, dataUriToBlob, isSavingAsset, imageSaveTitle,
    saveImage, escapeHtml, markdownLabel, openInsert, insertIntoNote, removeGeneration, handleTaskUpdate, handleImagePageKeydown,
    generationClass, generationModeLabel
  }
}

export type ImageGenerationWorkspace = ReturnType<typeof useImageGenerationWorkspace>
