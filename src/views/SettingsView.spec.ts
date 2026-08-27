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
const dialogMocks = vi.hoisted(() => ({ open: vi.fn() }))

vi.mock('../services/tauri', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: dialogMocks.open }))
vi.mock('../services/appUpdater', () => ({
  BUNDLED_APP_VERSION: '0.1.10',
  appUpdater: { currentVersion: vi.fn(async value => value), check: vi.fn() }
}))

import SettingsView from './SettingsView.vue'
import { confirmAppDialog, feedbackState } from '../services/appFeedback'

describe('SettingsView model services', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    mocks.invoke.mockReset()
    dialogMocks.open.mockReset()
    mocks.invoke.mockImplementation(async (command, args) => {
      if (command === 'settings_get') return { theme: 'light', language: 'zh-CN', fimEnabled: false }
      if (command === 'model_list') return [model]
      if (command === 'model_fetch_models') return [{ id: 'company-chat', name: 'Company Chat' }]
      if (command === 'model_test') return { ok: true, message: '连接成功' }
      if (command === 'model_upsert') return args
      return null
    })
  })

  it('shows, changes, and clears the default article export directory', async () => {
    mocks.invoke.mockImplementation(async (command, args) => {
      if (command === 'settings_get') return { theme: 'light', language: 'zh-CN', fimEnabled: false, exportDirectory: 'D:\\Old exports' }
      if (command === 'settings_update') return args.settings
      if (command === 'model_list') return [model]
      return null
    })
    dialogMocks.open.mockResolvedValue('D:\\New exports')
    const wrapper = mount(SettingsView, {
      global: { plugins: [createPinia(), createI18n({ legacy: false, locale: 'zh-CN', messages })], stubs: { AgentToolsCatalog: true } }
    })
    await vi.waitFor(() => expect(wrapper.text()).toContain('文件保存位置'))
    await wrapper.findAll('.settings-nav-item').find(button => button.text().includes('文件保存')).trigger('click')

    expect(wrapper.get('[data-testid="export-directory-path"]').text()).toContain('D:\\Old exports')
    await wrapper.get('[data-testid="choose-export-directory"]').trigger('click')
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('settings_update', {
      settings: expect.objectContaining({ exportDirectory: 'D:\\New exports' })
    }))
    expect(wrapper.get('[data-testid="export-directory-path"]').text()).toContain('D:\\New exports')

    await vi.waitFor(() => expect(wrapper.get('[data-testid="clear-export-directory"]').attributes('disabled')).toBeUndefined())
    await wrapper.get('[data-testid="clear-export-directory"]').trigger('click')
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('settings_update', {
      settings: expect.objectContaining({ exportDirectory: '' })
    }))
    expect(wrapper.get('[data-testid="export-directory-path"]').text()).toContain('每次保存时选择')
  })

  it('organizes editor shortcuts in their own settings category and supports recording and reset', async () => {
    const wrapper = mount(SettingsView, {
      global: {
        plugins: [createPinia(), createI18n({ legacy: false, locale: 'zh-CN', messages })],
        stubs: { AgentToolsCatalog: true }
      }
    })
    await vi.waitFor(() => expect(wrapper.text()).toContain('外观'))

    expect(wrapper.find('.settings-shortcut-recorder').exists()).toBe(false)
    const shortcutsSection = wrapper.findAll('.settings-nav-item').find(button => button.text().includes('快捷键'))
    expect(shortcutsSection).toBeTruthy()
    await shortcutsSection.trigger('click')
    expect(wrapper.get('.settings-section-kicker').text()).toBe('编辑器')

    const recorder = wrapper.get('.settings-shortcut-recorder')
    await recorder.trigger('click')
    expect(recorder.attributes('aria-pressed')).toBe('true')
    expect(recorder.text()).toContain('请按下新快捷键')

    await recorder.trigger('keydown', { key: 'm', code: 'KeyM' })
    expect(wrapper.get('.settings-shortcut-status').text()).toContain('Ctrl')
    expect(localStorage.getItem('tiny-note-editor-mode-shortcut')).toBeNull()
    await recorder.trigger('keydown', { key: 'Escape', code: 'Escape' })
    expect(recorder.attributes('aria-pressed')).toBe('false')

    await recorder.trigger('click')

    await recorder.trigger('keydown', { key: 'm', code: 'KeyM', ctrlKey: true, shiftKey: true })
    expect(localStorage.getItem('tiny-note-editor-mode-shortcut')).toBe('Mod+Shift+KeyM')
    expect(wrapper.findAll('.settings-shortcut-recorder kbd').map(key => key.text())).toEqual(['Ctrl', 'Shift', 'M'])

    await wrapper.get('.settings-shortcut-reset').trigger('click')
    expect(localStorage.getItem('tiny-note-editor-mode-shortcut')).toBe('Mod+Slash')
    expect(wrapper.findAll('.settings-shortcut-recorder kbd').map(key => key.text())).toEqual(['Ctrl', '/'])
    wrapper.unmount()
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
