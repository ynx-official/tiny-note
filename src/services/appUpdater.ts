import packageMetadata from '../../package.json'
import { invoke } from './tauri'
import type { UpdateInfo } from '../types/domain'

interface AppUpdaterDependencies {
  isDesktop(): boolean
  invoke: typeof invoke
  loadApp(): Promise<typeof import('@tauri-apps/api/app')>
  storage: Storage | null
}
export interface UpdateCheckState extends UpdateInfo { supported?: boolean; skipped?: boolean; retryAfterMs?: number; failed?: boolean }

export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
export const UPDATE_RETRY_INTERVAL_MS = 15 * 60 * 1000
export const UPDATE_CHECKED_AT_KEY = 'tiny-note-update-checked-at'
export const BUNDLED_APP_VERSION = packageMetadata.version

const defaultDependencies = {
  isDesktop: () => typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__),
  invoke,
  loadApp: () => import('@tauri-apps/api/app'),
  storage: typeof window !== 'undefined' ? window.localStorage : null
}

export function createAppUpdater(dependencies: Partial<AppUpdaterDependencies> = {}) {
  const deps = { ...defaultDependencies, ...dependencies }
  let pendingUpdate: UpdateInfo | null = null
  let checking: Promise<UpdateCheckState> | null = null

  function readLastCheckedAt() {
    try { return Number(deps.storage?.getItem(UPDATE_CHECKED_AT_KEY) || 0) || 0 } catch { return 0 }
  }

  function writeLastCheckedAt() {
    try { deps.storage?.setItem(UPDATE_CHECKED_AT_KEY, String(Date.now())) } catch { /* private mode or test storage */ }
  }

  return {
    async currentVersion(fallback = BUNDLED_APP_VERSION) {
      if (!deps.isDesktop()) return fallback
      const { getVersion } = await deps.loadApp()
      return getVersion()
    },

    async check({ force = true } = {}): Promise<UpdateCheckState> {
      const elapsed = Date.now() - readLastCheckedAt()
      if (!force && elapsed < UPDATE_CHECK_INTERVAL_MS) {
        return { supported: true, available: false, skipped: true, retryAfterMs: UPDATE_CHECK_INTERVAL_MS - elapsed }
      }
      if (checking) return checking
      const request: Promise<UpdateCheckState> = (async () => {
        pendingUpdate = null
        if (!deps.isDesktop()) return { supported: false, available: false }
        const update = await deps.invoke('app_update_check')
        writeLastCheckedAt()
        if (!update?.available) return { supported: true, available: false, version: update?.version, body: update?.notes || '' }
        pendingUpdate = update
        return { ...update, body: update.notes || '', date: undefined }
      })()
      checking = request
      try {
        return await request
      } finally {
        if (checking === request) checking = null
      }
    },

    async downloadAndInstall(onProgress: (progress: number) => void = () => {}) {
      const update = pendingUpdate
      if (!update?.assetName) throw new Error('No pending update')
      try {
        onProgress(0)
        await deps.invoke('app_update_download', { assetName: update.assetName, version: update.version })
        onProgress(100)
      } finally {
        // The installer is opened only after the Rust side verifies its digest.
        pendingUpdate = null
      }
    },

    hasPendingUpdate() {
      return Boolean(pendingUpdate)
    },

    clearPendingUpdate() {
      pendingUpdate = null
    },

    async relaunch() {}
  }
}

export const appUpdater = createAppUpdater()
