import { beforeEach, expect, it, vi } from 'vitest'
import { createNotePageState, loadNotePage } from './notePage'
import { invoke } from './tauri'
import type { NotePage, NoteSummary } from '../types/domain'
vi.mock('./tauri', () => ({ invoke: vi.fn() }))
const item = (id: string) => ({ id, title: id, excerpt: 'summary' }) as NoteSummary
const page = (ids: string[], cursor = ''): NotePage => ({ items: ids.map(item), total: 3, hasMore: Boolean(cursor), nextCursor: cursor })
beforeEach(() => { vi.mocked(invoke).mockReset() })

it('keeps rows, totals and cursors visible while refreshing the same filter', async () => {
  const state = createNotePageState()
  vi.mocked(invoke).mockResolvedValueOnce({ ...page(['old'], 'next'), notebookCounts: { book: 3 } })
  await loadNotePage(state, { notebookId: 'book' })
  let resolve!: (value: NotePage) => void
  vi.mocked(invoke).mockReturnValueOnce(new Promise(done => { resolve = done }))
  const refresh = loadNotePage(state, { notebookId: 'book', search: undefined })
  expect(state.items.map(note => note.id)).toEqual(['old'])
  expect(state.total).toBe(3)
  expect(state.notebookCounts).toEqual({ book: 3 })
  expect(state.nextCursor).toBe('next')
  resolve(page(['new']))
  await refresh
  expect(state.items.map(note => note.id)).toEqual(['new'])
})

it('keeps a failed refresh visible and retries the first page, not its old next cursor', async () => {
  const state = createNotePageState()
  vi.mocked(invoke).mockResolvedValueOnce(page(['old'], 'next'))
  await loadNotePage(state, { notebookId: 'book' })
  vi.mocked(invoke).mockRejectedValueOnce(new Error('offline'))
  await loadNotePage(state)
  expect(state.items.map(note => note.id)).toEqual(['old'])
  expect(state.retryAppend).toBe(false)
  vi.mocked(invoke).mockResolvedValueOnce(page(['new']))
  await loadNotePage(state, state.filter, state.retryAppend)
  expect(invoke).toHaveBeenLastCalledWith('note_page', { notebookId: 'book', limit: 80, cursor: undefined })
})

it('never presents the previous filter results as the new filter', async () => {
  const state = createNotePageState()
  vi.mocked(invoke).mockResolvedValueOnce(page(['old']))
  await loadNotePage(state, { notebookId: 'old' })
  let resolve!: (value: NotePage) => void
  vi.mocked(invoke).mockReturnValueOnce(new Promise(done => { resolve = done }))
  const refresh = loadNotePage(state, { notebookId: 'new' })
  expect(state.items).toEqual([])
  expect(state.loaded).toBe(false)
  resolve(page(['new']))
  await refresh
  expect(state.loaded).toBe(true)
})

it('ignores stale pages after a filter change', async () => {
  const state = createNotePageState()
  let resolve!: (value: NotePage) => void
  vi.mocked(invoke).mockReturnValueOnce(new Promise(done => { resolve = done }))
  const first = loadNotePage(state, { tagId: 'old' })
  vi.mocked(invoke).mockResolvedValueOnce(page(['new']))
  await loadNotePage(state, { tagId: 'new' })
  resolve(page(['old'], 'old-cursor'))
  await first
  expect(state.items.map(note => note.id)).toEqual(['new'])
  expect(state.nextCursor).toBe('')
  expect(state.filter.tagId).toBe('new')
  expect(state.loading).toBe(false)
})

it('retains the next cursor after a failed request and deduplicates updated rows', async () => {
  const state = createNotePageState()
  vi.mocked(invoke).mockResolvedValueOnce(page(['1', '2'], 'next'))
  await loadNotePage(state, { search: 'deep body', limit: 2 })
  vi.mocked(invoke).mockRejectedValueOnce(new Error('offline'))
  expect(await loadNotePage(state, state.filter, true)).toBe(false)
  expect(state.items).toHaveLength(2)
  expect(state.nextCursor).toBe('next')
  vi.mocked(invoke).mockResolvedValueOnce(page(['2', '3']))
  await loadNotePage(state, state.filter, true)
  expect(invoke).toHaveBeenLastCalledWith('note_page', { search: 'deep body', limit: 2, cursor: 'next' })
  expect(state.items.map(note => note.id)).toEqual(['1', '2', '3'])
  expect(state.error).toBe('')
})
