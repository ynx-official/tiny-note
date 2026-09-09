import { beforeEach, describe, expect, it, vi } from 'vitest'

const bus = vi.hoisted(() => ({ handlers: new Map<string, (event: { payload: unknown }) => unknown>() }))
const credential = vi.hoisted(() => vi.fn().mockResolvedValue(null))
vi.mock('@tauri-apps/api/core', () => ({ invoke: credential }))
vi.mock('./deviceInfo', () => ({ collectDeviceReport: vi.fn().mockResolvedValue({}) }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, callback: (event: { payload: unknown }) => unknown, options: { target: string }) => {
    const key = `${options.target}:${name}`
    bus.handlers.set(key, callback)
    return () => bus.handlers.delete(key)
  }),
  emitTo: vi.fn(async (target: string, name: string, payload: unknown) => {
    await bus.handlers.get(`${target}:${name}`)?.({ payload })
  })
}))

const info = { user: { userId: 1, username: 'tiny' }, roles: [], perms: [] }
const response = (data: unknown, status = 200) => new Response(JSON.stringify({ code: status === 200 ? 0 : status, msg: 'expired', data }), { status })

describe('desktop window authentication', () => {
  beforeEach(() => {
    vi.resetModules()
    bus.handlers.clear()
    credential.mockReset().mockResolvedValue(null)
    localStorage.clear()
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
  })

  async function windows() {
    const fetchMock = vi.fn(async (url: string) => response(url.endsWith('/auth/login') ? { token: 'memory-token' } : url.endsWith('/auth/info') ? info : []))
    vi.stubGlobal('fetch', fetchMock)
    const main = await import('./apiClient')
    await main.initializeDesktopAuth('main')
    await main.login('tiny', 'secret', false)
    vi.resetModules() // A tray WebView has its own module-level memory.
    const tray = await import('./apiClient')
    return { main, tray, fetchMock }
  }

  it('authenticates a separately loaded tray without requiring remember-me or persistent storage', async () => {
    const { tray, fetchMock } = await windows()
    await tray.initializeDesktopAuth('tray-panel')
    await tray.apiRequest('/todos')
    expect(tray.getAuthSnapshot().authenticated).toBe(true)
    const call = fetchMock.mock.calls.find(([url]) => url.endsWith('/todos'))
    expect(new Headers((call as unknown as [string, RequestInit])[1].headers).get('Authorization')).toBe('Bearer memory-token')
    expect(credential.mock.calls.some(([name]) => name === 'credential_set')).toBe(false)
    expect(JSON.stringify(localStorage)).not.toContain('memory-token')
  })

  it('updates an already-open tray on login and logout', async () => {
    const { main, tray } = await windows()
    await tray.initializeDesktopAuth('tray-panel')
    await main.logout()
    expect(tray.getAuthSnapshot().authenticated).toBe(false)
    await main.login('tiny', 'secret', false)
    expect(tray.getAuthSnapshot().authenticated).toBe(true)
  })

  it('invalidates the main session when the tray receives 401', async () => {
    const { main, tray, fetchMock } = await windows()
    await tray.initializeDesktopAuth('tray-panel')
    fetchMock.mockResolvedValueOnce(response(null, 401))
    await expect(tray.apiRequest('/todos')).rejects.toMatchObject({ status: 401 })
    expect(main.getAuthSnapshot().authenticated).toBe(false)
    expect(tray.getAuthSnapshot().authenticated).toBe(false)
  })

  it('discards a response that arrives after the main window logs out', async () => {
    const { main, tray, fetchMock } = await windows()
    await tray.initializeDesktopAuth('tray-panel')
    let finish!: (value: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = tray.apiRequest('/todos')
    await main.logout()
    finish(response([{ id: 'private-todo' }]))
    await expect(pending).rejects.toMatchObject({ code: 'session_changed' })
  })

  it('does not let an old 401 invalidate a newly signed-in session', async () => {
    const { main, tray, fetchMock } = await windows()
    await tray.initializeDesktopAuth('tray-panel')
    let finish!: (value: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = tray.apiRequest('/todos')
    fetchMock.mockResolvedValueOnce(response({ token: 'new-session-token' }))
    await main.login('tiny', 'secret', false)
    finish(response(null, 401))
    await expect(pending).rejects.toMatchObject({ code: 'session_changed' })
    expect(main.getAuthSnapshot().authenticated).toBe(true)
    expect(tray.getAuthSnapshot().authenticated).toBe(true)
  })

  it('restores remembered authentication through the main window before handing it to the tray', async () => {
    credential.mockImplementation(async (name: string) => name === 'credential_get' ? 'remembered-token' : null)
    vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.endsWith('/auth/info') ? info : [])))
    const main = await import('./apiClient')
    await main.initializeDesktopAuth('main')
    vi.resetModules()
    const tray = await import('./apiClient')
    await tray.initializeDesktopAuth('tray-panel')
    expect(main.getAuthSnapshot().authenticated).toBe(true)
    expect(tray.getAuthSnapshot().authenticated).toBe(true)
    expect(credential.mock.calls.filter(([name]) => name === 'credential_get')).toHaveLength(1)
  })
})


