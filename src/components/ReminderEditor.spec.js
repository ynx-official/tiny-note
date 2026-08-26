import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ReminderEditor from './ReminderEditor.vue'

describe('ReminderEditor', () => {
  it('provides a useful default time when enabling a one-shot reminder', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 26, 9, 7))
    const wrapper = mount(ReminderEditor, { props: { modelValue: { enabled: false, mode: 'at', triggerAt: '', offsetMinutes: 10, intervalMinutes: 10 } } })
    await wrapper.get('button[aria-label="启用提醒"]').trigger('click')
    expect(wrapper.emitted('update:modelValue').at(-1)[0]).toMatchObject({ enabled: true, triggerAt: '2026-08-26T09:40' })
    vi.useRealTimers()
  })

  it('offers common before-reminder presets', async () => {
    const wrapper = mount(ReminderEditor, { props: { modelValue: { enabled: true, mode: 'before', offsetMinutes: 10, intervalMinutes: 10 } } })
    const preset = wrapper.findAll('.reminder-presets button').find(button => button.text() === '30 分钟')
    await preset.trigger('click')
    expect(wrapper.emitted('update:modelValue').at(-1)[0]).toMatchObject({ mode: 'before', offsetMinutes: 30 })
  })
})
