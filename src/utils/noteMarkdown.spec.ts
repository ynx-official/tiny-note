import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NOTE_MODE,
  NOTE_MODES,
  clampSplitRatio,
  isRichClipboardHtml,
  markdownToEditorHtml,
  sanitizeEditorHtml,
  scrollOffset,
  scrollProgress,
  textFromEditorHtml
} from './noteMarkdown'

describe('note Markdown safety and mode helpers', () => {
  it('defines the three article experiences in the product order and defaults to instant editing', () => {
    expect(DEFAULT_NOTE_MODE).toBe('rich')
    expect(NOTE_MODES.map(mode => mode.id)).toEqual(['rich', 'markdown', 'reading'])
    expect(NOTE_MODES.map(mode => mode.label)).toEqual(['即时编辑', 'Markdown', '阅读模式'])
  })

  it('keeps supported presentation styles and removes executable content', () => {
    const html = sanitizeEditorHtml(`
      <script>alert(1)</script>
      <p onclick="steal()" style="color:#c2410c; background-color: rgb(255, 247, 237); text-align:center; position:fixed">安全内容</p>
      <a href="javascript:alert(1)" onmouseover="steal()">危险链接</a>
      <img src="data:text/html;base64,AAAA" onerror="steal()">
    `)

    expect(html).not.toContain('<script')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('onmouseover')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('data:text/html')
    expect(html).not.toContain('position')
    expect(html).toContain('color: #c2410c')
    expect(html).toContain('background-color: rgb(255, 247, 237)')
    expect(html).toContain('text-align: center')
  })

  it('keeps safe links and image URLs while dropping unknown elements', () => {
    const html = sanitizeEditorHtml('<custom-box>正文</custom-box><a href="https://example.com/a">链接</a><img src="https://example.com/a.png" alt="图"><ul data-type="taskList"><li data-type="taskItem" data-checked="true">任务</li></ul>')

    expect(html).not.toContain('custom-box')
    expect(html).toContain('正文')
    expect(html).toContain('href="https://example.com/a"')
    expect(html).toContain('src="https://example.com/a.png"')
    expect(html).toContain('data-type="taskList"')
    expect(html).toContain('data-checked="true"')
  })

  it('uses the Friday paste pipeline for Markdown quotes and empty table cells', () => {
    const html = markdownToEditorHtml('> 引用内容\n\n| 状态 | 说明 |\n| --- | --- |\n| 正常 | |')

    expect(html).toContain('<blockquote>')
    expect(html).toContain('<p>引用内容</p>')
    expect(html).toContain('<td>&nbsp;</td>')
  })

  it('preserves single line breaks only between consecutive plain blockquote lines', () => {
    const html = markdownToEditorHtml([
      '> 文档状态：Review（解释视图）',
      '> 最后更新：2026-08-26',
      '> 适用对象：业务负责人、产品、设计、研发、测试及各岗位执行人员',
      '> 权威依据：[端到端流程](../flow.md)',
      '> 关联文档：[管理系统 PRD](../prd.md) &#x20;'
    ].join('\n'))
    const ordinaryParagraph = markdownToEditorHtml('普通正文第一行\n普通正文第二行')
    const structuredQuote = markdownToEditorHtml('> - 第一项\n> - 第二项\n> ```text\n> 第一行\n> 第二行\n> ```')

    expect(html).toContain('<blockquote>')
    expect(html.match(/<br>/g)).toHaveLength(4)
    expect(html).toContain('<a href="../flow.md">端到端流程</a>')
    expect(ordinaryParagraph).not.toContain('<br>')
    expect(structuredQuote).not.toContain('<br>')
    expect(structuredQuote).toContain('<ul>')
    expect(structuredQuote).toContain('<pre><code class="language-text">第一行\n第二行')
  })

  it('keeps Mermaid as fenced source while rejecting persisted SVG markup', () => {
    const html = markdownToEditorHtml('```mermaid\nflowchart LR\nA --> B\n```')

    expect(html).toContain('class="language-mermaid"')
    expect(html).toContain('flowchart LR')
    expect(sanitizeEditorHtml(`${html}<svg onload="alert(1)"><script>alert(1)</script></svg>`)).not.toContain('<svg')
  })

  it('lets actual rich clipboard HTML use the browser paste parser', () => {
    expect(isRichClipboardHtml('<p><strong>富文本</strong></p>')).toBe(true)
    expect(isRichClipboardHtml('<p>## Markdown 标题</p>')).toBe(false)
  })

  it('clamps split ratios and converts scroll positions without divide-by-zero', () => {
    expect(clampSplitRatio(12)).toBe(30)
    expect(clampSplitRatio(55)).toBe(55)
    expect(clampSplitRatio(92)).toBe(70)
    expect(scrollProgress(250, 1000, 500)).toBe(0.5)
    expect(scrollProgress(10, 100, 100)).toBe(0)
    expect(scrollOffset(0.5, 800, 200)).toBe(300)
  })

  it('derives plain search and AI text from rendered HTML', () => {
    expect(textFromEditorHtml('<h1>标题</h1><p>正文 <strong>加粗</strong></p>')).toBe('标题\n正文 加粗')
  })
})
