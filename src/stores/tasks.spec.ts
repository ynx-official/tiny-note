import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), connect: vi.fn(() => new Promise(() => {})) }))
vi.mock('../services/tauri', () => ({ invoke: mocks.invoke }))
vi.mock('../services/eventChannel', () => ({ EventChannel: class EventChannel { onmessage = null; connect = mocks.connect; close = vi.fn() } }))

import { useTasksStore } from './tasks'
const invoke = mocks.invoke

describe('background task store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    invoke.mockReset()
    mocks.connect.mockClear()
    window.__TAURI_INTERNALS__ = {}
  })

  it('creates a typed server task without executing or transitioning it locally', async () => {
    const task = { id: 'task-1', kind: 'note_ai', title: '润色', status: 'queued', payload: {}, output: '', resourceKey: 'note:note-1', targetNoteId: 'note-1' }
    invoke.mockImplementation(async command => command === 'note_ai_task_create' ? task : null)
    const store = useTasksStore()
    await store.createNoteAI({ noteId: 'note-1', requestKey: 'request-1', action: 'polish', baseVersion: 1 })
    expect(invoke).toHaveBeenCalledWith('note_ai_task_create', expect.objectContaining({ action: 'polish', requestKey: 'request-1' }))
    expect(invoke.mock.calls.some(([command]) => ['note_ai_stream', 'image_generate', 'background_task_transition'].includes(command))).toBe(false)
    expect(store.tasks[0].status).toBe('queued')
  })

  it('only subscribes to server-owned active tasks during initialization', async () => {
    const tasks = ['1', '2'].map(id => ({ id, kind: 'note_ai', title: id, status: 'queued', payload: { request: {} }, output: '', resourceKey: 'note:shared', targetNoteId: 'shared' }))
    invoke.mockImplementation(async command => {
      if (command === 'background_task_list') return tasks
      return null
    })
    const store = useTasksStore()
    await store.initialize()
    expect(mocks.connect).toHaveBeenCalledTimes(2)
    expect(invoke.mock.calls.some(([command]) => ['note_ai_stream', 'background_task_transition'].includes(command))).toBe(false)
  })

  it('does not persist a server-owned stream delta twice', async () => {
    const store = useTasksStore()
    store.tasks = [{ id: 'task-stream', kind: 'note_ai', status: 'running', payload: {}, output: 'A' }]

    await store.handleEvent('task-stream', { type: 'delta', text: 'B' })

    expect(store.tasks[0].output).toBe('AB')
    expect(invoke.mock.calls.filter(([command]) => command === 'background_task_transition')).toHaveLength(0)
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

  it('keeps successful tasks green only until their results are viewed', () => {
    const store = useTasksStore()
    store.tasks = [{ id: 'done-1', kind: 'note_ai', status: 'succeeded' }]

    expect(store.unreadSucceededCount).toBe(1)

    store.markResultsSeen()

    expect(store.unreadSucceededCount).toBe(0)
  })
})
