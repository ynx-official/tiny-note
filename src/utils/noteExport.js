import { sanitizeEditorHtml } from './noteMarkdown'

const DEFAULT_EXPORT_TITLE = '未命名笔记'
const WINDOWS_RESERVED_FILENAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i

export const NOTE_EXPORT_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: #ffffff; }
body {
  color: #37352f;
  font-family: "Notion Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased;
}
.tiny-note-export-document {
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
.tiny-note-export-body p { margin: 0.62em 0; }
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
@media (max-width: 640px) {
  .tiny-note-export-document { width: min(100% - 32px, 820px); padding: 36px 0 48px; }
  .tiny-note-export-title { margin-bottom: 26px; font-size: 32px; }
  .tiny-note-export-body { font-size: 15px; }
}
@page { size: A4 portrait; margin: 18mm; }
@media print {
  html, body { min-height: 0; background: #ffffff !important; }
  body.tiny-note-app-printing > :not(.tiny-note-print-root) { display: none !important; }
  body.tiny-note-app-printing .tiny-note-print-root { display: block !important; }
  .tiny-note-export-document { width: auto; max-width: none; margin: 0; padding: 0; }
  .tiny-note-export-title { font-size: 30px; }
  .tiny-note-export-body { font-size: 11pt; line-height: 1.65; }
  .tiny-note-export-body a { color: #1a1a1a; text-decoration: underline; }
}
`

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

function articleMarkup(note = {}) {
  const snapshot = normalizeSnapshot(note)
  const content = snapshot.contentHtml.trim() || '<p class="tiny-note-export-empty">暂无正文</p>'
  return `<article class="tiny-note-export-document"><header><h1 class="tiny-note-export-title">${escapeHtml(snapshot.title)}</h1></header><main class="tiny-note-export-body">${content}</main></article>`
}

export function createSafeExportFilename(title, extension) {
  const normalizedExtension = String(extension || '').replace(/^\.+/, '').replace(/[^a-z\d]/gi, '').toLowerCase() || 'txt'
  let base = String(title || '').trim()
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001f\u007f:"/\\|?*]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[\s.-]+|[\s.-]+$/g, '')
  base = [...base].slice(0, 100).join('').replace(/[\s.-]+$/g, '')
  if (!base || WINDOWS_RESERVED_FILENAME.test(base)) base = 'note'
  return `${base}.${normalizedExtension}`
}

export function buildNoteExportHtml(note = {}, { lang = 'zh-CN' } = {}) {
  const snapshot = normalizeSnapshot(note)
  const safeLang = /^[a-z]{2,3}(?:-[a-z\d]{2,8})*$/i.test(lang) ? lang : 'zh-CN'
  return `<!doctype html>
<html lang="${safeLang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(snapshot.title)}</title>
<style>${NOTE_EXPORT_CSS}</style>
</head>
<body class="tiny-note-export-page">
${articleMarkup(snapshot)}
</body>
</html>`
}

export function downloadBlob(blob, filename, { documentRef = document, urlApi = URL, schedule = setTimeout } = {}) {
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

export function downloadNoteHtml(note, { download = downloadBlob } = {}) {
  const snapshot = normalizeSnapshot(note)
  const filename = createSafeExportFilename(snapshot.title, 'html')
  const blob = new Blob([buildNoteExportHtml(snapshot)], { type: 'text/html;charset=utf-8' })
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

export async function exportNotePdf(note, {
  pdfFactory = loadHtml2Pdf,
  download = downloadBlob,
  documentRef = document
} = {}) {
  const snapshot = normalizeSnapshot(note)
  const filename = createSafeExportFilename(snapshot.title, 'pdf')
  const stage = documentRef.createElement('div')
  stage.className = 'tiny-note-pdf-stage'
  stage.setAttribute('aria-hidden', 'true')
  stage.style.cssText = 'position:absolute;left:0;top:0;z-index:-2147483647;width:174mm;pointer-events:none;background:#fff;'
  stage.innerHTML = `<style>${NOTE_EXPORT_CSS}.tiny-note-pdf-stage .tiny-note-export-document{width:174mm;max-width:none;margin:0;padding:0;}</style>${articleMarkup(snapshot)}`
  documentRef.body.appendChild(stage)

  try {
    const article = stage.querySelector('.tiny-note-export-document')
    await waitForExportAssets(article, documentRef)
    const html2pdf = await pdfFactory()
    const options = {
      margin: [18, 18, 18, 18],
      filename,
      enableLinks: true,
      pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', 'pre', 'img', 'blockquote', 'li'] },
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
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
  documentRef = document,
  windowRef = window
} = {}) {
  const root = documentRef.createElement('div')
  root.className = 'tiny-note-print-root'
  root.setAttribute('aria-hidden', 'true')
  root.style.display = 'none'
  root.innerHTML = `<style>${NOTE_EXPORT_CSS}</style>${articleMarkup(note)}`
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
    windowRef.print()
    if (root.isConnected) cleanupTimer = windowRef.setTimeout(cleanup, 60_000)
  } catch (error) {
    cleanup()
    throw error
  }
}
