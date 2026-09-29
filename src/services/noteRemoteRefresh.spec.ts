import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useNotesStore } from '../stores/notes'
import type { Note } from '../types/domain'
import { cacheNoteBody, protectNoteDraft } from './noteCache'
import { invoke } from './tauri'
import { showToast } from './appFeedback'
import { NOTE_REMOTE_REFRESH_MS, startNoteRemoteRefresh, refreshRemoteNotes } from './noteRemoteRefresh'
import { useNoteSyncStore } from '../stores/noteSync'

vi.mock('./tauri', () => ({ invoke: vi.fn() }))
vi.mock('./appFeedback', () => ({ showToast: vi.fn() }))
const note = (version = 1): Note => ({ id: 'one', title: 'Title', notebookId: null, knowledgeBaseId: null, contentHtml: '<p>body</p>', contentText: 'body', contentMarkdown: 'body', pinned: false, version, deletedAt: null, createdAt: '', updatedAt: '' })
let stop = () => {}
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  setActivePinia(createPinia())
  vi.mocked(invoke).mockReset().mockImplementation(async command => command === 'note_get' ? note(2) : command === 'note_page'
    ? { items: [], total: 0, hasMore: false, nextCursor: '' } : [])
  vi.mocked(showToast).mockClear()
})
afterEach(() => { stop(); vi.restoreAllMocks(); vi.useRealTimers() })
function start(refreshOnStart = false) {
  const store = useNotesStore()
  cacheNoteBody(store, note())
  store.activeId = 'one'
  stop = startNoteRemoteRefresh(store, refreshOnStart)
  return store
}
const bodyReads = () => vi.mocked(invoke).mock.calls.filter(([command]) => command === 'note_get')

it('revalidates an already open note on returning to the workspace', async () => {
  const store = start(true)
  await flushPromises()
  expect(store.active?.version).toBe(2)
})

it('checks the active body every 30 seconds and keeps an unchanged editor object', async () => {
  const store = start()
  await vi.advanceTimersByTimeAsync(NOTE_REMOTE_REFRESH_MS)
  expect(store.active?.version).toBe(2)
  const current = store.active
  await vi.advanceTimersByTimeAsync(NOTE_REMOTE_REFRESH_MS)
  expect(bodyReads()).toHaveLength(2)
  expect(store.active).toBe(current)
})

it.each(['dirty', 'unparsed', 'saving', 'external'])('protects %s content without fetching or saving it', async mode => {
  const store = start()
  if (mode === 'dirty') store.active!.contentMarkdown = 'Local draft'
  if (mode === 'unparsed') protectNoteDraft(store.active!)
  if (mode === 'saving') store.saving = true
  if (mode === 'external') store.active!.external = true
  const current = store.active
  await vi.advanceTimersByTimeAsync(NOTE_REMOTE_REFRESH_MS)
  expect(bodyReads()).toHaveLength(0)
  expect(vi.mocked(invoke).mock.calls.some(([command]) => command === 'note_update')).toBe(false)
  expect(store.active).toBe(current)
  expect(store.active?.version).toBe(1)
})

it('preserves edits made while a remote body is being fetched', async () => {
  let resolve!: (value: Note) => void
  vi.mocked(invoke).mockReturnValueOnce(new Promise(done => { resolve = done }))
  const store = start(true)
  await flushPromises()
  store.active!.contentMarkdown = 'Typed during request'
  resolve(note(2))
  await flushPromises()
  expect(store.active).toMatchObject({ version: 1, contentMarkdown: 'Typed during request' })
})

it('suspends hidden/offline polling and refreshes on visibility or network recovery', async () => {
  const store = start()
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  await vi.advanceTimersByTimeAsync(NOTE_REMOTE_REFRESH_MS)
  expect(bodyReads()).toHaveLength(0)
  visibility.mockReturnValue('visible')
  document.dispatchEvent(new Event('visibilitychange'))
  await flushPromises()
  expect(store.active?.version).toBe(2)
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  await vi.advanceTimersByTimeAsync(NOTE_REMOTE_REFRESH_MS)
  expect(bodyReads()).toHaveLength(1)
  online.mockReturnValue(true)
  window.dispatchEvent(new Event('online'))
  await flushPromises()
  expect(bodyReads()).toHaveLength(2)
})

