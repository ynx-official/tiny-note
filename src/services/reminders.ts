import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification'
import type { Reminder } from '../types/domain'

interface ReminderDraft { enabled?: boolean; mode?: string; offsetMinutes?: number | string | null; intervalMinutes?: number | string | null; triggerAt?: string | null }

export async function ensureReminderPermission() {
  if (!window.__TAURI_INTERNALS__) return true
  if (await isPermissionGranted()) return true
  return (await requestPermission()) === 'granted'
}

export function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function fromDateTimeLocal(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function reminderSummary(reminder: Partial<Reminder> | null | undefined, locale = 'zh-CN') {
  if (!reminder?.enabled) return locale === 'zh-CN' ? '不提醒' : 'No reminder'
  if (reminder.mode === 'before') return locale === 'zh-CN' ? `提前 ${reminder.offsetMinutes} 分钟` : `${reminder.offsetMinutes} min before`
  if (reminder.mode === 'interval') return locale === 'zh-CN' ? `每隔 ${reminder.intervalMinutes} 分钟` : `Every ${reminder.intervalMinutes} min`
  return new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(reminder.triggerAt || ''))
}

export function normalizedReminder(draft: ReminderDraft | null | undefined, { hasAnchor = true } = {}) {
  if (!draft?.enabled) return null
  const mode = draft.mode || 'at'
  if (mode === 'before') {
    if (!hasAnchor) throw new Error('提前提醒需要具体的开始或截止时间')
    const offsetMinutes = Number(draft.offsetMinutes)
    if (!Number.isInteger(offsetMinutes) || offsetMinutes <= 0) throw new Error('提前分钟数必须大于 0')
    return { mode, offsetMinutes, triggerAt: null, intervalMinutes: null, enabled: true }
  }
  const triggerAt = fromDateTimeLocal(draft.triggerAt)
  if (mode === 'at' && !triggerAt) throw new Error('请选择提醒时间')
  if (mode === 'interval') {
    const intervalMinutes = Number(draft.intervalMinutes)
    if (!Number.isInteger(intervalMinutes) || intervalMinutes <= 0) throw new Error('提醒间隔必须大于 0')
    return { mode, triggerAt, offsetMinutes: null, intervalMinutes, enabled: true }
  }
  return { mode, triggerAt, offsetMinutes: null, intervalMinutes: null, enabled: true }
}
