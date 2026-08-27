import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MarkdownSourceEditor from './MarkdownSourceEditor.vue'
import NoteAssistantSidebar from './NoteAssistantSidebar.vue'
import { mountEditor, note } from './NoteEditor.testHarness'

describe('NoteEditor modes and menus', () => {
  it('hides the assistant trigger while the sidebar is open and restores it after closing', async () => {
    vi.useFakeTimers()
    const wrapper = await mountEditor()

    expect(wrapper.get('.ai-button').text()).toContain('Tiny Note 助理')
    await wrapper.get('.ai-button').trigger('click')
    await flushPromises()

    expect(wrapper.find('.ai-button').exists()).toBe(false)
    expect(wrapper.get('.friday-editor-toolbar').classes()).toContain('with-assistant')
    const sidebar = wrapper.getComponent(NoteAssistantSidebar)
    await sidebar.vm.$emit('close')
    await flushPromises()

    expect(wrapper.find('.ai-button').exists()).toBe(false)
    expect(wrapper.get('.friday-editor-toolbar').classes()).toContain('with-assistant')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    expect(wrapper.get('.ai-button').text()).toContain('Tiny Note 助理')
    expect(wrapper.get('.friday-editor-toolbar').classes()).not.toContain('with-assistant')
    wrapper.unmount()
  })

  it('opens in instant editing and exposes only instant editing and Markdown', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.get('.editor-mode-trigger').text()).toBe('')
    expect(wrapper.get('.editor-mode-trigger').attributes('aria-label')).toContain('即时编辑')
    expect(wrapper.find('.knowledge-menu-anchor').exists()).toBe(false)
    expect(wrapper.get('.toolbar-left-group').isVisible()).toBe(true)

    await wrapper.get('.editor-mode-trigger').trigger('click')
    const modeItems = wrapper.findAll('[role="menuitemradio"]')
    expect(modeItems.map(item => item.find('strong').text())).toEqual(['即时编辑', 'Markdown'])
    await modeItems[1].trigger('click')
    await flushPromises()
    expect(wrapper.find('.markdown-source-editor').exists()).toBe(true)
    expect(wrapper.find('.split-preview-pane').exists()).toBe(true)
    expect(wrapper.get('.toolbar-left-group').isVisible()).toBe(true)
    expect(wrapper.find('.markdown-toolbar-controls').exists()).toBe(true)

    expect(wrapper.text()).not.toContain('阅读模式')
    wrapper.unmount()
  })

  it('always opens an external Markdown article in instant editing', async () => {
    const regular = note('regular-before-external')
    const external = { ...note('external-rich-default'), external: true, externalPath: 'C:\\docs\\outside.md' }
    const wrapper = await mountEditor(regular)

    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()
    expect(wrapper.get('.editor-mode-trigger').attributes('aria-label')).toContain('Markdown')

    wrapper.notesStore.notes.push(external)
    await wrapper.setProps({ note: external })
    await flushPromises()

    expect(wrapper.get('.editor-mode-trigger').attributes('aria-label')).toContain('即时编辑')
    expect(wrapper.find('.editor-workspace.mode-rich').exists()).toBe(true)
    expect(wrapper.get('.note-prose').attributes('contenteditable')).toBe('true')
    wrapper.unmount()
  })

  it('applies formatting toolbar actions to the Markdown source selection', async () => {
    const active = note('note-markdown-toolbar')
    const wrapper = await mountEditor(active)
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()

    const source = wrapper.findComponent(MarkdownSourceEditor)
    const start = source.vm.view.state.doc.toString().indexOf('正文')
    source.vm.view.dispatch({ selection: { anchor: start, head: start + 2 } })
    await wrapper.get('.markdown-toolbar-controls button[title="粗体"]').trigger('click')
    await flushPromises()

    expect(source.vm.view.state.doc.toString()).toContain('**正文**')
    expect(active.contentMarkdown).toContain('**正文**')
    wrapper.unmount()
  })

  it('shows the full Friday heading hierarchy in Markdown mode', async () => {
    const wrapper = await mountEditor(note('note-markdown-heading-menu'))
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()

    await wrapper.get('.markdown-toolbar-controls .heading-menu-anchor > button').trigger('click')
    expect(wrapper.findAll('.editor-heading-menu button').map(item => item.text())).toEqual([
      '标题', '标题 1', '标题 2', '标题 3', '正文', '小正'
    ])
    wrapper.unmount()
  })

  it('uses the Friday SVG chevron for labeled toolbar dropdowns and keeps the mode trigger icon-only', async () => {
    const wrapper = await mountEditor(note('note-heading-chevron'))
    const richDropdownTriggers = [
      'button[title="插入"]',
      'button[title="文字颜色"]',
      'button[title="背景颜色"]',
      '.heading-menu-anchor > button'
    ]

    for (const selector of richDropdownTriggers) {
      const chevron = wrapper.get(`${selector} .friday-dropdown-chevron`)
      expect(chevron.element.tagName.toLowerCase()).toBe('svg')
      expect(chevron.attributes('width')).toBe('12')
      expect(chevron.attributes('height')).toBe('12')
      expect(chevron.get('polyline').attributes('points')).toBe('6 9 12 15 18 9')
    }
    expect(wrapper.find('.editor-mode-trigger .friday-dropdown-chevron').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('▾')

    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()
    expect(wrapper.get('.markdown-toolbar-controls .friday-dropdown-chevron').get('polyline').attributes('points')).toBe('6 9 12 15 18 9')
    expect(wrapper.find('.editor-mode-trigger .friday-dropdown-chevron').exists()).toBe(false)
    wrapper.unmount()
  })

  it('closes the heading menu when article content is pressed in either editor mode', async () => {
    const wrapper = await mountEditor(note('note-heading-menu-dismiss'))

    await wrapper.get('.heading-menu-anchor > button[title="标题"]').trigger('click')
    expect(wrapper.find('.editor-heading-menu').exists()).toBe(true)
    await wrapper.get('.note-prose').trigger('pointerdown')
    expect(wrapper.find('.editor-heading-menu').exists()).toBe(false)

    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()
    await wrapper.get('.markdown-toolbar-controls .heading-menu-anchor > button').trigger('click')
    expect(wrapper.find('.editor-heading-menu').exists()).toBe(true)
    await wrapper.get('.cm-content').trigger('pointerdown')
    expect(wrapper.find('.editor-heading-menu').exists()).toBe(false)
    wrapper.unmount()
  })

  it('toggles both editor modes with Ctrl+/ even when CodeMirror has focus', async () => {
    const active = note('note-mode-shortcut')
    const wrapper = await mountEditor(active)
    const enterMarkdown = new window.KeyboardEvent('keydown', {
      key: '/', code: 'Slash', ctrlKey: true, bubbles: true, cancelable: true
    })

    wrapper.get('.note-prose').element.dispatchEvent(enterMarkdown)
    await flushPromises()
    expect(enterMarkdown.defaultPrevented).toBe(true)
    expect(wrapper.get('.editor-mode-trigger').attributes('aria-label')).toContain('Markdown')
    expect(globalThis.document.activeElement).toBe(wrapper.get('.cm-content').element)

    const exactDraft = '# 快捷键保存\n\n\n保留空行\n'
    const source = wrapper.findComponent(MarkdownSourceEditor)
    source.vm.view.dispatch({ changes: { from: 0, to: source.vm.view.state.doc.length, insert: exactDraft } })
    const returnToRich = new window.KeyboardEvent('keydown', {
      key: '/', code: 'Slash', ctrlKey: true, bubbles: true, cancelable: true
    })
    wrapper.get('.cm-content').element.dispatchEvent(returnToRich)
    await flushPromises()
    expect(returnToRich.defaultPrevented).toBe(true)
    expect(wrapper.get('.editor-mode-trigger').attributes('aria-label')).toContain('即时编辑')
    expect(globalThis.document.activeElement).toBe(wrapper.get('.note-prose').element)
    expect(active.contentMarkdown).toBe(exactDraft)
    expect(wrapper.get('.note-prose').text()).toContain('保留空行')
    wrapper.unmount()
  })

  it('uses the customized editor mode shortcut instead of Ctrl+/', async () => {
    const wrapper = await mountEditor(note('note-custom-shortcut'))
    wrapper.appStore.setEditorModeShortcut('Mod+Shift+KeyM')
    await flushPromises()

    wrapper.get('.note-prose').element.dispatchEvent(new window.KeyboardEvent('keydown', {
      key: '/', code: 'Slash', ctrlKey: true, bubbles: true, cancelable: true
    }))
    await flushPromises()
    expect(wrapper.get('.editor-mode-trigger').attributes('aria-label')).toContain('即时编辑')

    wrapper.get('.note-prose').element.dispatchEvent(new window.KeyboardEvent('keydown', {
      key: 'm', code: 'KeyM', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true
    }))
    await flushPromises()
    expect(wrapper.get('.editor-mode-trigger').attributes('aria-label')).toContain('Markdown')
    expect(wrapper.get('.editor-mode-trigger').attributes('title')).toContain('Ctrl + Shift + M')
    wrapper.unmount()
  })

  it('consumes repeated shortcut presses while a mode switch is still saving', async () => {
    const wrapper = await mountEditor(note('note-shortcut-race'))
    const first = new window.KeyboardEvent('keydown', {
      key: '/', code: 'Slash', ctrlKey: true, bubbles: true, cancelable: true
    })
    const second = new window.KeyboardEvent('keydown', {
      key: '/', code: 'Slash', ctrlKey: true, bubbles: true, cancelable: true
    })
    const repeated = new window.KeyboardEvent('keydown', {
      key: '/', code: 'Slash', ctrlKey: true, repeat: true, bubbles: true, cancelable: true
    })

    wrapper.get('.note-prose').element.dispatchEvent(first)
    wrapper.get('.note-prose').element.dispatchEvent(second)
    wrapper.get('.note-prose').element.dispatchEvent(repeated)
    expect(first.defaultPrevented).toBe(true)
    expect(second.defaultPrevented).toBe(true)
    expect(repeated.defaultPrevented).toBe(true)
    await flushPromises()
    expect(wrapper.get('.editor-mode-trigger').attributes('aria-label')).toContain('Markdown')
    wrapper.unmount()
  })

  it('supports keyboard menu navigation and keeps the current mode for another note', async () => {
    const wrapper = await mountEditor()
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.get('.editor-mode-menu').trigger('keydown', { key: 'ArrowDown' })
    expect(window.document.activeElement?.textContent).toContain('Markdown')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()
    expect(wrapper.find('.editor-workspace.mode-markdown.is-previewing').exists()).toBe(true)

    await wrapper.setProps({ note: note('note-2') })
    await flushPromises()
    expect(wrapper.get('.editor-mode-trigger').attributes('aria-label')).toContain('Markdown')
    expect(wrapper.find('.editor-workspace.mode-markdown.is-previewing').exists()).toBe(true)
    wrapper.unmount()
  })

  it('treats preview as a layout option inside Markdown mode', async () => {
    const wrapper = await mountEditor()
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()

    const previewToggle = wrapper.get('.markdown-preview-toggle')
    expect(previewToggle.text()).toBe('')
    expect(previewToggle.attributes('aria-label')).toBe('关闭实时预览')
    expect(previewToggle.attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('.split-preview-pane').exists()).toBe(true)
    await previewToggle.trigger('click')
    await flushPromises()
    expect(previewToggle.attributes('aria-pressed')).toBe('false')
    expect(wrapper.find('.split-preview-pane').exists()).toBe(false)
    expect(wrapper.find('.markdown-source-editor').exists()).toBe(true)
    wrapper.unmount()
  })

})
