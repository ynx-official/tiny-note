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

  it('shows the home loader until startup data is ready', async () => {
    let resolveSettings: (value: unknown) => void = () => {}
    let resolveModels: (value: unknown) => void = () => {}
    mocks.invoke.mockImplementation((command: string) => {
      if (command === 'settings_get') return new Promise(resolve => { resolveSettings = resolve })
      if (command === 'model_list') return new Promise(resolve => { resolveModels = resolve })
      return Promise.resolve([])
    })

    const wrapper = mount(HomeView, {
      global: {
        plugins: [createPinia(), createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en', messages })]
      }
    })
    await flushPromises()

    expect(wrapper.get('.home-loader').attributes('role')).toBe('status')
    expect(wrapper.findAll('.home-loader-grid span')).toHaveLength(6)
    expect(wrapper.find('.home-content').exists()).toBe(false)

    resolveSettings({ theme: 'system', language: 'zh-CN', fimEnabled: false, exportDirectory: '' })
    resolveModels([])
    await flushPromises()

    expect(wrapper.find('.home-loader').exists()).toBe(false)
    expect(wrapper.get('.home-content').exists()).toBe(true)
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

  it('excludes image generation models from the home chat model menu', async () => {
    mocks.invoke.mockImplementation((command: string) => {
      if (command === 'settings_get') return Promise.resolve({ theme: 'system', language: 'zh-CN', fimEnabled: false, exportDirectory: '' })
      if (command === 'model_list') return Promise.resolve([
        { id: 'image-model', name: 'Image Model', connectionName: 'Image Service', provider: 'OpenAI', model: 'gpt-image-1', isDefault: true, imageEnabled: true },
        { id: 'chat-model', name: 'Chat Model', connectionName: 'Chat Service', provider: 'OpenAI', model: 'gpt-4.1-mini', isDefault: false, imageEnabled: false }
      ])
      return Promise.resolve([])
    })

    const wrapper = mount(HomeView, {
      global: {
        plugins: [createPinia(), createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en', messages })]
      }
    })
    await flushPromises()

    expect(wrapper.get('.home-model-anchor .home-select-button').text()).toContain('gpt-4.1-mini')
    await wrapper.get('.home-model-anchor .home-select-button').trigger('click')

    const options = wrapper.findAll('.home-model-option')
    expect(options).toHaveLength(1)
    expect(options[0].text()).toContain('gpt-4.1-mini')
    expect(wrapper.text()).not.toContain('gpt-image-1')
  })
})
