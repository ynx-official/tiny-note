import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it } from 'vitest'
import { messages } from '../i18n'
import { requestPrompt } from '../services/promptDialog'
import AppPromptDialog from './AppPromptDialog.vue'

function mountDialog() {
  return mount(AppPromptDialog, {
    attachTo: window.document.body,
    global: {
      plugins: [createI18n({ legacy: false, locale: 'zh-CN', messages })],
      stubs: { teleport: true }
    }
  })
}

afterEach(() => {
  window.document.body.innerHTML = ''
})

describe('AppPromptDialog', () => {
  it('centers an app-owned prompt and confirms its default value with Enter', async () => {
    const wrapper = mountDialog()
    const result = requestPrompt('重命名', '旧名称')
    await flushPromises()

    expect(wrapper.get('[data-testid="app-prompt-overlay"]').classes()).toContain('app-prompt-overlay')
    const input = wrapper.get('[data-testid="app-prompt-input"]')
    expect(input.element.value).toBe('旧名称')
    expect(window.document.activeElement).toBe(input.element)

    await input.setValue('新名称')
    await input.trigger('keydown', { key: 'Enter' })
    await expect(result).resolves.toBe('新名称')
    expect(wrapper.find('[data-testid="app-prompt-overlay"]').exists()).toBe(false)
  })

  it('returns null when Escape cancels the prompt', async () => {
    const wrapper = mountDialog()
    const result = requestPrompt('新建文件夹')
    await flushPromises()

    await wrapper.get('[data-testid="app-prompt-dialog"]').trigger('keydown', { key: 'Escape' })
    await expect(result).resolves.toBeNull()
  })
})
