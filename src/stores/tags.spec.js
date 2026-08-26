import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { invoke } from '../services/tauri'
import { useNotesStore } from './notes'
import { useTagsStore } from './tags'

describe('normalized tags and notebook hierarchy', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('migrates embedded browser tags into entities and relations', async () => {
    const now = new Date().toISOString()
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({
      notebooks: [{ id: 'uncategorized', name: '未分类', description: '', createdAt: now, updatedAt: now }],
      notes: [{ id: 'note-1', notebookId: null, title: '旧笔记', contentHtml: '', contentText: '', contentMarkdown: '', tags: ['#项目', '项目'], pinned: false, deletedAt: null, createdAt: now, updatedAt: now }]
    }))

    const tags = await invoke('tag_list')
    const noteTags = await invoke('note_tag_list', { noteId: 'note-1' })
    const state = JSON.parse(localStorage.getItem('tiny-note-browser-state'))

    expect(tags).toEqual([expect.objectContaining({ name: '项目', noteCount: 1 })])
    expect(noteTags).toHaveLength(1)
    expect(state.notes[0].tags).toBeUndefined()
    expect(state.notes[0].notebookId).toBe('uncategorized')
  })

  it('adds and removes multiple notes without deleting their content', async () => {
    const notes = useNotesStore()
    const tags = useTagsStore()
    await notes.load()
    const first = await notes.createFromContent({ title: '一', contentText: '正文一' })
    const second = await notes.createFromContent({ title: '二', contentText: '正文二' })
    const tag = await tags.create('工作')

    await tags.addNotes(tag.id, [first.id, second.id])
    expect(tags.notes.map(note => note.id)).toEqual(expect.arrayContaining([first.id, second.id]))
    expect(tags.tags.find(item => item.id === tag.id)?.noteCount).toBe(2)

    await tags.removeNotes(tag.id, [first.id])
    expect((await invoke('note_get', { id: first.id })).contentText).toBe('正文一')
    await tags.remove(tag.id)
    expect((await invoke('note_get', { id: second.id })).contentText).toBe('正文二')
  })

  it('rejects notebook cycles and promotes children when a parent is deleted', async () => {
    const parent = await invoke('notebook_create', { name: '父级', description: '', parentId: null })
    const child = await invoke('notebook_create', { name: '子级', description: '', parentId: parent.id })
    const directNote = await invoke('note_create', { input: { title: '直属笔记', notebookId: parent.id, contentHtml: '', contentText: '', contentMarkdown: '', pinned: false } })

    await expect(invoke('notebook_move', { id: parent.id, parentId: child.id })).rejects.toThrow(/子笔记本|自身/)
    await invoke('notebook_delete', { id: parent.id })

    expect((await invoke('notebook_list')).find(book => book.id === child.id)?.parentId).toBeNull()
    expect((await invoke('note_get', { id: directNote.id })).notebookId).toBe('uncategorized')
  })
})
