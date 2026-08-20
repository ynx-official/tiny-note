import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLibraryStore } from './library'

describe('library store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('imports, navigates, previews, renames and removes local files', async () => {
    const store = useLibraryStore()
    const file = (name, content) => ({ name, text: async () => content })
    await store.load()
    await store.importText(file('guide.md', '# Guide\nhello'))
    expect(store.entries[0].name).toBe('guide.md')

    await store.createFolder('drafts')
    await store.navigate('drafts')
    await store.importText(file('note.txt', 'draft'))
    await store.rename('drafts/note.txt', 'renamed.txt')
    await store.openPreview('drafts/renamed.txt')

    expect(store.preview.content).toBe('draft')
    expect(store.preview.title).toBe('renamed.txt')
    expect(store.path).toBe('drafts')
    await store.goBack()
    expect(store.path).toBe('')
    await store.remove('drafts')
    expect(store.entries.some(entry => entry.name === 'drafts')).toBe(false)
  })

  it('adds a note reference as a collision-safe .note file', async () => {
    const store = useLibraryStore()
    await store.load()
    const result = await store.addNoteReference(store.activeId, {
      id: 'note-1',
      title: '设计/计划',
      contentHtml: '<p>hello</p>',
      updatedAt: '2026-08-20T00:00:00.000Z'
    })

    expect(result.name).toBe('设计计划.note')
    expect(store.entries.some(entry => entry.name === '设计计划.note')).toBe(true)
  })
})
