import type { BackgroundTask } from '../types/domain'

type ProgressTask = Pick<BackgroundTask, 'status'> & Partial<Pick<BackgroundTask, 'attemptCount' | 'maxAttempts' | 'retryScheduled' | 'scheduledAt' | 'startedAt' | 'createdAt' | 'errorMessage'>>
const labels: Record<string, string> = { queued: '等待执行', running: '执行中', finalizing: '正在保存结果', cancelling: '正在取消', awaiting_approval: '等待确认', awaiting_input: '等待回答', succeeded: '已完成', failed: '失败', cancelled: '已取消', interrupted: '已中断' }

function readableError(message: string) {
  if (message.includes('usage_limit_reached')) return '图片模型额度已用尽，服务正在冷却。请等待额度恢复后重试，或切换可用的图片模型。'
  return message
}

export function taskProgress(task: ProgressTask, now = Date.now()): { label: string; detail: string } {
  if (task.status !== 'queued') return { label: labels[task.status] || task.status, detail: ['failed', 'interrupted'].includes(task.status) ? readableError(task.errorMessage || '任务未能完成，请重试。') : '' }
  const retry = task.retryScheduled || (task.attemptCount || 0) > 0 || Boolean(task.startedAt)
  const due = Date.parse(task.scheduledAt || task.createdAt || '')
  const delayed = Number.isFinite(due) && now - due > 30_000
  if (!retry) return { label: delayed ? '启动延迟' : '等待执行', detail: delayed ? '服务尚未开始执行，正在自动刷新状态；可刷新或取消任务。' : '' }
  const reason = readableError(task.errorMessage || '上次执行未完成')
  const attempt = task.attemptCount ? `已尝试 ${task.attemptCount}/${task.maxAttempts || 3} 次。` : ''
  if (delayed) return { label: '重试延迟', detail: `${reason}。${attempt}到达重试时间后尚未重新执行，正在自动刷新状态；可刷新或取消任务。` }
  const seconds = Math.max(0, Math.ceil((due - now) / 1000))
  return { label: '等待重试', detail: `${reason}。${attempt}${seconds > 0 ? `约 ${seconds} 秒后自动重试。` : '等待服务重新执行。'}` }
}
