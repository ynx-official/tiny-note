import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), push: vi.fn() }))
vi.mock('../services/tauri', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/api/core', () => ({
  Channel: class Channel { onmessage = null }
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))

import TasksView from './TasksView.vue'

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
