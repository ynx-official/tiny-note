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

  it('acknowledges an Agent approval without waiting for the resumed event stream to finish', async () => {
    const run = { id: 'run-1', status: 'running' }
    apiRequest.mockResolvedValue(run)
    const connect = vi.fn(() => new Promise(() => {}))
    const channel = { connect, emit: vi.fn() }
    const { remoteInvoke } = await import('./remoteCommands')
    let settled = false

    const request = remoteInvoke('agent_resume', {
      request: { runId: 'run-1', toolCallId: 'tool-1', approvalHash: 'hash-1', decision: 'approve', reason: null },
      onEvent: channel as never
    }).then(value => { settled = true; return value })
    await vi.waitFor(() => expect(settled).toBe(true))

    await expect(request).resolves.toEqual(run)
    expect(apiRequest).toHaveBeenCalledWith('/agent/runs/run-1/resume', {
      method: 'POST',
      body: { runId: 'run-1', toolCallId: 'tool-1', approvalHash: 'hash-1', decision: 'approve', reason: null }
    })
    expect(connect).toHaveBeenCalledWith('run-1')
  })
})
