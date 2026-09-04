import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'

const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => null }))

import AppShell from './AppShell.vue'
import { useTasksStore } from '../stores/tasks'
import { useAuthStore } from '../stores/auth'

describe('AppShell task status', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    mocks.push.mockReset()
    mocks.replace.mockReset()
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

  it('opens the account drawer when a protected route requests login', async () => {
    const pinia = createPinia()
    const wrapper = mount(AppShell, {
      props: { loginRequested: true, loginRedirect: '/notes' },
      global: {
        plugins: [pinia, createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': { notes: '笔记', library: '知识库', tags: '标签', settings: '设置', appName: 'Tiny Note', newNote: '新建笔记' } } })],
        stubs: { AvatarDrawer: true, ChatHistoryDrawer: true }
      }
    })

    await flushPromises()

    expect(wrapper.find('avatar-drawer-stub').exists()).toBe(true)
  })

  it('shows the signed-in user avatar in the top-left rail when available', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.authenticated = true
    auth.user = { userId: 1, username: 'tiny', nickname: 'Tiny', avatar: '42', avatarUrl: 'https://cdn.example/avatar.png', email: '', phone: '', status: 'normal' }
    const wrapper = mount(AppShell, {
      global: {
        plugins: [pinia, createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': { notes: '笔记', library: '知识库', tags: '标签', settings: '设置', appName: 'Tiny Note', newNote: '新建笔记' } } })],
        stubs: { AvatarDrawer: true, ChatHistoryDrawer: true }
      }
    })

    expect(wrapper.get('.rail-avatar-image').attributes('src')).toBe('https://cdn.example/avatar.png')
  })

  it('does not show a create button after the top tabs', () => {
    const pinia = createPinia()
    const wrapper = mount(AppShell, {
      global: {
        plugins: [pinia, createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': { notes: '笔记', library: '知识库', tags: '标签', settings: '设置', appName: 'Tiny Note', newNote: '新建笔记' } } })],
        stubs: { AvatarDrawer: true, ChatHistoryDrawer: true }
      }
    })

    expect(wrapper.find('.tab-plus').exists()).toBe(false)
  })
})
