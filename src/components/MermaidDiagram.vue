<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AlertTriangle, Check, Copy, Expand, Maximize2, Minus, Plus, RefreshCw, Scan, Workflow, X } from 'lucide-vue-next'
import { renderMermaidDiagram } from '../utils/mermaidRenderer'

const props = defineProps({
  source: { type: String, default: '' }
})
const emit = defineEmits(['show-source', 'rendered'])

const svg = ref('')
const loading = ref(false)
const error = ref('')
const theme = ref('light')
const zoom = ref(100)
const fullscreenZoom = ref(100)
const naturalWidth = ref(0)
const fullscreen = ref(false)
const sourceCopied = ref(false)
const inlineStage = ref(null)
const fullscreenStage = ref(null)
const fullscreenClose = ref(null)
const fullscreenDialog = ref(null)
const dragging = ref(false)
let themeObserver
let stageObserver
let renderTimer
let copyTimer
let renderRevision = 0
let fullscreenTrigger
let inertRoot
let inertRootWasAlreadyInert = false
let lastWheelZoomAt = -Infinity
let inlineFit = false
let fullscreenFit = true
let panPointerId = null
let panStartX = 0
let panStartY = 0
let panStartScrollLeft = 0
let panStartScrollTop = 0
let viewportRevision = 0

const diagramKind = computed(() => {
  const firstLine = props.source.trimStart().split(/\r?\n/, 1)[0]?.toLowerCase() || ''
  if (firstLine.startsWith('swimlane-beta')) return '泳道图'
  if (/^(?:flowchart|graph)\b/.test(firstLine)) return '流程图'
  return 'Mermaid 图表'
})
const activeZoom = computed({
  get: () => fullscreen.value ? fullscreenZoom.value : zoom.value,
  set: value => {
    if (fullscreen.value) fullscreenZoom.value = value
    else zoom.value = value
  }
})
const zoomStyle = computed(() => naturalWidth.value
  ? { width: `${Math.round(naturalWidth.value * activeZoom.value / 100)}px` }
  : { width: `${activeZoom.value}%` })
const empty = computed(() => !props.source.trim())

