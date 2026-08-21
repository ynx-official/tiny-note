import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NOTE_MODE,
  NOTE_MODES,
  clampSplitRatio,
  sanitizeEditorHtml,
  scrollOffset,
  scrollProgress,
  textFromEditorHtml
} from './noteMarkdown'

describe('note Markdown safety and mode helpers', () => {
  it('defines the four modes in the product order and defaults to rich text', () => {
    expect(DEFAULT_NOTE_MODE).toBe('rich')
    expect(NOTE_MODES.map(mode => mode.id)).toEqual(['rich', 'split', 'source', 'read'])
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
