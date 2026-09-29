import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MarkdownSourceEditor from './MarkdownSourceEditor.vue'
import { mountEditor, note } from './NoteEditor.testHarness'
import { cacheNoteBody, trackPersistedNote } from '../services/noteCache'

describe('NoteEditor save and synchronization', () => {
  it('shows automatic save progress and saves the edited body without a save click', async () => {
    const original = { ...note('visible-autosave'), title: '标题' }
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({ notes: [original] }))
    const wrapper = await mountEditor(original)
    try {
      vi.useFakeTimers()
      wrapper.vm.editor.commands.setContent('<h1>标题</h1><p>自动保存的新内容</p>')
      await flushPromises()
      expect(wrapper.get('.note-auto-save').text()).toContain('等待自动保存')
      await vi.advanceTimersByTimeAsync(800)
      await flushPromises()
      expect(wrapper.get('.note-auto-save').text()).toBe('已保存')
      expect(JSON.parse(localStorage.getItem('tiny-note-browser-state')!).notes[0].contentText).toContain('自动保存的新内容')
    } finally { wrapper.unmount(); vi.useRealTimers() }
  })

  it.each(['rich', 'markdown'])('renders a newer cloud body for the same ID in %s mode', async mode => {
    const original = { ...note('remote-refresh'), title: '标题' }
    const wrapper = await mountEditor(original)
    try {
      trackPersistedNote(original)
      if (mode === 'markdown') {
        await wrapper.get('.editor-mode-trigger').trigger('click')
        await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
        await flushPromises()
      }
      const save = vi.spyOn(wrapper.notesStore, 'save')
      const remote = { ...original, version: 2, title: '远端标题', contentHtml: '<h1>远端标题</h1><p>另一台电脑保存的正文</p>', contentText: '远端标题\n另一台电脑保存的正文', contentMarkdown: '# 远端标题\n\n另一台电脑保存的正文' }
      cacheNoteBody(wrapper.notesStore, remote)
      await wrapper.setProps({ note: wrapper.notesStore.active })
      await flushPromises()
      if (mode === 'markdown') expect(wrapper.findComponent(MarkdownSourceEditor).props('modelValue')).toBe(remote.contentMarkdown)
      else expect(wrapper.get('.note-prose').text()).toContain('另一台电脑保存的正文')
      expect(save).not.toHaveBeenCalled()
      expect(wrapper.notesStore.active?.version).toBe(2)
    } finally { wrapper.unmount() }
  })

  it('restores reading position before slow links arrive without moving a reader who has scrolled', async () => {
    const first = note('slow-links-first')
    const second = note('slow-links-second')
    const wrapper = await mountEditor(first)
    wrapper.notesStore.notes.push(second)
    const scroller = wrapper.get('.editor-render-pane').element as HTMLElement
    Object.defineProperties(scroller, {
      scrollHeight: { value: 1200, configurable: true },
      clientHeight: { value: 400, configurable: true }
    })
    localStorage.setItem('tiny-note:reading-position:slow-links-second', '0.5')
    let finish!: (value: []) => void
    const links = vi.spyOn(wrapper.notesStore, 'listLinks').mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await wrapper.setProps({ note: second })
    await flushPromises()
    try {
      expect(scroller.scrollTop).toBe(400)
      scroller.scrollTop = 600
      finish([])
      await flushPromises()
      expect(scroller.scrollTop).toBe(600)
    } finally { finish([]); links.mockRestore(); wrapper.unmount() }
  })

  it('flushes an exact Markdown draft before switching notes', async () => {
    const first = note('note-source')
    const second = note('note-next')
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({ notes: [first] }))
    const wrapper = await mountEditor(first)
    wrapper.notesStore.notes.push(second)

    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()
    const source = wrapper.findComponent(MarkdownSourceEditor)
    const exactDraft = '# 新稿\n\n\n保留空行\n'
    source.vm.view.dispatch({ changes: { from: 0, to: source.vm.view.state.doc.length, insert: exactDraft } })

    await wrapper.setProps({ note: second })
    await flushPromises()
    expect(first.contentMarkdown).toBe(exactDraft)
    expect(first.contentHtml).toContain('<h1 data-note-title="true">新稿</h1>')
    expect(first.contentText).toContain('保留空行')
    expect(JSON.parse(localStorage.getItem('tiny-note-browser-state')).notes[0].contentMarkdown).toBe(exactDraft)
    expect(wrapper.get('.editor-mode-trigger').attributes('aria-label')).toContain('Markdown')
    wrapper.unmount()
  })

  it('clamps the split divider and synchronizes both scroll directions', async () => {
    const wrapper = await mountEditor()
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()

    const workspace = wrapper.get('.editor-workspace').element
    workspace.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600 })
    await wrapper.get('.split-divider').trigger('pointerdown', { button: 0, pointerId: 7, clientX: 500 })
    const move = new window.MouseEvent('pointermove', { clientX: 950 })
    Object.defineProperty(move, 'pointerId', { value: 7 })
    window.dispatchEvent(move)
    await flushPromises()
    expect(wrapper.get('.split-divider').attributes('aria-valuenow')).toBe('70')

    const sourceScroller = wrapper.get('.cm-scroller').element
    const previewScroller = wrapper.get('.split-preview-pane').element
    Object.defineProperties(sourceScroller, { scrollHeight: { value: 1000, configurable: true }, clientHeight: { value: 500, configurable: true } })
    Object.defineProperties(previewScroller, { scrollHeight: { value: 800, configurable: true }, clientHeight: { value: 200, configurable: true } })
    sourceScroller.scrollTop = 250
    sourceScroller.dispatchEvent(new window.Event('scroll'))
    await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))
    expect(previewScroller.scrollTop).toBe(300)

    previewScroller.scrollTop = 600
    previewScroller.dispatchEvent(new window.Event('scroll'))
    await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))
    expect(sourceScroller.scrollTop).toBe(500)
    wrapper.unmount()
  })

  it('remembers and restores the reading position for each article', async () => {
    const first = note('reading-position-first')
    const second = note('reading-position-second')
    const wrapper = await mountEditor(first)
    wrapper.notesStore.notes.push(second)
    const scroller = wrapper.get('.editor-render-pane').element as HTMLElement
    Object.defineProperties(scroller, {
      scrollHeight: { value: 1200, configurable: true },
      clientHeight: { value: 400, configurable: true }
    })

    scroller.scrollTop = 400
    scroller.dispatchEvent(new window.Event('scroll'))
    await wrapper.setProps({ note: second })
    await flushPromises()
    expect(localStorage.getItem('tiny-note:reading-position:reading-position-first')).toBe('0.5')

    scroller.scrollTop = 160
    scroller.dispatchEvent(new window.Event('scroll'))
    await wrapper.setProps({ note: first })
    await flushPromises()
    expect(scroller.scrollTop).toBe(400)
    wrapper.unmount()
  })

  it('parses source after 150ms and keeps the existing 800ms autosave', async () => {
    const active = note('note-autosave')
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({ notes: [active] }))
    const wrapper = await mountEditor(active)
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()
    vi.useFakeTimers()

    const source = wrapper.findComponent(MarkdownSourceEditor)
    source.vm.view.dispatch({ changes: { from: 0, to: source.vm.view.state.doc.length, insert: '## 自动保存' } })
    await vi.advanceTimersByTimeAsync(149)
    expect(active.contentMarkdown).toBe('# 标题\n\n正文')
    await vi.advanceTimersByTimeAsync(1)
    expect(active.contentMarkdown).toBe('## 自动保存')
    expect(active.contentHtml).toContain('<h1 data-note-title="true">自动保存</h1>')
    await vi.advanceTimersByTimeAsync(800)
    expect(JSON.parse(localStorage.getItem('tiny-note-browser-state')).notes[0].contentMarkdown).toBe('## 自动保存')

    vi.useRealTimers()
    wrapper.unmount()
  })

  it('keeps transient Markdown structures editable and saves the exact source', async () => {
    const active = note('note-incomplete-markdown')
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({ notes: [active] }))
    const wrapper = await mountEditor(active)
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()
    vi.useFakeTimers()

    const source = wrapper.findComponent(MarkdownSourceEditor)
    const drafts = ['', '> ', '1. ', '最终内容']
    for (const draft of drafts) {
      source.vm.view.dispatch({ changes: { from: 0, to: source.vm.view.state.doc.length, insert: draft } })
      await vi.advanceTimersByTimeAsync(150)
      expect(active.contentMarkdown).toBe(draft)
      expect(wrapper.find('.markdown-parse-error').exists()).toBe(false)
    }

    expect(wrapper.get('.split-preview-pane').text()).toContain('最终内容')

    await vi.advanceTimersByTimeAsync(800)
    expect(JSON.parse(localStorage.getItem('tiny-note-browser-state')).notes[0].contentMarkdown).toBe('最终内容')

    vi.useRealTimers()
    wrapper.unmount()
  })

})
