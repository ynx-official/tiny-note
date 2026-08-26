import { sanitizeEditorHtml } from './noteMarkdown'
import { renderMermaidDiagram } from './mermaidRenderer'

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
  margin: 1.2em 0;
  break-inside: avoid-page;
  border: 1px solid #e5e3df;
  border-radius: 8px;
  background: #ffffff;
  overflow: hidden;
}
.tiny-note-export-mermaid:not([data-mermaid-viewer]) { padding: 16px; }
.tiny-note-export-mermaid:not([data-mermaid-viewer]) svg { display: block; width: 100%; max-width: 100%; height: auto; margin: 0 auto; }
.tiny-note-export-mermaid-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px;
  border-bottom: 1px solid #e5e3df;
  background: #fafaf9;
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
  width: 100%;
  height: clamp(280px, 55vh, 540px);
  overflow: hidden;
  background: #ffffff;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.tiny-note-export-mermaid-viewport.is-dragging { cursor: grabbing; }
.tiny-note-export-mermaid-canvas {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
  will-change: transform;
}
.tiny-note-export-mermaid-canvas svg { display: block; width: 100%; height: 100%; max-width: none; margin: 0; }
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
  .tiny-note-export-mermaid-toolbar { display: none !important; }
  .tiny-note-export-mermaid-viewport { height: auto !important; overflow: visible !important; }
  .tiny-note-export-mermaid-canvas { position: static !important; width: 100% !important; height: auto !important; transform: none !important; }
  .tiny-note-export-mermaid-canvas svg { width: 100% !important; height: auto !important; }
}
`

export const NOTE_EXPORT_CSS = `${NOTE_EXPORT_PAGE_CSS}${NOTE_EXPORT_ARTICLE_CSS}${NOTE_EXPORT_RESPONSIVE_CSS}${NOTE_EXPORT_PRINT_CSS}`

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function normalizeSnapshot(note = {}) {
  const title = String(note.title || '').trim() || DEFAULT_EXPORT_TITLE
  const contentHtml = sanitizeEditorHtml(note.contentHtml || '')
  return { title, contentHtml }
}

export function initializeExportMermaidViewers(documentRef = globalThis.document) {
  const MIN_SCALE = 0.75
  const MAX_SCALE = 2.5
  const SCALE_STEP = 0.25
  const roots = [...documentRef.querySelectorAll('[data-mermaid-viewer]')]

  roots.forEach(root => {
    if (root.dataset.mermaidInitialized === 'true') return
    const viewport = root.querySelector('[data-mermaid-viewport]')
    const canvas = root.querySelector('[data-mermaid-canvas]')
    const scaleOutput = root.querySelector('[data-mermaid-scale]')
    const svg = canvas?.querySelector('svg')
    if (!viewport || !canvas || !svg) return
    root.dataset.mermaidInitialized = 'true'

    const viewBox = String(svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number)
    if (viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
      const dimensionScale = Math.min(1, 12000 / Math.max(viewBox[2], viewBox[3]))
      canvas.style.width = `${viewBox[2] * dimensionScale}px`
      canvas.style.height = `${viewBox[3] * dimensionScale}px`
    }

    let scale = 1
    let offsetX = 0
    let offsetY = 0
    let fitMode = true
    let drag = null

    const dimensions = () => ({
      viewportWidth: viewport.clientWidth || viewport.getBoundingClientRect().width || 1,
      viewportHeight: viewport.clientHeight || viewport.getBoundingClientRect().height || 1,
      canvasWidth: canvas.offsetWidth || 1,
      canvasHeight: canvas.offsetHeight || 1
    })
    const clampAxis = (offset, viewportSize, contentSize, centerWhenSmaller) => {
      if (contentSize <= viewportSize) return centerWhenSmaller ? (viewportSize - contentSize) / 2 : 0
      return Math.min(0, Math.max(viewportSize - contentSize, offset))
    }
    const apply = () => {
      const size = dimensions()
      offsetX = clampAxis(offsetX, size.viewportWidth, size.canvasWidth * scale, true)
      offsetY = clampAxis(offsetY, size.viewportHeight, size.canvasHeight * scale, false)
      const roundedX = Math.round(offsetX * 100) / 100
      const roundedY = Math.round(offsetY * 100) / 100
      const roundedScale = Math.round(scale * 100) / 100
      canvas.style.transform = `translate(${roundedX}px, ${roundedY}px) scale(${roundedScale})`
      root.dataset.mermaidScaleValue = String(roundedScale)
      if (scaleOutput) scaleOutput.textContent = `${Math.round(roundedScale * 100)}%`
      const zoomOut = root.querySelector('[data-mermaid-action="zoom-out"]')
      const zoomIn = root.querySelector('[data-mermaid-action="zoom-in"]')
      if (zoomOut) zoomOut.disabled = scale <= MIN_SCALE
      if (zoomIn) zoomIn.disabled = scale >= MAX_SCALE
    }
    const setScale = (nextScale, anchorX, anchorY, allowBelowMinimum = false) => {
      const minimum = allowBelowMinimum ? 0.05 : MIN_SCALE
      const next = Math.min(MAX_SCALE, Math.max(minimum, Math.round(nextScale * 100) / 100))
      const bounds = viewport.getBoundingClientRect()
      const x = Number.isFinite(anchorX) ? anchorX : bounds.width / 2
      const y = Number.isFinite(anchorY) ? anchorY : bounds.height / 2
      const ratio = next / scale
      offsetX = x - ((x - offsetX) * ratio)
      offsetY = y - ((y - offsetY) * ratio)
      scale = next
      fitMode = false
      apply()
    }
    const zoomBy = (amount, anchorX, anchorY) => {
      if (scale < MIN_SCALE && amount < 0) return
      const nextScale = scale < MIN_SCALE ? MIN_SCALE : scale + amount
      setScale(nextScale, anchorX, anchorY)
    }
    const fit = () => {
      const size = dimensions()
      scale = Math.min(1, size.viewportWidth / Math.max(1, size.canvasWidth))
      offsetX = 0
      offsetY = 0
      fitMode = true
      apply()
    }
    const actual = () => {
      scale = 1
      offsetX = 0
      offsetY = 0
      fitMode = false
      apply()
    }

    root.addEventListener('click', event => {
      const action = event.target.closest?.('[data-mermaid-action]')?.dataset.mermaidAction
      if (action === 'zoom-in') zoomBy(SCALE_STEP)
      else if (action === 'zoom-out') zoomBy(-SCALE_STEP)
      else if (action === 'fit') fit()
      else if (action === 'actual') actual()
    })
    viewport.addEventListener('wheel', event => {
      event.preventDefault()
      const bounds = viewport.getBoundingClientRect()
      const direction = event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP
      zoomBy(direction, event.clientX - bounds.left, event.clientY - bounds.top)
    }, { passive: false })
    viewport.addEventListener('pointerdown', event => {
      if (event.button !== 0) return
      event.preventDefault()
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offsetX, offsetY }
      viewport.classList.add('is-dragging')
      viewport.setPointerCapture?.(event.pointerId)
    })
    viewport.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointerId) return
      offsetX = drag.offsetX + event.clientX - drag.x
      offsetY = drag.offsetY + event.clientY - drag.y
      fitMode = false
      apply()
    })
    const endDrag = event => {
      if (!drag || event.pointerId !== drag.pointerId) return
      viewport.releasePointerCapture?.(event.pointerId)
      drag = null
      viewport.classList.remove('is-dragging')
    }
    viewport.addEventListener('pointerup', endDrag)
    viewport.addEventListener('pointercancel', endDrag)
    viewport.addEventListener('keydown', event => {
      if (event.key === '+' || event.key === '=') zoomBy(SCALE_STEP)
      else if (event.key === '-') zoomBy(-SCALE_STEP)
      else if (event.key === '0') actual()
      else if (event.key.toLowerCase() === 'f') fit()
      else if (event.key.startsWith('Arrow')) {
        const movement = 40
        if (event.key === 'ArrowLeft') offsetX -= movement
        if (event.key === 'ArrowRight') offsetX += movement
        if (event.key === 'ArrowUp') offsetY -= movement
        if (event.key === 'ArrowDown') offsetY += movement
        fitMode = false
        apply()
      } else return
      event.preventDefault()
    })
    documentRef.defaultView?.addEventListener('resize', () => {
      if (fitMode) fit()
      else apply()
    })
    fit()
  })
}

async function renderSnapshotMermaid(note, {
  documentRef = globalThis.document,
  renderMermaid = renderMermaidDiagram,
  interactive = false
} = {}) {
  const snapshot = normalizeSnapshot(note)
  const container = documentRef.createElement('div')
  container.innerHTML = snapshot.contentHtml
  const blocks = [...container.querySelectorAll('pre > code.language-mermaid')]

  for (const code of blocks) {
    const pre = code.parentElement
    try {
      const result = await renderMermaid(code.textContent || '', { theme: 'light' })
      const figure = documentRef.createElement('figure')
      figure.className = 'tiny-note-export-mermaid'
      figure.setAttribute('role', interactive ? 'group' : 'img')
      figure.setAttribute('aria-label', 'Mermaid 图表')
      if (interactive) {
        figure.setAttribute('data-mermaid-viewer', '')
        figure.innerHTML = `<div class="tiny-note-export-mermaid-toolbar" role="toolbar" aria-label="图表缩放控制">
