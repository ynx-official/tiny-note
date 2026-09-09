import { invoke as tauriInvoke } from '@tauri-apps/api/core'

const INSTALLATION_ID_ACCOUNT = 'device-installation-id'
const BROWSER_INSTALLATION_ID_KEY = 'tiny-note-device-installation-id'

interface NativeDeviceSnapshot {
  osName: string
  osVersion: string
  architecture: string
  appVersion: string
}

export interface DeviceReport {
  installationId: string
  deviceName: string
  deviceType: 'desktop' | 'web'
  osName: string
  osVersion: string
  architecture: string
  appVersion: string
  locale: string
  timezone: string
}

function newInstallationId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
}

async function installationId(): Promise<string> {
  if (window.__TAURI_INTERNALS__) {
    try {
      const existing = await tauriInvoke<string | null>('credential_get', { account: INSTALLATION_ID_ACCOUNT })
      if (existing) return existing
      const created = newInstallationId()
      await tauriInvoke('credential_set', { account: INSTALLATION_ID_ACCOUNT, secret: created })
      return created
    } catch {
      // A random session identifier is safer than falling back to a hardware fingerprint.
      return newInstallationId()
    }
  }
  try {
    const existing = localStorage.getItem(BROWSER_INSTALLATION_ID_KEY)
    if (existing) return existing
    const created = newInstallationId()
    localStorage.setItem(BROWSER_INSTALLATION_ID_KEY, created)
    return created
  } catch {
    return newInstallationId()
  }
}

function browserOsName(): string {
  const source = `${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase()
  if (source.includes('win')) return 'windows'
  if (source.includes('mac')) return 'macos'
  if (source.includes('linux')) return 'linux'
  return 'unknown'
}

async function nativeSnapshot(): Promise<NativeDeviceSnapshot | null> {
  if (!window.__TAURI_INTERNALS__) return null
  try { return await tauriInvoke<NativeDeviceSnapshot>('device_snapshot') } catch { return null }
}

export async function collectDeviceReport(): Promise<DeviceReport> {
  const native = await nativeSnapshot()
  const osName = native?.osName || browserOsName()
  return {
    installationId: await installationId(),
    deviceName: `${osName === 'macos' ? 'macOS' : osName === 'windows' ? 'Windows' : osName === 'linux' ? 'Linux' : 'Web'} ${native ? '桌面端' : '浏览器'}`,
    deviceType: native ? 'desktop' : 'web',
    osName,
    osVersion: native?.osVersion || '',
    architecture: native?.architecture || '',
    appVersion: native?.appVersion || 'web-preview',
    locale: navigator.language || '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  }
}
