import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildNoteExportHtml,
  createSafeExportFilename,
  downloadBlob,
  exportNotePdf,
  printNote
} from './noteExport'

const unsafeNote = {
  title: '方案 & <复盘>',
  contentHtml: '<h2>正文标题</h2><p onclick="alert(1)">安全正文</p><script>alert(2)</script><a href="javascript:alert(3)">危险链接</a>'
}

afterEach(() => {
  document.body.innerHTML = ''
  document.body.className = ''
  vi.restoreAllMocks()
})

describe('note export documents', () => {
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
  })

  it('downloads a Blob and always revokes its temporary URL', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const urlApi = { createObjectURL: vi.fn(() => 'blob:tiny-note-export'), revokeObjectURL: vi.fn() }
    const schedule = vi.fn(callback => callback())
    const blob = new Blob(['hello'], { type: 'text/plain' })

    downloadBlob(blob, 'note.txt', { documentRef: document, urlApi, schedule })

    expect(urlApi.createObjectURL).toHaveBeenCalledWith(blob)
    expect(click).toHaveBeenCalledOnce()
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 0)
    expect(urlApi.revokeObjectURL).toHaveBeenCalledWith('blob:tiny-note-export')
    expect(document.querySelector('a[download]')).toBeNull()
  })

  it('exports a real PDF Blob through a dedicated renderer and removes its render stage', async () => {
    const pdfBlob = new Blob(['%PDF-1.7\n'], { type: 'application/pdf' })
    const outputPdf = vi.fn().mockResolvedValue(pdfBlob)
    const from = vi.fn(() => ({ outputPdf }))
    const set = vi.fn(() => ({ from }))
    const pdfFactory = vi.fn(async () => () => ({ set }))
    const download = vi.fn()

    await exportNotePdf(unsafeNote, { pdfFactory, download, documentRef: document })

    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      filename: '方案 & 复盘.pdf',
      jsPDF: expect.objectContaining({ format: 'a4', orientation: 'portrait' }),
      pagebreak: expect.objectContaining({ avoid: expect.arrayContaining(['p', 'h2', 'pre', 'tr']) })
    }))
    expect(from).toHaveBeenCalledWith(expect.any(HTMLElement))
    expect(outputPdf).toHaveBeenCalledWith('blob')
    expect(download).toHaveBeenCalledWith(pdfBlob, '方案 & 复盘.pdf')
    expect(document.querySelector('.tiny-note-pdf-stage')).toBeNull()
  })

  it('prints only the standalone article snapshot and cleans it after printing', async () => {
    const print = vi.fn()
    const windowRef = { print, addEventListener: window.addEventListener.bind(window), setTimeout: window.setTimeout.bind(window) }

    await printNote(unsafeNote, { documentRef: document, windowRef })

    expect(print).toHaveBeenCalledOnce()
    expect(document.body.classList.contains('tiny-note-app-printing')).toBe(true)
    const printRoot = document.querySelector('.tiny-note-print-root')
    expect(printRoot?.textContent).toContain('方案 & <复盘>')
    expect(printRoot?.textContent).toContain('安全正文')
    expect(printRoot?.innerHTML).not.toMatch(/<script|onclick=|javascript:/i)

    window.dispatchEvent(new Event('afterprint'))
    expect(document.querySelector('.tiny-note-print-root')).toBeNull()
    expect(document.body.classList.contains('tiny-note-app-printing')).toBe(false)
  })
})
