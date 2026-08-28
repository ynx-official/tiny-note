import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'

const mocks = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => null }))

import AppShell from './AppShell.vue'
import { useTasksStore } from '../stores/tasks'

describe('AppShell task status', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    document.body.innerHTML = ''
    mocks.push.mockReset()
  })

  it('shows the Friday floating tooltip animation target for rail items', async () => {
    const pinia = createPinia()
    const wrapper = mount(AppShell, {
      global: {
        plugins: [pinia, createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': { notes: '笔记', library: '知识库', tags: '标签', settings: '设置', appName: 'Tiny Note', newNote: '新建笔记' } } })],
        stubs: { AvatarDrawer: true, ChatHistoryDrawer: true }
      }
    })

    const notesItem = wrapper.get('.rail nav .rail-item')
    vi.spyOn(notesItem.element, 'getBoundingClientRect').mockReturnValue({
      top: 40,
      right: 56,
      bottom: 80,
      left: 16,
      width: 40,
      height: 40,
      x: 16,
      y: 40,
      toJSON: () => ({})
    })

    await notesItem.trigger('mouseenter')

    const tooltip = document.body.querySelector<HTMLElement>('.floating-tooltip')
    expect(tooltip?.textContent?.trim()).toBe('笔记')
    expect(tooltip?.style.top).toBe('60px')
    expect(tooltip?.style.left).toBe('66px')
    expect(notesItem.attributes('title')).toBeUndefined()

    await notesItem.trigger('mouseleave')
    expect(document.body.querySelector('.floating-tooltip')).toBeNull()

    wrapper.unmount()
  })

  it('returns a completed task icon to the rail tone after task center is opened', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const tasks = useTasksStore()
    tasks.tasks = [{ id: 'done-1', kind: 'note_ai', status: 'succeeded' }]
    const wrapper = mount(AppShell, {
      props: { active: 'notes' },
      global: {
        plugins: [pinia, createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': { notes: '笔记', library: '知识库', tags: '标签', settings: '设置', appName: 'Tiny Note', newNote: '新建笔记' } } })],
        stubs: { AvatarDrawer: true, ChatHistoryDrawer: true }
      }
    })

    expect(wrapper.find('.rail-task-state.is-succeeded').exists()).toBe(true)

    await wrapper.get('.rail-tasks').trigger('click')

    expect(wrapper.find('.rail-task-state.is-succeeded').exists()).toBe(false)
    expect(mocks.push).toHaveBeenCalledWith('/tasks')
  })

  it('does not instantiate drawer hosts until their first user action', async () => {
    const pinia = createPinia()
    const wrapper = mount(AppShell, {
      global: {
        plugins: [pinia, createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': { notes: '笔记', library: '知识库', tags: '标签', settings: '设置', appName: 'Tiny Note', newNote: '新建笔记' } } })],
        stubs: { AvatarDrawer: true, ChatHistoryDrawer: true }
      }
    })

    expect(wrapper.find('avatar-drawer-stub').exists()).toBe(false)
    expect(wrapper.find('chat-history-drawer-stub').exists()).toBe(false)

    await wrapper.get('.rail-avatar').trigger('click')
    expect(wrapper.find('avatar-drawer-stub').exists()).toBe(true)

    await wrapper.get('.rail-clock').trigger('click')
    expect(wrapper.find('chat-history-drawer-stub').exists()).toBe(true)
  })
})
