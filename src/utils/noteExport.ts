import { sanitizeEditorHtml } from './noteMarkdown'
import { renderMermaidDiagram } from './mermaidRenderer'
import { createMermaidViewportKernel } from './mermaidViewport'
import type { Note } from '../types/domain'

interface NoteSnapshot { title: string; contentHtml: string }
interface MermaidDragState { pointerId: number; clientX: number; clientY: number; scrollLeft: number; scrollTop: number }
type ViewportKernel = ReturnType<typeof createMermaidViewportKernel>
type MermaidRenderer = typeof renderMermaidDiagram
type RemoteImageEmbedder = (source: string, documentRef: Document, options?: { timeoutMs?: number }) => Promise<string>

const DEFAULT_EXPORT_TITLE = '未命名笔记'
const WINDOWS_RESERVED_FILENAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i
const PDF_MAX_CANVAS_DIMENSION = 24_000
const PDF_MAX_CANVAS_AREA = 160_000_000
const PDF_MIN_RENDER_SCALE = 0.75
const PDF_REMOTE_IMAGE_MAX_OUTPUT_BYTES = 12 * 1024 * 1024
const PDF_REMOTE_IMAGE_TOTAL_BYTES = 24 * 1024 * 1024
const PDF_REMOTE_IMAGE_MAX_COUNT = 24
const PDF_REMOTE_IMAGE_TIMEOUT_MS = 3_000
const PDF_REMOTE_IMAGE_TOTAL_TIMEOUT_MS = 9_000
const PDF_REMOTE_IMAGE_MAX_DIMENSION = 4_096
const PDF_REMOTE_IMAGE_MAX_PIXELS = 8_000_000

const NOTE_EXPORT_PAGE_CSS = `
:root { color-scheme: light; }
html, body { margin: 0; min-height: 100%; background: #ffffff; }
body { -webkit-font-smoothing: antialiased; }
`

