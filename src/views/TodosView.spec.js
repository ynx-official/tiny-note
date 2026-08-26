import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { messages } from '../i18n'
import TodosView from './TodosView.vue'

function setup(path = '/todos', locale = 'zh-CN') {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/todos', component: TodosView }] })
  const i18n = createI18n({ legacy: false, locale, messages })
  return router.push(path).then(() => router.isReady()).then(() => mount(TodosView, { attachTo: document.body, global: { plugins: [createPinia(), router, i18n] } }))
}

function seedTodos(todos) { localStorage.setItem('tiny-note-browser-state', JSON.stringify({ todos, reminders: [], calendarEvents: [] })) }

describe('TodosView', () => {
  beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; vi.useRealTimers() })

  it('quick-adds a todo, keeps capture focus, and does not force-open details', async () => {
    const wrapper = await setup()
    await flushPromises()
    const input = wrapper.get('.todo-quick input')
    await input.setValue('准备周会')
    await wrapper.get('.todo-quick').trigger('submit')
    await flushPromises()
    expect(wrapper.get('.todo-row-main strong').text()).toBe('准备周会')
    expect(document.activeElement).toBe(input.element)
    expect(wrapper.find('.todo-detail-form').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows overdue work in Today and groups it separately', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 26, 10, 0))
    seedTodos([
      { id: 'overdue', title: '逾期任务', notes: '', dueAt: '2026-08-25T02:00:00.000Z', priority: 'none', completedAt: null, createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' },
      { id: 'later', title: '未来任务', notes: '', dueAt: '2026-08-28T02:00:00.000Z', priority: 'none', completedAt: null, createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' }
    ])
    const wrapper = await setup('/todos?filter=today')
    await flushPromises()
    expect(wrapper.text()).toContain('已过期')
    expect(wrapper.text()).toContain('逾期任务')
    expect(wrapper.text()).not.toContain('未来任务')
    wrapper.unmount(); vi.useRealTimers()
  })

  it('shows a contextual completed group inside Today', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 7, 26, 10, 0))
    seedTodos([
      { id: 'done-today', title: '今天完成', notes: '', dueAt: '2026-08-26T02:00:00.000Z', priority: 'none', completedAt: '2026-08-25T03:00:00.000Z', createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-25T03:00:00Z' },
      { id: 'done-before', title: '此前完成', notes: '', dueAt: '2026-08-25T02:00:00.000Z', priority: 'none', completedAt: '2026-08-26T03:00:00.000Z', createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-26T03:00:00Z' }
    ])
    const wrapper = await setup('/todos?filter=today')
    await flushPromises()
    expect(wrapper.text()).toContain('已完成')
    expect(wrapper.text()).toContain('今天完成')
    expect(wrapper.text()).not.toContain('此前完成')
    expect(wrapper.get('.todo-checkbox.checked').exists()).toBe(true)
    wrapper.unmount(); vi.useRealTimers()
  })

  it('auto-saves detail edits after the debounce period', async () => {
    seedTodos([{ id: 'one', title: '旧标题', notes: '', dueAt: null, priority: 'none', completedAt: null, createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' }])
    const wrapper = await setup()
    await flushPromises()
    await wrapper.get('.todo-row-main').trigger('click')
    await flushPromises()
    vi.useFakeTimers()
    await wrapper.get('.detail-title textarea').setValue('新标题')
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()
    expect(wrapper.get('.save-status').text()).toBe('已保存')
    expect(wrapper.get('.todo-row-main strong').text()).toBe('新标题')
    wrapper.unmount(); vi.useRealTimers()
  })

  it('renders the todo shell in English', async () => {
    const wrapper = await setup('/todos?filter=today', 'en')
    await flushPromises()
    expect(wrapper.get('.todo-heading h1').text()).toBe('Today')
    expect(wrapper.get('.todo-quick input').attributes('placeholder')).toBe('Add a todo and press Enter')
    wrapper.unmount()
  })
})
