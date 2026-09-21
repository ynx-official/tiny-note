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
import { useNotesStore } from '../stores/notes'

describe('AppShell task status', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    document.body.innerHTML = ''
    mocks.push.mockReset()
    mocks.replace.mockReset()
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

  it('opens workspaces from the tab picker and closes a tab without deleting its note', async () => {
    const pinia = createPinia()
    const wrapper = mount(AppShell, {
      props: { active: 'notes' },
      global: {
        plugins: [pinia, createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': { notes: '笔记', library: '知识库', tags: '标签', settings: '设置', appName: 'Tiny Note', newNote: '新建笔记' } } })],
        stubs: { AvatarDrawer: true, ChatHistoryDrawer: true }
      }
    })

    const notes = useNotesStore(pinia)
    notes.activeId = 'layout-note'
    notes.notes = [{ id: 'layout-note', title: 'Git 常用命令' } as never]
    await flushPromises()
    expect(wrapper.get('.workspace-tab .tab').text()).toBe('Git 常用命令')
    expect(wrapper.findAll('.workspace-tab')).toHaveLength(1)
    await wrapper.get('.tab-plus').trigger('click')
    await wrapper.get('.workspace-tab-picker button[data-workspace="library"]').trigger('click')
    expect(mocks.push).toHaveBeenCalledWith('/library')
    await wrapper.setProps({ active: 'library' })
    expect(wrapper.findAll('.workspace-tab')).toHaveLength(2)
    await wrapper.get('button[aria-label="关闭 Git 常用命令"]').trigger('click')
    expect(wrapper.findAll('.workspace-tab')).toHaveLength(1)
    expect(notes.notes[0].title).toBe('Git 常用命令')
    await wrapper.get('button[aria-label="关闭 知识库"]').trigger('click')
    expect(mocks.push).toHaveBeenLastCalledWith({ path: '/' })
    wrapper.unmount()
  })
})
