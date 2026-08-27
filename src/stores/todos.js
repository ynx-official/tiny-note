import { defineStore } from 'pinia'
import { invoke } from '../services/tauri'
import { sortTodos } from '../utils/todos'

export { sortTodos } from '../utils/todos'
export const TODO_LIST_COLORS = ['#E53935', '#FB8C00', '#558B2F', '#43A047', '#00897B', '#1E88E5', '#5C6BC0', '#8E24AA', '#D81B60', '#8D6E63', '#546E7A']

export const useTodosStore = defineStore('todos', {
  state: () => ({ todos: [], lists: [], loading: false, error: '' }),
  getters: {
    sorted: state => sortTodos(state.todos),
    byId: state => id => state.todos.find(item => item.id === id),
    listById: state => id => state.lists.find(item => item.id === id),
    itemsForList: state => id => state.todos.filter(item => item.listId === id),
    activeCountForList: state => id => state.todos.filter(item => item.listId === id && !item.completedAt).length
  },
  actions: {
    async load() {
      this.loading = true
      try {
        const [todos, lists] = await Promise.all([invoke('todo_list'), invoke('todo_custom_list_list')])
        this.todos = todos || []
        this.lists = lists || []
        this.error = ''
      }
      catch (error) { this.error = error?.message || '待办读取失败'; throw error }
      finally { this.loading = false }
      return this.todos
    },
    async createList(input) { const item = await invoke('todo_custom_list_create', { input }); this.lists.push(item); return item },
    async updateList(id, input) { const item = await invoke('todo_custom_list_update', { id, input }); const index = this.lists.findIndex(value => value.id === id); if (index >= 0) this.lists[index] = item; return item },
    async deleteList(id) { await invoke('todo_custom_list_delete', { id }); this.lists = this.lists.filter(item => item.id !== id); this.todos = this.todos.map(item => item.listId === id ? { ...item, listId: null } : item) },
    async create(input) { const item = await invoke('todo_create', { input }); this.todos.unshift(item); return item },
    async update(id, input) { const item = await invoke('todo_update', { id, input }); this.upsert(item); return item },
    async setCompleted(id, completed) { const item = await invoke('todo_set_completed', { id, completed }); this.upsert(item); return item },
    async remove(id) { await invoke('todo_delete', { id }); this.todos = this.todos.filter(item => item.id !== id) },
    async stopReminder(id) { await invoke('reminder_stop', { ownerType: 'todo', ownerId: id }); const item = this.byId(id); if (item?.reminder) item.reminder = { ...item.reminder, enabled: false, nextFireAt: null } },
    upsert(item) { const index = this.todos.findIndex(value => value.id === item.id); if (index >= 0) this.todos[index] = item; else this.todos.unshift(item) }
  }
})
