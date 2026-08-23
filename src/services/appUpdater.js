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
      pendingUpdate = await check({ timeout: 30_000 })
      if (!pendingUpdate) return { supported: true, available: false }
      return {
        supported: true,
        available: true,
        version: pendingUpdate.version,
        body: pendingUpdate.body || '',
        date: pendingUpdate.date || null
      }
    },

    async downloadAndInstall(onProgress = () => {}) {
      if (!pendingUpdate) throw new Error('No pending update')
      let downloaded = 0
      let contentLength = 0
      await pendingUpdate.downloadAndInstall(event => {
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
    },

    async relaunch() {
      const { relaunch } = await deps.loadProcess()
      await relaunch()
    }
  }
}

export const appUpdater = createAppUpdater()
