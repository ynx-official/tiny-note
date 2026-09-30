import { describe, expect, it } from 'vitest'
import { applyMarkdownProposal, mapMarkdownSelection } from './markdownSelection'

describe('Markdown AI selection', () => {
  it('maps a repeated selection by position through harmless normalization', () => {
    const original = '# 标题\r\n\r\n重复\r\n\r\n重复'
    const canonical = '# 标题\n\n重复\n\n重复\n'
    const from = canonical.lastIndexOf('重复')
    const range = mapMarkdownSelection(canonical, original, from, from + 2)
    expect(range).toMatchObject({ from: original.lastIndexOf('重复'), to: original.length, text: '重复' })
    expect(applyMarkdownProposal(original, '新内容', 'replace', range)).toBe('# 标题\r\n\r\n重复\r\n\r\n新内容')
  })
  it('keeps surrounding inline syntax, metadata, formulas and footnotes', () => {
    const source = '---\ntitle: test\n---\n\n**重点内容**\n\n$x^2$[^1]\n\n[^1]: 来源'
    const from = source.indexOf('重点内容')
    const range = { from, to: from + 4, text: '重点内容', source }
    expect(applyMarkdownProposal(source, '核心内容', 'replace', range)).toBe(source.replace('重点内容', '核心内容'))
    expect(applyMarkdownProposal(source, '补充', 'insert', range)).toBe(source.replace('重点内容', '重点内容补充'))
  })
  it('rejects stale selection and ambiguous legacy proposals', () => {
    expect(() => applyMarkdownProposal('内容已改变', 'AI', 'replace', { from: 0, to: 2, text: '内容', source: '内容旧版' })).toThrow('文章已经发生变化')
    expect(() => applyMarkdownProposal('重复\n\n重复', 'AI', 'replace', { from: 99, to: 101, text: '重复' })).toThrow('选区')
  })
  it('recovers an unambiguous legacy selection by its original text', () => {
    expect(applyMarkdownProposal('# 标题\n\n正文', '修改', 'replace', { from: 5, to: 7, text: '正文' })).toBe('# 标题\n\n修改')
  })
  it('never treats an invalid partial selection as a whole-document replacement', () => {
    expect(() => applyMarkdownProposal('原文', 'AI', 'replace', { from: 1, to: 99, text: '丢失的段落' })).toThrow('选区')
    expect(() => applyMarkdownProposal('原文', 'AI', 'insert', null)).toThrow('插入位置')
    expect(applyMarkdownProposal('原文', 'AI', 'replace', null)).toBe('AI')
  })
})
