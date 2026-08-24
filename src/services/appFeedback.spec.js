import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cancelAppDialog,
  confirmAppDialog,
  feedbackState,
  requestConfirmation,
  showToast
} from './appFeedback'

describe('appFeedback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    feedbackState.dialog.visible = false
    feedbackState.toasts.splice(0)
  })

  it('queues confirmations and resolves them through the shared dialog', async () => {
    const first = requestConfirmation({ title: '删除笔记', message: '确定删除吗？', tone: 'danger' })
    const second = requestConfirmation({ title: '恢复版本', message: '确定恢复吗？' })

    expect(feedbackState.dialog).toMatchObject({ visible: true, title: '删除笔记', tone: 'danger' })
    confirmAppDialog()
    await expect(first).resolves.toBe(true)
    await vi.runAllTicks()
    expect(feedbackState.dialog).toMatchObject({ visible: true, title: '恢复版本' })
    cancelAppDialog()
    await expect(second).resolves.toBe(false)
  })

  it('shows typed toasts and removes them after the configured duration', () => {
    const id = showToast('保存成功', { tone: 'success', duration: 1200 })
    expect(feedbackState.toasts).toEqual([expect.objectContaining({ id, message: '保存成功', tone: 'success' })])
    vi.advanceTimersByTime(1200)
    expect(feedbackState.toasts).toHaveLength(0)
  })
})