const NOTE_EXPORT_ARTICLE_CSS = `
.tiny-note-export-document,
.tiny-note-export-document * { box-sizing: border-box; }
.tiny-note-export-document {
  color: #37352f;
  font-family: "Notion Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased;
  width: min(820px, calc(100% - 48px));
  margin: 0 auto;
  padding: 56px 0 72px;
}
.tiny-note-export-title {
  margin: 0 0 34px;
  color: #1a1a1a;
  font-size: 40px;
  font-weight: 700;
  line-height: 1.18;
  letter-spacing: -0.7px;
  overflow-wrap: anywhere;
}
.tiny-note-export-body {
  color: #37352f;
  font-size: 16px;
  line-height: 1.75;
  overflow-wrap: anywhere;
}
.tiny-note-export-body > :first-child { margin-top: 0; }
.tiny-note-export-body > :last-child { margin-bottom: 0; }
.tiny-note-export-body h1,
.tiny-note-export-body h2,
.tiny-note-export-body h3,
.tiny-note-export-body h4,
.tiny-note-export-body h5,
.tiny-note-export-body h6 {
  break-after: avoid-page;
  color: #1a1a1a;
  font-weight: 650;
  line-height: 1.32;
}
.tiny-note-export-body h1 { margin: 1.4em 0 0.55em; font-size: 30px; letter-spacing: -0.35px; }
.tiny-note-export-body h2 { margin: 1.35em 0 0.5em; font-size: 24px; letter-spacing: -0.2px; }
.tiny-note-export-body h3 { margin: 1.25em 0 0.45em; font-size: 20px; }
.tiny-note-export-body h4,
.tiny-note-export-body h5,
.tiny-note-export-body h6 { margin: 1.1em 0 0.4em; font-size: 17px; }
.tiny-note-export-body p {
  margin: 0.62em 0;
  break-inside: avoid-page;
}
.tiny-note-export-body ul,
.tiny-note-export-body ol { margin: 0.65em 0; padding-left: 1.7em; }
.tiny-note-export-body li { margin: 0.22em 0; }
.tiny-note-export-body li > p { margin: 0.12em 0; }
.tiny-note-export-body blockquote {
  margin: 1em 0;
  padding: 0.2em 0 0.2em 1em;
  border-left: 3px solid #c8c4be;
  color: #5d5b54;
}
.tiny-note-export-body pre {
  margin: 1em 0;
  padding: 14px 16px;
  break-inside: avoid-page;
  border: 1px solid #e5e3df;
  border-radius: 8px;
  background: #f6f5f4;
  color: #1a1a1a;
  font-size: 13px;
  line-height: 1.58;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.tiny-note-export-body code {
  padding: 0.12em 0.32em;
  border-radius: 4px;
  background: #f0eeec;
  color: #1a1a1a;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 0.9em;
}
.tiny-note-export-body pre code { padding: 0; background: transparent; font-size: inherit; }
.tiny-note-export-body table {
  width: 100%;
  margin: 1.1em 0;
  border-collapse: collapse;
  break-inside: auto;
  font-size: 14px;
}
.tiny-note-export-body tr { break-inside: avoid-page; }
.tiny-note-export-body th,
.tiny-note-export-body td {
  min-width: 60px;
  padding: 8px 10px;
  border: 1px solid #d9d6d0;
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}
.tiny-note-export-body th { background: #f6f5f4; color: #1a1a1a; font-weight: 600; }
.tiny-note-export-body th > p,
.tiny-note-export-body td > p { margin: 0; }
.tiny-note-export-body img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 1em auto;
  break-inside: avoid-page;
}
.tiny-note-export-image-fallback {
  margin: 1em 0;
  padding: 12px 14px;
  break-inside: avoid-page;
  border: 1px solid #d9d6d0;
  border-radius: 6px;
  background: #f6f5f4;
  color: #5d5b54;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.tiny-note-export-mermaid {
  position: relative;
  margin: 1.2em 0;
  padding: 16px;
  break-inside: avoid-page;
  border: 1px solid #e5e3df;
  border-radius: 8px;
  background: #ffffff;
  overflow: hidden;
}
.tiny-note-export-mermaid svg { display: block; width: 100%; max-width: 100%; height: auto; margin: 0 auto; }
.tiny-note-export-mermaid-actions {
  position: absolute;
  z-index: 1;
  top: 10px;
  right: 10px;
  display: flex;
  gap: 6px;
}
.tiny-note-export-mermaid-actions button {
  min-width: 32px;
  height: 32px;
  padding: 0 9px;
  border: 1px solid #c8c4be;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.96);
  color: #37352f;
  font: 500 12px/1 "Notion Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  cursor: pointer;
}
.tiny-note-export-mermaid-actions button:hover { background: #f0eeec; }
.tiny-note-export-mermaid-actions button:focus-visible { outline: 2px solid #5645d4; outline-offset: 2px; }
.tiny-note-export-mermaid-actions button:disabled { color: #787671; cursor: wait; }
.tiny-note-export-mermaid-dialog {
  position: fixed;
  z-index: 2147483647;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(10, 15, 24, 0.72);
}
.tiny-note-export-mermaid-dialog-panel {
  display: flex;
  flex-direction: column;
  width: min(1180px, 100%);
  height: min(820px, 100%);
  min-height: 0;
  overflow: hidden;
  border: 1px solid #c8c4be;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: rgba(15, 15, 15, 0.2) 0 24px 48px -8px;
}
.tiny-note-export-mermaid-dialog-panel:fullscreen {
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  border: 0;
  border-radius: 0;
}
.tiny-note-export-mermaid-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px 10px 16px;
  border-bottom: 1px solid #e5e3df;
  background: #fafaf9;
}
.tiny-note-export-mermaid-dialog-title { color: #1a1a1a; font-size: 14px; font-weight: 600; }
.tiny-note-export-mermaid-dialog-hint { margin-left: 10px; color: #787671; font-size: 12px; font-weight: 400; }
.tiny-note-export-mermaid-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.tiny-note-export-mermaid-toolbar button {
  min-width: 40px;
  height: 40px;
  padding: 0 11px;
  border: 1px solid #c8c4be;
  border-radius: 8px;
  background: #ffffff;
  color: #37352f;
  font: 500 13px/1 "Notion Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  cursor: pointer;
}
.tiny-note-export-mermaid-toolbar button:hover { background: #f0eeec; }
.tiny-note-export-mermaid-toolbar button:active { background: #e5e3df; }
.tiny-note-export-mermaid-toolbar button:focus-visible,
.tiny-note-export-mermaid-viewport:focus-visible { outline: 2px solid #5645d4; outline-offset: -2px; }
.tiny-note-export-mermaid-toolbar button:disabled { color: #a4a097; cursor: default; opacity: 0.7; }
.tiny-note-export-mermaid-scale {
  min-width: 52px;
  color: #5d5b54;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.tiny-note-export-mermaid-viewport {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow: auto;
  background: #ffffff;
  cursor: grab;
  overscroll-behavior: contain;
  touch-action: none;
  user-select: none;
}
body.tiny-note-export-mermaid-open { overflow: hidden; }
.tiny-note-export-mermaid-viewport.is-dragging { cursor: grabbing; }
.tiny-note-export-mermaid-canvas {
  position: relative;
  flex: 0 0 auto;
  margin: auto;
}
.tiny-note-export-mermaid-canvas svg { display: block; width: 100%; height: auto; max-width: none; margin: 0; }
.tiny-note-export-mermaid-error {
  margin: 1em 0 -0.5em;
  padding: 8px 10px;
  border-radius: 6px;
  color: #a61e1e;
  background: #fff1f0;
  font-size: 12px;
}
.tiny-note-export-body a { color: #0075de; text-decoration: underline; text-underline-offset: 2px; }
.tiny-note-export-body hr { margin: 1.6em 0; border: 0; border-top: 1px solid #e5e3df; }
.tiny-note-export-body mark { padding: 0.05em 0.18em; border-radius: 3px; }
.tiny-note-export-body ul[data-type="taskList"] { padding-left: 0; list-style: none; }
.tiny-note-export-body ul[data-type="taskList"] li {
  display: flex;
  align-items: flex-start;
  gap: 0.55em;
  break-inside: avoid-page;
}
.tiny-note-export-body ul[data-type="taskList"] li > label { flex: 0 0 auto; padding-top: 0.12em; }
.tiny-note-export-body ul[data-type="taskList"] li > div { min-width: 0; flex: 1; }
.tiny-note-export-body input[type="checkbox"] { width: 14px; height: 14px; accent-color: #5645d4; }
.tiny-note-export-empty { margin: 0; color: #787671; font-style: italic; }
.tiny-note-pdf-heading-group {
  display: flow-root;
  break-inside: avoid-page;
  page-break-inside: avoid;
}
`

const NOTE_EXPORT_RESPONSIVE_CSS = `
@media (max-width: 640px) {
  .tiny-note-export-document { width: min(100% - 32px, 820px); padding: 36px 0 48px; }
  .tiny-note-export-title { margin-bottom: 26px; font-size: 32px; }
  .tiny-note-export-body { font-size: 15px; }
  .tiny-note-export-mermaid-dialog { padding: 0; }
  .tiny-note-export-mermaid-dialog-panel { width: 100%; height: 100%; border: 0; border-radius: 0; }
  .tiny-note-export-mermaid-dialog-header { align-items: flex-start; flex-direction: column; gap: 8px; }
  .tiny-note-export-mermaid-dialog-hint { display: block; margin: 4px 0 0; }
}
`

