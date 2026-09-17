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
import { useAuthStore } from '../stores/auth'

function authenticatedPinia() {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.initialized = true
  auth.authenticated = true
  return pinia
}

function guestPinia() {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.initialized = true
  auth.authenticated = false
  return pinia
}

describe('HomeView startup data', () => {
  it('keeps image generation models out of the authenticated chat menu', async () => {
    const base = mocks.invoke.getMockImplementation()
    mocks.invoke.mockImplementation((command: string) => command === 'model_list' ? Promise.resolve([
      { id: 'image-model', provider: 'OpenAI', model: 'gpt-image-1', isDefault: true, imageEnabled: true },
      { id: 'chat-model', provider: 'OpenAI', model: 'gpt-4.1-mini', isDefault: false, imageEnabled: false }
    ]) : base?.(command))
    const wrapper = mount(HomeView, { global: { plugins: [authenticatedPinia(), createI18n({ legacy: false, locale: 'zh-CN', messages })] } })
    await flushPromises()
    expect(wrapper.get('.home-model-anchor .home-select-button').text()).toContain('gpt-4.1-mini')
    await wrapper.get('.home-model-anchor .home-select-button').trigger('click')
    expect(wrapper.findAll('.home-model-option')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('gpt-image-1')
    wrapper.unmount()
  })

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    mocks.invoke.mockReset()
    mocks.push.mockReset()
    mocks.invoke.mockImplementation((command: string) => {
      if (command === 'settings_get') return Promise.resolve({ theme: 'system', language: 'zh-CN', fimEnabled: false, exportDirectory: '' })
      if (command === 'model_list') return Promise.resolve([])
      if (command === 'knowledge_base_list') return Promise.resolve([])
      if (command === 'note_page') return Promise.resolve({ items: [], total: 0, hasMore: false, nextCursor: '' })
      if (command === 'note_list' || command === 'notebook_list' || command === 'external_markdown_list') return Promise.resolve([])
      return Promise.resolve(null)
    })
  })

  it('keeps the composer and draft in place while startup data loads', async () => {
    let resolveSettings: (value: unknown) => void = () => {}
    let resolveModels: (value: unknown) => void = () => {}
    mocks.invoke.mockImplementation((command: string) => {
      if (command === 'settings_get') return new Promise(resolve => { resolveSettings = resolve })
      if (command === 'model_list') return new Promise(resolve => { resolveModels = resolve })
      return Promise.resolve([])
    })

    const wrapper = mount(HomeView, {
      global: {
        plugins: [authenticatedPinia(), createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en', messages })]
      }
    })
    await flushPromises()

    expect(wrapper.find('.home-loader').exists()).toBe(false)
    const composer = wrapper.get('.home-content').element
    await wrapper.get('textarea').setValue('启动期间写下的想法')
    expect(wrapper.get('.home-send-button').attributes('disabled')).toBeDefined()
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(mocks.push).not.toHaveBeenCalled()

    resolveSettings({ theme: 'system', language: 'zh-CN', fimEnabled: false, exportDirectory: '' })
    resolveModels([])
    await flushPromises()

    expect(wrapper.find('.home-loader').exists()).toBe(false)
    expect(wrapper.get('.home-content').element).toBe(composer)
    expect(wrapper.get('textarea').element.value).toBe('启动期间写下的想法')
    expect(wrapper.get('.home-send-button').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('keeps notes and library data off the startup path until a reference picker is opened', async () => {
    const wrapper = mount(HomeView, {
      global: {
        plugins: [authenticatedPinia(), createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en', messages })]
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
    expect(invokedCommands()).toContain('note_page')
    expect(invokedCommands()).not.toContain('note_list')
    expect(invokedCommands()).not.toContain('knowledge_base_list')
  })

  it('shows the shell immediately without loading cloud data for a guest', async () => {
    const wrapper = mount(HomeView, {
      global: {
        plugins: [guestPinia(), createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en', messages })]
      }
    })
    await flushPromises()

    expect(wrapper.find('.home-loader').exists()).toBe(false)
    expect(wrapper.get('.home-guest-hint').text()).toContain('狗狗头像登录')
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})
