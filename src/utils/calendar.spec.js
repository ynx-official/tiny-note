import { describe, expect, it } from 'vitest'
import { formatDate, isInDateRange, monthCells, startOfWeek, todoCalendarItems, weekDays } from './calendar'

describe('calendar helpers', () => {
  it('builds a monday-first six-week month grid', () => {
    const cells = monthCells(2026, 7)
    expect(cells).toHaveLength(42)
    expect(cells[0].date).toBe('2026-07-27')
    expect(cells[41].date).toBe('2026-09-06')
  })
  it('builds monday-first week days', () => {
    expect(formatDate(startOfWeek(new Date(2026, 7, 26)))).toBe('2026-08-24')
    expect(weekDays(new Date(2026, 7, 26))).toHaveLength(7)
  })
  it('handles reversed date selections', () => expect(isInDateRange('2026-08-25', '2026-08-27', '2026-08-24')).toBe(true))
  it('projects due todos without changing source data', () => {
    const source = [{ id: '1', title: 'x', dueAt: '2026-08-26T03:00:00.000Z', completedAt: null }]
    const result = todoCalendarItems(source)
    expect(result[0].kind).toBe('todo')
    expect(source[0].kind).toBeUndefined()
  })
})
