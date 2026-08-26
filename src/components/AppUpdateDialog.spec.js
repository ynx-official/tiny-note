import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppUpdateDialog from './AppUpdateDialog.vue'

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  downloadAndInstall: vi.fn()
}))

vi.mock('../services/appUpdater', () => ({
  appUpdater: mocks,
  UPDATE_CHECK_INTERVAL_MS: 6 * 60 * 60 * 1000,
  UPDATE_RETRY_INTERVAL_MS: 15 * 60 * 1000
}))

describe('AppUpdateDialog automatic scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.check.mockReset().mockResolvedValue({ supported: true, available: false })
    mocks.downloadAndInstall.mockReset()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('checks after startup and keeps checking every six hours while open', async () => {
    const wrapper = mount(AppUpdateDialog)

    await vi.advanceTimersByTimeAsync(2200)
    expect(mocks.check).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000)
    expect(mocks.check).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })

  it('retries a failed automatic check after fifteen minutes', async () => {
    mocks.check.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ supported: true, available: false })
    const wrapper = mount(AppUpdateDialog)

    await vi.advanceTimersByTimeAsync(2200)
    expect(mocks.check).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000)
    expect(mocks.check).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })
})
