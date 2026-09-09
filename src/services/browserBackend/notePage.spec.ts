import { expect, it } from 'vitest'
import { browserNotePage } from './notePage'
import type { BrowserState } from './types'

function corpus(): BrowserState {
  return { notes: Array.from({ length: 205 }, (_, index) => ({
    id: `note-${String(index).padStart(4, '0')}`, title: `标题 ${index}`, notebookId: 'book', knowledgeBaseId: 'kb',
    contentText: '字'.repeat(300) + (index === 42 ? 'needle' : ''), contentHtml: '<p>private body</p>', contentMarkdown: 'private body',
    createdAt: '2026-09-06T00:00:00Z', updatedAt: '2026-09-06T00:00:00Z', version: 1, pinned: index % 10 === 0, deletedAt: null
  })), noteTags: [] } as unknown as BrowserState
}
it('pages tied timestamps without body fields, duplicates or mutation of stored notes', () => {
  const state = corpus()
  const first = browserNotePage(state, { limit: 200 })
  const second = browserNotePage(state, { limit: 200, cursor: first.nextCursor })
  expect(first.total).toBe(205)
  expect(first.notebookCounts).toEqual({ book: 205 })
  expect(first.items).toHaveLength(200)
  expect(second.items).toHaveLength(5)
  expect(second.hasMore).toBe(false)
  expect(new Set([...first.items, ...second.items].map(note => note.id)).size).toBe(205)
  expect(first.items[0]!.excerpt).toHaveLength(200)
  expect(first.items[0]).not.toHaveProperty('contentMarkdown')
  first.items[0]!.title = 'changed preview'
  expect(state.notes.some(note => note.title === 'changed preview')).toBe(false)
  expect(() => browserNotePage(state, { cursor: first.nextCursor, search: '不同条件' })).toThrow('筛选条件')
})
it('searches full text while excluding external and deleted notes', () => {
  const state = corpus()
  expect(browserNotePage(state, { search: 'needle' }).items.map(note => note.id)).toEqual(['note-0042'])
  state.notes[42]!.externalPath = '/local.md'
  expect(browserNotePage(state, { search: 'needle' }).total).toBe(0)
  state.notes[0]!.deletedAt = '2026-09-06T00:00:00Z'
  expect(browserNotePage(state, { deleted: true }).items.map(note => note.id)).toEqual(['note-0000'])
  expect(() => browserNotePage(state, { limit: 201 })).toThrow('参数')
})
