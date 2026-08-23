const defaultDependencies = {
  isDesktop: () => typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__),
  loadUpdater: () => import('@tauri-apps/plugin-updater'),
  loadProcess: () => import('@tauri-apps/plugin-process'),
  loadApp: () => import('@tauri-apps/api/app')
}

export function createAppUpdater(dependencies = {}) {
  const deps = { ...defaultDependencies, ...dependencies }
  let pendingUpdate = null

  return {
    async currentVersion(fallback = '0.1.0') {
      if (!deps.isDesktop()) return fallback
      const { getVersion } = await deps.loadApp()
      return getVersion()
    },

    async check() {
      pendingUpdate = null
      if (!deps.isDesktop()) return { supported: false, available: false }
      const { check } = await deps.loadUpdater()
      const update = await check({ timeout: 30_000 })
      if (!update) return { supported: true, available: false }
      pendingUpdate = update
      return {
        supported: true,
        available: true,
        version: pendingUpdate.version,
        body: pendingUpdate.body || '',
        date: pendingUpdate.date || null
      }
    },

    async downloadAndInstall(onProgress = () => {}) {
      const update = pendingUpdate
      if (!update) throw new Error('No pending update')
      let downloaded = 0
      let contentLength = 0
      try {
        await update.downloadAndInstall(event => {
          if (event.event === 'Started') {
            contentLength = Number(event.data?.contentLength) || 0
            onProgress(0)
          } else if (event.event === 'Progress') {
            downloaded += Number(event.data?.chunkLength) || 0
            onProgress(contentLength ? Math.min(99, Math.round(downloaded / contentLength * 100)) : null)
          } else if (event.event === 'Finished') {
            onProgress(100)
          }
        })
      } finally {
        // An update may only be installed once. A failed install must be checked again.
        pendingUpdate = null
      }
    },

    hasPendingUpdate() {
      return Boolean(pendingUpdate)
    },

    clearPendingUpdate() {
      pendingUpdate = null
    },

    async relaunch() {
      const { relaunch } = await deps.loadProcess()
      await relaunch()
    }
  }
}

export const appUpdater = createAppUpdater()
