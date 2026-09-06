import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useNotesStore } from './notes'
import { invoke } from '../services/tauri'
import { noteSummary, trackPersistedNote } from '../services/noteCache'
import type { Note } from '../types/domain'

vi.mock('../services/tauri', () => ({ invoke: vi.fn() }))
const fullNote = (): Note => ({ id: 'one', title: 'one', notebookId: 'book', knowledgeBaseId: null, contentHtml: '<p>Full body</p>', contentText: 'Full body', contentMarkdown: 'Full body', version: 1, pinned: false, deletedAt: null, createdAt: '', updatedAt: '' })
beforeEach(() => { setActivePinia(createPinia()); vi.mocked(invoke).mockReset() })

it('loads summaries and notebook totals without fetching any full bodies', async () => {
  vi.mocked(invoke).mockImplementation(async command => {
    if (command === 'note_page') return { items: [noteSummary(fullNote())], total: 10000, notebookCounts: { book: 10000 }, hasMore: true, nextCursor: 'next' }
    if (command === 'note_purge_expired') return 0
    if (command === 'notebook_list' || command === 'external_markdown_list') return []
    if (command === 'note_get') return fullNote()
    throw new Error(`Unexpected full-list dependency: ${command}`)
  })
  const store = useNotesStore()
  await store.load()
  expect(store.notes).toEqual([])
  expect(store.catalog.total).toBe(10000)
  expect(store.listed[0]).not.toHaveProperty('contentMarkdown')
  expect(vi.mocked(invoke).mock.calls.map(([command]) => command)).not.toContain('note_get')
  const body = await store.getNote('one', 1)
  expect(body.contentMarkdown).toBe('Full body')
  expect(store.notes).toHaveLength(1)
  expect(invoke).toHaveBeenLastCalledWith('note_get', { id: 'one' })
})

it('renames from a summary without sending a body and preserves a dirty cached body', async () => {
  const store = useNotesStore()
  const body = fullNote()
  store.notes.push(body); trackPersistedNote(body)
  store.notes[0]!.contentMarkdown = 'Unsaved draft'
  store.catalog.items = [noteSummary(body)]
  vi.mocked(invoke).mockImplementation(async command => {
    if (command === 'note_update') return { ...body, title: 'Renamed', version: 2 }
    if (command === 'note_page') return { items: [], total: 0, hasMore: false, nextCursor: '' }
    throw new Error(`Unexpected: ${command}`)
  })
  await store.rename('one', 'Renamed')
  expect(invoke).toHaveBeenCalledWith('note_update', { id: 'one', input: { title: 'Renamed', version: 1 } })
  expect(store.notes[0]).toMatchObject({ contentMarkdown: 'Unsaved draft', title: 'Renamed', version: 2 })
  vi.mocked(invoke).mockClear()
  await expect(store.save(noteSummary(body) as unknown as Note)).rejects.toThrow('不能保存目录摘要')
  expect(invoke).not.toHaveBeenCalled()
})