const NOTE_EXPORT_PRINT_CSS = `
@page { size: A4 portrait; margin: 18mm; }
@media print {
  html, body {
    margin: 0 !important;
    min-width: 0 !important;
    width: auto !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
    background: #ffffff !important;
  }
  body.tiny-note-app-printing > :not(.tiny-note-print-root) { display: none !important; }
  body.tiny-note-app-printing .tiny-note-print-root { display: block !important; }
  .tiny-note-export-document { width: auto; max-width: none; margin: 0; padding: 0; }
  .tiny-note-export-title { font-size: 30px; }
  .tiny-note-export-body { font-size: 11pt; line-height: 1.65; }
  .tiny-note-export-body a { color: #1a1a1a; text-decoration: underline; }
  .tiny-note-export-mermaid-actions,
  .tiny-note-export-mermaid-dialog { display: none !important; }
}
`

export const NOTE_EXPORT_CSS = `${NOTE_EXPORT_PAGE_CSS}${NOTE_EXPORT_ARTICLE_CSS}${NOTE_EXPORT_RESPONSIVE_CSS}${NOTE_EXPORT_PRINT_CSS}`

export async function exportMermaidPng(svg: SVGElement, {
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  urlRef = globalThis.URL
}: { documentRef?: Document; windowRef?: Window & typeof globalThis; urlRef?: typeof URL } = {}): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGElement
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const viewBox = (clone.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number)
  let naturalWidth = viewBox.length === 4 && Number.isFinite(viewBox[2]) && viewBox[2] > 0
    ? viewBox[2]
    : Number.parseFloat(clone.getAttribute('width') || '')
  let naturalHeight = viewBox.length === 4 && Number.isFinite(viewBox[3]) && viewBox[3] > 0
    ? viewBox[3]
    : Number.parseFloat(clone.getAttribute('height') || '')
  if (!Number.isFinite(naturalWidth) || naturalWidth <= 0) naturalWidth = 1200
  if (!Number.isFinite(naturalHeight) || naturalHeight <= 0) naturalHeight = naturalWidth * 0.5625

  const scale = Math.min(
    4,
    8192 / naturalWidth,
    8192 / naturalHeight,
    Math.sqrt(32_000_000 / (naturalWidth * naturalHeight))
  )
  const targetWidth = Math.max(1, Math.round(naturalWidth * scale))
  const targetHeight = Math.max(1, Math.round(naturalHeight * scale))
  clone.setAttribute('width', String(naturalWidth))
  clone.setAttribute('height', String(naturalHeight))

  const source = new windowRef.XMLSerializer().serializeToString(clone)
  const sourceBlob = new windowRef.Blob([source], { type: 'image/svg+xml;charset=utf-8' })
  const sourceUrl = urlRef.createObjectURL(sourceBlob)
  try {
    const image = new windowRef.Image()
    image.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('无法载入流程图'))
      image.src = sourceUrl
    })
    const canvas = documentRef.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前浏览器无法生成图片')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, targetWidth, targetHeight)
    context.drawImage(image, 0, 0, targetWidth, targetHeight)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片生成失败')), 'image/png')
    })
  } finally {
    urlRef.revokeObjectURL(sourceUrl)
  }
}

