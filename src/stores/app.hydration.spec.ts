import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { invoke } from '../services/tauri'
import { useAppStore } from './app'

vi.mock('../services/tauri', () => ({ invoke: vi.fn() }))
beforeEach(() => { setActivePinia(createPinia()); vi.mocked(invoke).mockReset() })
afterEach(() => { localStorage.clear(); delete document.documentElement.dataset.theme })

it('keeps the cached theme when settings cannot be read', async () => {
  document.documentElement.dataset.theme = 'dark'
  vi.mocked(invoke).mockRejectedValue(new Error('offline'))
  await useAppStore().initialize()
  expect(document.documentElement.dataset.theme).toBe('dark')
})

it('applies settings without waiting for a slower model list', async () => {
  let finish!: (value: []) => void
  vi.mocked(invoke).mockImplementation(command => command === 'settings_get'
    ? Promise.resolve({ theme: 'dark', language: 'zh-CN', fimEnabled: false, exportDirectory: '' })
    : new Promise(resolve => { finish = resolve }))
  const store = useAppStore()
  const loading = store.initialize()
  await flushPromises()
  try {
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(store.initialized).toBe(false)
  } finally { finish([]); await loading }
})
