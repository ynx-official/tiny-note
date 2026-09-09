import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SkillsManagement from './SkillsManagement.vue'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('../services/tauri', () => ({ invoke }))

describe('SkillsManagement', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockResolvedValue([])
  })

  it('explains the boundary between Agent skills and tools with an example', async () => {
    const wrapper = mount(SkillsManagement)
    await flushPromises()

    expect(wrapper.find('[role="dialog"][aria-label="Agent 技能与工具说明"]').exists()).toBe(false)

    await wrapper.get('[data-testid="skills-help"]').trigger('click')

    const dialog = wrapper.get('[role="dialog"][aria-label="Agent 技能与工具说明"]')
    expect(dialog.text()).toContain('技能决定怎么做')
    expect(dialog.text()).toContain('工具决定能做什么')
    expect(dialog.text()).toContain('笔记整理技能')
    expect(dialog.text()).toContain('list_notes')
    expect(dialog.text()).toContain('get_note')
    expect(dialog.text()).not.toContain('retrieve_knowledge')

    await dialog.get('[aria-label="关闭说明"]').trigger('click')
    expect(wrapper.find('[role="dialog"][aria-label="Agent 技能与工具说明"]').exists()).toBe(false)
  })

  it('renders cloud system skills as read-only', async () => {
    invoke.mockResolvedValueOnce([{
      id: 'system-1',
      name: 'note-organizer',
      fileName: 'note-organizer/SKILL.md',
      description: '管理笔记',
      builtin: true,
      scope: 'system',
      enabled: true
    }])

    const wrapper = mount(SkillsManagement)
    await flushPromises()

    const card = wrapper.get('.skill-card')
    expect(card.text()).toContain('系统')
    expect(card.find('[title="编辑"]').exists()).toBe(false)
    expect(card.find('[title="删除"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('系统技能由云端统一提供且只读')
    expect(wrapper.text()).not.toContain('技能保存在本机')
  })
})
