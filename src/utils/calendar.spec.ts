import { describe, expect, it } from 'vitest'
import { formatDate, isInDateRange, lunarLabelForDate, monthCells, monthWeekRows, startOfWeek, todoCalendarItems, weekDays } from './calendar'

describe('calendar helpers', () => {
  it('builds a sunday-first six-week month grid', () => {
    const cells = monthCells(2026, 7)
    expect(cells).toHaveLength(42)
    expect(cells[0].date).toBe('2026-07-26')
    expect(cells[41].date).toBe('2026-09-05')
  })
  it('builds sunday-first week days', () => {
    expect(formatDate(startOfWeek(new Date(2026, 7, 26)))).toBe('2026-08-23')
    expect(weekDays(new Date(2026, 7, 26))).toHaveLength(7)
  })
  it('handles reversed date selections', () => expect(isInDateRange('2026-08-25', '2026-08-27', '2026-08-24')).toBe(true))
  it('projects due todos without changing source data', () => {
    const source = [{ id: '1', title: 'x', dueAt: '2026-08-26T03:00:00.000Z', completedAt: null }]
    const result = todoCalendarItems(source)
    expect(result[0].kind).toBe('todo')
    expect(source[0].kind).toBeUndefined()
  })
  it('projects todo date ranges as all-day multi-day items', () => {
    const [result] = todoCalendarItems([{ id: 'range', title: '专注工作', startAt: '2026-08-26T00:00:00', dueAt: '2026-08-29T23:59:00', completedAt: null }])
    expect(result).toMatchObject({ startDate: '2026-08-26', endDate: '2026-08-29', startTime: '', endTime: '', allDay: true })
  })
  it('splits multi-day items into continuous weekly segments', () => {
    const rows = monthWeekRows(2026, 7, [{ id: 'long', kind: 'event', title: '跨日', startDate: '2026-08-05', endDate: '2026-08-10' }])
    expect(rows[1].segments[0]).toMatchObject({ startColumn: 4, span: 4, continuesAfter: true })
    expect(rows[2].segments[0]).toMatchObject({ startColumn: 1, span: 2, continuesBefore: true })
  })
  it('uses readable lunar labels and highlights lunar festivals', () => {
    expect(lunarLabelForDate('2026-08-18')).toMatchObject({ text: '初六', holiday: false })
    expect(lunarLabelForDate('2026-08-19')).toEqual({ text: '七夕节', holiday: true })
  })
  it('keeps four visible lanes and counts overflow per day', () => {
    const items = Array.from({ length: 5 }, (_, index) => ({ id: String(index), kind: 'todo', title: '待办' + index, startDate: '2026-08-26', endDate: '2026-08-26' }))
    const row = monthWeekRows(2026, 7, items)[4]
    expect(row.segments).toHaveLength(4)
    expect(row.hiddenCounts[3]).toBe(1)
  })
})
