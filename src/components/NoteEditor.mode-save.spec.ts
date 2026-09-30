import { editMarkdown, mountEditor, note } from './NoteEditor.testHarness'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import VditorEditor from './VditorEditor.vue'
import * as transport from '../services/tauri'

describe('mode switching during persistence', () => {
  it.each(['menu', 'shortcut'])('returns to instant editing via %s while saving is pending and preserves a failed draft for retry', async entry => {
    const active = note(`mode-save-${entry}`)
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({ notes: [active] }))
    const wrapper = await mountEditor(active)
    let rejectSave!: (reason: Error) => void
    const invoke = vi.spyOn(transport, 'invoke')
    try {
      await wrapper.get('.editor-mode-trigger').trigger('click')
      await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
      await flushPromises()

      const draft = '## 最新正文\n\n\n保存失败也不能丢失\n'
      editMarkdown(wrapper, draft)
      await wrapper.get('input[aria-label="笔记名称"]').setValue('独立名称')
      invoke.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectSave = reject }))
      if (entry === 'menu') {
        await wrapper.get('.editor-mode-trigger').trigger('click')
        await wrapper.findAll('[role="menuitemradio"]')[0].trigger('click')
      } else {
        await wrapper.get('.vditor-sv').trigger('keydown', { key: '/', code: 'Slash', ctrlKey: true })
      }
      await flushPromises()
      const switchedWhilePending = wrapper.vm.editorMode === 'rich'
      const contentWhilePending = wrapper.get('.vditor-ir pre.vditor-reset').text()
      rejectSave(new Error('网络暂时不可用'))
      await flushPromises()

      expect(switchedWhilePending).toBe(true)
      expect(contentWhilePending).toContain('保存失败也不能丢失')
      expect(wrapper.get('.editor-mode-trigger').attributes('aria-label')).toContain('即时编辑')
      expect(wrapper.get('.vditor-ir pre.vditor-reset').attributes('contenteditable')).toBe('true')
      expect(active.contentMarkdown).toBe(draft)
      expect(active.title).toBe('独立名称')
      expect(wrapper.get('.note-auto-save button').attributes('title')).toContain('网络暂时不可用')
      invoke.mockRestore()
      await wrapper.get('.note-auto-save button').trigger('click')
      await flushPromises()
      const persisted = JSON.parse(localStorage.getItem('tiny-note-browser-state')!).notes[0]
      expect(persisted.contentMarkdown).toBe(draft)
      expect(persisted.title).toBe('独立名称')
      expect(wrapper.get('.note-auto-save').text()).toBe('已保存')

      await wrapper.get('.editor-mode-trigger').trigger('click')
      await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
      await flushPromises()
      expect(wrapper.getComponent(VditorEditor).props('modelValue')).toBe(draft)
    } finally { invoke.mockRestore(); wrapper.unmount() }
  })
})