function escapeHtml(value: unknown = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function normalizeSnapshot(note: Partial<Pick<Note, 'title' | 'contentHtml'>> = {}) {
  const title = String(note.title || '').trim() || DEFAULT_EXPORT_TITLE
  const contentHtml = sanitizeEditorHtml(note.contentHtml || '')
  return { title, contentHtml }
}

export function initializeExportMermaidViewers(documentRef: Document, viewportKernel: ViewportKernel, pngExporter: typeof exportMermaidPng) {
  const MINIMUM_ZOOM = 10
  const MAXIMUM_ZOOM = 250
  const BUTTON_STEP = 25
  const WHEEL_STEP = 15
  const roots = [...documentRef.querySelectorAll<HTMLElement>('[data-mermaid-viewer]')]

  roots.forEach((root, index) => {
    if (root.dataset.mermaidInitialized === 'true') return
    const expandButton = root.querySelector<HTMLButtonElement>('[data-mermaid-action="expand"]')
    const downloadButton = root.querySelector<HTMLButtonElement>('[data-mermaid-action="download-png"]')
    const previewSvg = root.querySelector<SVGElement>('[data-mermaid-preview] > svg')
    if (!expandButton || !previewSvg) return
    root.dataset.mermaidInitialized = 'true'

    downloadButton?.addEventListener('click', async () => {
      if (downloadButton.disabled || typeof pngExporter !== 'function') return
      const windowRef = documentRef.defaultView || globalThis.window
      downloadButton.disabled = true
      downloadButton.setAttribute('aria-busy', 'true')
      downloadButton.textContent = '生成中…'
      try {
        const blob = await pngExporter(previewSvg, { documentRef, windowRef })
        const rawTitle = documentRef.title || '流程图'
        const safeTitle = rawTitle
          .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
          .replace(/[. ]+$/g, '')
          .slice(0, 80) || '流程图'
        const url = windowRef.URL.createObjectURL(blob)
        const anchor = documentRef.createElement('a')
        anchor.href = url
        anchor.download = `${safeTitle}-流程图-${index + 1}.png`
        anchor.style.display = 'none'
        documentRef.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        windowRef.setTimeout(() => windowRef.URL.revokeObjectURL(url), 0)
        downloadButton.textContent = '已下载'
      } catch {
        downloadButton.textContent = '下载失败'
      } finally {
        downloadButton.removeAttribute('aria-busy')
        windowRef.setTimeout(() => {
          downloadButton.disabled = false
          downloadButton.textContent = '↓ 下载高清图'
        }, 1200)
      }
    })

    expandButton.addEventListener('click', () => {
      if (documentRef.querySelector('[data-mermaid-dialog]')) return
      const windowRef = documentRef.defaultView
      const dialog = documentRef.createElement('div')
      dialog.className = 'tiny-note-export-mermaid-dialog'
      dialog.setAttribute('data-mermaid-dialog', '')
      dialog.setAttribute('role', 'dialog')
      dialog.setAttribute('aria-modal', 'true')
      dialog.setAttribute('aria-label', 'Mermaid 图表放大查看')
      dialog.innerHTML = `<div class="tiny-note-export-mermaid-dialog-panel">
<header class="tiny-note-export-mermaid-dialog-header">
<div><span class="tiny-note-export-mermaid-dialog-title">Mermaid 图表</span><span class="tiny-note-export-mermaid-dialog-hint">按住左键拖动 · 滚轮指向缩放</span></div>
<div class="tiny-note-export-mermaid-toolbar" role="toolbar" aria-label="图表缩放控制">
<output class="tiny-note-export-mermaid-scale" data-mermaid-scale aria-live="polite">100%</output>
<button type="button" data-mermaid-action="fit" title="适合宽度">适合宽度</button>
<button type="button" data-mermaid-action="screen-fullscreen" title="进入全屏" aria-label="进入全屏">全屏</button>
<button type="button" data-mermaid-action="close" title="关闭" aria-label="关闭图表">×</button>
</div>
</header>
<div class="tiny-note-export-mermaid-viewport" data-mermaid-viewport tabindex="0" aria-label="全屏图表画布，按住鼠标左键拖动，滚轮围绕指针缩放">
<div class="tiny-note-export-mermaid-canvas" data-mermaid-canvas></div>
</div>
</div>`
      const viewport = dialog.querySelector<HTMLElement>('[data-mermaid-viewport]')
      const canvas = dialog.querySelector<HTMLElement>('[data-mermaid-canvas]')
      const scaleOutput = dialog.querySelector<HTMLOutputElement>('[data-mermaid-scale]')
      const panel = dialog.querySelector<HTMLElement>('.tiny-note-export-mermaid-dialog-panel')
      const fullscreenButton = dialog.querySelector<HTMLButtonElement>('[data-mermaid-action="screen-fullscreen"]')
      if (!viewport || !canvas || !scaleOutput || !panel || !fullscreenButton) return
      const svg = previewSvg.cloneNode(true) as SVGElement
      canvas.appendChild(svg)
      documentRef.body.appendChild(dialog)
      documentRef.body.classList.add('tiny-note-export-mermaid-open')

      const inertTargets = [...documentRef.body.children]
        .filter(element => element !== dialog)
        .map(element => ({ element, wasInert: element.hasAttribute('inert') }))
      inertTargets.forEach(({ element }) => element.setAttribute('inert', ''))

      const naturalWidth = viewportKernel.readNaturalWidth(svg.outerHTML) || viewport.clientWidth || 1
      let zoom = 100
      let fitMode = true
      let drag: MermaidDragState | null = null
      let lastWheelZoomAt = -Infinity

      const apply = () => {
        canvas.style.width = `${Math.round(naturalWidth * zoom) / 100}px`
        dialog.dataset.mermaidScaleValue = String(zoom / 100)
        scaleOutput.textContent = `${zoom}%`
      }
      const setZoom = (nextZoom: number) => {
        zoom = nextZoom
        fitMode = false
        apply()
      }
      const zoomBy = (direction: number, step = BUTTON_STEP) => {
        const nextZoom = viewportKernel.nextZoom(zoom, direction, {
          minimum: MINIMUM_ZOOM,
          maximum: MAXIMUM_ZOOM,
          step
        })
        if (nextZoom !== zoom) setZoom(nextZoom)
      }
      const setScroll = (left: number, top: number) => {
        const next = viewportKernel.clampScroll(viewport, left, top)
        viewport.scrollLeft = next.left
        viewport.scrollTop = next.top
      }
      const fit = () => {
        zoom = viewportKernel.fitZoom(viewport.clientWidth || viewport.getBoundingClientRect().width, naturalWidth)
        fitMode = true
        apply()
        viewport.scrollLeft = 0
        viewport.scrollTop = 0
      }
      const updateFullscreenState = () => {
        const active = documentRef.fullscreenElement === panel
        fullscreenButton.setAttribute('aria-label', active ? '退出全屏' : '进入全屏')
        fullscreenButton.setAttribute('title', active ? '退出全屏' : '进入全屏')
        fullscreenButton.textContent = active ? '退出全屏' : '全屏'
        if (fitMode) fit()
      }
      const enterScreenFullscreen = async () => {
        if (typeof panel.requestFullscreen !== 'function') {
          fullscreenButton.setAttribute('title', '当前浏览器不支持全屏')
          return
        }
        try {
          await panel.requestFullscreen()
          updateFullscreenState()
          viewport.focus?.({ preventScroll: true })
        } catch {
          fullscreenButton.setAttribute('title', '无法进入全屏')
        }
      }
      const exitScreenFullscreen = async () => {
        if (documentRef.fullscreenElement !== panel || typeof documentRef.exitFullscreen !== 'function') return
        try { await documentRef.exitFullscreen() } catch { /* The browser may have already exited fullscreen. */ }
        updateFullscreenState()
      }
      const toggleScreenFullscreen = () => documentRef.fullscreenElement === panel
        ? exitScreenFullscreen()
        : enterScreenFullscreen()
      const close = async () => {
        if (documentRef.fullscreenElement === panel) await exitScreenFullscreen()
        documentRef.removeEventListener('keydown', handleDocumentKeydown)
        documentRef.removeEventListener('fullscreenchange', updateFullscreenState)
        windowRef?.removeEventListener('resize', handleResize)
        dialog.remove()
        documentRef.body.classList.remove('tiny-note-export-mermaid-open')
        inertTargets.forEach(({ element, wasInert }) => {
          if (!wasInert) element.removeAttribute('inert')
        })
        expandButton.focus()
      }
      const handleResize = () => {
        if (fitMode) fit()
        else setScroll(viewport.scrollLeft, viewport.scrollTop)
      }
      const handleDocumentKeydown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          if (documentRef.fullscreenElement === panel) void exitScreenFullscreen()
          else void close()
          return
        }
        if (event.key === '+' || event.key === '=') zoomBy(1)
        else if (event.key === '-') zoomBy(-1)
        else if (event.key === '0') fit()
        else if (event.key === 'Tab') {
          const focusable = [...dialog.querySelectorAll('button:not(:disabled), [tabindex="0"]')]
          const first = focusable[0]
          const last = focusable.at(-1)
          if (event.shiftKey && documentRef.activeElement === first) {
            event.preventDefault()
            ;(last as HTMLElement | undefined)?.focus()
          } else if (!event.shiftKey && documentRef.activeElement === last) {
            event.preventDefault()
            ;(first as HTMLElement | undefined)?.focus()
          }
          return
        } else return
        event.preventDefault()
      }

      dialog.addEventListener('click', (event: MouseEvent) => {
        const action = event.target instanceof Element ? (event.target.closest<HTMLElement>('[data-mermaid-action]')?.dataset.mermaidAction) : undefined
        if (action === 'fit') fit()
        else if (action === 'screen-fullscreen') void toggleScreenFullscreen()
        else if (action === 'close') void close()
      })
      viewport.addEventListener('wheel', async (event: WheelEvent) => {
        event.preventDefault()
        if (!event.deltaY) return
        const now = windowRef?.performance?.now?.() ?? Date.now()
        if (now - lastWheelZoomAt < 32) return
        lastWheelZoomAt = now
        const before = svg.getBoundingClientRect()
        const anchor = viewportKernel.pointerAnchor(before, event.clientX, event.clientY)
        const nextZoom = viewportKernel.nextZoom(zoom, event.deltaY < 0 ? 1 : -1, {
          minimum: MINIMUM_ZOOM,
          maximum: MAXIMUM_ZOOM,
          step: WHEEL_STEP
        })
        if (nextZoom === zoom) return
        setZoom(nextZoom)
        await new Promise(resolve => {
          if (windowRef?.requestAnimationFrame) windowRef.requestAnimationFrame(resolve)
          else setTimeout(resolve, 0)
        })
        if (!svg.isConnected) return
        const after = svg.getBoundingClientRect()
        const nextScroll = viewportKernel.anchoredScroll(viewport, { before, after, anchor })
        setScroll(nextScroll.left, nextScroll.top)
      }, { passive: false })
      const endDrag = (event: PointerEvent) => {
        if (!drag || event.pointerId !== drag.pointerId) return
        try { viewport.releasePointerCapture?.(event.pointerId) } catch { /* The browser may release capture first. */ }
        drag = null
        viewport.classList.remove('is-dragging')
      }
      viewport.addEventListener('pointerdown', (event: PointerEvent) => {
        if (event.button !== 0 || event.isPrimary === false) return
        if (viewport.scrollWidth <= viewport.clientWidth && viewport.scrollHeight <= viewport.clientHeight) return
        event.preventDefault()
        drag = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          scrollLeft: viewport.scrollLeft,
          scrollTop: viewport.scrollTop
        }
        viewport.classList.add('is-dragging')
        viewport.setPointerCapture?.(event.pointerId)
        viewport.focus?.({ preventScroll: true })
      })
      viewport.addEventListener('pointermove', (event: PointerEvent) => {
        if (!drag || event.pointerId !== drag.pointerId) return
        if (event.pointerType === 'mouse' && typeof event.buttons === 'number' && !(event.buttons & 1)) {
          endDrag(event)
          return
        }
        const nextScroll = viewportKernel.panScroll(drag, event.clientX, event.clientY)
        fitMode = false
        setScroll(nextScroll.left, nextScroll.top)
      })
      viewport.addEventListener('pointerup', endDrag)
      viewport.addEventListener('pointercancel', endDrag)
      documentRef.addEventListener('keydown', handleDocumentKeydown)
      documentRef.addEventListener('fullscreenchange', updateFullscreenState)
      windowRef?.addEventListener('resize', handleResize)
      fit()
      dialog.querySelector<HTMLElement>('[data-mermaid-action="close"]')?.focus()
    })
  })
}

