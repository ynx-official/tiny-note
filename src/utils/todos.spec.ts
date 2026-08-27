import { describe, expect, it } from 'vitest'
import { defaultQuickDue, filterTodos, filterTodoViewItems, groupTodos, sortTodos, todoCounts } from './todos'

const now = new Date(2026, 7, 26, 10, 0)
const item = (id, dueAt, extra = {}) => ({ id, title: id, dueAt, priority: 'none', completedAt: null, createdAt: '2026-08-20T00:00:00Z', ...extra })

describe('todo view helpers', () => {
  const items = [
    item('overdue', '2026-08-25T09:00:00+08:00'), item('today', '2026-08-26T18:00:00+08:00'),
    item('week', '2026-08-30T09:00:00+08:00'), item('later', '2026-09-05T09:00:00+08:00'), item('undated', null),
    item('done', null, { completedAt: '2026-08-25T10:00:00Z' })
  ]

  it('filters smart lists at their calendar boundaries', () => {
    expect(filterTodos(items, 'today', now).map(value => value.id)).toEqual(['overdue', 'today'])
    expect(filterTodos(items, 'upcoming', now).map(value => value.id)).toEqual(['today', 'week'])
    expect(filterTodos(items, 'inbox', now)).toHaveLength(5)
    expect(todoCounts(items, now)).toEqual({ today: 2, upcoming: 2, inbox: 5, completed: 1 })
  })

  it('groups active work by overdue, today, later, and undated', () => {
    expect(groupTodos(filterTodos(items, 'inbox', now), 'inbox', now).map(group => group.key)).toEqual(['overdue', 'today', 'later', 'undated'])
  })

  it('appends a contextual completed group to every smart list', () => {
    const values = [
      ...items,
      item('done-today', '2026-08-26T09:00:00+08:00', { completedAt: '2026-08-25T11:00:00+08:00' }),
      item('done-overdue', '2026-08-20T09:00:00+08:00', { completedAt: '2026-08-26T11:00:00+08:00' }),
      item('done-week', '2026-08-29T09:00:00+08:00', { completedAt: '2026-08-25T11:00:00+08:00' })
    ]
    expect(filterTodoViewItems(values, 'today', now).map(value => value.id)).toContain('done-today')
    expect(filterTodoViewItems(values, 'today', now).map(value => value.id)).not.toContain('done-overdue')
    expect(filterTodoViewItems(values, 'today', now).map(value => value.id)).not.toContain('done-week')
    expect(filterTodoViewItems(values, 'upcoming', now).map(value => value.id)).toContain('done-week')
    expect(filterTodoViewItems(values, 'inbox', now).filter(value => value.completedAt)).toHaveLength(4)
    expect(groupTodos(filterTodoViewItems(values, 'today', now), 'today', now).at(-1).key).toBe('completed')
  })

  it('supports priority and created sorting', () => {
    const values = [item('low', null, { priority: 'low', createdAt: '2026-08-21T00:00:00Z' }), item('high', null, { priority: 'high', createdAt: '2026-08-20T00:00:00Z' })]
    expect(sortTodos(values, 'priority').map(value => value.id)).toEqual(['high', 'low'])
    expect(sortTodos(values, 'created').map(value => value.id)).toEqual(['low', 'high'])
  })

  it('derives quick-add defaults from the active smart list', () => {
    expect(defaultQuickDue('inbox', now)).toBe('')
    expect(defaultQuickDue('today', now)).toBe('2026-08-26T18:00')
    expect(defaultQuickDue('upcoming', now)).toBe('2026-08-27T09:00')
    expect(defaultQuickDue('today', new Date(2026, 7, 26, 19, 2))).toBe('2026-08-26T19:35')
  })
})
