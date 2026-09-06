<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url'

const props = defineProps<{ bytes: Uint8Array; title: string }>()
GlobalWorkerOptions.workerSrc = workerUrl
const canvas = ref<HTMLCanvasElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const pageNumber = ref(1)
const pageCount = ref(0)
const zoom = ref(1)
const loading = ref(true)
const error = ref('')
const pageText = ref('')
let document: PDFDocumentProxy | null = null
let loader: PDFDocumentLoadingTask | null = null
let render: RenderTask | null = null
let loadSequence = 0
let renderSequence = 0
let resizeObserver: ResizeObserver | undefined
let stageWidth = 0

async function renderPage() {
  const current = document
  if (!current || !canvas.value) return
  const sequence = ++renderSequence
  const previous = render
  previous?.cancel()
  if (previous) await previous.promise.catch(() => {})
  if (sequence !== renderSequence) return
  loading.value = true
  error.value = ''
  try {
    const page = await current.getPage(pageNumber.value)
    if (sequence !== renderSequence || !canvas.value) return
    const original = page.getViewport({ scale: 1 })
    const width = Math.max(200, (stage.value?.clientWidth || 500) - 24)
    const scale = width / original.width * zoom.value
    const viewport = page.getViewport({ scale })
    const resolution = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8_000_000 / (viewport.width * viewport.height)))
    const surface = canvas.value
    surface.width = Math.max(1, Math.floor(viewport.width * resolution))
    surface.height = Math.max(1, Math.floor(viewport.height * resolution))
    surface.style.width = `${viewport.width}px`
    surface.style.height = `${viewport.height}px`
    render = page.render({ canvas: surface, viewport, transform: [resolution, 0, 0, resolution, 0, 0] })
    await render.promise
    const text = await page.getTextContent()
    if (sequence === renderSequence) pageText.value = text.items.map(item => 'str' in item ? item.str : '').join(' ')
  } catch (cause) {
    if (sequence === renderSequence && !(cause instanceof Error && cause.name === 'RenderingCancelledException')) error.value = '此页无法渲染，请下载原文件查看。'
  } finally { if (sequence === renderSequence) loading.value = false }
}

watch(() => props.bytes, async bytes => {
  const sequence = ++loadSequence
  ++renderSequence
  render?.cancel()
  const previous = loader
  loader = null
  document = null
  pageCount.value = 0
  loading.value = true
  error.value = ''
  pageText.value = ''
  await previous?.destroy().catch(() => {})
  if (sequence !== loadSequence) return
  const root = new URL('pdfjs/', window.document.baseURI).href
  try {
    loader = getDocument({ data: bytes.slice(), cMapUrl: `${root}cmaps/`, cMapPacked: true, standardFontDataUrl: `${root}standard_fonts/`, wasmUrl: `${root}wasm/`, maxImageSize: 16_000_000, stopAtErrors: true })
    const loaded = await loader.promise
    if (sequence !== loadSequence) return
    document = loaded
    pageCount.value = loaded.numPages
    pageNumber.value = 1
    zoom.value = 1
    await nextTick()
    await renderPage()
  } catch (cause) {
    if (sequence === loadSequence) {
      error.value = cause instanceof Error && cause.name === 'PasswordException' ? '此 PDF 需要密码，请下载原文件打开。' : 'PDF 无法打开，请下载原文件查看。'
      loading.value = false
    }
  }
}, { immediate: true })
watch([pageNumber, zoom], () => { void renderPage() })
onMounted(() => {
  resizeObserver = new ResizeObserver(entries => {
    const width = entries[0]?.contentRect.width || 0
    if (Math.abs(width - stageWidth) < 1) return
    stageWidth = width
    void renderPage()
  })
  if (stage.value) resizeObserver.observe(stage.value)
})
onBeforeUnmount(() => { ++loadSequence; ++renderSequence; resizeObserver?.disconnect(); render?.cancel(); void loader?.destroy().catch(() => {}) })
</script>

<template>
  <section class="pdf-preview" :aria-label="`${title} PDF 阅读器`">
    <div class="pdf-controls" role="toolbar" aria-label="PDF 页码与缩放">
      <button type="button" :disabled="pageNumber <= 1 || !pageCount" @click="pageNumber--">上一页</button>
      <span aria-live="polite">{{ pageNumber }} / {{ pageCount }}</span>
      <button type="button" :disabled="pageNumber >= pageCount" @click="pageNumber++">下一页</button>
      <select v-model.number="zoom" aria-label="PDF 缩放"><option :value="1">适合宽度</option><option :value="1.5">150%</option><option :value="2">200%</option></select>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="loading" role="status">正在读取 PDF…</p>
    <div ref="stage" class="pdf-stage"><canvas ref="canvas" :aria-label="`${title} 第 ${pageNumber} 页`" /></div>
    <details v-if="pageText" class="pdf-text"><summary>本页文字内容</summary><p>{{ pageText }}</p></details>
  </section>
</template>

<style scoped>
.pdf-preview { display:flex; flex-direction:column; min-height:0; flex:1; }
.pdf-controls { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:10px 12px; border-bottom:1px solid var(--line); font-size:12px; }
.pdf-controls button,.pdf-controls select { padding:5px 7px; border:1px solid var(--line); border-radius:5px; color:var(--text); background:var(--surface); }
.pdf-controls button:disabled { opacity:.4; }
.pdf-preview > p { margin:12px; font-size:12px; }
.pdf-stage { flex:1; min-height:0; overflow:auto; padding:12px; }
.pdf-stage canvas { display:block; background:white; }
.pdf-text { padding:10px 12px; font-size:12px; max-height:30%; overflow:auto; }
</style>