async function renderSnapshotMermaid(note: Partial<Pick<Note, 'title' | 'contentHtml'>>, {
  documentRef = globalThis.document,
  renderMermaid = renderMermaidDiagram,
  interactive = false
}: { documentRef?: Document; renderMermaid?: MermaidRenderer; interactive?: boolean } = {}): Promise<NoteSnapshot> {
  const snapshot = normalizeSnapshot(note)
  const container = documentRef.createElement('div')
  container.innerHTML = snapshot.contentHtml
  const blocks = [...container.querySelectorAll<HTMLElement>('pre > code.language-mermaid')]

  for (const code of blocks) {
    const pre = code.parentElement
    if (!pre) continue
    try {
      const result = await renderMermaid(code.textContent || '', { theme: 'light' })
      const figure = documentRef.createElement('figure')
      figure.className = 'tiny-note-export-mermaid'
      figure.setAttribute('role', interactive ? 'group' : 'img')
      figure.setAttribute('aria-label', 'Mermaid 图表')
      if (interactive) {
        figure.setAttribute('data-mermaid-viewer', '')
        figure.innerHTML = `<div class="tiny-note-export-mermaid-actions">
<button type="button" data-mermaid-action="download-png" title="下载四倍高清 PNG" aria-label="下载 Mermaid 高清图片">↓ 下载高清图</button>
<button type="button" data-mermaid-action="expand" title="放大查看图表" aria-label="放大查看 Mermaid 图表">⛶ 放大查看</button>
</div>
<div data-mermaid-preview>${result.svg}</div>`
      } else {
        figure.innerHTML = result.svg
      }
      pre.replaceWith(figure)
    } catch {
      const warning = documentRef.createElement('div')
      warning.className = 'tiny-note-export-mermaid-error'
      warning.textContent = '图表渲染失败，已保留 Mermaid 源码'
      pre.before(warning)
    }
  }

  return { ...snapshot, contentHtml: container.innerHTML }
}

