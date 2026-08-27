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
    expect(wrapper.findAll('.month-week')).toHaveLength(6)
    expect(wrapper.find('.month-weekdays').text()).toMatch(/^周日/)
    await wrapper.find('.calendar-view-switch > button').trigger('click')
    const year = wrapper.findAll('.calendar-view-menu button').find(button => button.text().includes('年'))
    await year.trigger('click')
    expect(wrapper.findAll('.calendar-year > button')).toHaveLength(12)
  })
  it('renders active and completed items with distinct status treatments', async () => {
    const now = new Date()
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const event = { startDate: date, endDate: date, startTime: '09:00', endTime: '10:00', allDay: false, description: '', color: '#1E88E5', priority: 'important', reminder: null, createdAt: now.toISOString(), updatedAt: now.toISOString() }
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({ calendarEvents: [{ ...event, id: 'active', title: '未完成事项', completed: false }, { ...event, id: 'done', title: '已完成事项', completed: true }], todos: [], reminders: [] }))
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/calendar', component: CalendarView }, { path: '/calendar/:id', component: { template: '<div />' } }, { path: '/todos', component: { template: '<div />' } }] })
    await router.push('/calendar'); await router.isReady()
    const wrapper = mount(CalendarView, { global: { plugins: [createPinia(), router] } })
    await flushPromises()
    const active = wrapper.get('.month-item[data-status="active"]')
    const completed = wrapper.get('.month-item[data-status="completed"]')
    expect(active.classes()).not.toContain('completed')
    expect(active.find('.item-check svg').exists()).toBe(false)
    expect(completed.classes()).toContain('completed')
    expect(completed.find('.item-check svg').exists()).toBe(true)
  })
})
