import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { applyMarkdownSourceToEditor } from '../utils/noteMarkdown'
import { createNoteExtensions } from './noteExtensions'

const editors = []
function createEditor(content = '<p></p>') {
  const editor = new Editor({ content, extensions: createNoteExtensions() })
  editors.push(editor)
  return editor
}

function typeText(editor, text) {
  for (const character of text) {
    const { from, to } = editor.state.selection
    let handled = false
    editor.view.someProp('handleTextInput', handler => {
      if (handler(editor.view, from, to, character)) handled = true
      return handled
    })
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(character, from, to))
  }
}

afterEach(() => editors.splice(0).forEach(editor => editor.destroy()))

describe('Tiny Note Markdown conversion', () => {
  it('keeps the Friday-style title node in Markdown and starts body text after Enter', () => {
    const editor = createEditor('<h1 data-note-title="true">标题</h1><p></p>')

    expect(editor.getHTML()).toContain('<h1 data-note-title="true">标题</h1>')
    expect(editor.getMarkdown()).toContain('# 标题')

    editor.commands.setTextSelection(3)
    editor.view.dom.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))

    expect(editor.getHTML()).toBe('<h1 data-note-title="true">标题</h1><p></p>')
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph')
  })

  it('round-trips Friday small body paragraphs without turning them into normal body text', () => {
    const editor = createEditor('<p data-small-text="true">辅助说明</p>')

    expect(editor.getHTML()).toContain('<p data-small-text="true">辅助说明</p>')
    const markdown = editor.getMarkdown()
    expect(markdown).toContain('<p data-small-text="true">辅助说明</p>')

    const restored = createEditor()
    restored.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false })
    expect(restored.getHTML()).toContain('<p data-small-text="true">辅助说明</p>')
  })

  it('applies Markdown shortcuts immediately in the instant editor', () => {
    const editor = createEditor('<p></p>')
    editor.commands.focus('start')
    typeText(editor, '# ')
    typeText(editor, '即时标题')

    expect(editor.getHTML()).toContain('<h1>即时标题</h1>')
    expect(editor.getMarkdown()).toContain('# 即时标题')
  })

  it('round-trips the supported GFM and TipTap extension syntax', () => {
    const source = [
      '# 指南',
      '',
      '- [x] 已完成',
      '- [ ] 待处理',
      '',
      '++下划线++和==高亮==',
      '',
      '```javascript',
      'const answer = 42',
      '```',
      '',
      '![封面](https://example.com/cover.png)',
      '',
      '| 名称 | 状态 |',
      '| --- | --- |',
      '| Tiny Note | 可用 |'
    ].join('\n')
    const editor = createEditor()

    expect(editor.commands.setContent(source, { contentType: 'markdown', emitUpdate: false })).toBe(true)
    expect(editor.getHTML()).toContain('data-type="taskList"')
    expect(editor.getHTML()).toContain('language-javascript')
    expect(editor.getHTML()).toContain('<table')

    const roundTrip = editor.getMarkdown()
    expect(roundTrip).toContain('# 指南')
    expect(roundTrip).toContain('- [x] 已完成')
    expect(roundTrip).toContain('++下划线++')
    expect(roundTrip).toContain('==高亮==')
    expect(roundTrip).toContain('```javascript')
    expect(roundTrip).toContain('![封面](https://example.com/cover.png)')
    expect(roundTrip).toMatch(/\| Tiny Note\s+\| 可用\s+\|/)
  })

  it('keeps Mermaid flowchart and native swimlane source intact through the editor', () => {
    const source = [
      '```mermaid',
      'swimlane-beta LR',
      '  accTitle: 报销审批泳道',
      '  subgraph employee [员工]',
      '    submit[提交报销]',
      '  end',
      '  subgraph manager [主管]',
      '    review{是否批准}',
      '  end',
      '  submit --> review',
      '```'
    ].join('\n')
    const editor = createEditor()

    expect(editor.commands.setContent(source, { contentType: 'markdown', emitUpdate: false })).toBe(true)
    expect(editor.getHTML()).toContain('language-mermaid')
    expect(editor.getHTML()).toContain('swimlane-beta LR')
    expect(editor.getMarkdown().trimEnd()).toBe(source)
  })

  it('preserves rich-only formatting as sanitized inline HTML', () => {
    const editor = createEditor('<p style="text-align: center"><span style="color: #dc2626">红色</span><mark data-color="#bae6fd" style="background-color: #bae6fd">高亮</mark>H<sub>2</sub>O x<sup>2</sup></p>')

    const markdown = editor.getMarkdown()
    expect(markdown).toContain('<p style="text-align: center">')
    expect(markdown).toContain('<span style="color: #dc2626">红色</span>')
    expect(markdown).toContain('<mark data-color="#bae6fd" style="background-color: #bae6fd">高亮</mark>')
    expect(markdown).toContain('<sub>2</sub>')
    expect(markdown).toContain('<sup>2</sup>')

    const restored = createEditor()
    restored.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false })
    expect(restored.getHTML()).toContain('text-align: center')
    expect(restored.getHTML()).toMatch(/color: (?:#dc2626|rgb\(220, 38, 38\))/)
    expect(restored.getHTML()).toContain('data-color="#bae6fd"')
    expect(restored.getHTML()).toContain('<sub>2</sub>')
    expect(restored.getHTML()).toContain('<sup>2</sup>')
  })

  it('uses HTML for complex tables so spans survive a round trip', () => {
    const editor = createEditor('<table><tbody><tr><th colspan="2"><p>标题</p></th></tr><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table>')

    const markdown = editor.getMarkdown()
    expect(markdown).toContain('<table>')
    expect(markdown).toContain('colspan="2"')

    const restored = createEditor()
    restored.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false })
    expect(restored.getHTML()).toContain('colspan="2"')
  })

  it('accepts every intermediate prefix of Markdown emitted by the editor', () => {
    const sources = [
      '<p style="text-align: center"><span style="color: #dc2626">红色</span></p>',
      '<table><tbody><tr><th colspan="2"><p>标题</p></th></tr><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table>',
      '- [x] 已完成\n- [ ] 待处理\n\n```javascript\nconst answer = 42\n```',
      '| 名称 | 状态 |\n| --- | --- |\n| Tiny Note | 可用 |'
    ]
    const editor = createEditor()
    const drafts = [
      '', ' ', '\n', '\n\n', '\t',
      '#', '# ', '## ', '-', '- ', '*', '* ', '+', '+ ', '1.', '1. ',
      '>', '> ', '```', '```js', '[', '[文字](', '![', '|', '| '
    ]

    for (const source of sources) {
      for (let length = 0; length <= source.length; length += 1) {
        drafts.push(source.slice(0, length), source.slice(length))
      }
      for (let index = 0; index < source.length; index += 1) drafts.push(source.slice(0, index) + source.slice(index + 1))
    }

    const failures = drafts.filter(draft => !applyMarkdownSourceToEditor(editor, draft))

    expect([...new Set(failures.map(JSON.stringify))]).toEqual([])
  })
})
