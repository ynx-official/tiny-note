import { describe, expect, it, vi } from 'vitest'
import { createAppUpdater } from './appUpdater'

describe('app updater', () => {
  it('reports browser previews as unsupported without loading native plugins', async () => {
    const invoke = vi.fn()
    const client = createAppUpdater({ isDesktop: () => false, invoke })

    await expect(client.check()).resolves.toEqual({ supported: false, available: false })
    expect(invoke).not.toHaveBeenCalled()
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
})
