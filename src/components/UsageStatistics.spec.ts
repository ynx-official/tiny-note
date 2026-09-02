import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('../services/tauri', () => ({ invoke }))

import UsageStatistics from './UsageStatistics.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function stats(range: string, totalTokens: number) {
  return { range, summary: { totalRequests: 1, totalTokens, totalPrompt: totalTokens, totalCompletion: 0, totalReasoning: 0 }, byModel: [], byDay: [], bySource: [] }
}

describe('UsageStatistics', () => {
  beforeEach(() => {
    invoke.mockReset()
    vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-480)
  })

  it('sends the client timezone and ignores a stale response from the previous range', async () => {
    const today = deferred<ReturnType<typeof stats>>()
    const sevenDays = deferred<ReturnType<typeof stats>>()
    invoke.mockReturnValueOnce(today.promise).mockReturnValueOnce(sevenDays.promise)
    const wrapper = mount(UsageStatistics, {
      global: { plugins: [createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': {
        usageStatistics: '用量统计', refresh: '刷新', close: '关闭', usageRange: '范围', today: '今天', last7Days: '最近 7 天', last30Days: '最近 30 天', allTime: '全部', clearUsage: '清理', totalTokens: '总量', promptTokens: '输入', completionTokens: '输出', reasoningTokens: '推理', requests: '请求', dailyTrend: '趋势', byModel: '模型', bySource: '来源', usageEmpty: '暂无', usageHint: '暂无记录'
      } } })] }
    })
    await flushPromises()

    await wrapper.findAll('.usage-range-tabs button')[1].trigger('click')
    sevenDays.resolve(stats('7d', 700))
    await flushPromises()
    today.resolve(stats('today', 100))
    await flushPromises()

    expect(invoke).toHaveBeenNthCalledWith(1, 'usage_get_stats', { range: 'today', timezoneOffsetMinutes: 480 })
    expect(invoke).toHaveBeenNthCalledWith(2, 'usage_get_stats', { range: '7d', timezoneOffsetMinutes: 480 })
    expect(wrapper.findAll('.usage-summary-card strong')[0].text()).toBe('700')
  })
})
