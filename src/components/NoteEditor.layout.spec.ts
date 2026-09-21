import { describe, expect, it } from 'vitest'
import { mountEditor } from './NoteEditor.testHarness'

describe('note workspace layout', () => {
  it('puts the directory control beside document actions and exposes its state', async () => {
    const wrapper = await mountEditor()
    const toggle = wrapper.get('.toolbar-right-group button[aria-label="目录"]')
    expect(toggle.attributes('aria-pressed')).toBe('false')
    await toggle.trigger('click')
    expect(wrapper.emitted('toggle-toc')).toHaveLength(1)
    await wrapper.setProps({ tocVisible: true })
    expect(toggle.attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('.toc-btn').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps less frequent formatting reachable in a keyboard dismissible menu', async () => {
    const wrapper = await mountEditor()
    const trigger = wrapper.get('button[aria-label="更多格式"]')
    await trigger.trigger('click')
    const menu = wrapper.get('[aria-label="更多格式选项"]')
    expect(menu.find('button[title="清除格式"]').exists()).toBe(true)
    expect(menu.find('button[title="居中"]').exists()).toBe(true)
    await menu.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[aria-label="更多格式选项"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    wrapper.unmount()
  })

  it('closes the heading dropdown before opening another format group', async () => {
    const wrapper = await mountEditor()
    await wrapper.get('.heading-menu-anchor > button').trigger('click')
    expect(wrapper.find('.editor-heading-menu').exists()).toBe(true)
    await wrapper.get('button[aria-label="列表"]').trigger('click')
    expect(wrapper.find('.editor-heading-menu').exists()).toBe(false)
    expect(wrapper.get('[aria-label="列表选项"]').find('button[title="任务列表"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows the actual notebook path without inventing a saved state', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.get('.note-document-context').text()).toContain('未分类')
    expect(wrapper.get('.note-document-context').text()).toContain(wrapper.props('note').title)
    expect(wrapper.text()).not.toContain('已保存')
    wrapper.unmount()
  })
})
