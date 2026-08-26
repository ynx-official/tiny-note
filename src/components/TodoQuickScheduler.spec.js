/* global document */
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TodoQuickScheduler from './TodoQuickScheduler.vue'

afterEach(() => { document.body.innerHTML = '' })

describe('TodoQuickScheduler', () => {
  it('commits a selected calendar day with its time', async () => {
    const wrapper = mount(TodoQuickScheduler, { attachTo: document.body, props: { dueAt: '2026-08-26T18:00' } })
    await wrapper.get('.schedule-pill').trigger('click')
    document.body.querySelector('button[aria-label="2026-08-27"]').click()
    await wrapper.vm.$nextTick()
    document.body.querySelector('.schedule-confirm').click()
    expect(wrapper.emitted('update:dueAt').at(-1)).toEqual(['2026-08-27T18:00'])
    wrapper.unmount()
  })

  it('renders English scheduler labels when requested', async () => {
    const wrapper = mount(TodoQuickScheduler, { attachTo: document.body, props: { locale: 'en', dueAt: '' } })
    expect(wrapper.get('.schedule-pill').text()).toContain('No time')
    await wrapper.get('.schedule-pill').trigger('click')
    expect(document.body.textContent).toContain('Tomorrow')
    wrapper.unmount()
  })

  it('commits two selected days as an inclusive date range', async () => {
    const wrapper = mount(TodoQuickScheduler, { attachTo: document.body, props: { startAt: '2026-08-26T00:00', dueAt: '2026-08-26T23:59' } })
    await wrapper.get('.schedule-pill').trigger('click')
    expect(document.body.querySelector('.schedule-tabs .active').textContent).toContain('时间段')
    document.body.querySelector('button[aria-label="2026-08-27"]').click()
    await wrapper.vm.$nextTick()
    expect(document.body.textContent).toContain('请选择结束日期')
    document.body.querySelector('button[aria-label="2026-08-29"]').click()
    await wrapper.vm.$nextTick()
    document.body.querySelector('.schedule-confirm').click()
    expect(wrapper.emitted('update:startAt').at(-1)).toEqual(['2026-08-27T00:00'])
    expect(wrapper.emitted('update:dueAt').at(-1)).toEqual(['2026-08-29T23:59'])
    wrapper.unmount()
  })
})
