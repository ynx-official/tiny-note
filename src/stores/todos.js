import { defineStore } from 'pinia'
import { invoke } from '../services/tauri'

const PRIORITY_ORDER = { high: 3, medium: 2, low: 1, none: 0 }

export function sortTodos(items) {
  return [...items].sort((a, b) => {
    if (Boolean(a.completedAt) !== Boolean(b.completedAt)) return a.completedAt ? 1 : -1
    if (Boolean(a.dueAt) !== Boolean(b.dueAt)) return a.dueAt ? -1 : 1
    if (a.dueAt !== b.dueAt) return String(a.dueAt).localeCompare(String(b.dueAt))
    if (PRIORITY_ORDER[a.priority] !== PRIORITY_ORDER[b.priority]) return PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]
    return String(b.createdAt).localeCompare(String(a.createdAt))
  })
}

export const useTodosStore = defineStore('todos', {
  state: () => ({ todos: [], loading: false, error: '' }),
  getters: {
    sorted: state => sortTodos(state.todos),
    byId: state => id => state.todos.find(item => item.id === id)
  },
  actions: {
    async load() {
      this.loading = true
      try { this.todos = await invoke('todo_list') || []; this.error = '' }
      catch (error) { this.error = error?.message || '待办读取失败'; throw error }
      finally { this.loading = false }
      return this.todos
    },
    async create(input) { const item = await invoke('todo_create', { input }); this.todos.unshift(item); return item },
    async update(id, input) { const item = await invoke('todo_update', { id, input }); this.upsert(item); return item },
    async setCompleted(id, completed) { const item = await invoke('todo_set_completed', { id, completed }); this.upsert(item); return item },
    async remove(id) { await invoke('todo_delete', { id }); this.todos = this.todos.filter(item => item.id !== id) },
    async stopReminder(id) { await invoke('reminder_stop', { ownerType: 'todo', ownerId: id }); const item = this.byId(id); if (item?.reminder) item.reminder = { ...item.reminder, enabled: false, nextFireAt: null } },
    upsert(item) { const index = this.todos.findIndex(value => value.id === item.id); if (index >= 0) this.todos[index] = item; else this.todos.unshift(item) }
  }
})
