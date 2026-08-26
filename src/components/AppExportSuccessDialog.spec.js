import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { messages } from '../i18n'

const serviceMocks = vi.hoisted(() => ({
  state: { visible: true, fileName: '文章.pdf', path: 'D:\\Exports\\文章.pdf', busy: false, error: '' },
  dismiss: vi.fn(),
  open: vi.fn(),
  reveal: vi.fn()
}))
vi.mock('../services/exportSuccess', () => ({
  exportSuccessState: serviceMocks.state,
  dismissExportSuccess: serviceMocks.dismiss,
  openExportedFile: serviceMocks.open,
  revealExportedFile: serviceMocks.reveal
}))

import AppExportSuccessDialog from './AppExportSuccessDialog.vue'

afterEach(() => vi.clearAllMocks())

describe('AppExportSuccessDialog', () => {
  it('offers all three post-export actions and focuses open file', async () => {
    const wrapper = mount(AppExportSuccessDialog, {
      attachTo: window.document.body,
      global: { plugins: [createI18n({ legacy: false, locale: 'zh-CN', messages })], stubs: { Transition: false } }
    })
    await flushPromises()

    expect(wrapper.get('[role="dialog"]').text()).toContain('导出成功')
    expect(wrapper.get('[data-testid="reveal-exported-file"]').text()).toContain('打开所在文件夹')
    expect(wrapper.get('[data-testid="open-exported-file"]').text()).toContain('打开文件')
    expect(wrapper.get('[data-testid="dismiss-export-success"]').text()).toContain('以后再说')
    expect(window.document.activeElement).toBe(wrapper.get('[data-testid="open-exported-file"]').element)

    await wrapper.get('[data-testid="reveal-exported-file"]').trigger('click')
    expect(serviceMocks.reveal).toHaveBeenCalledOnce()
    wrapper.unmount()
  })
})
