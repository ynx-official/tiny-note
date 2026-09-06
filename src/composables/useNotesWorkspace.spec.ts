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

async function workspace() {
  let result!: NotesWorkspace
  const wrapper = mount(defineComponent({ setup() { result = useNotesWorkspace(); return () => h('div') } }), { global: { plugins: [createPinia()] } })
  await flushPromises()
  return { workspace: result, wrapper }
}
beforeEach(() => {
  mocks.route.query = {}
  mocks.invoke.mockReset().mockImplementation(async command => command === 'note_page' ? { items: [], total: 0, hasMore: false, nextCursor: '' } : [])
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
