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

  it('wraps and unwraps the selected Markdown text without leaving an invalid selection', () => {
    const wrapper = mount(MarkdownSourceEditor, {
      props: { modelValue: '正文', ariaLabel: '源码' }
    })

    wrapper.vm.view.dispatch({ selection: { anchor: 0, head: 2 } })
    expect(wrapper.vm.applyFormat('bold')).toBe(true)
    expect(wrapper.vm.view.state.doc.toString()).toBe('**正文**')

    wrapper.vm.view.dispatch({ selection: { anchor: 0, head: 6 } })
    expect(wrapper.vm.applyFormat('bold')).toBe(true)
    expect(wrapper.vm.view.state.doc.toString()).toBe('正文')
    expect(wrapper.vm.view.state.selection.main.to).toBe(2)

    wrapper.unmount()
  })

  it('does not prefix the next line when a selection ends at its start', () => {
    const wrapper = mount(MarkdownSourceEditor, {
      props: { modelValue: '第一行\n第二行', ariaLabel: '源码' }
    })

    wrapper.vm.view.dispatch({ selection: { anchor: 0, head: 4 } })
    expect(wrapper.vm.applyFormat('bullet')).toBe(true)
    expect(wrapper.vm.view.state.doc.toString()).toBe('- 第一行\n第二行')

    wrapper.unmount()
  })

  it('applies and removes the Friday small body block in Markdown source', () => {
    const wrapper = mount(MarkdownSourceEditor, {
      props: { modelValue: '辅助说明', ariaLabel: '源码' }
    })

    wrapper.vm.view.dispatch({ selection: { anchor: 0, head: 4 } })
    expect(wrapper.vm.setSmallParagraph()).toBe(true)
    expect(wrapper.vm.view.state.doc.toString()).toBe('<p data-small-text="true">辅助说明</p>')

    wrapper.vm.view.dispatch({ selection: { anchor: 0, head: wrapper.vm.view.state.doc.length } })
    expect(wrapper.vm.setSmallParagraph()).toBe(true)
    expect(wrapper.vm.view.state.doc.toString()).toBe('辅助说明')
    wrapper.unmount()
  })
})
