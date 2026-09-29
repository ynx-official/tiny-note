import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { beforeEach, expect, it, vi } from 'vitest'
import { messages } from '../../i18n'
import { useNoteSyncStore } from '../../stores/noteSync'
import { invoke } from '../../services/tauri'
import SettingsSync from './SettingsSync.vue'

vi.mock('../../services/tauri', () => ({ invoke: vi.fn() }))
beforeEach(() => { localStorage.clear(); vi.mocked(invoke).mockReset() })
function mountSync() {
  const pinia = createPinia()
  return { sync: useNoteSyncStore(pinia), wrapper: mount(SettingsSync, { global: { plugins: [pinia, createI18n({ legacy: false, locale: 'zh-CN', messages })] } }) }
}
it('offers custom seconds/minutes, persists valid edits and rejects invalid input', async () => {
  const { wrapper, sync } = mountSync()
  try {
    await wrapper.get('input[type="number"]').setValue(2)
    await wrapper.get('select').setValue('minutes')
    expect(sync.intervalMs).toBe(120_000)
    await wrapper.get('input[type="number"]').setValue(0)
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(sync.intervalMs).toBe(120_000)
    expect(wrapper.text()).toContain('自动保存')
  } finally { wrapper.unmount() }
})
it('keeps manual sync available while automatic updates are off and reports real success', async () => {
  const { wrapper, sync } = mountSync()
  try {
    vi.mocked(invoke).mockImplementation(async command => command === 'note_page' ? { items: [], total: 0, hasMore: false, nextCursor: '' } : [])
    expect(wrapper.text()).toContain('尚未检查')
    await wrapper.get('input[type="checkbox"]').setValue(false)
    expect(sync.preferences.enabled).toBe(false)
    await wrapper.get('[data-testid="sync-now"]').trigger('click')
    await flushPromises()
    expect(sync.lastCheckedAt).toBeGreaterThan(0)
    expect(wrapper.text()).toContain('最近检查')
  } finally { wrapper.unmount() }
})
