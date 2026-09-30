import { editMarkdown, editHtml, mountEditor, note } from './NoteEditor.testHarness'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import * as transport from '../services/tauri'

describe('independent note title header', () => {
  it('puts title and document actions before the separate formatting row', async () => {
    const wrapper = await mountEditor()
    try {
      const header = wrapper.get('.note-title-row')
      expect(header.get('input[aria-label="笔记名称"]').element.value).toBe('四种模式')
      expect(header.find('.note-auto-save').exists()).toBe(true)
      expect(header.find('.toolbar-right-group').exists()).toBe(true)
      expect(header.element.compareDocumentPosition(wrapper.get('.vditor-toolbar').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    } finally { wrapper.unmount() }
  })

  it('autosaves a title without changing the body, supports spaces and empty input', async () => {
    const active = note('title-field')
    const body = active.contentMarkdown
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({ notes: [active] }))
    const wrapper = await mountEditor(active)
    try {
      vi.useFakeTimers()
      const input = wrapper.get('input[aria-label="笔记名称"]')
      await input.setValue('Docker ')
      expect(input.element.value).toBe('Docker ')
      await input.setValue('Docker 部署记录')
      await vi.advanceTimersByTimeAsync(800)
      expect(JSON.parse(localStorage.getItem('tiny-note-browser-state')!).notes[0].title).toBe('Docker 部署记录')
      expect(active.contentMarkdown).toBe(body)
      await input.setValue('')
      expect(input.element.value).toBe('')
      expect(active.title).toBe('未命名笔记')
      editHtml(wrapper, '<h1>正文标题</h1>')
      expect(active.title).toBe('未命名笔记')
    } finally { wrapper.unmount(); vi.useRealTimers() }
  })

  it('keeps the same title input in Markdown mode and flushes title with the source draft', async () => {
    const active = note('header-markdown')
    const wrapper = await mountEditor(active)
    try {
      const input = wrapper.get('input[aria-label="笔记名称"]')
      await wrapper.get('.editor-mode-trigger').trigger('click')
      await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')

      editMarkdown(wrapper, '## 章节\n\n正文')
      await input.setValue('独立名称')
      await wrapper.vm.saveLatestContent()
      expect(wrapper.get('input[aria-label="笔记名称"]').element).toBe(input.element)
      expect(active.title).toBe('独立名称')
      expect(active.contentMarkdown).toBe('## 章节\n\n正文')
      await wrapper.get('.markdown-preview-toggle').trigger('click')
      expect(input.isVisible()).toBe(true)
    } finally { wrapper.unmount() }
  })

  it('does not promote a first paragraph or H2 into a special document title', async () => {
    const active = { ...note('ordinary-body'), contentHtml: '<p>开头正文</p><h2>章节</h2>', contentMarkdown: '开头正文\n\n## 章节' }
    const wrapper = await mountEditor(active)
    try {
      expect(wrapper.get('.vditor-ir pre.vditor-reset').element.firstElementChild?.tagName).toBe('P')
      expect(wrapper.find('.note-prose [data-note-title]').exists()).toBe(false)
    } finally { wrapper.unmount() }
  })

  it('waits for Chinese composition before saving and ignores Enter while composing', async () => {
    const active = note('title-ime')
    const wrapper = await mountEditor(active)
    try {
      const input = wrapper.get('input[aria-label="笔记名称"]')
      await input.trigger('focus')
      await input.trigger('compositionstart')
      input.element.value = 'bu'
      await input.trigger('input')
      await input.trigger('keydown', { key: 'Enter', isComposing: true })
      expect(active.title).toBe('四种模式')
      input.element.value = '部署记录'
      await input.trigger('compositionend')
      await flushPromises()
      expect(active.title).toBe('部署记录')
    } finally { wrapper.unmount() }
  })

  it('flushes the current title when switching notes and shows the next name', async () => {
    const active = note('title-before-switch')
    const next = { ...note('title-after-switch'), title: '下一篇' }
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({ notes: [active, next] }))
    const wrapper = await mountEditor(active)
    try {
      wrapper.notesStore.notes.push(next)
      await wrapper.get('input[aria-label="笔记名称"]').setValue('切换前改名')
      await wrapper.setProps({ note: next })
      await flushPromises()
      expect(wrapper.get('input[aria-label="笔记名称"]').element.value).toBe('下一篇')
      expect(JSON.parse(localStorage.getItem('tiny-note-browser-state')!).notes[0].title).toBe('切换前改名')
    } finally { wrapper.unmount() }
  })

  it('retains an unsaved title and exposes retry when saving fails', async () => {
    const active = note('title-save-failure')
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({ notes: [active] }))
    const wrapper = await mountEditor(active)
    const invoke = vi.spyOn(transport, 'invoke').mockRejectedValueOnce(new Error('网络暂不可用'))
    try {
      await wrapper.get('input[aria-label="笔记名称"]').setValue('保留我的标题')
      await expect(wrapper.vm.saveLatestContent()).rejects.toThrow()
      expect(wrapper.get('input[aria-label="笔记名称"]').element.value).toBe('保留我的标题')
      expect(wrapper.find('.note-title-row .note-auto-save button').exists()).toBe(true)
      await wrapper.get('.note-title-row .note-auto-save button').trigger('click')
      await flushPromises()
      expect(wrapper.get('.note-title-row .note-auto-save').text()).toBe('已保存')
    } finally { invoke.mockRestore(); wrapper.unmount() }
  })

  it('keeps the assistant toggle available while its panel is open', async () => {
    const wrapper = await mountEditor()
    try {
      await wrapper.get('.ai-button').trigger('click')
      await flushPromises()
      expect(wrapper.get('.ai-button').attributes('aria-pressed')).toBe('true')
      expect(wrapper.get('input[aria-label="笔记名称"]').isVisible()).toBe(true)
      await wrapper.get('.ai-button').trigger('click')
      expect(wrapper.get('.ai-button').attributes('aria-pressed')).toBe('false')
    } finally { wrapper.unmount() }
  })
})
