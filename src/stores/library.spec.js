import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLibraryStore } from './library'
import { invoke } from '../services/tauri'

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

  it('moves a note into the selected knowledge base', async () => {
    const store = useLibraryStore()
    await store.load()
    const note = await invoke('note_create', { input: { title: '设计计划', contentHtml: '<p>hello</p>' } })
    const result = await store.addNoteReference(store.activeId, note)

    expect(result.knowledgeBaseId).toBe(store.activeId)
    expect(note.knowledgeBaseId).toBe(store.activeId)
  })

  it('keeps binary imports intact and previews image data safely', async () => {
    const store = useLibraryStore()
    await store.load()
    const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10])
    await store.importFile({ name: 'cover.png', type: 'image/png', arrayBuffer: async () => bytes })
    await store.openPreview('cover.png')
    expect(store.preview.kind).toBe('image')
    expect(store.preview.content).toMatch(/^data:image\/png;base64,/)
  })
})
