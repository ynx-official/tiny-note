import { reactive } from 'vue'
import { beforeEach, expect, it, vi } from 'vitest'
import { invoke } from './tauri'
import { assertNoteBody, cacheNoteBody, noteHasUnsavedChanges, protectNoteDraft, readNoteBody, trackPersistedNote, trimNoteCache, type NoteCacheState } from './noteCache'
import type { Note } from '../types/domain'

vi.mock('./tauri', () => ({ invoke: vi.fn() }))
const note = (id: string, version = 1): Note => ({ id, title: id, notebookId: 'book', knowledgeBaseId: null, contentHtml: '<p>body</p>', contentText: 'body', contentMarkdown: 'body', version, pinned: false, deletedAt: null, createdAt: '', updatedAt: '' })
const state = () => reactive<NoteCacheState>({ notes: [], deleted: [], activeId: null, cacheScope: {} })
beforeEach(() => vi.mocked(invoke).mockReset())

it('bounds clean bodies but keeps the active note and unsaved drafts', () => {
  const cache = state()
  cacheNoteBody(cache, note('active')); cache.activeId = 'active'
  cacheNoteBody(cache, note('draft'))
  cache.notes.find(item => item.id === 'draft')!.contentMarkdown = 'unsaved'
  for (let index = 0; index < 60; index++) cacheNoteBody(cache, note(String(index)))
  expect(cache.notes).toHaveLength(20)
  expect(cache.notes.map(item => item.id)).toContain('active')
  expect(cache.notes.find(item => item.id === 'draft')?.contentMarkdown).toBe('unsaved')
  expect(cache.notes.map(item => item.id)).not.toContain('0')
  trimNoteCache(cache, '', 20, 0)
  expect(cache.notes.map(item => item.id)).toEqual(['active', 'draft'])
})

it('does not treat an in-flight newer edit as persisted, including Vue proxies', () => {
  const cache = state()
  cacheNoteBody(cache, note('draft'))
  const draft = cache.notes[0]!
  expect(noteHasUnsavedChanges(draft)).toBe(false)
  draft.contentMarkdown = 'new edit'
  trackPersistedNote(draft, note('draft', 2))
  expect(noteHasUnsavedChanges(draft)).toBe(true)
  expect(cacheNoteBody(cache, note('draft', 3))).toBe(draft)
  expect(draft.contentMarkdown).toBe('new edit')
})

it('deduplicates detail requests and refreshes a clean cached version', async () => {
  const cache = state()
  let resolve!: (value: Note) => void
  vi.mocked(invoke).mockReturnValueOnce(new Promise(done => { resolve = done }))
  const first = readNoteBody(cache, 'one', 1)
  const second = readNoteBody(cache, 'one', 1)
  expect(invoke).toHaveBeenCalledOnce()
  resolve(note('one'))
  await Promise.all([first, second])
  await readNoteBody(cache, 'one', 1)
  expect(invoke).toHaveBeenCalledOnce()
  vi.mocked(invoke).mockResolvedValueOnce(note('one', 2))
  expect((await readNoteBody(cache, 'one', 2)).version).toBe(2)
  expect(invoke).toHaveBeenCalledTimes(2)
})

it('rejects a previous session response and never fetches external IDs from the cloud', async () => {
  const cache = state()
  let resolve!: (value: Note) => void
  vi.mocked(invoke).mockReturnValueOnce(new Promise(done => { resolve = done }))
  const pending = readNoteBody(cache, 'private')
  cache.cacheScope = {}
  resolve(note('private'))
  await expect(pending).rejects.toThrow('登录状态已变化')
  expect(cache.notes).toEqual([])
  await expect(readNoteBody(cache, 'external:file')).rejects.toThrow('外部来源历史')
  expect(invoke).toHaveBeenCalledOnce()
})

it('rejects directory summaries before a body save', () => {
  expect(() => assertNoteBody({ id: 'one', title: 'Summary', excerpt: 'body' } as unknown as Note)).toThrow('不能保存目录摘要')
})

it('protects source drafts before their parser updates the cached Note body', () => {
  const cache = state()
  cacheNoteBody(cache, note('unparsed'))
  protectNoteDraft(cache.notes[0]!)
  trimNoteCache(cache, '', 0, 0)
  expect(cache.notes[0]?.id).toBe('unparsed')
  trackPersistedNote(cache.notes[0]!)
  trimNoteCache(cache, '', 0, 0)
  expect(cache.notes).toEqual([])
})
