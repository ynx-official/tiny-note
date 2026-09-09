import { defineStore } from 'pinia'
import { invoke } from '../services/tauri'
import type { CalendarEvent, Reminder } from '../types/domain'
import { errorMessage } from '../types/domain'
import { requireResourceVersion } from '../services/resourceVersion'

export const EVENT_COLORS = ['#E53935', '#FB8C00', '#558B2F', '#43A047', '#00897B', '#1E88E5', '#5C6BC0', '#8E24AA', '#D81B60', '#8D6E63', '#546E7A']
type CalendarEventInput = Omit<Partial<CalendarEvent>, 'reminder'> & { reminder?: Partial<Reminder> | null }

export const useCalendarStore = defineStore('calendar', {
  state: () => ({ events: [] as CalendarEvent[], loading: false, error: '' }),
  getters: { byId: state => (id: string | string[]) => state.events.find(item => item.id === (Array.isArray(id) ? id[0] : id)) },
  actions: {
    async load(range = {}) {
      this.loading = true
      try { this.events = await invoke('calendar_event_list', range) || []; this.error = '' }
      catch (error) { this.error = errorMessage(error, '日程读取失败'); throw error }
      finally { this.loading = false }
      return this.events
    },
    async create(input: CalendarEventInput) { const item = await invoke('calendar_event_create', { input }); this.events.push(item); return item },
    async update(id: string, input: CalendarEventInput) { const current = this.byId(id); const item = await invoke('calendar_event_update', { id, input, version: requireResourceVersion(current, '日程') }); const index = this.events.findIndex(value => value.id === id); if (index >= 0) this.events[index] = item; return item },
    async remove(id: string) { await invoke('calendar_event_delete', { id }); this.events = this.events.filter(item => item.id !== id) }
  }
})
