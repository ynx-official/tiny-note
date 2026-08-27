import { describe, expect, it, vi } from 'vitest'
import packageMetadata from '../../package.json'
import { BUNDLED_APP_VERSION, createAppUpdater, UPDATE_CHECKED_AT_KEY, UPDATE_CHECK_INTERVAL_MS } from './appUpdater'

describe('app updater', () => {
  it('uses the package version as the browser fallback', async () => {
    const client = createAppUpdater({ isDesktop: () => false })

    await expect(client.currentVersion()).resolves.toBe(packageMetadata.version)
    expect(BUNDLED_APP_VERSION).toBe(packageMetadata.version)
  })

  it('reports browser previews as unsupported without loading native plugins', async () => {
    const invoke = vi.fn()
    const client = createAppUpdater({ isDesktop: () => false, invoke })

    await expect(client.check()).resolves.toEqual({ supported: false, available: false })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('clears a synchronously completed check before the next environment check', async () => {
    const isDesktop = vi.fn().mockReturnValueOnce(false).mockReturnValue(true)
    const invoke = vi.fn(async () => ({ available: false, supported: true, version: '0.1.10', notes: '' }))
    const client = createAppUpdater({ isDesktop, invoke })

    await expect(client.check()).resolves.toMatchObject({ supported: false })
    await expect(client.check()).resolves.toMatchObject({ supported: true, version: '0.1.10' })
    expect(invoke).toHaveBeenCalledOnce()
  })

  it('keeps a checked update for a later user-approved install', async () => {
    const invoke = vi.fn(async () => {})
    const client = createAppUpdater({
      isDesktop: () => true,
      invoke
    })
    invoke.mockImplementationOnce(async () => ({ available: true, supported: true, version: '0.2.0', notes: 'Improvements', assetName: 'Tiny Note_0.2.0_aarch64.dmg' }))

    await expect(client.check()).resolves.toMatchObject({ supported: true, available: true, version: '0.2.0' })
    const progress = []
    await client.downloadAndInstall(value => progress.push(value))

    expect(invoke).toHaveBeenLastCalledWith('app_update_download', { assetName: 'Tiny Note_0.2.0_aarch64.dmg', version: '0.2.0' })
    expect(progress).toEqual([0, 100])
  })

  it('does not install when no update was checked', async () => {
    const client = createAppUpdater({ isDesktop: () => true })
    await expect(client.downloadAndInstall()).rejects.toThrow('No pending update')
  })

  it('clears the pending update after installation', async () => {
    const invoke = vi.fn(async () => {})
    const client = createAppUpdater({
      isDesktop: () => true,
      invoke
    })
    invoke.mockResolvedValueOnce({ available: true, supported: true, version: '0.2.0', notes: '', assetName: 'Tiny Note_0.2.0_aarch64.dmg' })

    await client.check()
    expect(client.hasPendingUpdate()).toBe(true)
    await client.downloadAndInstall()

    expect(client.hasPendingUpdate()).toBe(false)
    await expect(client.downloadAndInstall()).rejects.toThrow('No pending update')
  })

  it('clears the pending update when installation fails', async () => {
    const invoke = vi.fn()
    const client = createAppUpdater({
      isDesktop: () => true,
      invoke
    })

    invoke.mockResolvedValueOnce({ available: true, supported: true, version: '0.2.0', notes: '', assetName: 'Tiny Note_0.2.0_aarch64.dmg' })
    invoke.mockRejectedValueOnce(new Error('network'))
    await client.check()
    await expect(client.downloadAndInstall()).rejects.toThrow('network')
    expect(client.hasPendingUpdate()).toBe(false)
  })

  it('throttles automatic checks but keeps manual checks available', async () => {
    const storage = { getItem: vi.fn(() => String(Date.now())), setItem: vi.fn() }
    const invoke = vi.fn()
    const client = createAppUpdater({ isDesktop: () => true, invoke, storage })

    await expect(client.check({ force: false })).resolves.toMatchObject({ skipped: true })
    expect(invoke).not.toHaveBeenCalled()

    invoke.mockResolvedValueOnce({ available: false, supported: true, version: '0.1.8', notes: '' })
    await expect(client.check({ force: true })).resolves.toMatchObject({ available: false })
    expect(storage.setItem).toHaveBeenCalledWith(UPDATE_CHECKED_AT_KEY, expect.any(String))
  })

  it('does not throttle a check after the interval expires', async () => {
    const storage = { getItem: vi.fn(() => String(Date.now() - UPDATE_CHECK_INTERVAL_MS - 1)), setItem: vi.fn() }
    const invoke = vi.fn(async () => ({ available: false, supported: true, version: '0.1.8', notes: '' }))
    const client = createAppUpdater({ isDesktop: () => true, invoke, storage })

    await client.check({ force: false })
    expect(invoke).toHaveBeenCalledOnce()
  })

  it('does not start the six-hour cooldown when checking fails', async () => {
    const storage = { getItem: vi.fn(() => '0'), setItem: vi.fn() }
    const invoke = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ available: false, supported: true, version: '0.1.10', notes: '' })
    const client = createAppUpdater({ isDesktop: () => true, invoke, storage })

    await expect(client.check({ force: false })).rejects.toThrow('offline')
    expect(storage.setItem).not.toHaveBeenCalled()
    await expect(client.check({ force: false })).resolves.toMatchObject({ available: false })
    expect(invoke).toHaveBeenCalledTimes(2)
  })
})