it('deduplicates resume events and releases listeners and timers on exit', async () => {
  let resolve!: (value: Note) => void
  vi.mocked(invoke).mockReturnValueOnce(new Promise(done => { resolve = done }))
  start(true)
  window.dispatchEvent(new Event('focus'))
  window.dispatchEvent(new Event('online'))
  await vi.advanceTimersByTimeAsync(NOTE_REMOTE_REFRESH_MS)
  expect(bodyReads()).toHaveLength(1)
  stop()
  resolve(note(2))
  await flushPromises()
  vi.mocked(invoke).mockClear()
  window.dispatchEvent(new Event('focus'))
  window.dispatchEvent(new Event('online'))
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(NOTE_REMOTE_REFRESH_MS)
  expect(invoke).not.toHaveBeenCalled()
})

it('discards a response after account reset and stops subsequent polling', async () => {
  let resolve!: (value: Note) => void
  vi.mocked(invoke).mockReturnValueOnce(new Promise(done => { resolve = done }))
  const store = start(true)
  await flushPromises()
  store.$reset()
  resolve(note(2))
  await flushPromises()
  await vi.advanceTimersByTimeAsync(NOTE_REMOTE_REFRESH_MS)
  expect(store.notes).toEqual([])
  expect(bodyReads()).toHaveLength(1)
  expect(showToast).not.toHaveBeenCalled()
})

it('keeps the selected note if another note is opened during validation', async () => {
  let resolve!: (value: Note) => void
  vi.mocked(invoke).mockReturnValueOnce(new Promise(done => { resolve = done }))
  const store = start(true)
  await flushPromises()
  cacheNoteBody(store, { ...note(), id: 'two' })
  store.activeId = 'two'
  resolve({ ...note(2), deletedAt: '2026-09-29' })
  await flushPromises()
  expect(store.activeId).toBe('two')
  expect(store.showDeleted).toBe(false)
})

it('makes a remotely deleted note read-only through the existing trash view', async () => {
  vi.mocked(invoke).mockResolvedValueOnce({ ...note(2), deletedAt: '2026-09-29' })
  const store = start(true)
  await flushPromises()
  expect(store.showDeleted).toBe(true)
})

it('keeps the last body on failure, exposes inline status without toasts and retries successfully', async () => {
  let reads = 0
  vi.mocked(invoke).mockImplementation(async command => {
    if (command === 'note_get') { if (++reads <= 2) throw new Error('offline'); return note(2) }
    return command === 'note_page' ? { items: [], total: 0, hasMore: false, nextCursor: '' } : []
  })
  const store = start(true)
  await flushPromises()
  await vi.advanceTimersByTimeAsync(NOTE_REMOTE_REFRESH_MS)
  expect(store.active?.version).toBe(1)
  expect(showToast).not.toHaveBeenCalled()
  expect(useNoteSyncStore().error).toBe('offline')
  await vi.advanceTimersByTimeAsync(NOTE_REMOTE_REFRESH_MS)
  expect(store.active?.version).toBe(2)
  expect(useNoteSyncStore().error).toBe('')
})

it('reschedules immediately for custom minutes and stops automatic checks when disabled', async () => {
  const store = start()
  const sync = useNoteSyncStore()
  sync.setPreferences({ enabled: true, interval: 2, unit: 'minutes' })
  await vi.advanceTimersByTimeAsync(119_999)
  expect(bodyReads()).toHaveLength(0)
  await vi.advanceTimersByTimeAsync(1)
  expect(bodyReads()).toHaveLength(1)
  sync.setPreferences({ enabled: false, interval: 2, unit: 'minutes' })
  window.dispatchEvent(new Event('focus'))
  await vi.advanceTimersByTimeAsync(240_000)
  expect(bodyReads()).toHaveLength(1)
  await refreshRemoteNotes(store)
  expect(bodyReads()).toHaveLength(2)
})
