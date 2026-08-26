import { localDateTimeValue, localDateValue, roundedFutureDate } from './dateTime'

export const TODO_PRIORITY_ORDER = { high: 3, medium: 2, low: 1, none: 0 }
export const TODO_FILTERS = ['today', 'upcoming', 'inbox', 'completed']
export const TODO_SORTS = ['due', 'priority', 'created']

function dueTime(item) {
  const value = item?.dueAt ? new Date(item.dueAt).getTime() : Number.POSITIVE_INFINITY
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY
}

function createdTime(item) {
  const value = item?.createdAt ? new Date(item.createdAt).getTime() : 0
  return Number.isFinite(value) ? value : 0
}

export function sortTodos(items, mode = 'due') {
  return [...items].sort((a, b) => {
    if (Boolean(a.completedAt) !== Boolean(b.completedAt)) return a.completedAt ? 1 : -1
    if (mode === 'priority') {
      const priority = (TODO_PRIORITY_ORDER[b.priority] || 0) - (TODO_PRIORITY_ORDER[a.priority] || 0)
      if (priority) return priority
      const aDue = dueTime(a); const bDue = dueTime(b)
      return aDue !== bDue ? aDue - bDue : createdTime(b) - createdTime(a)
    }
    if (mode === 'created') return createdTime(b) - createdTime(a)
    const aDue = dueTime(a); const bDue = dueTime(b)
    if (aDue !== bDue) return aDue - bDue
    const priority = (TODO_PRIORITY_ORDER[b.priority] || 0) - (TODO_PRIORITY_ORDER[a.priority] || 0)
    return priority || createdTime(b) - createdTime(a)
  })
}

export function filterTodos(items, filter = 'inbox', now = new Date()) {
  if (filter === 'completed') return items.filter(item => Boolean(item.completedAt))
  const active = items.filter(item => !item.completedAt)
  if (filter === 'inbox') return active
  const today = localDateValue(now)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  end.setDate(end.getDate() + 7)
  if (filter === 'today') {
    return active.filter(item => item.dueAt && localDateValue(new Date(item.dueAt)) <= today)
  }
  return active.filter(item => {
    if (!item.dueAt) return false
    const due = new Date(item.dueAt)
    return localDateValue(due) >= today && due <= end
  })
}

export function filterTodoViewItems(items, filter = 'inbox', now = new Date()) {
  if (filter === 'completed') return filterTodos(items, filter, now)
  const active = filterTodos(items, filter, now)
  const today = localDateValue(now)
  const rangeEnd = new Date(now)
  rangeEnd.setHours(23, 59, 59, 999)
  rangeEnd.setDate(rangeEnd.getDate() + 7)
  const completed = items.filter(item => {
    if (!item.completedAt) return false
    if (filter === 'inbox') return true
    if (!item.dueAt) return false
    const due = new Date(item.dueAt)
    if (filter === 'today') return localDateValue(due) === today
    const rangeStart = new Date(now)
    rangeStart.setHours(0, 0, 0, 0)
    return due >= rangeStart && due <= rangeEnd
  })
  return [...active, ...completed]
}

export function groupTodos(items, filter = 'inbox', now = new Date(), sortMode = 'due') {
  if (filter === 'completed') return [{ key: 'completed', items: sortTodos(items, sortMode) }]
  const today = localDateValue(now)
  const groups = { overdue: [], today: [], later: [], undated: [] }
  const completed = []
  for (const item of items) {
    if (item.completedAt) completed.push(item)
    else if (!item.dueAt) groups.undated.push(item)
    else if (new Date(item.dueAt) < now) groups.overdue.push(item)
    else if (localDateValue(new Date(item.dueAt)) === today) groups.today.push(item)
    else groups.later.push(item)
  }
  const activeGroups = ['overdue', 'today', 'later', 'undated']
    .map(key => ({ key, items: sortTodos(groups[key], sortMode) }))
    .filter(group => group.items.length)
  if (completed.length) activeGroups.push({ key: 'completed', items: sortTodos(completed, sortMode) })
  return activeGroups
}

export function defaultQuickDue(filter, now = new Date()) {
  if (filter === 'today') {
    const evening = new Date(now)
    evening.setHours(18, 0, 0, 0)
    return localDateTimeValue(evening > now ? evening : roundedFutureDate(30, 5, now))
  }
  if (filter === 'upcoming') {
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(9, 0, 0, 0)
    return localDateTimeValue(tomorrow)
  }
  return ''
}

export function todoCounts(items, now = new Date()) {
  return {
    today: filterTodos(items, 'today', now).length,
    upcoming: filterTodos(items, 'upcoming', now).length,
    inbox: filterTodos(items, 'inbox', now).length,
    completed: filterTodos(items, 'completed', now).length
  }
}
