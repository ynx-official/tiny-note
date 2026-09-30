import { selectText, mountEditor, note, editMarkdown, switchMode } from './NoteEditor.testHarness'
import { describe, expect, it, vi } from 'vitest'

describe('Vditor Markdown content', () => {
  it('converts HTML-only legacy content in memory without saving on open', async () => {
    const active = { ...note(), contentMarkdown: '', contentHtml: '<h1>旧标题</h1><p>旧内容</p>' }
    const original = { ...active }; const w = await mountEditor(active)
    const save = vi.spyOn(w.notesStore, 'save')
    try {
      expect(w.get('.vditor-ir').text()).toContain('旧内容')
      expect(w.vm.markdownDraft).toContain('# 旧标题')
      expect(active).toEqual(original); expect(save).not.toHaveBeenCalled()
    } finally { w.unmount() }
  })
  it.each([
    ['headings', '# 标题\n\n## 二级\n\n### 三级', '<h2'],
    ['lists', '- 第一项\n- 第二项\n\n1. 有序项', '<ul>'],
    ['tasks', '- [x] 已完成\n- [ ] 待办', 'checkbox'],
    ['table', '| 列一 | 列二 |\n| --- | --- |\n| 内容 | 数据 |', '<th>'],
    ['quote', '> 引用\n\n正文', '<blockquote>'],
    ['code', '```javascript\nconst value = 1\n```', 'language-javascript'],
    ['formula', '$x^2$\n\n$$\na+b\n$$', 'language-math'],
    ['footnote', '内容[^1]\n\n[^1]: 来源', '来源'],
    ['front matter', '---\ntitle: Example\n---\n\n正文', '正文'],
    ['mermaid', '```mermaid\nflowchart LR\nA-->B\n```', 'language-mermaid'],
    ['wiki link', '保留 [[关联笔记]] 与正文', '关联笔记']
  ])('renders and saves %s without converting source through HTML', async (_label, source, html) => {
    const active = note(); const w = await mountEditor(active)
    try {
      await switchMode(w, 'markdown'); editMarkdown(w, source); await w.vm.saveLatestContent()
      expect(active.contentMarkdown).toBe(source); expect(active.contentHtml).toContain(html)
      await switchMode(w, 'rich')
      expect(w.vm.editor.getMarkdown()).toBe(source)
      expect(active.contentMarkdown).not.toContain('<svg')
    } finally { w.unmount() }
  })
  it('inserts an image at the captured range after focus moves to a dialog', async () => {
    const w = await mountEditor({ ...note(), contentMarkdown: '前面 替换这里 后面' })
    try {
      await selectText(w, '替换这里')
      await w.get('[data-type="tiny-image"]').trigger('click')
      expect(w.vm.editor.insertMarkdown('![示例](https://example.com/a.png)')).toBe(true)
      await w.vm.saveLatestContent()
      expect(w.props('note').contentMarkdown).toBe('前面 ![示例](https://example.com/a.png) 后面')
    } finally { w.unmount() }
  })
  it('keeps table headers distinct from data cells', async () => {
    const w = await mountEditor({ ...note(), contentMarkdown: '| 标题 |\n| --- |\n| 内容 |' })
    try {
      expect(w.vm.editor.getHTML()).toContain('<th>标题</th>')
      expect(w.vm.editor.getHTML()).toContain('<td>内容</td>')
    } finally { w.unmount() }
  })
  it('sanitizes derived HTML and preserves Markdown source', async () => {
    const w = await mountEditor()
    try {
      const source = '安全内容\n\n<script>alert(1)</script>\n\n[链接](javascript:alert(1))'
      editMarkdown(w, source); await w.vm.saveLatestContent()
      expect(w.props('note').contentMarkdown).toBe(source)
      expect(w.props('note').contentHtml).not.toMatch(/<script|href="javascript:/)
    } finally { w.unmount() }
  })
  it('keeps first paragraphs independent from the name', async () => {
    const w = await mountEditor()
    try {
      editMarkdown(w, '正文开头\n\n## 章节'); await w.vm.saveLatestContent()
      expect(w.props('note').title).toBe('四种模式')
      expect(w.vm.editor.getHTML()).toContain('<p>正文开头</p>')
      expect(w.vm.editor.getHTML()).not.toContain('data-note-title')
    } finally { w.unmount() }
  })
})
