import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, expect, it, vi } from 'vitest'
import { useNotesWorkspace, type NotesWorkspace } from './useNotesWorkspace'
import { cacheNoteBody } from '../services/noteCache'
import type { Note } from '../types/domain'

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), route: { query: {} as Record<string, string> } }))
vi.mock('../services/tauri', () => ({ invoke: mocks.invoke }))
vi.mock('vue-router', () => ({ useRoute: () => mocks.route, useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
const note = (id: string): Note => ({ id, title: id, notebookId: null, knowledgeBaseId: null, contentHtml: `<p>${id}</p>`, contentText: id, contentMarkdown: id, pinned: false, version: 1, deletedAt: null, createdAt: '', updatedAt: '' })

async function workspace(pinia = createPinia()) {
  let result!: NotesWorkspace
  const wrapper = mount(defineComponent({ setup() { result = useNotesWorkspace(); return () => h('div') } }), { global: { plugins: [pinia] } })
  await flushPromises()
  return { workspace: result, wrapper }
}
beforeEach(() => {
  mocks.route.query = {}
  mocks.invoke.mockReset().mockImplementation(async command => command === 'note_page' ? { items: [], total: 0, hasMore: false, nextCursor: '' } : [])
})

it('opens the initial article without waiting for templates, tags or expired-trash maintenance', async () => {
  const pending: Array<() => void> = []
  mocks.invoke.mockImplementation(command => {
    if (command === 'note_template_list' || command === 'tag_list' || command === 'note_purge_expired') return new Promise(resolve => pending.push(() => resolve([])))
    if (command === 'note_page') return Promise.resolve({ items: [{ id: 'first', version: 1 }], total: 1, hasMore: false, nextCursor: '' })
    if (command === 'note_get') return Promise.resolve(note('first'))
    return Promise.resolve([])
  })
  const { workspace: work, wrapper } = await workspace()
  try { expect(work.store.activeId).toBe('first') }
  finally { pending.forEach(resolve => resolve()); await flushPromises(); wrapper.unmount() }
})

it('keeps the trash view read-only after leaving and returning', async () => {
  const pinia = createPinia()
  const first = await workspace(pinia)
  first.workspace.showDeleted.value = true
  first.wrapper.unmount()
  const second = await workspace(pinia)
  expect(second.workspace.showDeleted.value).toBe(true)
  second.wrapper.unmount()
})

it('restores expanded folders and sidebar position on return without refreshing a fresh catalog', async () => {
  const pinia = createPinia()
  const first = await workspace(pinia)
  await first.workspace.toggleNotebook('book')
  first.workspace.store.sidebarScrollTop = 120
  await flushPromises()
  first.wrapper.unmount()
  mocks.invoke.mockClear()
  const second = await workspace(pinia)
  try {
    expect(second.workspace.expandedNotebookIds.value.has('book')).toBe(true)
    expect(second.workspace.store.sidebarScrollTop).toBe(120)
    expect(mocks.invoke.mock.calls.map(([command]) => command)).not.toContain('notebook_list')
    second.workspace.store.$reset()
    expect(second.workspace.expandedNotebookIds.value.size).toBe(0)
    expect(second.workspace.store.sidebarScrollTop).toBe(0)
  } finally { second.wrapper.unmount() }
})

it('ends body loading before the containing folder page arrives', async () => {
  const { workspace: work, wrapper } = await workspace()
  work.store.notebooks = [{ id: 'book', name: 'Book', parentId: null, description: '', createdAt: '', updatedAt: '' }]
  let finish!: (value: unknown) => void
  mocks.invoke.mockImplementation(command => command === 'note_get'
    ? Promise.resolve({ ...note('next'), notebookId: 'book' })
    : new Promise(resolve => { finish = resolve }))
  const selection = work.selectNote({ id: 'next' })
  await flushPromises()
  try {
    expect(work.store.activeId).toBe('next')
    expect(work.bodyLoading.value).toBe(false)
  } finally {
    finish({ items: [], total: 0, hasMore: false, nextCursor: '' })
    await selection
    wrapper.unmount()
  }
})

it('keeps the current editor when its draft cannot be saved, and does not fetch the next body', async () => {
  const { workspace: work, wrapper } = await workspace()
  cacheNoteBody(work.store, note('current')); work.store.activeId = 'current'
  work.noteEditorRef.value = { saveLatestContent: vi.fn(async () => false) }
  mocks.invoke.mockClear()
  await work.selectNote({ id: 'next' })
  expect(work.store.activeId).toBe('current')
  expect(mocks.invoke).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('returns to all notes with no search, pinned or notebook filters and preserves the view on return', async () => {
  const pinia = createPinia()
  const { workspace: work, wrapper } = await workspace(pinia)
  cacheNoteBody(work.store, note('current')); work.store.activeId = 'current'
  work.store.selectedNotebook = 'book'
  work.store.selectedTreeNode = { type: 'note', id: 'current' }
  work.store.search = 'filtered'
  work.query.value = 'filtered'
  work.store.pinnedOnly = true
  work.showDeleted.value = true
  work.bodyError.value = 'old error'
  const save = vi.fn(async () => true)
  work.noteEditorRef.value = { saveLatestContent: save }
  mocks.invoke.mockClear()
  await work.selectAllNotes()
  expect(save).toHaveBeenCalledOnce()
  expect(work.store.activeId).toBeNull()
  expect(work.store.selectedTreeNode).toEqual({ type: 'all', id: 'all' })
  expect(work.store.selectedNotebook).toBe('all')
  expect(work.showDeleted.value).toBe(false)
  expect(work.bodyError.value).toBe('')
  expect(work.query.value).toBe('')
  expect(work.store.search).toBe('')
  expect(work.store.pinnedOnly).toBe(false)
  expect(mocks.invoke).toHaveBeenCalledWith('note_page', expect.objectContaining({ search: undefined, pinned: undefined, cursor: undefined }))
  work.store.catalog.items = [note('current')]
  wrapper.unmount()
  const returned = await workspace(pinia)
  expect(returned.workspace.store.activeId).toBeNull()
  expect(returned.workspace.store.selectedTreeNode.type).toBe('all')
  returned.wrapper.unmount()
})

it('stays in the editor when saving fails before opening all notes', async () => {
  const { workspace: work, wrapper } = await workspace()
  cacheNoteBody(work.store, note('current')); work.store.activeId = 'current'
  work.store.selectedTreeNode = { type: 'note', id: 'current' }
  work.noteEditorRef.value = { saveLatestContent: vi.fn(async () => false) }
  mocks.invoke.mockClear()
  await work.selectAllNotes()
  expect(work.store.activeId).toBe('current')
  expect(work.store.selectedTreeNode).toEqual({ type: 'note', id: 'current' })
  expect(mocks.invoke).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('does not reopen a pending article after switching to all notes', async () => {
  const { workspace: work, wrapper } = await workspace()
  let resolve!: (value: Note) => void
  mocks.invoke.mockImplementation(command => command === 'note_get'
    ? new Promise(done => { resolve = done })
    : Promise.resolve({ items: [], total: 0, hasMore: false, nextCursor: '' }))
  const pending = work.selectNote({ id: 'slow' })
  await flushPromises()
  await work.selectAllNotes()
  resolve(note('slow'))
  await pending
  expect(work.store.activeId).toBeNull()
  expect(work.store.selectedTreeNode.type).toBe('all')
  expect(work.bodyLoading.value).toBe(false)
  wrapper.unmount()
})

it('keeps the previous body visible during loading and only opens the latest selection', async () => {
  const { workspace: work, wrapper } = await workspace()
  cacheNoteBody(work.store, note('current')); work.store.activeId = 'current'
  const save = vi.fn(async () => true)
  work.noteEditorRef.value = { saveLatestContent: save }
  const responses = new Map<string, (value: Note) => void>()
  mocks.invoke.mockImplementation((command, args) => {
    if (command === 'note_get') return new Promise(resolve => responses.set(args.id, resolve))
    throw new Error(`Unexpected: ${command}`)
  })
  const first = work.selectNote({ id: 'slow' }); await flushPromises()
  expect(work.store.active?.id).toBe('current')
  const second = work.selectNote({ id: 'latest' }); await flushPromises()
  responses.get('latest')!(note('latest')); await second
  responses.get('slow')!(note('slow')); await first
  expect(work.store.active?.id).toBe('latest')
  expect(work.bodyLoading.value).toBe(false)
  expect(save).toHaveBeenCalledTimes(2)
  wrapper.unmount()
})

it('opens a deep link absent from the first summary page and retries a failed detail fetch', async () => {
  mocks.route.query.note = 'beyond-first-page'
  mocks.invoke.mockImplementation(async command => {
    if (command === 'note_get') throw new Error('offline')
    if (command === 'note_page') return { items: [], total: 10000, hasMore: true, nextCursor: 'next' }
    return []
  })
  const { workspace: work, wrapper } = await workspace()
  expect(work.bodyError.value).toBe('offline')
  expect(work.store.active).toBeNull()
  mocks.invoke.mockResolvedValueOnce(note('beyond-first-page'))
  work.retryNote(); await flushPromises()
  expect(work.store.active?.id).toBe('beyond-first-page')
  expect(work.bodyError.value).toBe('')
  expect(work.store.catalog.total).toBe(10000)
  wrapper.unmount()
})

it('does not open a note if the initial catalog arrives after the workspace unmounts', async () => {
  let resolve!: (value: unknown) => void
  mocks.invoke.mockImplementation(command => command === 'note_page' ? new Promise(done => { resolve = done }) : Promise.resolve([]))
  const { workspace: work, wrapper } = await workspace()
  wrapper.unmount()
  resolve({ items: [{ id: 'late', version: 1 }], total: 1, hasMore: false, nextCursor: '' })
  await flushPromises()
  expect(work.store.activeId).toBeNull()
  expect(mocks.invoke.mock.calls.map(([command]) => command)).not.toContain('note_get')
})
