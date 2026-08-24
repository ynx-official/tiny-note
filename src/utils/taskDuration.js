const ACTIVE_STATUSES = new Set(['running', 'awaiting_approval', 'awaiting_input'])
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'interrupted'])

function timestamp(value) {
  const parsed = value ? new Date(value).getTime() : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

export function taskDurationMs(task, now = Date.now()) {
  const startedAt = timestamp(task?.startedAt)
  if (startedAt == null) return null

  const persistedEnd = timestamp(task?.completedAt)
  const updatedEnd = TERMINAL_STATUSES.has(task?.status) ? timestamp(task?.updatedAt) : null
  const endedAt = persistedEnd ?? updatedEnd ?? now
  return Math.max(0, endedAt - startedAt)
}

export function formatDuration(milliseconds) {
  if (milliseconds < 1000) return '<1秒'
  const totalSeconds = Math.floor(milliseconds / 1000)
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const totalHours = Math.floor(totalMinutes / 60)
  const hours = totalHours % 24
  const days = Math.floor(totalHours / 24)

  if (days) return `${days}天${hours ? `${hours}小时` : ''}${minutes ? `${minutes}分` : ''}`
  if (totalHours) return `${totalHours}小时${String(minutes).padStart(2, '0')}分${String(seconds).padStart(2, '0')}秒`
  if (totalMinutes) return `${totalMinutes}分${String(seconds).padStart(2, '0')}秒`
  return `${seconds}秒`
}

export function formatTaskDuration(task, now = Date.now()) {
  const duration = taskDurationMs(task, now)
  if (duration == null) return task?.status === 'queued' ? '等待执行' : '未执行'
  return `${ACTIVE_STATUSES.has(task?.status) ? '已执行' : '耗时'} ${formatDuration(duration)}`
}
