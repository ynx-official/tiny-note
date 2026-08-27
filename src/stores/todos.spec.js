import { beforeEach, describe, expect, it } from 'vitest'
import { invoke } from '../services/tauri'
import { sortTodos } from './todos'

describe('todo sorting', () => {
  it('sorts active due work before undated and completed work', () => {
    const result = sortTodos([
      { id: 'done', completedAt: '2026-01-01', dueAt: null, priority: 'none', createdAt: '3' },
      { id: 'undated', completedAt: null, dueAt: null, priority: 'high', createdAt: '2' },
      { id: 'due', completedAt: null, dueAt: '2026-08-26', priority: 'low', createdAt: '1' }
    ])
    expect(result.map(item => item.id)).toEqual(['due', 'undated', 'done'])
  })
})

describe('todo custom lists in the browser adapter', () => {
  beforeEach(() => localStorage.clear())

  it('persists list assignment and keeps todos when a list is deleted', async () => {
    const list = await invoke('todo_custom_list_create', { input: { name: '  工作  ', color: '#1e88e5' } })
    expect(list).toMatchObject({ name: '工作', color: '#1E88E5' })
    const todo = await invoke('todo_create', { input: { title: '整理周报', listId: list.id } })
    expect(todo.listId).toBe(list.id)
    await expect(invoke('todo_create', { input: { title: '错误归属', listId: 'missing' } })).rejects.toThrow('清单不存在')

    await invoke('todo_custom_list_delete', { id: list.id })
    expect(await invoke('todo_custom_list_list')).toEqual([])
    expect(await invoke('todo_get', { id: todo.id })).toMatchObject({ title: '整理周报', listId: null })
  })

  it('exports list data as v5 and normalizes legacy todos without a list', async () => {
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({ todos: [{ id: 'legacy', title: '旧待办' }] }))
    expect(await invoke('todo_get', { id: 'legacy' })).toMatchObject({ listId: null })
    const list = await invoke('todo_custom_list_create', { input: { name: '个人', color: '#5C6BC0' } })
    await invoke('todo_update', { id: 'legacy', input: { title: '旧待办', listId: list.id } })
    const backup = await invoke('workspace_export')
    expect(backup).toMatchObject({ version: 5, todoLists: [expect.objectContaining({ id: list.id })], todos: [expect.objectContaining({ id: 'legacy', listId: list.id })] })
  })
})
