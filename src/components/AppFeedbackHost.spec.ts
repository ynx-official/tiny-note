import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import {
  cancelAppDialog,
  feedbackState,
  requestConfirmation,
  showToast
} from '../services/appFeedback'
import AppFeedbackHost from './AppFeedbackHost.vue'

afterEach(() => {
  if (feedbackState.dialog.visible) cancelAppDialog()
  feedbackState.toasts.splice(0)
  window.document.body.innerHTML = ''
})

describe('AppFeedbackHost', () => {
  it('renders a centered danger confirmation that does not close from a backdrop click', async () => {
    const wrapper = mount(AppFeedbackHost, { attachTo: window.document.body, global: { plugins: [createPinia()], stubs: { teleport: true } } })
    const result = requestConfirmation({ title: '删除模型', message: '确定删除吗？', tone: 'danger', confirmLabel: '删除' })
    await flushPromises()

    const overlay = wrapper.get('.app-feedback-overlay')
    expect(wrapper.get('[role="alertdialog"]').classes()).toContain('is-danger')
    expect(wrapper.text()).toContain('删除模型')
    await overlay.trigger('click')
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true)
    await wrapper.get('.app-feedback-primary').trigger('click')
    await expect(result).resolves.toBe(true)
  })

  it('uses the same host for typed application toasts', async () => {
    const wrapper = mount(AppFeedbackHost, { attachTo: window.document.body, global: { plugins: [createPinia()], stubs: { teleport: true } } })
    showToast('保存成功', { tone: 'success', duration: 0 })
    await flushPromises()
    expect(wrapper.get('.app-toast').classes()).toContain('is-success')
    expect(wrapper.get('.app-toast').text()).toContain('保存成功')
  })
})
