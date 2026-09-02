import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauriInvoke = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({ invoke: tauriInvoke }))

describe('device information reporting', () => {
  beforeEach(() => {
    vi.resetModules()
    tauriInvoke.mockReset()
    localStorage.clear()
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: undefined })
  })

  it('uses a random installation id and excludes hardware fingerprints', async () => {
    localStorage.setItem('tiny-note-device-installation-id', 'random-installation-id')
    const { collectDeviceReport } = await import('./deviceInfo')
    const report = await collectDeviceReport()

    expect(report.installationId).toBe('random-installation-id')
    expect(report.deviceType).toBe('web')
    expect(report).not.toHaveProperty('hostname')
    expect(report).not.toHaveProperty('macAddress')
    expect(report).not.toHaveProperty('serialNumber')
  })

  it('uses the native app snapshot without sending device credentials to login', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
    tauriInvoke.mockImplementation((command: string) => {
      if (command === 'device_snapshot') return { osName: 'windows', osVersion: '', architecture: 'x86_64', appVersion: '0.1.12' }
      if (command === 'credential_get') return 'install-native'
      return null
    })
    const { collectDeviceReport } = await import('./deviceInfo')
    await expect(collectDeviceReport()).resolves.toMatchObject({
      installationId: 'install-native', deviceName: 'Windows 桌面端', deviceType: 'desktop', osName: 'windows', architecture: 'x86_64', appVersion: '0.1.12'
    })
  })
})
