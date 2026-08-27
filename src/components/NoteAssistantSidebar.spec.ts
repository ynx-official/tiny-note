import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NoteAssistantSidebar from './NoteAssistantSidebar.vue'

describe('NoteAssistantSidebar', () => {
  it('renders completed assistant replies as Markdown while keeping user messages as text', () => {
    const wrapper = mount(NoteAssistantSidebar, {
      props: {
        messages: [
          { role: 'user', content: '**不要渲染用户输入**' },
          { role: 'assistant', content: '## 回答\n\n- **重点**\n\n```js\nconst answer = 42\n```' }
        ]
      }
    })

    expect(wrapper.get('.tiny-note-user-bubble').text()).toBe('**不要渲染用户输入**')
    expect(wrapper.find('.tiny-note-user-bubble strong').exists()).toBe(false)
    expect(wrapper.get('.tiny-note-response-content h2').text()).toBe('回答')
    expect(wrapper.get('.tiny-note-response-content li strong').text()).toBe('重点')
    expect(wrapper.find('.tiny-note-response-content .markdown-code-block').exists()).toBe(true)
  })

  it('renders the streaming assistant reply as Markdown', () => {
    const wrapper = mount(NoteAssistantSidebar, {
      props: {
        busy: true,
        streamingText: '**正在生成**\n\n1. 第一项'
      }
    })

    expect(wrapper.get('.tiny-note-assistant-response.is-streaming strong').text()).toBe('正在生成')
    expect(wrapper.get('.tiny-note-assistant-response.is-streaming li').text()).toBe('第一项')
    expect(wrapper.find('.markdown-streaming-cursor').exists()).toBe(true)
  })

  it('sanitizes untrusted HTML in assistant replies', () => {
    const wrapper = mount(NoteAssistantSidebar, {
      props: {
        messages: [{ role: 'assistant', content: '<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\n[危险链接](javascript:alert(1))' }]
      }
    })

    const response = wrapper.get('.tiny-note-response-content')
    expect(response.find('script').exists()).toBe(false)
    expect(response.find('img').attributes('onerror')).toBeUndefined()
    expect(response.get('a').attributes('href')).toBeUndefined()
  })
})
