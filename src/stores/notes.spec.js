import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useNotesStore } from './notes'
import { invoke } from '../services/tauri'

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
    expect(note.contentMarkdown).toBe('')
    expect(store.activeId).toBe(note.id)
    await store.remove(note.id)
    expect(store.deleted.some(item => item.id === note.id)).toBe(true)
    await store.restore(note.id)
    expect(store.notes.some(item => item.id === note.id)).toBe(true)
  })

  it('creates a populated note from a conversation', async () => {
    const store = useNotesStore()
    await store.load()
    const note = await store.createFromContent({ title: '对话总结', contentHtml: '<h1>结论</h1>', contentText: '结论', contentMarkdown: '# 结论' })
    expect(note).toMatchObject({ title: '对话总结', contentHtml: '<h1>结论</h1>', contentText: '结论', contentMarkdown: '# 结论' })
    expect(store.activeId).toBe(note.id)
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
    expect(note.contentMarkdown).toBe('# Guide\n\n<script>alert(1)</script>')
  })

  it('supports context-menu note actions', async () => {
    const store = useNotesStore()
    await store.load()
    const note = await store.create()
    note.contentMarkdown = '# 保留源码\n'
    await store.save(note)
    await store.rename(note.id, '右键菜单笔记')
    const copy = await store.duplicate(note.id)
    expect(copy.title).toBe('右键菜单笔记 副本')
    expect(copy.contentMarkdown).toBe('# 保留源码\n')
    await store.move(copy.id, null)
    expect(store.notes.find(item => item.id === copy.id).notebookId).toBe(null)
    await store.remove(copy.id)
    await store.purge(copy.id)
    expect(store.deleted.some(item => item.id === copy.id)).toBe(false)
  })

  it('keeps Markdown in AI revisions and restores all three representations', async () => {
    const store = useNotesStore()
    await store.load()
    const note = await store.createFromContent({ title: '版本', contentHtml: '<p>旧版</p>', contentText: '旧版', contentMarkdown: '旧版源码' })
    const state = JSON.parse(localStorage.getItem('tiny-note-browser-state'))
    state.editProposals = [{ id: 'proposal-1', noteId: note.id, status: 'draft' }]
    localStorage.setItem('tiny-note-browser-state', JSON.stringify(state))

    const updated = await invoke('note_edit_apply', {
      proposalId: 'proposal-1',
      expectedUpdatedAt: note.updatedAt,
      contentHtml: '<h1>新版</h1>',
      contentText: '新版',
      contentMarkdown: '# 新版'
    })
    expect(updated).toMatchObject({ contentHtml: '<h1>新版</h1>', contentText: '新版', contentMarkdown: '# 新版' })

    const revisions = await invoke('note_revision_list', { noteId: note.id })
    expect(revisions[0]).toMatchObject({ contentHtml: '<p>旧版</p>', contentText: '旧版', contentMarkdown: '旧版源码' })
    const restored = await invoke('note_revision_restore', { id: revisions[0].id })
    expect(restored).toMatchObject({ contentHtml: '<p>旧版</p>', contentText: '旧版', contentMarkdown: '旧版源码' })
  })
})
