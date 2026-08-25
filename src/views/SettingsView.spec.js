import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { messages } from '../i18n'

const model = {
  id: 'custom-model',
  name: '公司模型',
  providerId: 'company-provider',
  connectionName: '公司网关',
  provider: '其他',
  baseUrl: 'https://ai.example.com/v1',
  model: 'company-chat',
  endpointType: 'openaiResponses',
  apiKeyConfigured: true,
  isDefault: true
}
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('../services/tauri', () => ({ invoke: mocks.invoke }))
vi.mock('../services/appUpdater', () => ({
  BUNDLED_APP_VERSION: '0.1.10',
  appUpdater: { currentVersion: vi.fn(async value => value), check: vi.fn() }
}))

import SettingsView from './SettingsView.vue'
import { confirmAppDialog, feedbackState } from '../services/appFeedback'

describe('SettingsView model services', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.invoke.mockReset()
    mocks.invoke.mockImplementation(async (command, args) => {
      if (command === 'settings_get') return { theme: 'light', language: 'zh-CN', fimEnabled: false }
      if (command === 'model_list') return [model]
      if (command === 'model_fetch_models') return [{ id: 'company-chat', name: 'Company Chat' }]
      if (command === 'model_test') return { ok: true, message: '连接成功' }
      if (command === 'search_index_status') return null
      if (command === 'model_upsert') return args
      return null
    })
  })

  it('labels compatible providers clearly and updates an existing profile in place', async () => {
    const pinia = createPinia()
    const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages })
    const wrapper = mount(SettingsView, {
      global: { plugins: [pinia, i18n], stubs: { AgentToolsCatalog: true } }
    })
    await vi.waitFor(() => expect(wrapper.text()).toContain('模型服务'))
    const modelsSection = wrapper.findAll('.settings-nav-item').find(button => button.text().includes('模型服务'))
    await modelsSection.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('公司模型'))

    expect(wrapper.text()).toContain('OpenAI 兼容服务')
    await wrapper.get('.model-edit-btn').trigger('click')
    expect(wrapper.get('.settings-model-modal-header').text()).toContain('编辑模型服务')
    expect(wrapper.get('input[name="profile-name"]').element.value).toBe('公司网关')
    expect(wrapper.get('input[name="base-url"]').element.value).toBe('https://ai.example.com/v1')
    expect(wrapper.get('input[name="model-id"]').element.value).toBe('company-chat')
    expect(wrapper.get('.settings-endpoint-trigger').text()).toContain('OpenAI Responses')
    const apiKeyInput = wrapper.get('input[name="api-key"]')
    expect(apiKeyInput.element.value).toBe('')
    expect(apiKeyInput.attributes('placeholder')).toContain('留空保留')

    await wrapper.get('input[name="profile-name"]').setValue('更新后的网关')
    await wrapper.get('input[name="base-url"]').setValue('https://new.example.com/v1')
    await wrapper.get('input[name="model-id"]').setValue('company-chat-v2')
    await wrapper.get('.settings-endpoint-trigger').trigger('click')
    const anthropicOption = wrapper.findAll('.settings-endpoint-menu button').find(button => button.text().includes('Anthropic'))
    await anthropicOption.trigger('click')
    await wrapper.get('.settings-model-modal-footer .primary').trigger('click')

    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('model_upsert', expect.objectContaining({
      profile: expect.objectContaining({ id: 'custom-model', providerId: 'company-provider', connectionName: '更新后的网关', provider: 'OpenAI 兼容服务', baseUrl: 'https://new.example.com/v1', model: 'company-chat-v2', endpointType: 'anthropicMessages' }),
      apiKey: ''
    })))
  })

  it('groups many models under one provider connection instead of repeating credentials', async () => {
    mocks.invoke.mockImplementation(async command => {
      if (command === 'settings_get') return { theme: 'light', language: 'zh-CN', fimEnabled: false }
      if (command === 'model_list') return [model, { ...model, id: 'custom-model-2', name: '推理模型', model: 'company-reasoner', isDefault: false }]
      if (command === 'search_index_status') return null
      return null
    })
    const wrapper = mount(SettingsView, { global: { plugins: [createPinia(), createI18n({ legacy: false, locale: 'zh-CN', messages })], stubs: { AgentToolsCatalog: true } } })
    await vi.waitFor(() => expect(wrapper.text()).toContain('模型服务'))
    await wrapper.findAll('.settings-nav-item').find(button => button.text().includes('模型服务')).trigger('click')

    expect(wrapper.findAll('.settings-connection-card')).toHaveLength(1)
    expect(wrapper.get('.settings-connection-card').text()).toContain('2 个模型')
    expect(wrapper.findAll('.settings-connection-model-row')).toHaveLength(2)
  })

  it('uses the saved key when fetching models from an existing blank-key draft', async () => {
    const wrapper = mount(SettingsView, {
      global: {
        plugins: [createPinia(), createI18n({ legacy: false, locale: 'zh-CN', messages })],
        stubs: { AgentToolsCatalog: true }
      }
    })
    await vi.waitFor(() => expect(wrapper.text()).toContain('模型服务'))
    await wrapper.findAll('.settings-nav-item').find(button => button.text().includes('模型服务')).trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('公司模型'))
    await wrapper.get('.model-edit-btn').trigger('click')

    await wrapper.get('.settings-fetch-button').trigger('click')

    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('model_fetch_models', {
      request: expect.objectContaining({ profileId: 'custom-model', apiKey: '' })
    }))
  })

  it('keeps save enabled when an existing connection has selected catalog models', async () => {
    const wrapper = mount(SettingsView, {
      global: {
        plugins: [createPinia(), createI18n({ legacy: false, locale: 'zh-CN', messages })],
        stubs: { AgentToolsCatalog: true }
      }
    })
    await vi.waitFor(() => expect(wrapper.text()).toContain('模型服务'))
    await wrapper.findAll('.settings-nav-item').find(button => button.text().includes('模型服务')).trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('公司模型'))
    await wrapper.get('.model-edit-btn').trigger('click')

    await wrapper.get('.settings-fetch-button').trigger('click')
    await vi.waitFor(() => expect(wrapper.get('.settings-model-picker-header').text()).toContain('已选 1 个'))
    expect(wrapper.get('.settings-model-save-button').attributes('disabled')).toBeUndefined()
  })

  it('does not close the model editor when the backdrop is clicked', async () => {
    const wrapper = mount(SettingsView, {
      global: {
        plugins: [createPinia(), createI18n({ legacy: false, locale: 'zh-CN', messages })],
        stubs: { AgentToolsCatalog: true }
      }
    })
    await vi.waitFor(() => expect(wrapper.text()).toContain('模型服务'))
    await wrapper.findAll('.settings-nav-item').find(button => button.text().includes('模型服务')).trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('公司模型'))
    await wrapper.get('.model-edit-btn').trigger('click')

    await wrapper.get('.settings-model-modal-backdrop').trigger('click')

    expect(wrapper.find('.settings-model-modal').exists()).toBe(true)
  })

  it('tests a configured model from the icon beside edit and shows success', async () => {
    const wrapper = mount(SettingsView, {
      global: {
        plugins: [createPinia(), createI18n({ legacy: false, locale: 'zh-CN', messages })],
        stubs: { AgentToolsCatalog: true }
      }
    })
    await vi.waitFor(() => expect(wrapper.text()).toContain('模型服务'))
    await wrapper.findAll('.settings-nav-item').find(button => button.text().includes('模型服务')).trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('公司模型'))

    await wrapper.get('.model-test-btn').trigger('click')

    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('model_test', { modelId: 'custom-model' }))
    expect(wrapper.get('.settings-model-test-result').text()).toContain('连接成功')
  })

  it('uses the shared in-app confirmation instead of the native browser confirm when deleting a model', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = mount(SettingsView, {
      global: {
        plugins: [createPinia(), createI18n({ legacy: false, locale: 'zh-CN', messages })],
        stubs: { AgentToolsCatalog: true }
      }
    })
    await vi.waitFor(() => expect(wrapper.text()).toContain('模型服务'))
    await wrapper.findAll('.settings-nav-item').find(button => button.text().includes('模型服务')).trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('公司模型'))

    await wrapper.get('.settings-connection-model-row .model-delete-btn').trigger('click')

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(feedbackState.dialog).toMatchObject({ visible: true, title: '删除模型', tone: 'danger' })
    expect(feedbackState.dialog.message).toContain('公司模型')

    confirmAppDialog()
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('model_delete', { id: 'custom-model' }))
    expect(feedbackState.dialog.visible).toBe(false)
    confirmSpy.mockRestore()
  })
})
