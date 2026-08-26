import { beforeEach, describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import CalendarView from './CalendarView.vue'

describe('CalendarView', () => {
  beforeEach(() => localStorage.clear())
  it('renders the full month grid and switches to year view', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/calendar', component: CalendarView }, { path: '/calendar/:id', component: { template: '<div />' } }, { path: '/todos', component: { template: '<div />' } }] })
    await router.push('/calendar'); await router.isReady()
    const wrapper = mount(CalendarView, { global: { plugins: [createPinia(), router] } })
    await flushPromises()
    expect(wrapper.findAll('.month-cell')).toHaveLength(42)
    await wrapper.find('.calendar-view-switch > button').trigger('click')
    const year = wrapper.findAll('.calendar-view-menu button').find(button => button.text().includes('年'))
    await year.trigger('click')
    expect(wrapper.findAll('.calendar-year > button')).toHaveLength(12)
  })
})
