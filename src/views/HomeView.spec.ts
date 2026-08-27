import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  push: vi.fn()
}))

vi.mock('../services/tauri', () => ({ invoke: mocks.invoke }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))

import HomeView from './HomeView.vue'
import { messages } from '../i18n'

describe('HomeView startup data', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    mocks.invoke.mockReset()
    mocks.push.mockReset()
    mocks.invoke.mockImplementation((command: string) => {
      if (command === 'settings_get') return Promise.resolve({ theme: 'system', language: 'zh-CN', fimEnabled: false, exportDirectory: '' })
      if (command === 'model_list') return Promise.resolve([])
      if (command === 'knowledge_base_list') return Promise.resolve([])
      if (command === 'note_list' || command === 'notebook_list' || command === 'external_markdown_list') return Promise.resolve([])
      return Promise.resolve(null)
    })
  })

  it('keeps notes and library data off the startup path until a reference picker is opened', async () => {
    const wrapper = mount(HomeView, {
      global: {
        plugins: [createPinia(), createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en', messages })]
      }
    })
    await flushPromises()
    const invokedCommands = () => mocks.invoke.mock.calls.map(([command]) => command)

    expect(invokedCommands()).toContain('settings_get')
    expect(invokedCommands()).toContain('model_list')
    expect(invokedCommands()).not.toContain('note_purge_expired')
    expect(invokedCommands()).not.toContain('knowledge_base_list')

    await wrapper.get('button[title="引用文件"]').trigger('click')
    await flushPromises()
    expect(invokedCommands()).not.toContain('note_purge_expired')
    expect(invokedCommands()).not.toContain('knowledge_base_list')

    await wrapper.findAll('.home-reference-option')[0].trigger('click')
    await flushPromises()
    expect(invokedCommands()).toContain('note_purge_expired')
    expect(invokedCommands()).not.toContain('knowledge_base_list')
  })
})
