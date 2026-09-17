import { describe, expect, it } from 'vitest'
import { taskProgress } from './taskProgress'

describe('task progress', () => {
  const now = Date.parse('2026-09-17T10:00:00Z')
  it('distinguishes a first dispatch from an automatic retry', () => {
    expect(taskProgress({ status: 'queued', attemptCount: 0 }, now).label).toBe('等待执行')
    const progress = taskProgress({ status: 'queued', attemptCount: 1, scheduledAt: '2026-09-17T10:00:05Z', errorMessage: '连接模型服务超时' }, now)
    expect(progress.label).toBe('等待重试')
    expect(progress.detail).toContain('连接模型服务超时')
    expect(progress.detail).toContain('5 秒')
  })
  it('reports an overdue retry without inventing a failure', () => {
    const progress = taskProgress({ status: 'queued', attemptCount: 1, scheduledAt: '2026-09-17T09:58:00Z' }, now)
    expect(progress.label).toBe('重试延迟')
    expect(progress.detail).toContain('尚未重新执行')
  })
  it('shows final failures and ignores stale retry flags while running', () => {
    expect(taskProgress({ status: 'failed', errorMessage: '生成失败' }, now)).toEqual({ label: '失败', detail: '生成失败' })
    expect(taskProgress({ status: 'running', retryScheduled: true }, now).label).toBe('执行中')
  })
  it('explains quota failures instead of exposing raw provider JSON', () => {
    const progress = taskProgress({ status: 'failed', errorMessage: '图片模型返回 429: {"error":{"code":"usage_limit_reached"}}' }, now)
    expect(progress.detail).toContain('额度已用尽')
    expect(progress.detail).not.toContain('{')
  })
})
