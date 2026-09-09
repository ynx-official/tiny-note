import { beforeEach, expect, it, vi } from 'vitest'
import { createNotePageState, loadNotePage } from './notePage'
import { invoke } from './tauri'
import type { NotePage, NoteSummary } from '../types/domain'
vi.mock('./tauri', () => ({ invoke: vi.fn() }))
const item = (id: string) => ({ id, title: id, excerpt: 'summary' }) as NoteSummary
const page = (ids: string[], cursor = ''): NotePage => ({ items: ids.map(item), total: 3, hasMore: Boolean(cursor), nextCursor: cursor })
beforeEach(() => { vi.mocked(invoke).mockReset() })

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
