import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { renderMermaidDiagram } from '../utils/mermaidRenderer'
import { createMermaidViewportKernel } from '../utils/mermaidViewport'

export interface MermaidDiagramProps {
  source: string
}

export type MermaidDiagramEmit = (event: 'show-source' | 'rendered') => void

export function useMermaidDiagram(props: Readonly<MermaidDiagramProps>, emit: MermaidDiagramEmit) {  
  const viewportKernel = createMermaidViewportKernel()
  
  const svg = ref('')
  const loading = ref(false)
  const error = ref('')
  const theme = ref<'light' | 'dark'>('light')
  const zoom = ref(100)
  const fullscreenZoom = ref(100)
  const naturalWidth = ref(0)
  const fullscreen = ref(false)
  const screenFullscreen = ref(false)
  const sourceCopied = ref(false)
  const inlineStage = ref<HTMLElement | null>(null)
  const fullscreenStage = ref<HTMLElement | null>(null)
  const fullscreenClose = ref<HTMLButtonElement | null>(null)
  const fullscreenDialog = ref<HTMLElement | null>(null)
  const dragging = ref(false)
  let themeObserver: MutationObserver | undefined
  let stageObserver: ResizeObserver | undefined
  let renderTimer: number | undefined
  let copyTimer: number | undefined
  let renderRevision = 0
  let fullscreenTrigger: HTMLElement | null = null
  let inertRoot: HTMLElement | null = null
  let inertRootWasAlreadyInert = false
  let lastWheelZoomAt = -Infinity
  let inlineFit = true
  let fullscreenFit = true
  let panPointerId: number | null = null
  let panStartX = 0
  let panStartY = 0
  let panStartScrollLeft = 0
  let panStartScrollTop = 0
  let viewportRevision = 0
  let usingNativeFullscreen = false
  
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
  
  function friendlyError(reason: unknown) {
    const record = typeof reason === 'object' && reason !== null ? reason as { code?: string; message?: string } : null
    if (record?.code === 'MERMAID_EXTERNAL_RESOURCE') return record.message || ''
    const detail = String(record?.message || reason || '')
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
      naturalWidth.value = viewportKernel.readNaturalWidth(result.svg)
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
  
  function scheduleRender({ resetPreview = false }: { resetPreview?: boolean } = {}) {
    clearTimeout(renderTimer)
    renderRevision += 1
    loading.value = !empty.value
    error.value = ''
    if (resetPreview) {
      svg.value = ''
      naturalWidth.value = 0
      zoom.value = 100
      inlineFit = true
      if (fullscreen.value) closeFullscreen()
    }
    renderTimer = window.setTimeout(renderDiagram, 220)
  }
  
  function availableStageWidth(stage: HTMLElement) {
    if (!stage?.clientWidth) return 0
    const styles = window.getComputedStyle(stage)
    return Math.max(0, stage.clientWidth - parseFloat(styles.paddingLeft || '0') - parseFloat(styles.paddingRight || '0'))
  }
  
  function updateFitZoom(useFullscreen = fullscreen.value) {
    const stage = useFullscreen ? fullscreenStage.value : inlineStage.value
    if (!stage) return
    const available = availableStageWidth(stage)
    const fitted = viewportKernel.fitZoom(available, naturalWidth.value)
    if (useFullscreen) fullscreenZoom.value = fitted
    else zoom.value = fitted
  }
  
  function zoomIn() {
    viewportRevision += 1
    if (fullscreen.value) fullscreenFit = false
    else inlineFit = false
    activeZoom.value = viewportKernel.nextZoom(activeZoom.value, 1, {
      minimum: fullscreen.value ? 10 : 75,
      step: 25
    })
  }
  
  function zoomOut() {
    const minimum = fullscreen.value ? 10 : 75
    if (activeZoom.value <= minimum) return
    viewportRevision += 1
    if (fullscreen.value) fullscreenFit = false
    else inlineFit = false
    activeZoom.value = viewportKernel.nextZoom(activeZoom.value, -1, { minimum, step: 25 })
  }
  
  function fitWidth() {
    viewportRevision += 1
    if (fullscreen.value) fullscreenFit = true
    else inlineFit = true
    updateFitZoom()
  }
  
  async function openFullscreen(event: MouseEvent) {
    if (!svg.value || error.value) return
    viewportRevision += 1
    lastWheelZoomAt = -Infinity
    fullscreenTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : document.activeElement instanceof HTMLElement ? document.activeElement : null
    fullscreenZoom.value = 100
    fullscreenFit = true
    fullscreen.value = true
    await nextTick()
    setAppInert(true)
    updateFitZoom(true)
    fullscreenClose.value?.focus()
  }
  
  async function enterScreenFullscreen() {
    if (!fullscreen.value || !fullscreenDialog.value) return
    viewportRevision += 1
    cancelPan()
    const dialog = fullscreenDialog.value
    if (typeof dialog.requestFullscreen === 'function') {
      usingNativeFullscreen = true
      try {
        await dialog.requestFullscreen()
      } catch {
        usingNativeFullscreen = false
      }
    }
    screenFullscreen.value = true
    await nextTick()
    if (fullscreen.value && fullscreenFit) updateFitZoom(true)
    fullscreenStage.value?.focus?.({ preventScroll: true })
  }
  
  async function exitScreenFullscreen() {
    if (!screenFullscreen.value && !usingNativeFullscreen) return
    viewportRevision += 1
    cancelPan()
    const dialog = fullscreenDialog.value
    if (usingNativeFullscreen && document.fullscreenElement === dialog && typeof document.exitFullscreen === 'function') {
      try {
        await document.exitFullscreen()
      } catch {
        // The WebView can end native fullscreen before this promise settles.
      }
    }
    usingNativeFullscreen = false
    screenFullscreen.value = false
    await nextTick()
    if (fullscreen.value && fullscreenFit) updateFitZoom(true)
  }
  
  function toggleScreenFullscreen() {
    return screenFullscreen.value ? exitScreenFullscreen() : enterScreenFullscreen()
  }
  
  function handleFullscreenChange() {
    if (!usingNativeFullscreen) return
    const active = document.fullscreenElement === fullscreenDialog.value
    screenFullscreen.value = active
    if (!active) usingNativeFullscreen = false
    nextTick(() => {
      if (fullscreen.value && fullscreenFit) updateFitZoom(true)
    })
  }
  
  async function closeFullscreen() {
    if (!fullscreen.value) return
    viewportRevision += 1
    cancelPan()
    await exitScreenFullscreen()
    fullscreen.value = false
    setAppInert(false)
    await nextTick()
    if (inlineFit) updateFitZoom(false)
    fullscreenTrigger?.focus?.()
  }
  
  function setAppInert(active: boolean) {
    if (active) {
      inertRoot = document.getElementById('app')
      inertRootWasAlreadyInert = inertRoot?.hasAttribute('inert') || false
      inertRoot?.setAttribute('inert', '')
    } else if (inertRoot && !inertRootWasAlreadyInert) {
      inertRoot.removeAttribute('inert')
      inertRoot = null
    }
  }
  
  function handleStageKeydown(event: KeyboardEvent) {
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
  
  function setStageScroll(stage: HTMLElement, left: number, top: number) {
    const next = viewportKernel.clampScroll(stage, left, top)
    stage.scrollLeft = next.left
    stage.scrollTop = next.top
  }
  
  async function zoomAroundPointer(event: WheelEvent) {
    const revision = ++viewportRevision
    const wasFullscreen = fullscreen.value
    const stage = fullscreen.value ? fullscreenStage.value : inlineStage.value
    const diagram = stage?.querySelector<SVGElement>('.mermaid-diagram-svg > svg')
    if (!stage || !diagram) return
  
    const before = diagram.getBoundingClientRect()
    const anchor = viewportKernel.pointerAnchor(before, event.clientX, event.clientY)
    const direction = event.deltaY < 0 ? 1 : -1
    const minimum = fullscreen.value ? 10 : 75
    const nextZoom = viewportKernel.nextZoom(activeZoom.value, direction, { minimum, step: 15 })
    if (nextZoom === activeZoom.value) return
  
    if (fullscreen.value) fullscreenFit = false
    else inlineFit = false
    activeZoom.value = nextZoom
    await nextTick()
  
    const currentStage = wasFullscreen ? fullscreenStage.value : inlineStage.value
    if (revision !== viewportRevision || fullscreen.value !== wasFullscreen || currentStage !== stage || !diagram.isConnected) return
  
    const after = diagram.getBoundingClientRect()
    const nextScroll = viewportKernel.anchoredScroll(stage, { before, after, anchor })
    setStageScroll(stage, nextScroll.left, nextScroll.top)
  }
  
  function handleWheel(event: WheelEvent) {
    if (!fullscreen.value && !event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    if (!event.deltaY || !svg.value) return
    const now = performance.now()
    if (now - lastWheelZoomAt < 32) return
    lastWheelZoomAt = now
    void zoomAroundPointer(event)
  }
  
  function startPan(event: PointerEvent) {
    if (!fullscreen.value || event.button !== 0 || event.isPrimary === false) return
    const stage = event.currentTarget as HTMLElement
    if (event.target instanceof Element && event.target.closest('button,a,input,select,textarea,[contenteditable="true"]')) return
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
  
  function movePan(event: PointerEvent) {
    if (!dragging.value || event.pointerId !== panPointerId) return
    if (event.pointerType === 'mouse' && typeof event.buttons === 'number' && !(event.buttons & 1)) {
      finishPan(event)
      return
    }
    event.preventDefault()
    const stage = event.currentTarget as HTMLElement
    const nextScroll = viewportKernel.panScroll({
      clientX: panStartX,
      clientY: panStartY,
      scrollLeft: panStartScrollLeft,
      scrollTop: panStartScrollTop
    }, event.clientX, event.clientY)
    setStageScroll(stage, nextScroll.left, nextScroll.top)
  }
  
  function finishPan(event: PointerEvent) {
    if (!dragging.value || event.pointerId !== panPointerId) return
    const pointerId = panPointerId
    dragging.value = false
    panPointerId = null
    try {
      ;(event.currentTarget as HTMLElement).releasePointerCapture?.(pointerId)
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
  
  function handleWindowKeydown(event: KeyboardEvent) {
    if (!fullscreen.value) return
    if (event.key === 'Escape') {
      event.preventDefault()
      if (screenFullscreen.value) exitScreenFullscreen()
      else closeFullscreen()
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
    const focusable = Array.from(fullscreenDialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]') || [])
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
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
        if (inlineFit && inlineStage.value) updateFitZoom(false)
        if (fullscreen.value && fullscreenFit && fullscreenStage.value) updateFitZoom(true)
      })
      if (inlineStage.value) stageObserver.observe(inlineStage.value)
    }
    window.addEventListener('keydown', handleWindowKeydown)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
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
    if (usingNativeFullscreen && document.fullscreenElement === fullscreenDialog.value) {
      document.exitFullscreen?.().catch?.(() => {})
    }
    usingNativeFullscreen = false
    screenFullscreen.value = false
    setAppInert(false)
    window.removeEventListener('keydown', handleWindowKeydown)
    document.removeEventListener('fullscreenchange', handleFullscreenChange)
  })
  return {
    svg, loading, error, zoom, fullscreenZoom, fullscreen, screenFullscreen,
    sourceCopied, inlineStage, fullscreenStage, fullscreenClose, fullscreenDialog,
    dragging, diagramKind, zoomStyle, empty, renderDiagram, zoomIn, zoomOut,
    fitWidth, openFullscreen, toggleScreenFullscreen, closeFullscreen, copySource,
    handleStageKeydown, handleWheel, startPan, movePan, finishPan
  }
}
