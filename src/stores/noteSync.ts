import { defineStore } from 'pinia'

export const NOTE_SYNC_STORAGE_KEY = 'tiny-note-sync-preferences-v1'
export interface NoteSyncPreferences { enabled: boolean; interval: number; unit: 'seconds' | 'minutes' }
const defaults: NoteSyncPreferences = { enabled: true, interval: 30, unit: 'seconds' }

function valid(value: NoteSyncPreferences) {
  return typeof value?.enabled === 'boolean' && ['seconds', 'minutes'].includes(value.unit)
    && Number.isInteger(value.interval) && value.interval >= 1 && value.interval <= (value.unit === 'minutes' ? 1440 : 86400)
}
function readPreferences(): NoteSyncPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(NOTE_SYNC_STORAGE_KEY) || 'null')
    if (valid(value)) return { enabled: value.enabled, interval: value.interval, unit: value.unit }
  } catch { /* Corrupt or unavailable storage must not prevent reading notes. */ }
  return { ...defaults }
}

export const useNoteSyncStore = defineStore('noteSync', {
  state: () => ({ preferences: readPreferences(), checking: false, lastCheckedAt: 0, lastSavedAt: 0, error: '', draftProtected: false }),
  getters: { intervalMs: state => state.preferences.interval * (state.preferences.unit === 'minutes' ? 60_000 : 1000) },
  actions: {
    setPreferences(value: NoteSyncPreferences) {
      if (!valid(value)) throw new Error('同步间隔须为 1 秒至 24 小时，且填写整数。')
      // Commit only after persistence succeeds, so the UI never claims an
      // unsaved preference will survive an application restart.
      localStorage.setItem(NOTE_SYNC_STORAGE_KEY, JSON.stringify(value))
      this.preferences = { ...value }
    }
  }
})