function articleMarkupFromSnapshot(snapshot: NoteSnapshot) {
  const content = snapshot.contentHtml.trim() || '<p class="tiny-note-export-empty">暂无正文</p>'
  return `<article class="tiny-note-export-document"><header><h1 class="tiny-note-export-title">${escapeHtml(snapshot.title)}</h1></header><main class="tiny-note-export-body">${content}</main></article>`
}

function articleMarkup(note: Partial<Pick<Note, 'title' | 'contentHtml'>> = {}) {
  return articleMarkupFromSnapshot(normalizeSnapshot(note))
}

function buildPreparedNoteExportHtml(snapshot: NoteSnapshot, lang: string) {
  const safeLang = /^[a-z]{2,3}(?:-[a-z\d]{2,8})*$/i.test(lang) ? lang : 'zh-CN'
  const interactiveRuntime = snapshot.contentHtml.includes('data-mermaid-viewer')
    ? `<script>(${initializeExportMermaidViewers.toString()})(document, (${createMermaidViewportKernel.toString()})(), (${exportMermaidPng.toString()}));<\/script>`
    : ''
  return `<!doctype html>
<html lang="${safeLang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(snapshot.title)}</title>
<style>${NOTE_EXPORT_CSS}</style>
</head>
<body class="tiny-note-export-page">
${articleMarkupFromSnapshot(snapshot)}
${interactiveRuntime}
</body>
</html>`
}

export function createSafeExportFilename(title: unknown, extension: unknown) {
  const normalizedExtension = String(extension || '').replace(/^\.+/, '').replace(/[^a-z\d]/gi, '').toLowerCase().slice(0, 10) || 'txt'
  let base = String(title || '').trim()
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001f\u007f:"/\\|?*]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[\s.-]+|[\s.-]+$/g, '')
  // Sixty Unicode code points stay below the common 255-byte component limit,
  // even when every character uses four UTF-8 bytes.
  base = [...base].slice(0, 60).join('').replace(/[\s.-]+$/g, '')
  if (!base || WINDOWS_RESERVED_FILENAME.test(base)) base = 'note'
  return `${base}.${normalizedExtension}`
}

export function buildNoteExportHtml(note: Partial<Pick<Note, 'title' | 'contentHtml'>> = {}, { lang = 'zh-CN' }: { lang?: string } = {}) {
  const snapshot = normalizeSnapshot(note)
  return buildPreparedNoteExportHtml(snapshot, lang)
}

export function downloadBlob(blob: Blob, filename: string, { documentRef = globalThis.document, urlApi = globalThis.URL, schedule = setTimeout }: { documentRef?: Document; urlApi?: typeof URL; schedule?: typeof setTimeout } = {}) {
  const url = urlApi.createObjectURL(blob)
  const link = documentRef.createElement('a')
  const cleanup = () => {
    link.remove()
    urlApi.revokeObjectURL(url)
  }
  link.href = url
  link.download = filename
  link.style.display = 'none'
  documentRef.body.appendChild(link)
  try {
    link.click()
  } catch (error) {
    cleanup()
    throw error
  }
  // WebKit may consume the object URL after the click handler returns.
  schedule(cleanup, 0)
}

export async function downloadNoteHtml(note: Partial<Pick<Note, 'title' | 'contentHtml'>>, {
  download = downloadBlob,
  lang = 'zh-CN',
  documentRef = globalThis.document,
  renderMermaid = renderMermaidDiagram
}: { download?: typeof downloadBlob; lang?: string; documentRef?: Document; renderMermaid?: MermaidRenderer } = {}) {
  const snapshot = await renderSnapshotMermaid(note, { documentRef, renderMermaid, interactive: true })
  const filename = createSafeExportFilename(snapshot.title, 'html')
  const blob = new globalThis.Blob([buildPreparedNoteExportHtml(snapshot, lang)], { type: 'text/html;charset=utf-8' })
  download(blob, filename)
  return filename
}

async function loadHtml2Pdf() {
  const module = await import('html2pdf.js')
  return module.default
}

async function waitForExportAssets(root: Element, documentRef: Document) {
  const fontReady = documentRef.fonts?.ready
  if (fontReady) await fontReady.catch(() => {})
  const pendingImages = [...root.querySelectorAll('img')].filter(image => !image.complete)
  if (!pendingImages.length) return
  const imageReady = Promise.all(pendingImages.map(image => new Promise<void>(resolve => {
    const finish = () => resolve()
    image.addEventListener('load', finish, { once: true })
    image.addEventListener('error', finish, { once: true })
  })))
  await Promise.race([imageReady, new Promise(resolve => setTimeout(resolve, 3000))])
}

function blobToDataUrl(blob: Blob, documentRef: Document): Promise<string> {
  const Reader = documentRef.defaultView?.FileReader || globalThis.FileReader
  if (!Reader) return Promise.reject(new Error('FileReader is unavailable'))
  return new Promise<string>((resolve, reject) => {
    const reader = new Reader()
    reader.addEventListener('load', () => resolve(String(reader.result || '')), { once: true })
    reader.addEventListener('error', () => reject(reader.error || new Error('Image conversion failed')), { once: true })
    reader.readAsDataURL(blob)
  })
}

