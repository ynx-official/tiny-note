import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, expect, it } from 'vitest'
import { useNoteSyncStore, NOTE_SYNC_STORAGE_KEY } from './noteSync'

beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()) })
it('persists a custom frequency and its seconds/minutes unit on this device', () => {
  const sync = useNoteSyncStore()
  expect(sync.intervalMs).toBe(30_000)
  sync.setPreferences({ enabled: true, interval: 2, unit: 'minutes' })
  expect(sync.intervalMs).toBe(120_000)
  const restored = useNoteSyncStore(createPinia())
  expect(restored.preferences).toEqual({ enabled: true, interval: 2, unit: 'minutes' })
})
it('rejects invalid frequencies and recovers corrupt persisted settings', () => {
  const sync = useNoteSyncStore()
  for (const interval of [0, -1, NaN, Infinity, 1.5, 86401]) {
    expect(() => sync.setPreferences({ enabled: true, interval, unit: 'seconds' })).toThrow()
    expect(sync.intervalMs).toBe(30_000)
  }
  localStorage.setItem(NOTE_SYNC_STORAGE_KEY, '{broken')
  expect(useNoteSyncStore(createPinia()).intervalMs).toBe(30_000)
})
