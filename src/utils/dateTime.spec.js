import { describe, expect, it } from 'vitest'
import { addLocalDays, compareLocalEventTimes, defaultEventSchedule, endOneHourAfter, localDateTimeValue, roundedFutureDate, shiftEventStart } from './dateTime'

describe('date and time helpers', () => {
  it('rounds a future time to a useful step', () => {
    expect(localDateTimeValue(roundedFutureDate(30, 30, new Date(2026, 7, 26, 9, 7)))).toBe('2026-08-26T10:00')
  })

  it('creates a one hour event and crosses midnight safely', () => {
    expect(defaultEventSchedule(new Date(2026, 7, 26, 23, 34))).toEqual({
      startDate: '2026-08-27', startTime: '00:30', endDate: '2026-08-27', endTime: '01:30'
    })
    expect(endOneHourAfter('2026-08-26', '23:30')).toEqual({ endDate: '2026-08-27', endTime: '00:30' })
  })

  it('compares event ranges and handles local day changes', () => {
    expect(compareLocalEventTimes({ startDate: '2026-08-26', startTime: '10:00', endDate: '2026-08-26', endTime: '09:00' })).toBeLessThan(0)
    expect(addLocalDays('2026-08-31', 1)).toBe('2026-09-01')
  })

  it('keeps the event duration when its start moves', () => {
    expect(shiftEventStart({ startDate: '2026-08-26', startTime: '09:00', endDate: '2026-08-26', endTime: '10:30' }, '2026-08-27', '23:00')).toEqual({ endDate: '2026-08-28', endTime: '00:30' })
  })
})
