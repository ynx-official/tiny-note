import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauriInvoke = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', () => ({ invoke: tauriInvoke }))

function envelope(data: unknown, status = 200, code: number | string = 0, msg = 'ok') {
  return new Response(JSON.stringify({ code, msg, data }), { status, headers: { 'Content-Type': 'application/json' } })
}

const loginToken = (accessToken: string) => ({
  token: accessToken,
  accessToken,
  tokenType: 'Bearer',
  expiresIn: 2_592_000
})

const authInfo = { user: { userId: 1, username: 'tiny', nickname: 'Tiny', avatar: '', email: '', phone: '', status: 'normal' }, roles: [], perms: [] }

describe('remote API authentication', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    tauriInvoke.mockReset()
    localStorage.clear()
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: undefined })
  })

  it('keeps the access token in memory and invalidates the session on 401 without refreshing', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(envelope(loginToken('access-old')))
      .mockResolvedValueOnce(envelope(authInfo))
      .mockResolvedValueOnce(envelope(null, 401, 401, 'expired'))
    vi.stubGlobal('fetch', fetchMock)
    const api = await import('./apiClient')

    await api.login('tiny', 'secret', false)
    await expect(api.apiRequest('/notes/note-1')).rejects.toMatchObject({ status: 401 })

    expect(new Headers(fetchMock.mock.calls[2]?.[1]?.headers).get('Authorization')).toBe('Bearer access-old')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(api.getAuthSnapshot().authenticated).toBe(false)
    expect(JSON.stringify(localStorage)).not.toContain('access-old')
  })

  it('restores a remembered access token from the OS credential store', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
    tauriInvoke.mockImplementation((command: string) => command === 'credential_get' ? 'remembered-token' : null)
    const fetchMock = vi.fn().mockResolvedValue(envelope(authInfo))
    vi.stubGlobal('fetch', fetchMock)
    const api = await import('./apiClient')
    await expect(api.restoreAuthSession()).resolves.toBe(true)
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer remembered-token')
    expect(api.getAuthSnapshot().authenticated).toBe(true)
  })

  it('maps HTTP 409 envelopes to the shared conflict error shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(envelope({ expectedVersion: 3 }, 409, 'edit_conflict', '笔记已在其他设备更新')))
    const { apiRequest } = await import('./apiClient')
    await expect(apiRequest('/notes/note-1', { method: 'PUT', body: { version: 2 } })).rejects.toMatchObject({
      name: 'ApiError', code: 'edit_conflict', status: 409, message: '笔记已在其他设备更新'
    })
  })

  it('does not persist access credentials when the OS secure store is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(envelope(loginToken('access')))
      .mockResolvedValueOnce(envelope(authInfo)))
    const api = await import('./apiClient')
    await expect(api.login('tiny', 'secret', true)).resolves.toEqual({ remembered: false })
    expect(tauriInvoke).not.toHaveBeenCalled()
    expect(JSON.stringify(localStorage)).not.toContain('access')
  })
})
