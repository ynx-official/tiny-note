import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import AvatarDrawer from './AvatarDrawer.vue'

describe('AvatarDrawer', () => {
  it('owns the overlay layout needed to open from every route', () => {
    const wrapper = mount(AvatarDrawer, {
      props: { modelValue: true },
      attachTo: document.body,
      global: {
        plugins: [createPinia(), createI18n({
          legacy: false,
          locale: 'zh-CN',
          messages: {
            'zh-CN': {
              assistantCenter: '助手中心',
              memoryManagement: '记忆管理',
              usageStatistics: '用量统计'
            }
          }
        })],
        stubs: {
          AccountPanel: true,
          MemoryManagement: true,
          SkillsManagement: true,
          McpManagement: true,
          UsageStatistics: true
        }
      }
    })

    const overlay = document.body.querySelector<HTMLElement>('.assistant-drawer-overlay')
    expect(overlay).not.toBeNull()
    const styles = readFileSync(resolve('src/styles/assistant-drawer.css'), 'utf8')
    const component = readFileSync(resolve('src/components/AvatarDrawer.vue'), 'utf8')
    expect(component).toContain("import '../styles/assistant-drawer.css'")
    expect(styles).toMatch(/\.assistant-drawer-overlay\s*\{[^}]*position:fixed/)
    expect(styles).toMatch(/\.assistant-drawer-overlay\s*\{[^}]*display:grid/)

    wrapper.unmount()
  })

  it('uses the account section as the signed-out entry point', () => {
    const wrapper = mount(AvatarDrawer, {
      props: { modelValue: true },
      attachTo: document.body,
      global: {
        plugins: [createPinia(), createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': { assistantCenter: '助手中心', memoryManagement: '记忆管理', usageStatistics: '用量统计' } } })],
        stubs: { AccountPanel: true, MemoryManagement: true, SkillsManagement: true, McpManagement: true, UsageStatistics: true },
      }
    })

    expect(document.body.querySelector('[data-section="account"]')?.classList.contains('active')).toBe(true)
    expect(document.body.querySelector('account-panel-stub')).not.toBeNull()
    wrapper.unmount()
  })
})
