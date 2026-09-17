import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), push: vi.fn() }))
vi.mock('../services/tauri', () => ({ invoke: mocks.invoke }))
vi.mock('../services/eventChannel', () => ({ EventChannel: class { connect = () => new Promise(() => {}); close = vi.fn() } }))
vi.mock('@tauri-apps/api/core', () => ({
  Channel: class Channel { onmessage = null }
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))

import TasksView from './TasksView.vue'
import { useTasksStore } from '../stores/tasks'

const tasks = [
  { id: 'done', kind: 'conversation_summary', title: '总结为笔记', status: 'succeeded', createdAt: '2026-08-24T08:00:00Z', startedAt: '2026-08-24T08:00:10Z', completedAt: '2026-08-24T08:01:15Z', result: { noteId: 'note-1' } },
  { id: 'failed', kind: 'note_ai', title: '笔记 AI', status: 'failed', createdAt: '2026-08-24T08:01:00Z', errorMessage: '网络错误', targetNoteId: 'note-2' }
]

describe('TasksView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.invoke.mockReset()
    mocks.push.mockReset()
    mocks.invoke.mockImplementation(async command => {
      if (command === 'background_task_list') return tasks
      if (command === 'background_task_retry') return { ...tasks[1], id: 'retry-1', status: 'queued', errorMessage: null }
      return null
    })
    window.__TAURI_INTERNALS__ = {}
  })

  it('filters failed tasks and opens a completed note result', async () => {
    const wrapper = mount(TasksView, { global: { plugins: [createPinia()] } })
    await vi.waitFor(() => expect(wrapper.text()).toContain('耗时 1分05秒'))

    await wrapper.get('.task-actions button').trigger('click')
    expect(mocks.push).toHaveBeenCalledWith({ path: '/notes', query: { note: 'note-1' } })

    const failedFilter = wrapper.findAll('.tasks-filters button').find(button => button.text().includes('失败'))
    await failedFilter.trigger('click')
    expect(wrapper.text()).toContain('笔记 AI')
    expect(wrapper.text()).not.toContain('总结为笔记')
    await wrapper.get('.task-quick-retry').trigger('click')
    expect(mocks.invoke).toHaveBeenCalledWith('background_task_retry', { id: 'failed' })
  })
})
describe('task center progress', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-17T10:00:00Z')) })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
  function setup() {
    const store = useTasksStore()
    store.tasks = [{ id: 'delayed', title: '参考图生成', kind: 'image_generation', status: 'queued', attemptCount: 1, scheduledAt: '2026-09-17T09:58:00Z', createdAt: '2026-09-17T09:57:00Z', errorMessage: '连接模型服务超时' }]
    vi.spyOn(store, 'initialize').mockResolvedValue(undefined)
    const refresh = vi.spyOn(store, 'refresh').mockResolvedValue(store.tasks)
    return { store, refresh, wrapper: mount(TasksView) }
  }
  it('shows overdue retries and reasons without expanding a row', async () => {
    const { wrapper } = setup()
    await flushPromises()
    expect(wrapper.text()).toContain('重试延迟')
    expect(wrapper.text()).toContain('连接模型服务超时')
    expect(wrapper.find('.task-detail').exists()).toBe(false)
    wrapper.unmount()
  })
  it('polls active tasks and stops on unmount', async () => {
    const { wrapper, refresh } = setup()
    await vi.advanceTimersByTimeAsync(5000)
    expect(refresh).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(5000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })
  it('keeps the last task visible when refreshing fails', async () => {
    const { wrapper, refresh } = setup()
    refresh.mockRejectedValue(new Error('offline'))
    await wrapper.findAll('button').find(button => button.text() === '刷新状态')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('状态刷新失败')
    expect(wrapper.text()).toContain('参考图生成')
    wrapper.unmount()
  })
})

