import { describe, expect, it } from 'vitest'
import { isConversationSummaryIntent, isNoteEditIntent, parseNoteCommand } from './noteChatCommands'

describe('note chat commands', () => {
  it('recognizes conversation summaries without treating them as empty notes', () => {
    expect(isConversationSummaryIntent('把这段对话总结为笔记')).toBe(true)
    expect(parseNoteCommand('把这段对话总结为笔记')).toBe(null)
  })

  it('parses note creation with a title and content', () => {
    expect(parseNoteCommand('创建笔记《发布计划》，内容：周五完成验收。')).toEqual({
      action: 'create', title: '发布计划', content: '周五完成验收。'
    })
  })

  it('parses safe operations for a referenced note', () => {
    expect(parseNoteCommand('把它重命名为 周报')).toEqual({ action: 'rename', value: '周报' })
    expect(parseNoteCommand('复制这篇笔记')).toEqual({ action: 'duplicate' })
    expect(parseNoteCommand('删除这篇笔记')).toEqual({ action: 'delete' })
    expect(parseNoteCommand('移动到 工作 笔记本')).toEqual({ action: 'move', value: '工作' })
  })

  it('recognizes edits that should use the proposal review flow', () => {
    expect(isNoteEditIntent('给这篇笔记追加一个结论')).toBe(true)
  })
})
