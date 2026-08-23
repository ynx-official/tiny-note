const defaultDependencies = {
  isDesktop: () => typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__),
  invoke: (command, args) => import('./tauri').then(({ invoke }) => invoke(command, args)),
  loadApp: () => import('@tauri-apps/api/app')
}

export function createAppUpdater(dependencies = {}) {
  const deps = { ...defaultDependencies, ...dependencies }
  let pendingUpdate = null

  return {
    async currentVersion(fallback = '0.1.6') {
      if (!deps.isDesktop()) return fallback
      const { getVersion } = await deps.loadApp()
      return getVersion()
    },

    async check() {
      pendingUpdate = null
      if (!deps.isDesktop()) return { supported: false, available: false }
      const update = await deps.invoke('app_update_check')
      if (!update?.available) return { supported: true, available: false, version: update?.version || null, body: update?.notes || '' }
      pendingUpdate = update
      return { ...update, body: update.notes || '', date: null }
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
