import type { BrowserArgs, BrowserItem, BrowserState } from './types'

export interface BrowserHandlerResult {
  result: unknown
}

function item(value: Record<string, unknown>): BrowserItem {
  return value as BrowserItem
}
function bumpVersion(value: BrowserItem) { value.version = Number(value.version || 1) + 1 }

function updateReminder(state: BrowserState, ownerType: string, ownerId: string, input: BrowserItem | null | undefined, now: string): BrowserItem | null {
  state.reminders = state.reminders.filter(reminder => !(reminder.ownerType === ownerType && reminder.ownerId === ownerId))
  if (!input) return null
  const nextFireAt = input.mode === 'before'
    ? null
    : input.triggerAt || (input.mode === 'interval' ? new Date(Date.now() + Number(input.intervalMinutes || 1) * 60_000).toISOString() : null)
  const reminder = item({ id: crypto.randomUUID(), ownerType, ownerId, mode: input.mode, triggerAt: input.triggerAt || null, offsetMinutes: input.offsetMinutes || null, intervalMinutes: input.intervalMinutes || null, nextFireAt, enabled: input.enabled !== false, lastFiredAt: null, stoppedAt: null, createdAt: now, updatedAt: now })
  state.reminders.push(reminder)
  return reminder
}

function todoListInput(input: BrowserItem) {
  const name = String(input.name || '').trim()
  const color = String(input.color || '').trim().toUpperCase()
  if (!name) throw new Error('清单名称不能为空')
  if (!/^#[\dA-F]{6}$/.test(color)) throw new Error('清单颜色无效')
  return { name, color }
}

function validateTodoList(state: BrowserState, listId: string | null) {
  if (listId && !state.todoLists.some(list => list.id === listId)) throw new Error('清单不存在')
}

export function handlePlannerCommand(command: string, args: BrowserArgs, state: BrowserState, now: string): BrowserHandlerResult | null {
  if (command === 'calendar_event_list') return { result: state.calendarEvents.filter(event => (!args.start || event.endDate >= args.start) && (!args.end || event.startDate <= args.end)).map(event => ({ ...event, reminder: state.reminders.find(reminder => reminder.ownerType === 'calendarEvent' && reminder.ownerId === event.id) || null })) }
  if (command === 'calendar_event_get') { const event = state.calendarEvents.find(value => value.id === args.id); return { result: event ? { ...event, reminder: state.reminders.find(reminder => reminder.ownerType === 'calendarEvent' && reminder.ownerId === event.id) || null } : null } }
  if (command === 'calendar_event_create') { const input = args.input; const id = crypto.randomUUID(); const reminder = updateReminder(state, 'calendarEvent', id, input.reminder, now); const event = item({ id, title: input.title, startDate: input.startDate, endDate: input.endDate, startTime: input.startTime || '', endTime: input.endTime || '', allDay: Boolean(input.allDay), description: input.description || '', color: input.color || '#1E88E5', priority: input.priority || 'important', completed: Boolean(input.completed), reminder, version: 1, createdAt: now, updatedAt: now }); state.calendarEvents.push({ ...event, reminder: undefined }); return { result: event } }
  if (command === 'calendar_event_update') { const event = state.calendarEvents.find(value => value.id === args.id); if (!event) throw new Error('日程不存在'); Object.assign(event, args.input, { updatedAt: now }); bumpVersion(event); const reminder = updateReminder(state, 'calendarEvent', event.id, args.input.reminder, now); if (event.completed && reminder) Object.assign(reminder, { enabled: false, nextFireAt: null, stoppedAt: now }); return { result: { ...event, reminder } } }
  if (command === 'calendar_event_delete') { state.calendarEvents = state.calendarEvents.filter(event => event.id !== args.id); state.reminders = state.reminders.filter(reminder => !(reminder.ownerType === 'calendarEvent' && reminder.ownerId === args.id)); return { result: null } }
  if (command === 'todo_custom_list_list') return { result: [...state.todoLists].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)) }
  if (command === 'todo_custom_list_create') { const list = item({ id: crypto.randomUUID(), ...todoListInput(args.input), version: 1, createdAt: now, updatedAt: now }); state.todoLists.push(list); return { result: list } }
  if (command === 'todo_custom_list_update') { const list = state.todoLists.find(value => value.id === args.id); if (!list) throw new Error('清单不存在'); Object.assign(list, todoListInput(args.input), { updatedAt: now }); bumpVersion(list); return { result: { ...list } } }
  if (command === 'todo_custom_list_delete') { if (!state.todoLists.some(value => value.id === args.id)) throw new Error('清单不存在'); state.todoLists = state.todoLists.filter(value => value.id !== args.id); state.todos.forEach(todo => { if (todo.listId === args.id) Object.assign(todo, { listId: null, updatedAt: now }) }); return { result: null } }
  if (command === 'todo_list') return { result: state.todos.map(todo => ({ ...todo, reminder: state.reminders.find(reminder => reminder.ownerType === 'todo' && reminder.ownerId === todo.id) || null })) }
  if (command === 'todo_get') { const todo = state.todos.find(value => value.id === args.id); return { result: todo ? { ...todo, reminder: state.reminders.find(reminder => reminder.ownerType === 'todo' && reminder.ownerId === todo.id) || null } : null } }
  if (command === 'todo_create') { const input = args.input; const id = crypto.randomUUID(); const listId = input.listId || null; validateTodoList(state, listId); const reminder = updateReminder(state, 'todo', id, input.reminder, now); const todo = item({ id, title: input.title, notes: input.notes || '', listId, startAt: input.startAt || null, dueAt: input.dueAt || null, priority: input.priority || 'none', completedAt: null, reminder, version: 1, createdAt: now, updatedAt: now }); state.todos.unshift({ ...todo, reminder: undefined }); return { result: todo } }
  if (command === 'todo_update') { const todo = state.todos.find(value => value.id === args.id); if (!todo) throw new Error('待办不存在'); const listId = Object.hasOwn(args.input, 'listId') ? args.input.listId || null : todo.listId || null; validateTodoList(state, listId); Object.assign(todo, args.input, { listId, updatedAt: now }); bumpVersion(todo); const reminder = updateReminder(state, 'todo', todo.id, args.input.reminder, now); return { result: { ...todo, reminder } } }
  if (command === 'todo_set_completed') { const todo = state.todos.find(value => value.id === args.id); if (!todo) throw new Error('待办不存在'); todo.completedAt = args.completed ? now : null; todo.updatedAt = now; bumpVersion(todo); const reminder = state.reminders.find(value => value.ownerType === 'todo' && value.ownerId === todo.id) || null; if (args.completed && reminder) Object.assign(reminder, { enabled: false, nextFireAt: null, stoppedAt: now }); return { result: { ...todo, reminder } } }
  if (command === 'todo_delete') { state.todos = state.todos.filter(todo => todo.id !== args.id); state.reminders = state.reminders.filter(reminder => !(reminder.ownerType === 'todo' && reminder.ownerId === args.id)); return { result: null } }
  if (command === 'reminder_stop') { const reminder = state.reminders.find(value => value.ownerType === args.ownerType && value.ownerId === args.ownerId); if (reminder) Object.assign(reminder, { enabled: false, nextFireAt: null, stoppedAt: now, updatedAt: now }); return { result: null } }
  return null
}
