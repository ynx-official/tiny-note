import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { invoke } from '../services/tauri'
import { applyCachedTheme, useAppStore } from './app'

describe('app startup store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    delete window.document.documentElement.dataset.theme
  })

  it('loads persisted theme and model profiles before the first view uses them', async () => {
    await invoke('settings_update', { settings: { theme: 'dark', language: 'zh-CN', fimEnabled: true } })
    await invoke('model_upsert', {
      profile: {
        id: 'startup-model',
        name: '启动模型',
        provider: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        apiKeyConfigured: false,
        isDefault: true
      },
      apiKey: 'test-key'
    })

    const store = useAppStore()
    await store.initialize({ force: true })

    expect(store.settings).toMatchObject({ theme: 'dark', fimEnabled: true })
    expect(store.defaultModel).toMatchObject({ id: 'startup-model', isDefault: true })
    expect(window.document.documentElement.dataset.theme).toBe('dark')
  })

  it('applies the cached resolved theme synchronously during bootstrap', () => {
    localStorage.setItem('tiny-note-theme', 'dark')
    applyCachedTheme()
    expect(window.document.documentElement.dataset.theme).toBe('dark')
  })
})
