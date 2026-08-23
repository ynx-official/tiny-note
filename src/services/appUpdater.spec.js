import { describe, expect, it, vi } from 'vitest'
import { createAppUpdater } from './appUpdater'

describe('app updater', () => {
  it('reports browser previews as unsupported without loading native plugins', async () => {
    const loadUpdater = vi.fn()
    const client = createAppUpdater({ isDesktop: () => false, loadUpdater })

    await expect(client.check()).resolves.toEqual({ supported: false, available: false })
    expect(loadUpdater).not.toHaveBeenCalled()
  })

  it('keeps a checked update for a later user-approved install', async () => {
    const downloadAndInstall = vi.fn(async callback => {
      callback({ event: 'Started', data: { contentLength: 100 } })
      callback({ event: 'Progress', data: { chunkLength: 25 } })
      callback({ event: 'Finished' })
    })
    const client = createAppUpdater({
      isDesktop: () => true,
      loadUpdater: async () => ({ check: async () => ({ version: '0.2.0', body: 'Improvements', date: '2026-08-21', downloadAndInstall }) })
    })

    await expect(client.check()).resolves.toMatchObject({ supported: true, available: true, version: '0.2.0' })
    const progress = []
    await client.downloadAndInstall(value => progress.push(value))

    expect(downloadAndInstall).toHaveBeenCalledOnce()
    expect(progress).toEqual([0, 25, 100])
  })

  it('does not install when no update was checked', async () => {
    const client = createAppUpdater({ isDesktop: () => true })
    await expect(client.downloadAndInstall()).rejects.toThrow('No pending update')
  })
})
