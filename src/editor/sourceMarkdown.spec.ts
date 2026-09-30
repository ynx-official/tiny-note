import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { createNoteExtensions } from './noteExtensions'
import { applyMarkdownSourceToEditor, markdownToEditorHtml, sanitizeEditorHtml } from '../utils/noteMarkdown'

describe('source preserving editor nodes', () => {
  it.each([
    '$$x^2 + \\frac{a}{b}$$',
    '$$\n\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}\n$$',
    '行内 $x_1 + x_2$ 公式',
    '公式 \\(x^2\\) 和 \\[x+y\\]',
    '> 引用内 $x^2$\n\n- 列表 $y_1$',
    '| 公式 |\n| --- |\n| $x^2$ |',
    '---\ntitle: Shared\n---\n\n正文',
    '[[Other#Section]] 和 ![[image.png]]',
    '正文[^1]\n\n[^1]: 脚注说明',
    '<details><summary>展开</summary>隐藏内容</details>'
  ])('retains syntax after rich edits and HTML reload: %s', source => {
    const editor = new Editor({ extensions: createNoteExtensions(), content: '<p></p>' })
    const restored = new Editor({ extensions: createNoteExtensions(), content: '<p></p>' })
    try {
      // Table alignment whitespace is canonicalized by the existing serializer;
      // validate its cells and exact formula instead of incidental pipe spacing.
      const expectedSource = source.startsWith('|') ? '$x^2$' : source
      expect(applyMarkdownSourceToEditor(editor, source)).toBe(true)
      editor.commands.insertContentAt(editor.state.doc.content.size, '<p>新增正文</p>')
      const markdown = editor.getMarkdown()
      expect(markdown).toContain(expectedSource)
      expect(markdown).toContain('新增正文')
      restored.commands.setContent(sanitizeEditorHtml(editor.getHTML()), { emitUpdate: false })
      expect(restored.getMarkdown()).toContain(expectedSource)
      restored.commands.setContent(sanitizeEditorHtml(markdownToEditorHtml(source)), { emitUpdate: false })
      expect(restored.getMarkdown()).toContain(expectedSource)
      if (source.startsWith('|')) {
        expect(restored.view.dom.querySelector('th')?.textContent).toBe('公式')
        expect(restored.view.dom.querySelector('td')?.textContent).toBe('$x^2$')
      }
    } finally { editor.destroy(); restored.destroy() }
  })

  it('keeps formula examples in code and literal prices as ordinary content', () => {
    const editor = new Editor({ extensions: createNoteExtensions(), content: '<p></p>' })
    try {
      applyMarkdownSourceToEditor(editor, '价格 $10 和 $20\n\n`$x$`\n\n```latex\n$$x$$\n```')
      expect(editor.getHTML()).not.toContain('data-markdown-source')
      expect(editor.getMarkdown()).toContain('$$x$$')
    } finally { editor.destroy() }
  })

  it('displays preserved HTML as inert source text', () => {
    const source = '<script>alert("never execute")</script>'
    const editor = new Editor({ extensions: createNoteExtensions(), content: '<p></p>' })
    try {
      editor.commands.setContent(sanitizeEditorHtml(markdownToEditorHtml(source)), { emitUpdate: false })
      expect(editor.view.dom.querySelector('script')).toBeNull()
      expect(editor.view.dom.textContent).toContain(source)
      expect(editor.getMarkdown()).toContain(source)
    } finally { editor.destroy() }
  })
})