<button type="button" data-mermaid-action="zoom-out" title="缩小" aria-label="缩小图表">−</button>
<output class="tiny-note-export-mermaid-scale" data-mermaid-scale aria-live="polite">100%</output>
<button type="button" data-mermaid-action="zoom-in" title="放大" aria-label="放大图表">+</button>
<button type="button" data-mermaid-action="fit" title="适合宽度">适合宽度</button>
<button type="button" data-mermaid-action="actual" title="原始比例">100%</button>
</div>
<div class="tiny-note-export-mermaid-viewport" data-mermaid-viewport tabindex="0" aria-label="可缩放的 Mermaid 图表；滚轮缩放，按住鼠标左键拖动">
<div class="tiny-note-export-mermaid-canvas" data-mermaid-canvas>${result.svg}</div>
</div>`
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

function articleMarkupFromSnapshot(snapshot) {
  const content = snapshot.contentHtml.trim() || '<p class="tiny-note-export-empty">暂无正文</p>'
  return `<article class="tiny-note-export-document"><header><h1 class="tiny-note-export-title">${escapeHtml(snapshot.title)}</h1></header><main class="tiny-note-export-body">${content}</main></article>`
}

function articleMarkup(note = {}) {
  return articleMarkupFromSnapshot(normalizeSnapshot(note))
}

function buildPreparedNoteExportHtml(snapshot, lang) {
  const safeLang = /^[a-z]{2,3}(?:-[a-z\d]{2,8})*$/i.test(lang) ? lang : 'zh-CN'
  const interactiveRuntime = snapshot.contentHtml.includes('data-mermaid-viewer')
    ? `<script>(${initializeExportMermaidViewers.toString()})(document);<\/script>`
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

export function createSafeExportFilename(title, extension) {
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

export function buildNoteExportHtml(note = {}, { lang = 'zh-CN' } = {}) {
  const snapshot = normalizeSnapshot(note)
  return buildPreparedNoteExportHtml(snapshot, lang)
}

export function downloadBlob(blob, filename, { documentRef = globalThis.document, urlApi = globalThis.URL, schedule = setTimeout } = {}) {
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

export async function downloadNoteHtml(note, {
  download = downloadBlob,
  lang = 'zh-CN',
  documentRef = globalThis.document,
  renderMermaid = renderMermaidDiagram
} = {}) {
  const snapshot = await renderSnapshotMermaid(note, { documentRef, renderMermaid, interactive: true })
  const filename = createSafeExportFilename(snapshot.title, 'html')
  const blob = new globalThis.Blob([buildPreparedNoteExportHtml(snapshot, lang)], { type: 'text/html;charset=utf-8' })
  download(blob, filename)
  return filename
}

async function loadHtml2Pdf() {
  const module = await import('html2pdf.js')
  return module.default || module
}

async function waitForExportAssets(root, documentRef) {
  const fontReady = documentRef.fonts?.ready
  if (fontReady?.then) await fontReady.catch(() => {})
  const pendingImages = [...root.querySelectorAll('img')].filter(image => !image.complete)
  if (!pendingImages.length) return
  const imageReady = Promise.all(pendingImages.map(image => new Promise(resolve => {
    const finish = () => resolve()
    image.addEventListener('load', finish, { once: true })
    image.addEventListener('error', finish, { once: true })
  })))
  await Promise.race([imageReady, new Promise(resolve => setTimeout(resolve, 3000))])
}

function blobToDataUrl(blob, documentRef) {
  const Reader = documentRef.defaultView?.FileReader || globalThis.FileReader
  if (!Reader) return Promise.reject(new Error('FileReader is unavailable'))
  return new Promise((resolve, reject) => {
    const reader = new Reader()
    reader.addEventListener('load', () => resolve(String(reader.result || '')), { once: true })
    reader.addEventListener('error', () => reject(reader.error || new Error('Image conversion failed')), { once: true })
    reader.readAsDataURL(blob)
  })
}

function replaceRemoteImageWithFallback(image, url, documentRef) {
  const fallback = documentRef.createElement('div')
  fallback.className = 'tiny-note-export-image-fallback'
  fallback.setAttribute('role', 'img')
  const description = image.getAttribute('alt')?.trim() || '远程图片'
  fallback.textContent = `图片未能嵌入 PDF：${description}（${url.hostname}）`
  image.replaceWith(fallback)
}

// The packaged app intentionally allows remote media via img-src, not connect-src.
// An anonymous image element keeps PDF export self-contained without widening script fetch access.
function waitForCorsImage(source, documentRef, timeoutMs) {
  const image = documentRef.createElement('img')
  image.crossOrigin = 'anonymous'
  image.referrerPolicy = 'no-referrer'
  image.decoding = 'async'
  const timerApi = documentRef.defaultView || globalThis

  return new Promise((resolve, reject) => {
    let timer
    const cleanup = () => {
      if (timer != null) timerApi.clearTimeout(timer)
      image.removeEventListener('load', handleLoad)
      image.removeEventListener('error', handleError)
    }
    const fail = error => {
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

function canvasToBlob(canvas, documentRef, timeoutMs) {
  const timerApi = documentRef.defaultView || globalThis
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      reject(new Error('Canvas Blob export is unavailable'))
      return
    }
    let timer
    const finish = (error, blob) => {
      if (timer != null) timerApi.clearTimeout(timer)
      if (error) reject(error)
      else resolve(blob)
    }
    timer = timerApi.setTimeout(() => finish(new Error('Remote image conversion timed out')), timeoutMs)
    canvas.toBlob(blob => {
      if (!blob) finish(new Error('Remote image conversion failed'))
      else finish(null, blob)
    }, 'image/png')
  })
}

async function embedRemoteImageAsDataUrl(source, documentRef, { timeoutMs = PDF_REMOTE_IMAGE_TIMEOUT_MS } = {}) {
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

function estimateDataUrlBytes(dataUrl) {
  const comma = dataUrl.indexOf(',')
  return comma < 0 ? Number.POSITIVE_INFINITY : Math.ceil((dataUrl.length - comma - 1) * 0.75)
}

async function preparePdfImages(root, documentRef, embedRemoteImage) {
  const baseUrl = new globalThis.URL(documentRef.baseURI)
  const images = [...root.querySelectorAll('img')]
  const deadline = Date.now() + PDF_REMOTE_IMAGE_TOTAL_TIMEOUT_MS
  let embeddedBytes = 0
  let remoteImageCount = 0

  for (const image of images) {
    const source = image.getAttribute('src')
    if (!source) continue
    let url
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

export function calculatePdfRenderScale(width, height) {
  const safeWidth = Number(width)
  const safeHeight = Number(height)
  if (!(safeWidth > 0) || !(safeHeight > 0)) return 2
  const dimensionScale = PDF_MAX_CANVAS_DIMENSION / Math.max(safeWidth, safeHeight)
  const areaScale = Math.sqrt(PDF_MAX_CANVAS_AREA / (safeWidth * safeHeight))
  const scale = Math.min(2, dimensionScale, areaScale)
  if (scale < PDF_MIN_RENDER_SCALE) {
    const error = new Error('文章过长，无法安全生成 PDF。请使用“打印”保存为 PDF，或拆分文章后重试。')
    error.code = 'PDF_CANVAS_LIMIT'
    throw error
  }
  return Math.max(PDF_MIN_RENDER_SCALE, Math.floor(scale * 100) / 100)
}

export async function exportNotePdf(note, {
  pdfFactory = loadHtml2Pdf,
  download = downloadBlob,
  documentRef = globalThis.document,
  embedRemoteImage = embedRemoteImageAsDataUrl,
  renderMermaid = renderMermaidDiagram
} = {}) {
  const snapshot = await renderSnapshotMermaid(note, { documentRef, renderMermaid })
  const filename = createSafeExportFilename(snapshot.title, 'pdf')
  const stage = documentRef.createElement('div')
  stage.className = 'tiny-note-pdf-stage'
  stage.setAttribute('aria-hidden', 'true')
  stage.style.cssText = 'position:absolute;left:0;top:0;z-index:-2147483647;width:174mm;pointer-events:none;background:#fff;'
  stage.innerHTML = `<style>${NOTE_EXPORT_ARTICLE_CSS}.tiny-note-pdf-stage .tiny-note-export-document{width:174mm;max-width:none;margin:0;padding:0;}</style>${articleMarkupFromSnapshot(snapshot)}`
  documentRef.body.appendChild(stage)

  try {
    const article = stage.querySelector('.tiny-note-export-document')
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
      margin: [18, 18, 18, 18],
      filename,
      enableLinks: true,
      pagebreak: {
        mode: ['css', 'legacy'],
        avoid: ['tr', 'pre', 'img', 'blockquote', 'li', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', '.tiny-note-pdf-heading-group', '.tiny-note-export-mermaid']
      },
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: renderScale,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true }
    }
    const pdfBlob = await html2pdf().set(options).from(article).outputPdf('blob')
    download(pdfBlob, filename)
    return filename
  } finally {
    stage.remove()
  }
}

export async function printNote(note, {
  documentRef = globalThis.document,
  windowRef = window
} = {}) {
  const root = documentRef.createElement('div')
  root.className = 'tiny-note-print-root'
  root.setAttribute('aria-hidden', 'true')
  root.style.display = 'none'
  root.innerHTML = `<style>${NOTE_EXPORT_ARTICLE_CSS}${NOTE_EXPORT_PRINT_CSS}</style>${articleMarkup(note)}`
  documentRef.body.appendChild(root)
  documentRef.body.classList.add('tiny-note-app-printing')

  let cleanupTimer
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