function readTheme() {
  theme.value = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function friendlyError(reason) {
  if (reason?.code === 'MERMAID_EXTERNAL_RESOURCE') return reason.message
  const detail = String(reason?.message || reason || '')
    .replace(/^Error:\s*/i, '')
    .split(/\r?\n/, 1)[0]
    .trim()
    .slice(0, 160)
  return detail && !/parse error/i.test(detail)
    ? `Mermaid 语法有误：${detail}`
    : 'Mermaid 语法有误，请检查节点、箭头或泳道是否完整。'
}

async function renderDiagram() {
  const revision = ++renderRevision
  clearTimeout(renderTimer)
  if (empty.value) {
    loading.value = false
    error.value = ''
    svg.value = ''
    return
  }

  loading.value = true
  error.value = ''
  try {
    const result = await renderMermaidDiagram(props.source, { theme: theme.value })
    if (revision !== renderRevision) return
    svg.value = result.svg
    naturalWidth.value = readNaturalWidth(result.svg)
    emit('rendered')
    await nextTick()
    if (revision === renderRevision && inlineFit) updateFitZoom(false)
  } catch (reason) {
    if (revision !== renderRevision) return
    svg.value = ''
    naturalWidth.value = 0
    error.value = friendlyError(reason)
    if (fullscreen.value) await closeFullscreen()
  } finally {
    if (revision === renderRevision) loading.value = false
  }
}

function scheduleRender({ resetPreview = false } = {}) {
  clearTimeout(renderTimer)
  renderRevision += 1
  loading.value = !empty.value
  error.value = ''
  if (resetPreview) {
    svg.value = ''
    naturalWidth.value = 0
    zoom.value = 100
    inlineFit = false
    if (fullscreen.value) closeFullscreen()
  }
  renderTimer = window.setTimeout(renderDiagram, 220)
}

function readNaturalWidth(svgText) {
  const viewBox = String(svgText || '').match(/\bviewBox=["']\s*[-+\d.e]+[ ,]+[-+\d.e]+[ ,]+([-+\d.e]+)[ ,]+[-+\d.e]+\s*["']/i)
  const width = Number(viewBox?.[1])
  if (Number.isFinite(width) && width > 0) return width
  const widthAttribute = String(svgText || '').match(/<svg\b[^>]*\bwidth=["']([\d.]+)(?:px)?["']/i)
  const fallback = Number(widthAttribute?.[1])
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0
}

function availableStageWidth(stage) {
  if (!stage?.clientWidth) return 0
  const styles = window.getComputedStyle(stage)
  return Math.max(0, stage.clientWidth - parseFloat(styles.paddingLeft || 0) - parseFloat(styles.paddingRight || 0))
}

function updateFitZoom(useFullscreen = fullscreen.value) {
  const stage = useFullscreen ? fullscreenStage.value : inlineStage.value
  const available = availableStageWidth(stage)
  const fitted = available && naturalWidth.value
    ? Math.min(100, Math.max(10, Math.floor(available / naturalWidth.value * 100)))
    : 100
  if (useFullscreen) fullscreenZoom.value = fitted
  else zoom.value = fitted
}

function zoomIn() {
  viewportRevision += 1
  if (fullscreen.value) fullscreenFit = false
  else inlineFit = false
  activeZoom.value = Math.min(250, activeZoom.value + 25)
}

function zoomOut() {
  viewportRevision += 1
  if (fullscreen.value) fullscreenFit = false
  else inlineFit = false
  const minimum = fullscreen.value ? 10 : 75
  if (activeZoom.value <= minimum) return
  activeZoom.value = Math.max(minimum, activeZoom.value - 25)
}

function fitWidth() {
  viewportRevision += 1
  if (fullscreen.value) fullscreenFit = true
  else inlineFit = true
  updateFitZoom()
}

async function openFullscreen(event) {
  if (!svg.value || error.value) return
  viewportRevision += 1
  lastWheelZoomAt = -Infinity
  fullscreenTrigger = event?.currentTarget || document.activeElement
  fullscreenZoom.value = 100
  fullscreenFit = true
  fullscreen.value = true
  await nextTick()
  setAppInert(true)
  updateFitZoom(true)
  fullscreenClose.value?.focus()
}

async function closeFullscreen() {
  if (!fullscreen.value) return
  viewportRevision += 1
  cancelPan()
  fullscreen.value = false
  setAppInert(false)
  await nextTick()
  fullscreenTrigger?.focus?.()
}

function setAppInert(active) {
  if (active) {
    inertRoot = document.getElementById('app')
    inertRootWasAlreadyInert = inertRoot?.hasAttribute('inert') || false
    inertRoot?.setAttribute('inert', '')
  } else if (inertRoot && !inertRootWasAlreadyInert) {
    inertRoot.removeAttribute('inert')
    inertRoot = undefined
  }
}

function handleStageKeydown(event) {
  if (event.key === '+' || event.key === '=') {
    event.preventDefault()
    zoomIn()
  } else if (event.key === '-') {
    event.preventDefault()
    zoomOut()
  } else if (event.key === '0') {
    event.preventDefault()
    fitWidth()
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

function setStageScroll(stage, left, top) {
  const maximumLeft = Math.max(0, stage.scrollWidth - stage.clientWidth)
  const maximumTop = Math.max(0, stage.scrollHeight - stage.clientHeight)
  stage.scrollLeft = clamp(left, 0, maximumLeft)
  stage.scrollTop = clamp(top, 0, maximumTop)
}

async function zoomAroundPointer(event) {
  const revision = ++viewportRevision
  const wasFullscreen = fullscreen.value
  const stage = fullscreen.value ? fullscreenStage.value : inlineStage.value
  const diagram = stage?.querySelector('.mermaid-diagram-svg > svg')
  if (!stage || !diagram) return

  const before = diagram.getBoundingClientRect()
  const anchorX = before.width ? clamp((event.clientX - before.left) / before.width, 0, 1) : 0.5
  const anchorY = before.height ? clamp((event.clientY - before.top) / before.height, 0, 1) : 0.5
  const beforeAnchorX = before.left + before.width * anchorX
  const beforeAnchorY = before.top + before.height * anchorY
  const direction = event.deltaY < 0 ? 1 : -1
  const minimum = fullscreen.value ? 10 : 75
  const nextZoom = clamp(activeZoom.value + direction * 15, minimum, 250)
  if (nextZoom === activeZoom.value) return

  if (fullscreen.value) fullscreenFit = false
  else inlineFit = false
  activeZoom.value = nextZoom
  await nextTick()

  const currentStage = wasFullscreen ? fullscreenStage.value : inlineStage.value
  if (revision !== viewportRevision || fullscreen.value !== wasFullscreen || currentStage !== stage || !diagram.isConnected) return

  const after = diagram.getBoundingClientRect()
  setStageScroll(
    stage,
    stage.scrollLeft + after.left + after.width * anchorX - beforeAnchorX,
    stage.scrollTop + after.top + after.height * anchorY - beforeAnchorY
  )
}

function handleWheel(event) {
  if (!fullscreen.value && !event.ctrlKey && !event.metaKey) return
  event.preventDefault()
  if (!event.deltaY || !svg.value) return
  const now = performance.now()
  if (now - lastWheelZoomAt < 32) return
  lastWheelZoomAt = now
  void zoomAroundPointer(event)
}

function startPan(event) {
  if (!fullscreen.value || event.button !== 0 || event.isPrimary === false) return
  const stage = event.currentTarget
  if (event.target.closest?.('button,a,input,select,textarea,[contenteditable="true"]')) return
  if (stage.scrollWidth <= stage.clientWidth && stage.scrollHeight <= stage.clientHeight) return
  event.preventDefault()
  viewportRevision += 1
  dragging.value = true
  panPointerId = event.pointerId
  panStartX = event.clientX
  panStartY = event.clientY
  panStartScrollLeft = stage.scrollLeft
  panStartScrollTop = stage.scrollTop
  stage.setPointerCapture?.(event.pointerId)
  stage.focus?.({ preventScroll: true })
}

function movePan(event) {
  if (!dragging.value || event.pointerId !== panPointerId) return
  if (event.pointerType === 'mouse' && typeof event.buttons === 'number' && !(event.buttons & 1)) {
    finishPan(event)
    return
  }
  event.preventDefault()
  const stage = event.currentTarget
  setStageScroll(
    stage,
    panStartScrollLeft - (event.clientX - panStartX),
    panStartScrollTop - (event.clientY - panStartY)
  )
}

function finishPan(event) {
  if (!dragging.value || event.pointerId !== panPointerId) return
  const pointerId = panPointerId
  dragging.value = false
  panPointerId = null
  try {
    event.currentTarget.releasePointerCapture?.(pointerId)
  } catch {
    // Pointer capture may already be released by the WebView.
  }
}

function cancelPan() {
  const pointerId = panPointerId
  dragging.value = false
  panPointerId = null
  if (pointerId !== null) {
    try {
      fullscreenStage.value?.releasePointerCapture?.(pointerId)
    } catch {
      // The stage can disappear while a pointer is still captured.
    }
  }
}

async function copySource() {
  try {
    await navigator.clipboard.writeText(props.source)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = props.source
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }
  sourceCopied.value = true
  clearTimeout(copyTimer)
  copyTimer = window.setTimeout(() => { sourceCopied.value = false }, 2000)
}

function handleWindowKeydown(event) {
  if (!fullscreen.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    closeFullscreen()
    return
  }
  if (event.key === '+' || event.key === '=') {
    event.preventDefault()
    zoomIn()
    return
  }
  if (event.key === '-') {
    event.preventDefault()
    zoomOut()
    return
  }
  if (event.key === '0') {
    event.preventDefault()
    fitWidth()
    return
  }
  if (event.key !== 'Tab') return
  const focusable = Array.from(fullscreenDialog.value?.querySelectorAll('button:not(:disabled), [tabindex="0"]') || [])
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(() => props.source, () => scheduleRender({ resetPreview: true }))
watch(theme, () => scheduleRender())
watch(inlineStage, (current, previous) => {
  if (previous) stageObserver?.unobserve(previous)
  if (current) stageObserver?.observe(current)
})
watch(fullscreenStage, (current, previous) => {
  if (previous) stageObserver?.unobserve(previous)
  if (current) stageObserver?.observe(current)
})

onMounted(() => {
  readTheme()
  themeObserver = new MutationObserver(readTheme)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  if (typeof ResizeObserver !== 'undefined') {
    stageObserver = new ResizeObserver(() => {
      if (inlineFit) updateFitZoom(false)
      if (fullscreen.value && fullscreenFit) updateFitZoom(true)
    })
    if (inlineStage.value) stageObserver.observe(inlineStage.value)
  }
  window.addEventListener('keydown', handleWindowKeydown)
  renderDiagram()
})

onBeforeUnmount(() => {
  clearTimeout(renderTimer)
  clearTimeout(copyTimer)
  renderRevision += 1
  viewportRevision += 1
  themeObserver?.disconnect()
  stageObserver?.disconnect()
  cancelPan()
  setAppInert(false)
  window.removeEventListener('keydown', handleWindowKeydown)
})
</script>

<template>
  <figure class="mermaid-diagram" :class="{ 'is-loading': loading }" :aria-busy="loading" contenteditable="false">
    <figcaption class="mermaid-diagram-toolbar">
      <span class="mermaid-diagram-kind"><Workflow :size="14" />{{ diagramKind }}</span>
      <span v-if="loading" class="mermaid-render-status" aria-live="polite">渲染中…</span>
      <span v-else class="mermaid-zoom-value" aria-live="polite">{{ zoom }}%</span>
      <div class="mermaid-diagram-actions" role="toolbar" aria-label="图表视图">
        <button type="button" aria-label="缩小图表" title="缩小" :disabled="!svg || zoom <= 75" @click="zoomOut"><Minus :size="14" /></button>
        <button type="button" aria-label="适合宽度" title="适合宽度 (0)" :disabled="!svg" @click="fitWidth"><Scan :size="14" /></button>
        <button type="button" aria-label="放大图表" title="放大" :disabled="!svg || zoom >= 250" @click="zoomIn"><Plus :size="14" /></button>
        <button type="button" aria-label="全屏查看图表" title="全屏查看" :disabled="!svg || !!error" @click="openFullscreen"><Maximize2 :size="14" /></button>
        <slot name="actions"></slot>
      </div>
    </figcaption>

    <div v-if="!fullscreen" ref="inlineStage" class="mermaid-diagram-stage" role="group" tabindex="0" aria-label="图表画布，可用加号、减号和数字 0 调整缩放" aria-keyshortcuts="+ - 0" @keydown="handleStageKeydown" @wheel="handleWheel">
      <div v-if="svg" class="mermaid-diagram-svg" :style="zoomStyle" v-html="svg"></div>
      <div v-else-if="loading" class="mermaid-diagram-state" role="status"><RefreshCw :size="18" class="mermaid-spinner" />正在生成图表</div>
      <div v-else-if="empty" class="mermaid-diagram-state">输入 Mermaid 源码后即可预览</div>
      <div v-if="error" class="mermaid-diagram-error" role="alert">
        <AlertTriangle :size="17" />
        <span>{{ error }}</span>
        <button type="button" @click="renderDiagram"><RefreshCw :size="13" />重试</button>
        <button type="button" class="mermaid-show-source" @click="emit('show-source')">查看源码</button>
      </div>
    </div>
  </figure>

  <Teleport to="body">
    <div v-if="fullscreen" class="mermaid-fullscreen" role="presentation" @mousedown.self="closeFullscreen">
      <section ref="fullscreenDialog" class="mermaid-fullscreen-dialog" role="dialog" aria-modal="true" :aria-label="`${diagramKind}全屏预览`">
        <header>
          <span><Expand :size="15" />{{ diagramKind }}</span>
          <span class="mermaid-fullscreen-hint">按住左键拖动 · 滚轮指向缩放</span>
          <span class="mermaid-zoom-value" aria-live="polite">{{ fullscreenZoom }}%</span>
          <div role="toolbar" aria-label="全屏图表视图">
            <button type="button" aria-label="缩小图表" title="缩小" :disabled="fullscreenZoom <= 10" @click="zoomOut"><Minus :size="16" /></button>
            <button type="button" aria-label="适合宽度" title="适合宽度 (0)" @click="fitWidth"><Scan :size="16" /></button>
            <button type="button" aria-label="放大图表" title="放大" :disabled="fullscreenZoom >= 250" @click="zoomIn"><Plus :size="16" /></button>
            <button type="button" :aria-label="sourceCopied ? '图表源码已复制' : '复制图表源码'" :title="sourceCopied ? '已复制' : '复制源码'" @click="copySource"><Check v-if="sourceCopied" :size="16" /><Copy v-else :size="16" /></button>
            <button ref="fullscreenClose" type="button" aria-label="关闭全屏图表" title="关闭 (Esc)" @click="closeFullscreen"><X :size="17" /></button>
          </div>
        </header>
        <div ref="fullscreenStage" class="mermaid-fullscreen-stage" :class="{ 'is-dragging': dragging }" role="group" tabindex="0" aria-label="全屏图表画布，按住鼠标左键拖动，滚轮围绕指针缩放，也可用加号、减号和数字 0 调整缩放" aria-keyshortcuts="+ - 0" @wheel="handleWheel" @pointerdown="startPan" @pointermove="movePan" @pointerup="finishPan" @pointercancel="finishPan" @lostpointercapture="finishPan">
          <div class="mermaid-diagram-svg mermaid-fullscreen-svg" :style="[zoomStyle, { transition: 'none' }]" v-html="svg"></div>
        </div>
        <span class="visually-hidden" role="status" aria-live="polite">{{ sourceCopied ? '图表源码已复制' : '' }}</span>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.mermaid-diagram {
  container-type:inline-size;
  margin:0;
  color:var(--text-primary);
  background:var(--bg-primary);
}

.mermaid-diagram-toolbar {
  min-height:38px;
  display:flex;
  align-items:center;
  gap:9px;
  padding:5px 8px 5px 12px;
  border-bottom:1px solid var(--line,var(--border-color));
  color:var(--text-secondary);
  background:var(--bg-secondary);
  font-size:11px;
}

.mermaid-diagram-kind { display:inline-flex; align-items:center; gap:6px; color:var(--text-primary); font-weight:600; }
.mermaid-diagram-kind svg { color:var(--accent-color); }
.mermaid-render-status,.mermaid-zoom-value { color:var(--text-tertiary); font-variant-numeric:tabular-nums; }
.mermaid-diagram-actions { display:flex; align-items:center; gap:2px; margin-left:auto; }
.mermaid-diagram-actions button,.mermaid-fullscreen-dialog header button {
  width:28px;
  height:28px;
  display:grid;
  place-items:center;
  padding:0;
  border-radius:6px;
  color:var(--text-secondary);
}
.mermaid-diagram-actions button:hover:not(:disabled),.mermaid-fullscreen-dialog header button:hover:not(:disabled) { color:var(--text-primary); background:var(--bg-hover); }
.mermaid-diagram-actions button:focus-visible,.mermaid-fullscreen-dialog header button:focus-visible,.mermaid-diagram-stage:focus-visible,.mermaid-fullscreen-stage:focus-visible { outline:2px solid var(--accent-color); outline-offset:-2px; }
.mermaid-diagram-actions button:disabled,.mermaid-fullscreen-dialog header button:disabled { cursor:not-allowed; opacity:.35; }

.mermaid-diagram-stage {
  position:relative;
  min-height:180px;
  overflow:auto;
  overscroll-behavior-x:contain;
  overscroll-behavior-y:auto;
  padding:22px;
  background:var(--bg-primary);
  scrollbar-width:thin;
  scrollbar-color:color-mix(in srgb,var(--text-tertiary) 38%,transparent) transparent;
}
.mermaid-diagram-svg { min-width:0; margin:0 auto; transition:width .16s ease; }
.mermaid-diagram-svg :deep(svg) { display:block; width:100%!important; max-width:none!important; height:auto!important; margin:0 auto; overflow:visible; }
.mermaid-diagram.is-loading .mermaid-diagram-svg { opacity:.48; }
.mermaid-diagram-state { min-height:136px; display:flex; align-items:center; justify-content:center; gap:8px; color:var(--text-tertiary); font-size:12px; }
.mermaid-spinner { animation:mermaid-spin .8s linear infinite; }
@keyframes mermaid-spin { to { transform:rotate(360deg); } }

.mermaid-diagram-error {
  position:relative;
  display:flex;
  align-items:center;
  flex-wrap:wrap;
  gap:8px;
  margin-top:14px;
  padding:9px 10px;
  border:1px solid color-mix(in srgb,#e03131 36%,var(--line,var(--border-color)));
  border-radius:8px;
  color:#b42318;
  background:color-mix(in srgb,#e03131 7%,var(--bg-primary));
  font-size:11px;
}
.mermaid-diagram-error span { min-width:180px; flex:1; }
.mermaid-diagram-error button { display:inline-flex; align-items:center; gap:4px; min-height:26px; padding:0 7px; border-radius:6px; color:inherit; font-weight:600; }
.mermaid-diagram-error button:hover { background:color-mix(in srgb,#e03131 10%,transparent); }
[data-theme='dark'] .mermaid-diagram-error { color:#ffb4ab; }

.mermaid-fullscreen {
  position:fixed;
  z-index:3600;
  inset:0;
  display:grid;
  place-items:center;
  padding:24px;
  background:rgba(8,10,15,.72);
  backdrop-filter:blur(4px);
}
.mermaid-fullscreen-dialog {
  width:min(1400px,calc(100vw - 48px));
  height:min(920px,calc(100vh - 48px));
  display:flex;
  flex-direction:column;
  overflow:hidden;
  border:1px solid color-mix(in srgb,var(--line,var(--border-color)) 80%,transparent);
  border-radius:12px;
  color:var(--text-primary);
  background:var(--bg-primary);
  box-shadow:0 28px 80px rgba(0,0,0,.42);
}
.mermaid-fullscreen-dialog > header { min-height:48px; display:flex; align-items:center; gap:10px; padding:8px 10px 8px 16px; border-bottom:1px solid var(--line,var(--border-color)); background:var(--bg-secondary); }
.mermaid-fullscreen-dialog > header > span:first-child { display:inline-flex; align-items:center; gap:7px; font-size:13px; font-weight:600; }
.mermaid-fullscreen-dialog > header > span:first-child svg { color:var(--accent-color); }
.mermaid-fullscreen-hint { color:var(--text-tertiary); font-size:10px; font-weight:400; }
.mermaid-fullscreen-dialog > header > div { display:flex; gap:3px; margin-left:auto; }
.mermaid-fullscreen-stage { min-height:0; flex:1; overflow:auto; padding:28px; overscroll-behavior:contain; cursor:grab; user-select:none; touch-action:none; }
.mermaid-fullscreen-stage.is-dragging { cursor:grabbing; }
.mermaid-fullscreen-svg { min-height:100%; display:flex; align-items:center; transition:none; }
.visually-hidden { position:absolute!important; width:1px!important; height:1px!important; padding:0!important; margin:-1px!important; overflow:hidden!important; clip:rect(0,0,0,0)!important; white-space:nowrap!important; border:0!important; }

@container (max-width:520px) {
  .mermaid-diagram-toolbar { padding-left:8px; gap:6px; }
  .mermaid-diagram-kind { font-size:0; gap:0; }
  .mermaid-diagram-kind svg { width:15px; height:15px; }
  .mermaid-diagram-stage { padding:14px; }
}

@media (prefers-reduced-motion:reduce) {
  .mermaid-diagram-svg { transition:none; }
  .mermaid-spinner { animation-duration:.01ms; }
}
</style>
