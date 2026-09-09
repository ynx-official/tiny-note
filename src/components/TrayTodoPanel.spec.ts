import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { messages } from '../i18n'
import TrayTodoPanel from './TrayTodoPanel.vue'

const auth = vi.hoisted(() => ({ authenticated: true, listener: null as (() => void) | null, initialize: vi.fn() }))
vi.mock('../services/apiClient', () => ({
  initializeDesktopAuth: auth.initialize,
  getAuthSnapshot: () => ({ authenticated: auth.authenticated }),
  subscribeAuth: (listener: () => void) => { auth.listener = listener; return () => { auth.listener = null } }
}))

function seed(todos = [], todoLists = []) {
  localStorage.setItem('tiny-note-browser-state', JSON.stringify({
    todos,
    todoLists,
    reminders: [],
    calendarEvents: []
  }))
}

function setup() {
  return mount(TrayTodoPanel, {
    attachTo: document.body,
    global: {
      plugins: [createPinia(), createI18n({ legacy: false, locale: 'zh-CN', messages })]
    }
  })
}

describe('TrayTodoPanel', () => {
  beforeEach(async () => {
    await vi.dynamicImportSettled()
    auth.authenticated = true
    auth.listener = null
    auth.initialize.mockReset().mockResolvedValue(undefined)
    localStorage.clear()
    document.body.innerHTML = ''
    document.documentElement.classList.remove('tray-panel-root')
    delete window.__TAURI_INTERNALS__
  })

  it('waits for window authentication before loading private todos', async () => {
    seed([{ id: 'private', title: '私有待办' }])
    let ready!: () => void
    auth.initialize.mockImplementation(() => new Promise<void>(resolve => { ready = resolve }))
    const wrapper = setup()
    await flushPromises()
    expect(wrapper.text()).not.toContain('私有待办')
    ready()
    await flushPromises()
    expect(wrapper.text()).toContain('私有待办')
    wrapper.unmount()
  })

  it('requires login and clears private todos when the main session ends', async () => {
    auth.authenticated = false
    seed([{ id: 'private', title: '私有待办' }])
    const wrapper = setup()
    await flushPromises()
    expect(wrapper.text()).toContain('请先在主窗口登录')
    expect(wrapper.text()).not.toContain('私有待办')
    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
    auth.authenticated = true
    auth.listener?.()
    await flushPromises()
    expect(wrapper.text()).toContain('私有待办')
    auth.authenticated = false
    auth.listener?.()
    await flushPromises()
    expect(wrapper.text()).not.toContain('私有待办')
    wrapper.unmount()
    expect(auth.listener).toBeNull()
  })

  it('loads active and completed todos and toggles their state', async () => {
    seed([
      { id: 'active', listId: null, title: '准备周会', notes: '', dueAt: null, priority: 'none', completedAt: null, createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' },
      { id: 'done', listId: null, title: '完成归档', notes: '', dueAt: null, priority: 'none', completedAt: '2026-08-21T00:00:00Z', createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-21T00:00:00Z' }
    ])
    const wrapper = setup()
    await flushPromises()

    expect(wrapper.text()).toContain('准备周会')
    expect(wrapper.text()).toContain('完成归档')
    await wrapper.get('.tray-todo-rows:not(.completed) .tray-check').trigger('click')
    await flushPromises()
    expect(wrapper.find('.tray-todo-rows:not(.completed)').exists()).toBe(false)
    expect(wrapper.findAll('.tray-todo-rows.completed .tray-todo-row')).toHaveLength(2)
    wrapper.unmount()
  })

  it('quick-adds into the selected custom list', async () => {
    seed([], [{ id: 'work', name: '工作', color: '#1E88E5', createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' }])
    const wrapper = setup()
    await flushPromises()

    await wrapper.get('.tray-list-trigger').trigger('click')
    await wrapper.get('.tray-list-menu button:nth-child(2)').trigger('click')
    await wrapper.get('.tray-quick-add input').setValue('整理周报')
    await wrapper.get('.tray-quick-add').trigger('submit')
    await flushPromises()

    expect(wrapper.get('.tray-list-trigger').text()).toContain('工作')
    expect(wrapper.text()).toContain('整理周报')
    expect(JSON.parse(localStorage.getItem('tiny-note-browser-state')).todos[0]).toMatchObject({ title: '整理周报', listId: 'work' })
    wrapper.unmount()
  })
})
