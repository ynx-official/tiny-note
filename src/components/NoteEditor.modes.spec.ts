import { mountEditor, note, editMarkdown, switchMode, selectText } from './NoteEditor.testHarness'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import NoteAssistantSidebar from './NoteAssistantSidebar.vue'

describe('Vditor modes and menus', () => {
  it('uses one Vditor instance for both modes with a shared native toolbar', async () => {
    const w = await mountEditor()
    try {
      const host = w.get('.tiny-vditor').element
      expect(w.get('.editor-mode-trigger').text()).toBe('即时编辑')
      await switchMode(w, 'markdown')
      expect(w.get('.tiny-vditor').element).toBe(host)
      expect(w.get('.vditor-sv').isVisible()).toBe(true)
      expect(w.get('.vditor-preview').isVisible()).toBe(true)
      expect(w.get('.vditor-toolbar').isVisible()).toBe(true)
      expect(w.find('.cm-editor').exists()).toBe(false)
      expect(w.find('.tiptap').exists()).toBe(false)
      await switchMode(w, 'rich')
      expect(w.get('.tiny-vditor').element).toBe(host)
      expect(w.get('.vditor-ir').isVisible()).toBe(true)
    } finally { w.unmount() }
  })
  it('opens external Markdown in instant editing', async () => {
    const w = await mountEditor()
    try {
      await switchMode(w, 'markdown')
      const external = { ...note('external'), external: true, externalPath: '/notes/a.md' }
      w.notesStore.notes.push(external)
      await w.setProps({ note: external }); await flushPromises()
      expect(w.vm.editorMode).toBe('rich')
      expect(w.get('.vditor-ir').isVisible()).toBe(true)
    } finally { w.unmount() }
  })
  it('preserves untouched source exactly across repeated mode changes', async () => {
    const source = '---\ntitle: 示例\n---\n\n# 标题\n\n\n$x^2$[^1]\n\n[^1]: 来源\n'
    const active = { ...note(), contentMarkdown: source, markdownSource: true }
    const w = await mountEditor(active)
    const save = vi.spyOn(w.notesStore, 'save')
    try {
      for (let i = 0; i < 3; i++) { await switchMode(w, 'markdown'); await switchMode(w, 'rich') }
      expect(active.contentMarkdown).toBe(source)
      expect(w.vm.editor.getMarkdown()).toBe(source)
      expect(save).not.toHaveBeenCalled()
    } finally { w.unmount() }
  })
  it('applies native formatting to the Markdown selection', async () => {
    const w = await mountEditor()
    try {
      await switchMode(w, 'markdown'); editMarkdown(w, '需要加粗'); await selectText(w, '需要加粗')
      await w.get('.vditor-toolbar [data-type="bold"]').trigger('click')
      await flushPromises(); await w.vm.saveLatestContent()
      expect(w.vm.markdownDraft).toContain('**需要加粗**')
      expect(w.find('.vditor-toolbar [data-type="headings"]').exists()).toBe(true)
      expect(w.find('button[title="文字颜色"]').exists()).toBe(false)
      expect(w.find('button[title="居中"]').exists()).toBe(false)
    } finally { w.unmount() }
  })
  it('toggles Ctrl+/ with source focus and consumes repeat presses', async () => {
    const w = await mountEditor()
    try {
      await switchMode(w, 'markdown')
      await w.get('.vditor-sv').trigger('keydown', { key: '/', code: 'Slash', ctrlKey: true })
      await flushPromises()
      expect(w.vm.editorMode).toBe('rich')
      await w.get('.vditor-ir pre').trigger('keydown', { key: '/', code: 'Slash', ctrlKey: true, repeat: true })
      expect(w.vm.editorMode).toBe('rich')
    } finally { w.unmount() }
  })
  it('uses the configured shortcut', async () => {
    const w = await mountEditor()
    try {
      w.appStore.setEditorModeShortcut('Ctrl+Shift+M')
      await w.get('.vditor-ir pre').trigger('keydown', { key: '/', code: 'Slash', ctrlKey: true })
      expect(w.vm.editorMode).toBe('rich')
      await w.get('.vditor-ir pre').trigger('keydown', { key: 'M', code: 'KeyM', ctrlKey: true, shiftKey: true })
      await flushPromises(); expect(w.vm.editorMode).toBe('markdown')
    } finally { w.unmount() }
  })
  it('supports keyboard menus and keeps mode on article switch', async () => {
    const w = await mountEditor()
    try {
      await w.get('.editor-mode-trigger').trigger('click')
      await w.get('[role="menu"]').trigger('keydown', { key: 'End' })
      expect(document.activeElement).toBe(w.findAll('[role="menuitemradio"]')[1].element)
      await w.findAll('[role="menuitemradio"]')[1].trigger('click')
      const next = note('next'); w.notesStore.notes.push(next)
      await w.setProps({ note: next }); await flushPromises()
      expect(w.vm.editorMode).toBe('markdown')
    } finally { w.unmount() }
  })
  it('treats preview as layout only', async () => {
    const w = await mountEditor()
    try {
      await switchMode(w, 'markdown')
      const source = w.vm.markdownDraft
      await w.get('.markdown-preview-toggle').trigger('click')
      expect(w.get('.vditor-preview').isVisible()).toBe(false)
      await w.get('.markdown-preview-toggle').trigger('click')
      expect(w.get('.vditor-preview').isVisible()).toBe(true)
      expect(w.vm.markdownDraft).toBe(source)
    } finally { w.unmount() }
  })
  it('keeps assistant toggle visible through transitions', async () => {
    const w = await mountEditor()
    try {
      vi.useFakeTimers(); await w.get('.ai-button').trigger('click')
      expect(w.get('.ai-button').attributes('aria-pressed')).toBe('true')
      w.getComponent(NoteAssistantSidebar).vm.$emit('close')
      await flushPromises(); await vi.advanceTimersByTimeAsync(250)
      expect(w.get('.ai-button').isVisible()).toBe(true)
      expect(w.get('.ai-button').attributes('aria-pressed')).toBe('false')
    } finally { w.unmount() }
  })
})
