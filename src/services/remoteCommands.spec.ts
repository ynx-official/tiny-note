import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiRequest = vi.hoisted(() => vi.fn())

vi.mock('./apiClient', () => ({
  apiRequest,
  ApiError: class extends Error {
    constructor(public code: string | number, message: string, public status: number) { super(message) }
  }
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

describe('remote command optimistic versions', () => {
  beforeEach(() => apiRequest.mockReset())

  it('submits the editor version without fetching and replacing it', async () => {
    apiRequest.mockResolvedValue({ id: 'note-1', version: 4 })
    const { remoteInvoke } = await import('./remoteCommands')

    await remoteInvoke('note_update', { id: 'note-1', input: { title: 'stale editor content', version: 3 } })

    expect(apiRequest).toHaveBeenCalledTimes(1)
    expect(apiRequest).toHaveBeenCalledWith('/notes/note-1', {
      method: 'PUT', body: { title: 'stale editor content', version: 3 }
    })
  })
})
