import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('../services/tauri', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/api/core', () => ({
  Channel: class Channel { onmessage = null }
}))

import { useTasksStore } from './tasks'
const invoke = mocks.invoke

describe('background task store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    invoke.mockReset()
    window.__TAURI_INTERNALS__ = {}
  })

  it('keeps execution channels outside route component lifecycles', async () => {
    const task = { id: 'task-1', kind: 'note_ai', title: '润色', status: 'queued', payload: { request: { requestId: 'task-1' } }, output: '', resourceKey: 'note:note-1', targetNoteId: 'note-1' }
    invoke.mockImplementation(async (command, args) => {
      if (command === 'background_task_enqueue') return task
      if (command === 'background_task_transition') return { ...task, status: args.input.status, output: args.input.outputDelta || '' }
      if (command === 'note_ai_stream') return null
      return null
    })
    const store = useTasksStore()
    await store.enqueue({ kind: 'note_ai', title: '润色', payload: task.payload, targetNoteId: 'note-1' })
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('note_ai_stream', expect.objectContaining({ onEvent: expect.anything() })))
    expect(store.tasks[0].status).toBe('running')
  })

  it('never runs two tasks for the same resource at once', async () => {
    const tasks = ['1', '2'].map(id => ({ id, kind: 'note_ai', title: id, status: 'queued', payload: { request: {} }, output: '', resourceKey: 'note:shared', targetNoteId: 'shared' }))
    invoke.mockImplementation(async (command, args) => {
      if (command === 'background_task_list') return tasks
      if (command === 'background_task_transition') return { ...tasks.find(task => task.id === args.input.id), status: args.input.status }
      return null
    })
    const store = useTasksStore()
    await store.initialize()
    await vi.waitFor(() => expect(invoke.mock.calls.filter(([command]) => command === 'note_ai_stream')).toHaveLength(1))
  })

  it('does not expose legacy Agent runs in the task center', async () => {
    invoke.mockImplementation(async command => {
      if (command === 'background_task_list') return [
        { id: 'agent-1', kind: 'agent_run', status: 'failed', resourceKey: 'conversation:chat-1' },
        { id: 'summary-1', kind: 'conversation_summary', status: 'succeeded', resourceKey: 'conversation:chat-1' }
      ]
      return null
    })
    const store = useTasksStore()

    await store.initialize()

    expect(store.tasks.map(task => task.id)).toEqual(['summary-1'])
    expect(store.attentionCount).toBe(1)
  })

  it('clears finished records immediately and reports the result', async () => {
    invoke.mockImplementation(async command => {
      if (command === 'background_task_clear_finished') return 2
      if (command === 'background_task_list') return []
      return null
    })
    const store = useTasksStore()
    const removed = await store.clearFinished()
    expect(removed).toBe(2)
    expect(store.tasks).toEqual([])
    expect(store.notices.at(-1).message).toBe('已清理 2 条任务记录')
  })

  it('treats only the latest failed retry attempt as unresolved', () => {
    const store = useTasksStore()
    store.tasks = [
      { id: 'retry-1', status: 'running', retryOf: 'failed-1' },
      { id: 'failed-1', status: 'failed', retryOf: null }
    ]
    expect(store.failedCount).toBe(0)
    expect(store.runningCount).toBe(1)
    store.tasks[0].status = 'failed'
    expect(store.failedCount).toBe(1)
  })
})
