import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildNoteExportHtml,
  calculatePdfRenderScale,
  createSafeExportFilename,
  downloadNoteHtml,
  downloadBlob,
  exportNotePdf,
  exportMermaidPng,
  initializeExportMermaidViewers,
  NOTE_EXPORT_CSS,
  printNote
} from './noteExport'
import { createMermaidViewportKernel } from './mermaidViewport'

const unsafeNote = {
  title: '方案 & <复盘>',
  contentHtml: '<h2>正文标题</h2><p onclick="alert(1)">安全正文</p><script>alert(2)</script><a href="javascript:alert(3)">危险链接</a>'
}

afterEach(() => {
  window.document.body.innerHTML = ''
  window.document.body.className = ''
  delete window.document.fullscreenElement
  delete window.document.exitFullscreen
  vi.restoreAllMocks()
})

describe('note export documents', () => {
  it('centers a focused Mermaid diagram while keeping oversized diagrams scrollable', () => {
    expect(NOTE_EXPORT_CSS).toMatch(/\.tiny-note-export-mermaid-viewport\s*\{[^}]*display:\s*flex;/s)
    expect(NOTE_EXPORT_CSS).toMatch(/\.tiny-note-export-mermaid-canvas\s*\{[^}]*flex:\s*0 0 auto;[^}]*margin:\s*auto;/s)
    expect(NOTE_EXPORT_CSS).toMatch(/\.tiny-note-export-mermaid-actions button\s*\{[^}]*height:\s*32px;[^}]*font:\s*500 12px/s)
  })

  it('embeds rendered Mermaid SVG in standalone HTML instead of exporting its source block', async () => {
    const download = vi.fn()
    const renderMermaid = vi.fn().mockResolvedValue({ svg: '<svg viewBox="0 0 100 50"><text>渲染完成</text></svg>' })

    await downloadNoteHtml({
      title: '流程图',
      contentHtml: '<p>说明</p><pre><code class="language-mermaid">flowchart LR\nA --&gt; B</code></pre>'
    }, { download, renderMermaid, documentRef: window.document })

    expect(renderMermaid).toHaveBeenCalledWith('flowchart LR\nA --> B', { theme: 'light' })
    const blob = download.mock.calls[0][0]
    const html = await new Promise((resolve, reject) => {
      const reader = new window.FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error)
      reader.readAsText(blob)
    })
    expect(html).toContain('class="tiny-note-export-mermaid"')
    expect(html).toContain('data-mermaid-viewer')
    const exportedDocument = new window.DOMParser().parseFromString(html, 'text/html')
    const exportedFigure = exportedDocument.querySelector('[data-mermaid-viewer]')
    const figureActions = [...exportedFigure.querySelectorAll('[data-mermaid-action]')]
    expect(figureActions.map(button => button.dataset.mermaidAction)).toEqual(['download-png', 'expand'])
    expect(figureActions[0].textContent).toContain('下载高清图')
    expect(exportedFigure.querySelector('[data-mermaid-action="zoom-in"]')).toBeNull()
    expect(exportedFigure.querySelector('[data-mermaid-viewport]')).toBeNull()
    expect(html).toContain('initializeExportMermaidViewers')
    expect(html).toContain('createMermaidViewportKernel')
    expect(html).toContain('exportMermaidPng')
    expect(html).toContain('<svg viewBox="0 0 100 50">')
    expect(html).toContain('渲染完成')
    expect(html).not.toContain('class="language-mermaid"')
  })

  it('rasterizes a Mermaid SVG to a bounded four-times PNG on a white background', async () => {
    const drawImage = vi.fn()
    const fillRect = vi.fn()
    const context = { drawImage, fillRect, set fillStyle(value) { this.background = value } }
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob: callback => callback(new window.Blob(['png'], { type: 'image/png' }))
    }
    class FakeImage {
      set src(value) {
        this.source = value
        Promise.resolve().then(() => this.onload())
      }
    }
    const createObjectURL = vi.fn(() => 'blob:mermaid')
    const revokeObjectURL = vi.fn()
    const svg = window.document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 400 200')

    const result = await exportMermaidPng(svg, {
      documentRef: { createElement: vi.fn(() => canvas) },
      windowRef: { Blob: window.Blob, Image: FakeImage, XMLSerializer: window.XMLSerializer },
      urlRef: { createObjectURL, revokeObjectURL }
    })

    expect(result.type).toBe('image/png')
    expect(canvas.width).toBe(1600)
    expect(canvas.height).toBe(800)
    expect(context.background).toBe('#ffffff')
    expect(fillRect).toHaveBeenCalledWith(0, 0, 1600, 800)
    expect(drawImage).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mermaid')
  })

  it('keeps the article clean and activates shared zoom and pan controls only in a focused diagram dialog', () => {
    window.document.body.innerHTML = `
      <figure data-mermaid-viewer>
        <button data-mermaid-action="expand">放大查看</button>
        <div data-mermaid-preview><svg viewBox="0 0 400 200"></svg></div>
      </figure>`
    const root = window.document.querySelector('[data-mermaid-viewer]')
    const expand = root.querySelector('[data-mermaid-action="expand"]')

    initializeExportMermaidViewers(window.document, createMermaidViewportKernel())
    expect(window.document.querySelector('[data-mermaid-dialog]')).toBeNull()
    expand.focus()
    expand.click()

    const dialog = window.document.querySelector('[data-mermaid-dialog]')
    const viewport = dialog.querySelector('[data-mermaid-viewport]')
    const canvas = dialog.querySelector('[data-mermaid-canvas]')
    expect(dialog.querySelector('[data-mermaid-action="zoom-out"]')).toBeNull()
    expect(dialog.querySelector('[data-mermaid-action="zoom-in"]')).toBeNull()
    expect(dialog.querySelector('[data-mermaid-action="actual"]')).toBeNull()
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 400 },
      clientHeight: { configurable: true, value: 240 },
      scrollWidth: { configurable: true, value: 800 },
      scrollHeight: { configurable: true, value: 500 }
    })
    Object.defineProperties(canvas, {
      offsetWidth: { configurable: true, value: 400 },
      offsetHeight: { configurable: true, value: 200 }
    })
    viewport.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 240, right: 400, bottom: 240 })
    viewport.setPointerCapture = vi.fn()
    viewport.releasePointerCapture = vi.fn()

    dialog.querySelector('[data-mermaid-action="fit"]').click()
    viewport.dispatchEvent(new window.WheelEvent('wheel', { deltaY: -100, clientX: 200, clientY: 100, bubbles: true, cancelable: true }))
    expect(dialog.dataset.mermaidScaleValue).toBe('1.15')
    expect(dialog.querySelector('[data-mermaid-scale]').textContent).toBe('115%')

    viewport.scrollLeft = 100
    viewport.scrollTop = 60
    const down = new window.MouseEvent('pointerdown', { button: 0, clientX: 200, clientY: 100, bubbles: true })
    Object.defineProperty(down, 'pointerId', { value: 7 })
    viewport.dispatchEvent(down)
    const move = new window.MouseEvent('pointermove', { clientX: 150, clientY: 80, bubbles: true })
    Object.defineProperty(move, 'pointerId', { value: 7 })
    viewport.dispatchEvent(move)
    expect(viewport.scrollLeft).toBe(150)
    expect(viewport.scrollTop).toBe(80)

    dialog.querySelector('[data-mermaid-action="fit"]').click()
    expect(dialog.dataset.mermaidScaleValue).toBe('1')
    expect(canvas.style.width).toBe('400px')

    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(window.document.querySelector('[data-mermaid-dialog]')).toBeNull()
    expect(window.document.activeElement).toBe(expand)
  })

  it('lets the focused diagram enter screen fullscreen and exits fullscreen before closing on Escape', async () => {
    window.document.body.innerHTML = `
      <figure data-mermaid-viewer>
        <button data-mermaid-action="expand">放大查看</button>
        <div data-mermaid-preview><svg viewBox="0 0 400 200"></svg></div>
      </figure>`
    initializeExportMermaidViewers(window.document, createMermaidViewportKernel())
    window.document.querySelector('[data-mermaid-action="expand"]').click()

    const dialog = window.document.querySelector('[data-mermaid-dialog]')
    const panel = dialog.querySelector('.tiny-note-export-mermaid-dialog-panel')
    const fullscreenButton = dialog.querySelector('[data-mermaid-action="screen-fullscreen"]')
    Object.defineProperty(window.document, 'fullscreenElement', { configurable: true, writable: true, value: null })
    panel.requestFullscreen = vi.fn(async () => {
      window.document.fullscreenElement = panel
      window.document.dispatchEvent(new window.Event('fullscreenchange'))
    })
    window.document.exitFullscreen = vi.fn(async () => {
      window.document.fullscreenElement = null
      window.document.dispatchEvent(new window.Event('fullscreenchange'))
    })

    fullscreenButton.click()
    await vi.waitFor(() => expect(panel.requestFullscreen).toHaveBeenCalledOnce())
    expect(fullscreenButton.getAttribute('aria-label')).toBe('退出全屏')

    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await vi.waitFor(() => expect(window.document.exitFullscreen).toHaveBeenCalledOnce())
    expect(window.document.querySelector('[data-mermaid-dialog]')).not.toBeNull()
    expect(fullscreenButton.getAttribute('aria-label')).toBe('进入全屏')

    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(window.document.querySelector('[data-mermaid-dialog]')).toBeNull()
  })

  it('keeps Mermaid source visible when export rendering fails', async () => {
    const download = vi.fn()
    await downloadNoteHtml({
      title: '坏图表',
      contentHtml: '<pre><code class="language-mermaid">flowchart broken</code></pre>'
    }, {
      download,
      renderMermaid: vi.fn().mockRejectedValue(new Error('syntax error')),
      documentRef: window.document
    })

    const html = await new Promise(resolve => {
      const reader = new window.FileReader()
      reader.onload = () => resolve(reader.result)
      reader.readAsText(download.mock.calls[0][0])
    })
    expect(html).toContain('图表渲染失败，已保留 Mermaid 源码')
    expect(html).toContain('flowchart broken')
  })
  it('builds a standalone UTF-8 HTML document from a sanitized article snapshot', () => {
    const html = buildNoteExportHtml(unsafeNote)

    expect(html.toLowerCase()).toMatch(/^<!doctype html>/)
    expect(html).toContain('<meta charset="UTF-8">')
    expect(html).toContain('<title>方案 &amp; &lt;复盘&gt;</title>')
    expect(html).toContain('<h1 class="tiny-note-export-title">方案 &amp; &lt;复盘&gt;</h1>')
    expect(html).toContain('<h2>正文标题</h2>')
    expect(html).toContain('安全正文')
    expect(html).toContain('<style>')
    expect(html).not.toMatch(/<script|onclick=|javascript:/i)
    expect(html).not.toContain('friday-editor-toolbar')
  })

  it('creates Windows-safe filenames without dropping Chinese or emoji', () => {
    expect(createSafeExportFilename('项目:计划 / 复盘*', 'pdf')).toBe('项目-计划 - 复盘.pdf')
    expect(createSafeExportFilename('  CON.  ', '.html')).toBe('note.html')
    expect(createSafeExportFilename('灵感 💡', 'html')).toBe('灵感 💡.html')
    expect(createSafeExportFilename('', 'pdf')).toBe('note.pdf')
    const longFilename = createSafeExportFilename('🚀'.repeat(100), 'html')
    expect(new globalThis.TextEncoder().encode(longFilename).length).toBeLessThanOrEqual(255)
  })

  it('keeps the PDF canvas within browser limits instead of producing a blank long document', () => {
    expect(calculatePdfRenderScale(660, 16_000)).toBe(1.5)
    expect(() => calculatePdfRenderScale(660, 50_000)).toThrow(/文章过长/)
  })

  it('downloads a Blob and always revokes its temporary URL', () => {
    const click = vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const urlApi = { createObjectURL: vi.fn(() => 'blob:tiny-note-export'), revokeObjectURL: vi.fn() }
    const schedule = vi.fn(callback => callback())
    const blob = new window.Blob(['hello'], { type: 'text/plain' })

    downloadBlob(blob, 'note.txt', { documentRef: window.document, urlApi, schedule })

    expect(urlApi.createObjectURL).toHaveBeenCalledWith(blob)
    expect(click).toHaveBeenCalledOnce()
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 0)
    expect(urlApi.revokeObjectURL).toHaveBeenCalledWith('blob:tiny-note-export')
    expect(window.document.querySelector('a[download]')).toBeNull()
  })

  it('exports a real PDF Blob through a dedicated renderer and removes its render stage', async () => {
    const pdfBlob = new window.Blob(['%PDF-1.7\n'], { type: 'application/pdf' })
    const outputPdf = vi.fn().mockResolvedValue(pdfBlob)
    const from = vi.fn(() => ({ outputPdf }))
    const set = vi.fn(() => ({ from }))
    const pdfFactory = vi.fn(async () => () => ({ set }))
    const download = vi.fn()

    await exportNotePdf(unsafeNote, { pdfFactory, download, documentRef: window.document })

    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      filename: '方案 & 复盘.pdf',
      jsPDF: expect.objectContaining({ format: 'a4', orientation: 'portrait' }),
      pagebreak: expect.objectContaining({ avoid: expect.arrayContaining(['p', 'h2', 'pre', 'tr']) })
    }))
    expect(from).toHaveBeenCalledWith(expect.any(window.HTMLElement))
    const article = from.mock.calls[0][0]
    const headingGroup = article.querySelector('.tiny-note-pdf-heading-group')
    expect(headingGroup?.firstElementChild?.tagName).toBe('H2')
    expect(headingGroup?.lastElementChild?.tagName).toBe('P')
    const stageCss = article.parentElement.querySelector('style')?.textContent || ''
    expect(stageCss).not.toContain(':root')
    expect(stageCss).not.toContain('html, body')
    expect(outputPdf).toHaveBeenCalledWith('blob')
    expect(download).toHaveBeenCalledWith(pdfBlob, '方案 & 复盘.pdf')
    expect(window.document.querySelector('.tiny-note-pdf-stage')).toBeNull()
  })

  it('renders Mermaid diagrams before handing the article to the PDF renderer', async () => {
    const outputPdf = vi.fn().mockResolvedValue(new window.Blob(['%PDF'], { type: 'application/pdf' }))
    const from = vi.fn(() => ({ outputPdf }))
    const pdfFactory = vi.fn(async () => () => ({ set: () => ({ from }) }))
    const renderMermaid = vi.fn().mockResolvedValue({ svg: '<svg viewBox="0 0 80 40"><text>PDF 图表</text></svg>' })

    await exportNotePdf({
      title: 'PDF 流程图',
      contentHtml: '<pre><code class="language-mermaid">flowchart TD\nA --&gt; B</code></pre>'
    }, { pdfFactory, download: vi.fn(), documentRef: window.document, renderMermaid })

    const article = from.mock.calls[0][0]
    expect(article.querySelector('.tiny-note-export-mermaid svg')?.textContent).toContain('PDF 图表')
    expect(article.querySelector('[data-mermaid-viewer]')).toBeNull()
    expect(article.querySelector('[data-mermaid-action]')).toBeNull()
    expect(article.querySelector('code.language-mermaid')).toBeNull()
  })

  it('prints only the standalone article snapshot and cleans it after printing', async () => {
    const print = vi.fn()
    const windowRef = { print, addEventListener: window.addEventListener.bind(window), setTimeout: window.setTimeout.bind(window) }

    await printNote(unsafeNote, { documentRef: window.document, windowRef })

    expect(print).toHaveBeenCalledOnce()
    expect(window.document.body.classList.contains('tiny-note-app-printing')).toBe(true)
    const printRoot = window.document.querySelector('.tiny-note-print-root')
    expect(printRoot?.textContent).toContain('方案 & <复盘>')
    expect(printRoot?.textContent).toContain('安全正文')
    expect(printRoot?.innerHTML).not.toMatch(/<script|onclick=|javascript:/i)
    expect(printRoot?.querySelector('style')?.textContent).toMatch(/@media print[\s\S]*min-width:\s*0[\s\S]*overflow:\s*visible/)

    window.dispatchEvent(new window.Event('afterprint'))
    expect(window.document.querySelector('.tiny-note-print-root')).toBeNull()
    expect(window.document.body.classList.contains('tiny-note-app-printing')).toBe(false)
  })

  it('shows a visible placeholder when a remote image cannot be embedded with CORS', async () => {
    const outputPdf = vi.fn().mockResolvedValue(new window.Blob(['%PDF'], { type: 'application/pdf' }))
    const from = vi.fn(() => ({ outputPdf }))
    const set = vi.fn(() => ({ from }))
    const pdfFactory = vi.fn(async () => () => ({ set }))

    await exportNotePdf({
      title: '远程图片',
      contentHtml: '<p>封面</p><img src="https://cdn.example.com/cover.png" alt="文章封面">'
    }, {
      pdfFactory,
      download: vi.fn(),
      documentRef: window.document,
      embedRemoteImage: vi.fn().mockRejectedValue(new Error('CORS blocked'))
    })

    const article = from.mock.calls[0][0]
    expect(article.querySelector('img')).toBeNull()
    expect(article.querySelector('.tiny-note-export-image-fallback')?.textContent).toContain('文章封面（cdn.example.com）')
  })

  it('embeds remote images through the CSP-approved image path without cross-origin fetch', async () => {
    const outputPdf = vi.fn().mockResolvedValue(new window.Blob(['%PDF'], { type: 'application/pdf' }))
    const from = vi.fn(() => ({ outputPdf }))
    const pdfFactory = vi.fn(async () => () => ({ set: () => ({ from }) }))
    const embedRemoteImage = vi.fn().mockResolvedValue('data:image/png;base64,dGlueQ==')
    const fetchRef = vi.fn(() => { throw new Error('connect-src must not be required') })
    vi.spyOn(window.HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)

    await exportNotePdf({
      title: '远程图片',
      contentHtml: '<img src="https://cdn.example.com/cover.png" alt="文章封面">'
    }, {
      pdfFactory,
      download: vi.fn(),
      documentRef: window.document,
      embedRemoteImage,
      fetchRef
    })

    const article = from.mock.calls[0][0]
    expect(embedRemoteImage).toHaveBeenCalledWith('https://cdn.example.com/cover.png', window.document, expect.any(Object))
    expect(fetchRef).not.toHaveBeenCalled()
    expect(article.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,dGlueQ==')
  })

  it('keeps consecutive code blocks with their heading to avoid clipped border fragments', async () => {
    const outputPdf = vi.fn().mockResolvedValue(new window.Blob(['%PDF'], { type: 'application/pdf' }))
    const from = vi.fn(() => ({ outputPdf }))
    const pdfFactory = vi.fn(async () => () => ({ set: () => ({ from }) }))

    await exportNotePdf({
      title: '代码',
      contentHtml: '<h2>代码示例</h2><pre><code>one</code></pre><pre><code>two</code></pre>'
    }, { pdfFactory, download: vi.fn(), documentRef: window.document })

    expect(from.mock.calls[0][0].querySelectorAll('.tiny-note-pdf-heading-group pre')).toHaveLength(2)
  })

  it('awaits an asynchronous native print command and cleans up when it fails', async () => {
    const printError = new Error('print permission denied')
    const windowRef = {
      print: vi.fn().mockRejectedValue(printError),
      addEventListener: window.addEventListener.bind(window),
      setTimeout: window.setTimeout.bind(window)
    }

    await expect(printNote(unsafeNote, { documentRef: window.document, windowRef })).rejects.toThrow(printError)

    expect(window.document.querySelector('.tiny-note-print-root')).toBeNull()
    expect(window.document.body.classList.contains('tiny-note-app-printing')).toBe(false)
  })
})
