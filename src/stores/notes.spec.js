import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useNotesStore } from './notes'

describe('notes store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.useFakeTimers()
    if (!crypto.randomUUID) crypto.randomUUID = () => 'test-note-id'
  })
  afterEach(() => vi.useRealTimers())

  it('creates and restores notes using the browser adapter', async () => {
    const store = useNotesStore()
    await store.load()
    const note = await store.create()
    expect(note.title).toBe('未命名笔记')
    expect(store.activeId).toBe(note.id)
    await store.remove(note.id)
    expect(store.deleted.some(item => item.id === note.id)).toBe(true)
    await store.restore(note.id)
    expect(store.notes.some(item => item.id === note.id)).toBe(true)
  })

  it('debounces updates at 800ms', async () => {
    const store = useNotesStore()
    await store.load()
    const note = await store.create()
    note.title = '稍后保存'
    store.scheduleSave(note)
    expect(store.saving).toBe(false)
    await vi.advanceTimersByTimeAsync(799)
    expect(store.saving).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(store.saving).toBe(false)
    expect(store.active.title).toBe('稍后保存')
  })

  it('renders markdown imports and strips unsafe html', async () => {
    const store = useNotesStore()
    await store.load()
    const note = await store.importText({ name: 'guide.md', text: async () => '# Guide\n\n<script>alert(1)</script>' })
    expect(note.contentHtml).toContain('<h1>Guide</h1>')
    expect(note.contentHtml).not.toContain('<script>')
  })
})
