import { mountEditor } from './NoteEditor.testHarness'
import { describe, expect, it } from 'vitest'

describe('note workspace layout', () => {
  it('keeps the directory toggle in the document action row', async () => {
    const w = await mountEditor()
    try {
      const toggle = w.get('.toolbar-right-group button[aria-label="目录"]')
      expect(toggle.attributes('aria-pressed')).toBe('false')
      await toggle.trigger('click'); expect(w.emitted('toggle-toc')).toHaveLength(1)
      await w.setProps({ tocVisible: true }); expect(toggle.attributes('aria-pressed')).toBe('true')
    } finally { w.unmount() }
  })
  it('places the native Markdown formatting row after the separate title row', async () => {
    const w = await mountEditor()
    try {
      expect(w.get('.note-title-row').element.compareDocumentPosition(w.get('.vditor-toolbar').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(w.findAll('.vditor-toolbar')).toHaveLength(1)
      for (const type of ['bold', 'italic', 'strike', 'list', 'ordered-list', 'check', 'quote', 'link', 'table', 'code']) expect(w.find(`.vditor-toolbar [data-type="${type}"]`).exists()).toBe(true)
      expect(w.find('button[title="居中"]').exists()).toBe(false)
    } finally { w.unmount() }
  })
  it('keeps heading choices in the native accessible toolbar', async () => {
    const w = await mountEditor()
    try {
      const trigger = w.get('.vditor-toolbar [data-type="headings"]')
      await trigger.trigger('click')
      expect(w.find('.vditor-toolbar [data-tag="h1"]').exists()).toBe(true)
      expect(w.find('.vditor-toolbar [data-tag="h6"]').exists()).toBe(true)
      expect(w.text()).not.toContain('小正')
    } finally { w.unmount() }
  })
  it('omits the duplicate breadcrumb and keeps the title and real save status', async () => {
    const w = await mountEditor()
    try {
      expect(w.find('.note-document-context').exists()).toBe(false)
      expect(w.get<HTMLInputElement>('input[aria-label="笔记名称"]').element.value).toBe(w.props('note').title)
      expect(w.get('.note-auto-save').text()).not.toBe('已保存')
    } finally { w.unmount() }
  })
})
