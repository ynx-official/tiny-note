import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { messages } from '../i18n'
import TodoListDialog from '../components/TodoListDialog.vue'
import TodosView from './TodosView.vue'

const feedbackMocks = vi.hoisted(() => ({ requestConfirmation: vi.fn(() => Promise.resolve(true)) }))
vi.mock('../services/appFeedback', () => ({ requestConfirmation: feedbackMocks.requestConfirmation }))

function setup(path = '/todos', locale = 'zh-CN') {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/todos', component: TodosView }] })
  const i18n = createI18n({ legacy: false, locale, messages })
  return router.push(path).then(() => router.isReady()).then(() => mount(TodosView, { attachTo: document.body, global: { plugins: [createPinia(), router, i18n], stubs: { teleport: true } } }))
}

function seedTodos(todos, todoLists = []) { localStorage.setItem('tiny-note-browser-state', JSON.stringify({ todos, todoLists, reminders: [], calendarEvents: [] })) }

describe('TodosView', () => {
  beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; feedbackMocks.requestConfirmation.mockReset(); feedbackMocks.requestConfirmation.mockResolvedValue(true); vi.useRealTimers() })

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

  it('creates a custom list and assigns quick-added todos to it', async () => {
    const wrapper = await setup()
    await flushPromises()
    await wrapper.get('.custom-list-add').trigger('click')
    const dialog = wrapper.getComponent(TodoListDialog)
    await dialog.get('input').setValue('工作任务')
    await dialog.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('.custom-list-row').text()).toContain('工作任务')
    expect(wrapper.get('.todo-heading h1').text()).toBe('工作任务')
    expect(wrapper.vm.$route.query.list).toBeTruthy()

    await wrapper.get('.todo-quick input').setValue('整理周报')
    await wrapper.get('.todo-quick').trigger('submit')
    await flushPromises()
    const state = JSON.parse(localStorage.getItem('tiny-note-browser-state'))
    expect(state.todos[0]).toMatchObject({ title: '整理周报', listId: state.todoLists[0].id })
    expect(wrapper.get('.custom-list-row small').text()).toBe('1')
    wrapper.unmount()
  })

  it('filters a custom list and falls back from an invalid list route', async () => {
    const lists = [{ id: 'work', name: '工作', color: '#1E88E5', createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' }]
    seedTodos([
      { id: 'inside', listId: 'work', title: '清单内任务', notes: '', dueAt: null, priority: 'none', completedAt: null, createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' },
      { id: 'outside', listId: null, title: '其他任务', notes: '', dueAt: null, priority: 'none', completedAt: null, createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' }
    ], lists)
    const wrapper = await setup('/todos?list=work')
    await flushPromises()
    expect(wrapper.get('.todo-heading h1').text()).toBe('工作')
    expect(wrapper.text()).toContain('清单内任务')
    expect(wrapper.text()).not.toContain('其他任务')
    wrapper.unmount()

    const fallback = await setup('/todos?list=missing')
    await flushPromises()
    expect(fallback.get('.todo-heading h1').text()).toBe('收集箱')
    expect(fallback.vm.$route.query).toEqual({ filter: 'inbox' })
    fallback.unmount()
  })

  it('deletes a selected list while keeping its todos', async () => {
    const lists = [{ id: 'work', name: '工作', color: '#1E88E5', createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' }]
    seedTodos([{ id: 'inside', listId: 'work', title: '保留任务', notes: '', dueAt: null, priority: 'none', completedAt: null, createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' }], lists)
    const wrapper = await setup('/todos?list=work')
    await flushPromises()
    await wrapper.get('.custom-list-more').trigger('click')
    await wrapper.get('.custom-list-menu .danger').trigger('click')
    await flushPromises()

    expect(feedbackMocks.requestConfirmation).toHaveBeenCalled()
    expect(wrapper.get('.todo-heading h1').text()).toBe('收集箱')
    expect(wrapper.text()).toContain('保留任务')
    expect(wrapper.find('.custom-list-row').exists()).toBe(false)
    expect(JSON.parse(localStorage.getItem('tiny-note-browser-state')).todos[0].listId).toBeNull()
    wrapper.unmount()
  })

  it('renders the todo shell in English', async () => {
    const wrapper = await setup('/todos?filter=today', 'en')
    await flushPromises()
    expect(wrapper.get('.todo-heading h1').text()).toBe('Today')
    expect(wrapper.get('.todo-quick input').attributes('placeholder')).toBe('Add a todo and press Enter')
    wrapper.unmount()
  })
})
