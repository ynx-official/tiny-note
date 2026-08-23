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
    expect(dialog.text()).toContain('知识库研究技能')
    expect(dialog.text()).toContain('list_knowledge_bases')
    expect(dialog.text()).toContain('retrieve_knowledge')

    await dialog.get('[aria-label="关闭说明"]').trigger('click')
    expect(wrapper.find('[role="dialog"][aria-label="Agent 技能与工具说明"]').exists()).toBe(false)
  })
})
