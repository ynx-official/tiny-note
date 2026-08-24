import { describe, expect, it } from 'vitest'
import { formatTaskDuration, taskDurationMs } from './taskDuration'

describe('task execution duration', () => {
  it('uses the persisted start and completion timestamps for finished tasks', () => {
    const task = {
      status: 'succeeded',
      startedAt: '2026-08-24T08:00:00.000Z',
      completedAt: '2026-08-24T08:01:05.000Z'
    }

    expect(taskDurationMs(task, Date.parse('2026-08-24T09:00:00.000Z'))).toBe(65_000)
    expect(formatTaskDuration(task)).toBe('耗时 1分05秒')
  })

  it('keeps counting an active task and distinguishes tasks that never started', () => {
    const running = { status: 'running', startedAt: '2026-08-24T08:00:00.000Z', completedAt: null }

    expect(formatTaskDuration(running, Date.parse('2026-08-24T08:00:09.000Z'))).toBe('已执行 9秒')
    expect(formatTaskDuration({ status: 'queued', startedAt: null }, Date.now())).toBe('等待执行')
    expect(formatTaskDuration({ status: 'cancelled', startedAt: null }, Date.now())).toBe('未执行')
  })
})
