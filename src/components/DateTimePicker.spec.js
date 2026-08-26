/* global document */
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DateTimePicker from './DateTimePicker.vue'

afterEach(() => { document.body.innerHTML = '' })

describe('DateTimePicker', () => {
  it('shows a readable value and selects a calendar day', async () => {
    const wrapper = mount(DateTimePicker, { attachTo: document.body, props: { modelValue: '2026-08-26', mode: 'date' } })
    expect(wrapper.text()).toContain('8月26日')
    await wrapper.get('.picker-trigger').trigger('click')
    const day = document.body.querySelector('button[aria-label="2026-08-27"]')
    day.click()
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual(['2026-08-27'])
    wrapper.unmount()
  })

  it('keeps the date while choosing a time preset', async () => {
    const wrapper = mount(DateTimePicker, { attachTo: document.body, props: { modelValue: '2026-08-26T10:30' } })
    await wrapper.get('.picker-trigger').trigger('click')
    const preset = [...document.body.querySelectorAll('.time-presets button')].find(button => button.textContent === '18:00')
    preset.click()
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual(['2026-08-26T18:00'])
    wrapper.unmount()
  })

  it('can clear an optional value', async () => {
    const wrapper = mount(DateTimePicker, { props: { modelValue: '09:00', mode: 'time' } })
    await wrapper.get('.trigger-clear').trigger('click')
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([''])
  })

  it('moves from a month-end date to the next calendar month', async () => {
    const wrapper = mount(DateTimePicker, { attachTo: document.body, props: { modelValue: '2026-01-31', mode: 'date' } })
    await wrapper.get('.picker-trigger').trigger('click')
    document.body.querySelector('button[aria-label="下个月"]').click()
    await wrapper.vm.$nextTick()
    expect(document.body.textContent).toContain('2026年 2月')
    wrapper.unmount()
  })
})
