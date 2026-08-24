export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
export const UPDATE_CHECKED_AT_KEY = 'tiny-note-update-checked-at'

const defaultDependencies = {
  isDesktop: () => typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__),
  invoke: (command, args) => import('./tauri').then(({ invoke }) => invoke(command, args)),
  loadApp: () => import('@tauri-apps/api/app'),
  storage: typeof window !== 'undefined' ? window.localStorage : null
}

export function createAppUpdater(dependencies = {}) {
  const deps = { ...defaultDependencies, ...dependencies }
  let pendingUpdate = null
  let checking = null

  function readLastCheckedAt() {
    try { return Number(deps.storage?.getItem(UPDATE_CHECKED_AT_KEY) || 0) || 0 } catch { return 0 }
  }

  function writeLastCheckedAt() {
    try { deps.storage?.setItem(UPDATE_CHECKED_AT_KEY, String(Date.now())) } catch { /* private mode or test storage */ }
  }

  return {
    async currentVersion(fallback = '0.1.8') {
      if (!deps.isDesktop()) return fallback
      const { getVersion } = await deps.loadApp()
      return getVersion()
    },

    async check({ force = true } = {}) {
      if (!force && Date.now() - readLastCheckedAt() < UPDATE_CHECK_INTERVAL_MS) {
        return { supported: true, available: false, skipped: true }
      }
      if (checking) return checking
      checking = (async () => {
        pendingUpdate = null
        try {
          if (!deps.isDesktop()) return { supported: false, available: false }
          const update = await deps.invoke('app_update_check')
          if (!update?.available) return { supported: true, available: false, version: update?.version || null, body: update?.notes || '' }
          pendingUpdate = update
          return { ...update, body: update.notes || '', date: null }
        } finally {
          writeLastCheckedAt()
          checking = null
        }
      })()
      return checking
    },

    async downloadAndInstall(onProgress = () => {}) {
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
