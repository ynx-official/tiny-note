import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MarkdownSourceEditor from './MarkdownSourceEditor.vue'
import { mountEditor, note, noteEditorTestMocks } from './NoteEditor.testHarness'

const { exportLocationMocks, exportSuccessMocks, noteExportMocks } = noteEditorTestMocks()

describe('NoteEditor export and external files', () => {
  it('does not render the pin and saved-status toolbar above the article', async () => {
    const wrapper = await mountEditor()

    expect(wrapper.find('.note-pin-button').exists()).toBe(false)
    expect(wrapper.find('.editor-meta').exists()).toBe(false)
    expect(wrapper.find('.note-metadata').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('已保存')
    wrapper.unmount()
  })

  it('marks an external source and offers an explicit import action', async () => {
    const external = { ...note('external-note'), external: true, externalPath: 'C:\\docs\\outside.md' }
    const wrapper = await mountEditor(external)

    expect(wrapper.get('.external-note-banner').text()).toContain('外部文件')
    expect(wrapper.get('.external-note-banner').text()).toContain('outside.md')
    expect(wrapper.get('.external-note-banner').text()).toContain('不会出现在笔记列表')
    expect(wrapper.findAll('.external-note-actions button').map(button => button.text().trim())).toEqual(['不再提醒', '导入到笔记'])
    expect(wrapper.get('.editor-mode-trigger').text()).toBe('')
    expect(wrapper.get('.editor-mode-trigger').attributes('aria-label')).toContain('即时编辑')

    await wrapper.get('.external-note-import').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('import-external')).toEqual([[external]])
    wrapper.unmount()
  })

  it('remembers a dismissed external-file notice per article', async () => {
    const first = { ...note('external-first'), external: true, externalPath: 'C:\\docs\\first.md' }
    const second = { ...note('external-second'), external: true, externalPath: 'C:\\docs\\second.md' }
    const wrappers = []

    try {
      const firstVisit = await mountEditor(first)
      wrappers.push(firstVisit)
      await firstVisit.get('.external-note-dismiss').trigger('click')
      expect(firstVisit.find('.external-note-banner').exists()).toBe(false)
      firstVisit.unmount()

      const firstReopened = await mountEditor(first)
      wrappers.push(firstReopened)
      expect(firstReopened.find('.external-note-banner').exists()).toBe(false)
      firstReopened.unmount()

      const secondVisit = await mountEditor(second)
      wrappers.push(secondVisit)
      expect(secondVisit.get('.external-note-banner').text()).toContain('second.md')
    } finally {
      wrappers.forEach(wrapper => wrapper.unmount())
    }
  })

  it('uses a dedicated export trigger and keeps only export and print actions in its menu', async () => {
    const wrapper = await mountEditor()

    const trigger = wrapper.get('button[title="导出与打印"]')
    expect(trigger.classes()).toContain('toolbar-export-trigger')
    expect(trigger.find('.lucide-file-output-icon').exists()).toBe(true)
    expect(trigger.attributes('aria-expanded')).toBe('false')
    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.toolbar-more-menu').attributes('role')).toBe('menu')
    const labels = wrapper.findAll('.toolbar-more-menu button').map(button => button.text().trim())

    expect(labels).toEqual(['导出 Markdown', '导出 HTML', '导出 PDF', '打印'])
    await wrapper.get('.toolbar-more-menu').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.toolbar-more-menu').exists()).toBe(false)
    expect(window.document.activeElement).toBe(trigger.element)
    wrapper.unmount()
  })

  it('keeps export progress visible after the more menu closes', async () => {
    let finishPdf
    noteExportMocks.exportNotePdf.mockImplementationOnce(() => new Promise(resolve => { finishPdf = resolve }))
    const wrapper = await mountEditor()

    await wrapper.get('button[title="导出与打印"]').trigger('click')
    await wrapper.findAll('.toolbar-more-menu button').find(button => button.text().includes('导出 PDF')).trigger('click')
    await flushPromises()

    expect(wrapper.find('.toolbar-more-menu').exists()).toBe(false)
    expect(wrapper.get('.toolbar-export-status').text()).toContain('正在导出 PDF')
    expect(wrapper.get('.toolbar-export-status').attributes('role')).toBe('status')

    finishPdf()
    await flushPromises()
    expect(wrapper.find('.toolbar-export-status').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the exported file actions after a desktop file is written', async () => {
    exportLocationMocks.saveExportBlob.mockResolvedValueOnce({ path: 'D:\\Exports\\四种模式.html', fileName: '四种模式.html' })
    const wrapper = await mountEditor()

    await wrapper.get('button[title="导出与打印"]').trigger('click')
    await wrapper.findAll('.toolbar-more-menu button').find(button => button.text().includes('导出 HTML')).trigger('click')
    await flushPromises()

    expect(exportSuccessMocks.showExportSuccess).toHaveBeenCalledWith({ path: 'D:\\Exports\\四种模式.html', fileName: '四种模式.html' })
    wrapper.unmount()
  })

  it('flushes the latest Markdown draft before exporting HTML, PDF, or printing', async () => {
    const active = note('note-export')
    const wrapper = await mountEditor(active)
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()

    const source = wrapper.findComponent(MarkdownSourceEditor)
    source.vm.view.dispatch({
      changes: {
        from: 0,
        to: source.vm.view.state.doc.length,
        insert: '## 最新草稿\n\n尚未经过 150ms 防抖'
      }
    })

    await wrapper.get('button[title="导出与打印"]').trigger('click')
    await wrapper.findAll('.toolbar-more-menu button').find(button => button.text().includes('导出 HTML')).trigger('click')
    await flushPromises()
    expect(noteExportMocks.downloadNoteHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '最新草稿',
        contentHtml: expect.stringContaining('尚未经过 150ms 防抖')
      }),
      expect.objectContaining({ lang: 'zh-CN', download: expect.any(Function) })
    )
    expect(noteExportMocks.downloadNoteHtml.mock.calls[0][0].contentHtml).not.toContain('最新草稿')

    await wrapper.get('button[title="导出与打印"]').trigger('click')
    await wrapper.findAll('.toolbar-more-menu button').find(button => button.text().includes('导出 PDF')).trigger('click')
    await flushPromises()
    expect(noteExportMocks.exportNotePdf).toHaveBeenCalledWith(expect.objectContaining({ contentHtml: expect.stringContaining('尚未经过 150ms 防抖') }), expect.objectContaining({ download: expect.any(Function) }))

    await wrapper.get('button[title="导出与打印"]').trigger('click')
    await wrapper.findAll('.toolbar-more-menu button').find(button => button.text().trim() === '打印').trigger('click')
    await flushPromises()
    expect(noteExportMocks.printNote).toHaveBeenCalledWith(expect.objectContaining({ contentHtml: expect.stringContaining('尚未经过 150ms 防抖') }))
    wrapper.unmount()
  })

})
