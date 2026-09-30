import { mountEditor, note, editMarkdown, switchMode } from './NoteEditor.testHarness'
import { describe, expect, it } from 'vitest'

describe('authoritative Markdown sources', () => {
  it('uses Markdown rather than stale HTML and persists rich edits', async () => {
    const active = { ...note(), markdownSource: true, contentHtml: '<h1>过期</h1>', contentMarkdown: '# 最新\n\n正文' }
    const w = await mountEditor(active)
    try {
      expect(w.get('.vditor-ir').text()).toContain('最新')
      expect(w.get('.vditor-ir').text()).not.toContain('过期')
      await switchMode(w, 'markdown'); await switchMode(w, 'rich')
      editMarkdown(w, '# 编辑后\n\n正文'); await w.vm.saveLatestContent()
      expect(active.contentMarkdown).toBe('# 编辑后\n\n正文'); expect(active.contentHtml).toContain('编辑后')
    } finally { w.unmount() }
  })
  it('allows formulas, metadata and footnotes in instant editing', async () => {
    const source = '---\ntitle: Test\n---\n\n$x^2$[^1]\n\n[^1]: 来源'
    const active = { ...note(), markdownSource: true, contentMarkdown: source }; const w = await mountEditor(active)
    try {
      expect(w.vm.editorMode).toBe('rich'); expect(w.find('.markdown-mode-warning').exists()).toBe(false)
      editMarkdown(w, source + '\n\n补充'); await w.vm.saveLatestContent()
      expect(active.contentMarkdown).toBe(source + '\n\n补充')
    } finally { w.unmount() }
  })
  it('does not revive stale HTML when authoritative Markdown is empty', async () => {
    const active = { ...note(), markdownSource: true, contentMarkdown: '', contentHtml: '<p>过期内容</p>' }
    const w = await mountEditor(active)
    try {
      expect(w.vm.markdownDraft).toBe(''); expect(w.get('.vditor-ir').text()).not.toContain('过期内容')
      await switchMode(w, 'markdown'); expect(w.vm.markdownDraft).toBe('')
    } finally { w.unmount() }
  })
})
