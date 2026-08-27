import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AgentInputCard from './AgentInputCard.vue'

const request = {
  title: '选择保存方式',
  question: '这篇文章应该保存到哪里？',
  options: [
    { id: 'uncategorized', label: '保存到未分类', description: '稍后可以再整理', recommended: true },
    { id: 'knowledge_base', label: '选择知识库', description: '立即建立知识库引用' }
  ],
  allowOther: true
}

describe('AgentInputCard', () => {
  it('renders compact choices and submits an option with the A-D shortcut', async () => {
    const wrapper = mount(AgentInputCard, { props: { request, interactive: true } })

    expect(wrapper.text()).toContain('A')
    expect(wrapper.text()).toContain('B')
    expect(wrapper.text()).toContain('推荐')
    await wrapper.get('[data-testid="agent-input-card"]').trigger('keydown', { key: 'b' })

    expect(wrapper.emitted('answer')?.[0]?.[0]).toEqual({ outcome: 'answered', selectedOptionId: 'knowledge_base', otherText: null })
  })

  it('expands Other, submits free text with Enter, and cancels with Escape', async () => {
    const wrapper = mount(AgentInputCard, { props: { request, interactive: true } })

    await wrapper.get('[data-testid="agent-input-other"]').trigger('click')
    const input = wrapper.get('[data-testid="agent-input-other-text"]')
    await input.setValue('保存到临时区')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('answer')?.[0]?.[0]).toEqual({ outcome: 'answered', selectedOptionId: null, otherText: '保存到临时区' })

    await wrapper.get('[data-testid="agent-input-card"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('answer')?.[1]?.[0]).toEqual({ outcome: 'cancelled', selectedOptionId: null, otherText: null })
  })

  it('renders a read-only answer in conversation history', () => {
    const wrapper = mount(AgentInputCard, {
      props: {
        request,
        interactive: false,
        status: 'answered',
        response: { outcome: 'answered', selectedOptionId: 'uncategorized', selectedLabel: '保存到未分类' }
      }
    })

    expect(wrapper.text()).toContain('已选择：保存到未分类')
    expect(wrapper.findAll('button')).toHaveLength(0)
  })
})