function replaceRemoteImageWithFallback(image: HTMLImageElement, url: URL, documentRef: Document) {
  const fallback = documentRef.createElement('div')
  fallback.className = 'tiny-note-export-image-fallback'
  fallback.setAttribute('role', 'img')
  const description = image.getAttribute('alt')?.trim() || '远程图片'
  fallback.textContent = `图片未能嵌入 PDF：${description}（${url.hostname}）`
  image.replaceWith(fallback)
}

// The packaged app intentionally allows remote media via img-src, not connect-src.
// An anonymous image element keeps PDF export self-contained without widening script fetch access.
function waitForCorsImage(source: string, documentRef: Document, timeoutMs: number): Promise<HTMLImageElement> {
  const image = documentRef.createElement('img')
  image.crossOrigin = 'anonymous'
  image.referrerPolicy = 'no-referrer'
  image.decoding = 'async'
  const timerApi = documentRef.defaultView || globalThis

  return new Promise<HTMLImageElement>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const cleanup = () => {
      if (timer != null) timerApi.clearTimeout(timer)
      image.removeEventListener('load', handleLoad)
      image.removeEventListener('error', handleError)
    }
    const fail = (error: unknown) => {
      cleanup()
      image.removeAttribute('src')
      reject(error)
    }
    const handleLoad = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        fail(new Error('Remote image has no drawable pixels'))
        return
      }
      cleanup()
      resolve(image)
    }
    const handleError = () => fail(new Error('Remote image did not grant CORS access'))

    image.addEventListener('load', handleLoad, { once: true })
    image.addEventListener('error', handleError, { once: true })
    timer = timerApi.setTimeout(() => fail(new Error('Remote image timed out')), timeoutMs)
    image.src = source
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, documentRef: Document, timeoutMs: number): Promise<Blob> {
  const timerApi = documentRef.defaultView || globalThis
  return new Promise<Blob>((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      reject(new Error('Canvas Blob export is unavailable'))
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (error: Error | null, blob?: Blob | null) => {
      if (timer != null) timerApi.clearTimeout(timer)
      if (error) reject(error)
      else if (blob) resolve(blob)
      else reject(new Error('Remote image conversion failed'))
    }
    timer = timerApi.setTimeout(() => finish(new Error('Remote image conversion timed out')), timeoutMs)
    canvas.toBlob(blob => {
      if (!blob) finish(new Error('Remote image conversion failed'))
      else finish(null, blob)
    }, 'image/png')
  })
}

