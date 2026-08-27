import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown'

describe('renderMarkdown', () => {
  it('renders the structures used in assistant responses', () => {
    const html = renderMarkdown('# 标题\n\n- 项目\n\n| A | B |\n| - | - |\n| 1 | 2 |')

    expect(html).toContain('<h1>标题</h1>')
    expect(html).toContain('<li>项目</li>')
    expect(html).toContain('<table>')
  })

  it('adds a language header and copy control to fenced code', () => {
    const html = renderMarkdown('```javascript\nconst value = 1 < 2\n```')

    expect(html).toContain('class="markdown-code-block"')
    expect(html).toContain('javascript')
    expect(html).toContain('class="markdown-code-copy"')
    expect(html).toContain('&lt;')
  })

  it('labels fenced code without a language as auto', () => {
    const html = renderMarkdown('```\nconst value = 1\n```')

    expect(html).toContain('<span>auto</span>')
    expect(html).not.toContain('<span>text</span>')
  })

  it('marks blockquotes for the shared italic quote presentation', () => {
    const html = renderMarkdown('> 引用内容')

    expect(html).toContain('<blockquote class="markdown-blockquote">')
    expect(html).toContain('<p>引用内容</p>')
  })

  it('sanitizes unsafe model output', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">[危险链接](javascript:alert(1))')

    expect(html).not.toContain('onerror')
    expect(html).not.toContain('javascript:')
  })
})
