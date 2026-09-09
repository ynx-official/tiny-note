import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { openExternalDocument } from './externalDocument'
import { useNotesStore } from '../stores/notes'
import { flushPromises } from '@vue/test-utils'
import { cancelAppDialog, confirmAppDialog, feedbackState } from './appFeedback'

const mocks = vi.hoisted(() => ({ native: vi.fn(), api: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.native }))
vi.mock('./apiClient', () => ({ apiRequest: mocks.api, ApiError: class extends Error { constructor(public code: string, message: string) { super(message) } } }))

describe('desktop external document boundary', () => {
  beforeEach(() => {
    vi.stubEnv('MODE', 'production')
    setActivePinia(createPinia())
    window.__TAURI_INTERNALS__ = {} as never
    mocks.api.mockReset()
    mocks.native.mockReset()
    mocks.native.mockImplementation(async (command: string) => {
      if (command === 'external_markdown_bind') return { id: 'external:file', fingerprint: 'original', updatedAt: '2026-09-06T00:00:00Z' }
      if (command === 'external_markdown_write') return { id: 'external:file', fingerprint: 'saved', updatedAt: '2026-09-06T00:01:00Z' }
      if (command === 'external_markdown_list') return []
      if (command === 'external_markdown_clear') return 1
      throw new Error(`Unexpected native command: ${command}`)
    })
  })
  afterEach(() => { delete window.__TAURI_INTERNALS__; vi.unstubAllEnvs() })

  it.each([false, true])('requires a deliberate choice before replacing an unsaved external draft (reload=%s)', async reload => {
    const store = useNotesStore()
    const input = { path: '/notes/file.md', title: 'file', contentMarkdown: 'original', contentHtml: '<p>original</p>', contentText: 'original' }
    const original = await store.openExternalMarkdown(input)
    original.contentMarkdown = 'unsaved local draft'
    mocks.native.mockClear()
    const reopening = store.openExternalMarkdown({ ...input, contentMarkdown: 'changed on disk' })
    await flushPromises()
    expect(feedbackState.dialog.visible).toBe(true)
    expect(mocks.native).not.toHaveBeenCalled()
    if (reload) confirmAppDialog()
    else cancelAppDialog()
    const result = await reopening
    expect(result.contentMarkdown).toBe(reload ? 'changed on disk' : 'unsaved local draft')
    expect(store.active?.contentMarkdown).toBe(result.contentMarkdown)
    expect(mocks.native.mock.calls.some(([command]) => command === 'external_markdown_bind')).toBe(reload)
  })

  it('opens and saves a file without creating or updating a cloud note', async () => {
    const { remoteInvoke } = await import('./remoteCommands')
    const note = await remoteInvoke('note_open_external_markdown', { input: { path: '/notes/file.md', contentMarkdown: '# Original' } })
    const store = useNotesStore()
    store.notes.push(note)
    note.contentMarkdown = '# Changed\r\n'
    await store.save(note)
    expect(mocks.native).toHaveBeenCalledWith('external_markdown_write', { id: 'external:file', content: '# Changed\r\n', expectedFingerprint: 'original' })
    expect(note.externalFingerprint).toBe('saved')
    expect(store.listed).toEqual([])
    expect(await store.listLinks(note.id)).toEqual([])
    expect(mocks.api).not.toHaveBeenCalled()
  })

  it('keeps an in-flight edit and uses the new disk fingerprint for its next save', async () => {
    const note = await openExternalDocument({ path: '/notes/file.md', contentMarkdown: 'first' })
    let finish!: (value: unknown) => void
    mocks.native.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const store = useNotesStore()
    const saving = store.save(note)
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    note.contentMarkdown = 'newer draft'
    finish({ id: note.id, fingerprint: 'first-saved', updatedAt: 'now' })
    await saving
    expect(note.contentMarkdown).toBe('newer draft')
    await store.save(note)
    expect(mocks.native).toHaveBeenLastCalledWith('external_markdown_write', { id: note.id, content: 'newer draft', expectedFingerprint: 'first-saved' })
  })

  it('keeps drafts and the old fingerprint when a disk conflict refuses a save', async () => {
    const note = await openExternalDocument({ path: '/notes/file.md', contentMarkdown: 'original' })
    note.contentMarkdown = 'unsaved draft'
    mocks.native.mockRejectedValueOnce({ code: 'external_file_changed' })
    await expect(useNotesStore().save(note)).rejects.toMatchObject({ code: 'external_file_changed' })
    expect(note).toMatchObject({ contentMarkdown: 'unsaved draft', externalFingerprint: 'original' })
    expect(mocks.api).not.toHaveBeenCalled()
  })

  it('reopens unchanged files after a cold start using disk content, without cloud cache', async () => {
    const store = useNotesStore()
    mocks.native.mockImplementationOnce(async () => ({ path: '/notes/file.md', fileName: 'file.md', content: '# Disk', changed: false }))
    const note = await store.openExternalSource({ id: 'external:file', path: '/notes/file.md', fileName: 'file.md', title: 'file', updatedAt: '', available: true })
    expect(note).toMatchObject({ external: true, contentMarkdown: '# Disk' })
    expect(mocks.native.mock.calls.some(([command]) => command === 'note_get')).toBe(false)
    expect(mocks.api).not.toHaveBeenCalled()
  })

  it('clears only file history, without deleting files or cloud notes', async () => {
    const note = await openExternalDocument({ path: '/notes/file.md', contentMarkdown: 'original' })
    const store = useNotesStore()
    store.notes.push(note)
    store.externalSources = [{ id: note.id, path: '/notes/file.md', fileName: 'file.md', title: 'file', updatedAt: '', available: true }]
    mocks.native.mockClear()
    await store.clearExternalSources()
    expect(mocks.native.mock.calls.map(([command]) => command)).toEqual(['external_markdown_clear'])
    expect(mocks.api).not.toHaveBeenCalled()
    expect(store.notes).toEqual([])
  })

  it('creates a separate cloud copy only on explicit import', async () => {
    const note = await openExternalDocument({ path: '/notes/file.md', contentMarkdown: '# Local' })
    mocks.api.mockResolvedValueOnce({ ...note, id: 'cloud-copy', external: undefined, externalFingerprint: undefined, version: 1 }).mockResolvedValueOnce({ items: [], total: 0, hasMore: false, nextCursor: '' })
    const store = useNotesStore()
    store.notes.push(note)
    const imported = await store.importExternal(note)
    expect(imported.id).toBe('cloud-copy')
    expect(mocks.api).toHaveBeenCalledTimes(2)
    expect(mocks.api.mock.calls[1][0]).toMatch(/^\/notes\/page/)
    expect(mocks.api).toHaveBeenCalledWith('/notes', {
      method: 'POST', body: expect.objectContaining({ contentMarkdown: '# Local' })
    })
    expect(mocks.api.mock.calls[0][1].body).not.toHaveProperty('externalPath')
    expect(mocks.api.mock.calls[0][1].body).not.toHaveProperty('id')
    expect(note.id).toBe('external:file')
    expect(store.activeId).toBe('cloud-copy')
  })

  it('refuses cloud mutations and relations for local document identifiers', async () => {
    const { remoteInvoke } = await import('./remoteCommands')
    await expect(remoteInvoke('note_delete', { id: 'external:file', version: 1 })).rejects.toThrow('请先将外部文件导入')
    await expect(remoteInvoke('tag_note_add', { tagId: 'tag', noteIds: ['external:file'] })).rejects.toThrow('请先将外部文件导入')
    expect(mocks.api).not.toHaveBeenCalled()
  })
})
