import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toRaw } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import type { Note } from '../types/domain'

const invokeMock = vi.hoisted(() => vi.fn())

vi.mock('../services/tauri', () => ({ invoke: invokeMock }))

import { useNotesStore } from './notes'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function noteFixture(): Note {
  return {
    id: 'note-1',
    notebookId: null,
    knowledgeBaseId: null,
    title: '初始标题',
    contentHtml: '<p>第一版</p>',
    contentText: '第一版',
    contentMarkdown: '第一版',
    pinned: false,
    version: 1,
    deletedAt: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z'
  }
}

describe('notes save queue', () => {
  afterEach(() => vi.useRealTimers())
  beforeEach(() => {
    setActivePinia(createPinia())
    invokeMock.mockReset()
  })

  it('serializes saves and does not overwrite edits made while a request is in flight', async () => {
    const firstResponse = deferred<Note>()
    const secondResponse = deferred<Note>()
    invokeMock
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise)

    const store = useNotesStore()
    store.notes.push(noteFixture())
    const note = store.notes[0]

    const firstSave = store.save(toRaw(note))
    await vi.waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1))
    expect(invokeMock.mock.calls[0][1].input).toMatchObject({ contentText: '第一版', version: 1 })

    note.title = '仍在输入'
    note.contentHtml = '<p>第二版</p>'
    note.contentText = '第二版'
    note.contentMarkdown = '第二版'
    const secondSave = store.save(note)

    expect(invokeMock).toHaveBeenCalledTimes(1)
    firstResponse.resolve({ ...noteFixture(), version: 2, updatedAt: '2026-09-01T00:00:01Z' })
    await firstSave

    expect(note).toMatchObject({ title: '仍在输入', contentText: '第二版', version: 2 })
    await vi.waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2))
    expect(invokeMock.mock.calls[1][1].input).toMatchObject({ title: '仍在输入', contentText: '第二版', version: 2 })

    secondResponse.resolve({
      ...noteFixture(),
      title: '仍在输入',
      contentHtml: '<p>第二版</p>',
      contentText: '第二版',
      contentMarkdown: '第二版',
      version: 3,
      updatedAt: '2026-09-01T00:00:02Z'
    })
    await secondSave

    expect(note).toMatchObject({ title: '仍在输入', contentText: '第二版', version: 3 })
    expect(store.saving).toBe(false)
    expect(store.pendingSaveCount).toBe(0)
  })

  it('automatically saves after typing stops and exposes pending, saving and saved states', async () => {
    vi.useFakeTimers()
    const store = useNotesStore()
    const note = noteFixture()
    const response = deferred<Note>()
    invokeMock.mockReturnValueOnce(response.promise)
    store.scheduleSave(note)
    expect(store.saveStates[note.id]?.status).toBe('pending')
    await vi.advanceTimersByTimeAsync(799)
    expect(invokeMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(store.saveStates[note.id]?.status).toBe('saving')
    response.resolve({ ...note, version: 2 })
    await vi.advanceTimersByTimeAsync(0)
    expect(store.saveStates[note.id]?.status).toBe('saved')
  })

  it('keeps failed edits and exposes a retryable save error', async () => {
    const store = useNotesStore()
    const note = noteFixture()
    invokeMock.mockRejectedValueOnce(new Error('网络暂时中断'))
    await expect(store.save(note)).rejects.toThrow('网络暂时中断')
    expect(store.saveStates[note.id]).toMatchObject({ status: 'error', error: '网络暂时中断' })
    expect(note.contentText).toBe('第一版')
    invokeMock.mockResolvedValueOnce({ ...note, version: 2 })
    await store.save(note)
    expect(store.saveStates[note.id]?.status).toBe('saved')
  })
})