async function embedRemoteImageAsDataUrl(source: string, documentRef: Document, { timeoutMs = PDF_REMOTE_IMAGE_TIMEOUT_MS } = {}): Promise<string> {
  const startedAt = Date.now()
  const image = await waitForCorsImage(source, documentRef, timeoutMs)
  const sourceWidth = image.naturalWidth
  const sourceHeight = image.naturalHeight
  const scale = Math.min(
    1,
    PDF_REMOTE_IMAGE_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight),
    Math.sqrt(PDF_REMOTE_IMAGE_MAX_PIXELS / (sourceWidth * sourceHeight))
  )
  const canvas = documentRef.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(sourceWidth * scale))
  canvas.height = Math.max(1, Math.floor(sourceHeight * scale))

  try {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas rendering is unavailable')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const remainingMs = Math.max(250, timeoutMs - (Date.now() - startedAt))
    const blob = await canvasToBlob(canvas, documentRef, remainingMs)
    if (blob.size > PDF_REMOTE_IMAGE_MAX_OUTPUT_BYTES) throw new Error('Remote image is too large')
    return await blobToDataUrl(blob, documentRef)
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

function estimateDataUrlBytes(dataUrl: string) {
  const comma = dataUrl.indexOf(',')
  return comma < 0 ? Number.POSITIVE_INFINITY : Math.ceil((dataUrl.length - comma - 1) * 0.75)
}

async function preparePdfImages(root: Element, documentRef: Document, embedRemoteImage: RemoteImageEmbedder) {
  const baseUrl = new globalThis.URL(documentRef.baseURI)
  const images = [...root.querySelectorAll('img')]
  const deadline = Date.now() + PDF_REMOTE_IMAGE_TOTAL_TIMEOUT_MS
  let embeddedBytes = 0
  let remoteImageCount = 0

  for (const image of images) {
    const source = image.getAttribute('src')
    if (!source) continue
    let url: URL
    try { url = new globalThis.URL(source, baseUrl) } catch { continue }
    if (!/^https?:$/.test(url.protocol) || url.origin === baseUrl.origin) continue
    try {
      remoteImageCount += 1
      const remainingMs = deadline - Date.now()
      if (url.protocol !== 'https:' || remoteImageCount > PDF_REMOTE_IMAGE_MAX_COUNT || remainingMs <= 0) {
        throw new Error('Remote image budget exceeded')
      }
      const dataUrl = await embedRemoteImage(url.href, documentRef, {
        timeoutMs: Math.min(PDF_REMOTE_IMAGE_TIMEOUT_MS, remainingMs)
      })
      if (!/^data:image\/(?:png|jpe?g|webp|gif|avif);base64,/i.test(dataUrl)) throw new Error('Unsupported remote image')
      const imageBytes = estimateDataUrlBytes(dataUrl)
      if (imageBytes > PDF_REMOTE_IMAGE_MAX_OUTPUT_BYTES || embeddedBytes + imageBytes > PDF_REMOTE_IMAGE_TOTAL_BYTES) {
        throw new Error('Remote image budget exceeded')
      }
      embeddedBytes += imageBytes
      image.removeAttribute('srcset')
      image.src = dataUrl
    } catch {
      replaceRemoteImageWithFallback(image, url, documentRef)
    }
  }
}

export function calculatePdfRenderScale(width: unknown, height: unknown) {
  const safeWidth = Number(width)
  const safeHeight = Number(height)
  if (!(safeWidth > 0) || !(safeHeight > 0)) return 2
  const dimensionScale = PDF_MAX_CANVAS_DIMENSION / Math.max(safeWidth, safeHeight)
  const areaScale = Math.sqrt(PDF_MAX_CANVAS_AREA / (safeWidth * safeHeight))
  const scale = Math.min(2, dimensionScale, areaScale)
  if (scale < PDF_MIN_RENDER_SCALE) {
    const error = new Error('文章过长，无法安全生成 PDF。请使用“打印”保存为 PDF，或拆分文章后重试。') as Error & { code?: string }
    error.code = 'PDF_CANVAS_LIMIT'
    throw error
  }
  return Math.max(PDF_MIN_RENDER_SCALE, Math.floor(scale * 100) / 100)
}

export async function exportNotePdf(note: Partial<Pick<Note, 'title' | 'contentHtml'>>, {
  pdfFactory = loadHtml2Pdf,
  download = downloadBlob,
  documentRef = globalThis.document,
  embedRemoteImage = embedRemoteImageAsDataUrl,
  renderMermaid = renderMermaidDiagram
}: { pdfFactory?: typeof loadHtml2Pdf; download?: typeof downloadBlob; documentRef?: Document; embedRemoteImage?: RemoteImageEmbedder; renderMermaid?: MermaidRenderer } = {}) {
  const snapshot = await renderSnapshotMermaid(note, { documentRef, renderMermaid })
  const filename = createSafeExportFilename(snapshot.title, 'pdf')
  const stage = documentRef.createElement('div')
  stage.className = 'tiny-note-pdf-stage'
  stage.setAttribute('aria-hidden', 'true')
  stage.style.cssText = 'position:absolute;left:0;top:0;z-index:-2147483647;width:174mm;pointer-events:none;background:#fff;'
  stage.innerHTML = `<style>${NOTE_EXPORT_ARTICLE_CSS}.tiny-note-pdf-stage .tiny-note-export-document{width:174mm;max-width:none;margin:0;padding:0;}</style>${articleMarkupFromSnapshot(snapshot)}`
  documentRef.body.appendChild(stage)

  try {
    const article = stage.querySelector<HTMLElement>('.tiny-note-export-document')
    if (!article) throw new Error('无法创建 PDF 导出内容')
    article.querySelectorAll('.tiny-note-export-body > h1, .tiny-note-export-body > h2, .tiny-note-export-body > h3, .tiny-note-export-body > h4, .tiny-note-export-body > h5, .tiny-note-export-body > h6').forEach(heading => {
      const firstContentBlock = heading.nextElementSibling
      if (!firstContentBlock || /^H[1-6]$/.test(firstContentBlock.tagName)) return
      let trailingBlock = firstContentBlock.nextElementSibling
      const group = documentRef.createElement('div')
      group.className = 'tiny-note-pdf-heading-group'
      heading.before(group)
      group.append(heading, firstContentBlock)
      while (firstContentBlock.tagName === 'PRE' && trailingBlock?.tagName === 'PRE') {
        const nextBlock = trailingBlock.nextElementSibling
        group.append(trailingBlock)
        trailingBlock = nextBlock
      }
    })
    await preparePdfImages(article, documentRef, embedRemoteImage)
    await waitForExportAssets(article, documentRef)
    const bounds = article.getBoundingClientRect()
    const renderScale = calculatePdfRenderScale(article.scrollWidth || bounds.width, article.scrollHeight || bounds.height)
    const html2pdf = await pdfFactory()
    const options = {
      margin: [18, 18, 18, 18] as [number, number, number, number],
      filename,
      enableLinks: true,
      pagebreak: {
        mode: ['css', 'legacy'],
        avoid: ['tr', 'pre', 'img', 'blockquote', 'li', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', '.tiny-note-pdf-heading-group', '.tiny-note-export-mermaid']
      },
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: {
        scale: renderScale,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const, compress: true }
    }
    const pdfBlob = await html2pdf().set(options).from(article as HTMLElement).outputPdf('blob')
    download(pdfBlob, filename)
    return filename
  } finally {
    stage.remove()
  }
}

export async function printNote(note: Partial<Pick<Note, 'title' | 'contentHtml'>>, {
  documentRef = globalThis.document,
  windowRef = window
}: { documentRef?: Document; windowRef?: Window } = {}) {
  const root = documentRef.createElement('div')
  root.className = 'tiny-note-print-root'
  root.setAttribute('aria-hidden', 'true')
  root.style.display = 'none'
  root.innerHTML = `<style>${NOTE_EXPORT_ARTICLE_CSS}${NOTE_EXPORT_PRINT_CSS}</style>${articleMarkup(note)}`
  documentRef.body.appendChild(root)
  documentRef.body.classList.add('tiny-note-app-printing')

  let cleanupTimer: number | undefined
  const cleanup = () => {
    if (cleanupTimer != null) windowRef.clearTimeout?.(cleanupTimer)
    root.remove()
    documentRef.body.classList.remove('tiny-note-app-printing')
  }
  windowRef.addEventListener('afterprint', cleanup, { once: true })

  try {
    await waitForExportAssets(root, documentRef)
    await windowRef.print()
    if (root.isConnected) cleanupTimer = windowRef.setTimeout(cleanup, 60_000)
  } catch (error) {
    cleanup()
    throw error
  }
}
