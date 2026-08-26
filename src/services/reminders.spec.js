import { describe, expect, it } from 'vitest'
import { normalizedReminder } from './reminders'

describe('reminder form normalization', () => {
  it('validates before reminders against an anchor', () => {
    expect(() => normalizedReminder({ enabled: true, mode: 'before', offsetMinutes: 10 }, { hasAnchor: false })).toThrow()
    expect(normalizedReminder({ enabled: true, mode: 'before', offsetMinutes: 10 })).toMatchObject({ mode: 'before', offsetMinutes: 10 })
  })
  it('accepts an interval and optional first time', () => expect(normalizedReminder({ enabled: true, mode: 'interval', intervalMinutes: 5 })).toMatchObject({ mode: 'interval', intervalMinutes: 5 }))
  it('returns null for disabled reminders', () => expect(normalizedReminder({ enabled: false })).toBeNull())
})
