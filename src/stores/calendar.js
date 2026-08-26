import { defineStore } from 'pinia'
import { invoke } from '../services/tauri'

export const EVENT_COLORS = ['#E53935', '#FB8C00', '#558B2F', '#43A047', '#00897B', '#1E88E5', '#5C6BC0', '#8E24AA', '#D81B60', '#8D6E63', '#546E7A']

export const useCalendarStore = defineStore('calendar', {
  state: () => ({ events: [], loading: false, error: '' }),
  getters: { byId: state => id => state.events.find(item => item.id === id) },
  actions: {
    async load(range = {}) {
      this.loading = true
      try { this.events = await invoke('calendar_event_list', range) || []; this.error = '' }
      catch (error) { this.error = error?.message || '日程读取失败'; throw error }
      finally { this.loading = false }
      return this.events
    },
    async create(input) { const item = await invoke('calendar_event_create', { input }); this.events.push(item); return item },
    async update(id, input) { const item = await invoke('calendar_event_update', { id, input }); const index = this.events.findIndex(value => value.id === id); if (index >= 0) this.events[index] = item; return item },
    async remove(id) { await invoke('calendar_event_delete', { id }); this.events = this.events.filter(item => item.id !== id) }
  }
})
