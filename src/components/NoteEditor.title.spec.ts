import { editMarkdown, editHtml, mountEditor, note, noteEditorTestMocks } from './NoteEditor.testHarness'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

const { noteExportMocks } = noteEditorTestMocks()

describe('NoteEditor title ownership', () => {
  it('opens and closes a named note without changing or saving it', async () => {
    const active = note('named-read-only')
    const original = { ...active }
    const wrapper = await mountEditor(active)
    const save = vi.spyOn(wrapper.notesStore, 'save')
    try {
      expect(active).toEqual(original)
      expect(wrapper.notesStore.saveTimer).toBeFalsy()
    } finally { wrapper.unmount() }
    await flushPromises()
    expect(save).not.toHaveBeenCalled()
  })

  it.each(['项目笔记', '标题', '自定义标题'.repeat(15)])('preserves the saved title %s through body edits and autosave', async title => {
    const active = { ...note('named-rich'), title }
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({ notes: [active] }))
    const wrapper = await mountEditor(active)
    try {
      vi.useFakeTimers()
      editHtml(wrapper, '<h1>新的章节</h1><p>修改正文</p>')
      await vi.advanceTimersByTimeAsync(950)
      expect(active.title).toBe(title)
      expect(JSON.parse(localStorage.getItem('tiny-note-browser-state')!).notes[0]).toMatchObject({ title, contentText: expect.stringContaining('修改正文') })
      editMarkdown(wrapper, '')
      await vi.advanceTimersByTimeAsync(950)
      expect(active.title).toBe(title)
    } finally { wrapper.unmount(); vi.useRealTimers() }
  })

  it('preserves a named note while flushing Markdown, switching modes and reopening', async () => {
    const active = note('named-markdown')
    const wrapper = await mountEditor(active)
    const draft = '## 新的章节\n\n\n修改正文\n'
    try {
      await wrapper.get('.editor-mode-trigger').trigger('click')
      await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
      await flushPromises()

      editMarkdown(wrapper, draft)
      await wrapper.get('.editor-mode-trigger').trigger('click')
      await wrapper.findAll('[role="menuitemradio"]')[0].trigger('click')
      await flushPromises()
      expect(active.title).toBe('四种模式')
      expect(active.contentMarkdown).toBe(draft)
    } finally { wrapper.unmount() }
    const reopened = await mountEditor(active)
    try { expect(active.title).toBe('四种模式') } finally { reopened.unmount() }
  })

  it.each(['', '未命名笔记', 'Untitled note'])('preserves unnamed notes (%s) until an explicit rename', async title => {
    const active = { ...note('unnamed'), title, contentHtml: '<p></p>', contentText: '', contentMarkdown: '' }
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({ notes: [active] }))
    const wrapper = await mountEditor(active)
    try {
      expect(active.title).toBe(title)
      editHtml(wrapper, '<h1>新</h1>')
      await flushPromises()
      expect(active.title).toBe(title)
      editHtml(wrapper, '<h1>新笔记标题</h1>')
      await flushPromises()
      expect(active.title).toBe(title)
      await wrapper.vm.saveLatestContent()
      await wrapper.notesStore.rename(active.id, '我设定的名称')
      editHtml(wrapper, '<h1>正文的新标题</h1>')
      await flushPromises()
      expect(active.title).toBe('我设定的名称')
    } finally { wrapper.unmount() }
  })

  it.each(['不同的章节', '四种模式'])('only removes a duplicate body heading from exports (%s)', async heading => {
    const active = { ...note('named-export'), contentHtml: `<h1>${heading}</h1><p>正文</p>`, contentMarkdown: `# ${heading}\n\n正文` }
    const wrapper = await mountEditor(active)
    try {
      await wrapper.get('button[title="导出与打印"]').trigger('click')
      await wrapper.findAll('.toolbar-more-menu button').find(button => button.text().trim() === '打印')!.trigger('click')
      await flushPromises()
      const snapshot = noteExportMocks.printNote.mock.calls[0][0]
      expect(snapshot.title).toBe('四种模式')
      expect(snapshot.contentHtml.includes(heading)).toBe(heading !== '四种模式')
      expect(snapshot.contentHtml).toContain('正文')
    } finally { wrapper.unmount() }
  })
})
