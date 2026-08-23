import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import MarkdownSourceEditor from './MarkdownSourceEditor.vue'

describe('MarkdownSourceEditor', () => {
  it('exposes the required accessible CodeMirror interface', async () => {
    const wrapper = mount(MarkdownSourceEditor, {
      props: { modelValue: '# 标题', ariaLabel: 'Markdown 源码编辑器' }
    })

    expect(wrapper.find('.cm-content').attributes('aria-label')).toBe('Markdown 源码编辑器')
    expect(wrapper.find('.cm-content').text()).toContain('# 标题')

    await wrapper.setProps({ modelValue: '更新内容', readonly: true })
    expect(wrapper.find('.cm-content').text()).toContain('更新内容')
    expect(wrapper.find('.cm-content').attributes('contenteditable')).toBe('false')

    wrapper.unmount()
  })

  it('emits model and focus events from CodeMirror', async () => {
    const wrapper = mount(MarkdownSourceEditor, {
      props: { modelValue: '旧内容', ariaLabel: '源码' }
    })
    wrapper.vm.view.dispatch({ changes: { from: 0, to: wrapper.vm.view.state.doc.length, insert: '新内容' } })
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['新内容'])

    wrapper.find('.cm-content').element.dispatchEvent(new window.FocusEvent('focus'))
    expect(wrapper.emitted('focus')).toBeTruthy()
    wrapper.unmount()
  })
})
