import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it, vi } from 'vitest'
import { messages } from '../i18n'
import CodeBlockComponent from './CodeBlockComponent.vue'

function mountCodeBlock(language = 'mermaid', source = 'flowchart LR\nA --> B', editor = { isEditable: true }) {
  return mount(CodeBlockComponent, {
    props: {
      node: { attrs: { language }, textContent: source },
      editor,
      updateAttributes: vi.fn(),
      deleteNode: vi.fn()
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'zh-CN', messages })],
      stubs: {
        NodeViewWrapper: { template: '<div><slot /></div>' },
        NodeViewContent: { template: '<code class="node-view-source" />' },
        MermaidDiagram: {
          props: ['source'],
          emits: ['show-source'],
          template: '<div class="mermaid-diagram-stub" :data-source="source"><slot name="actions" /><button class="stub-show-source" @click="$emit(\'show-source\')">源码</button></div>'
        }
      }
    }
  })
}

describe('CodeBlockComponent Mermaid presentation', () => {
  it('recognizes Mermaid fenced code as a rendered diagram', async () => {
    const wrapper = mountCodeBlock()

    expect(wrapper.get('.mermaid-diagram-stub').attributes('data-source')).toContain('flowchart LR')
    expect(wrapper.get('.code-block-component').classes()).toContain('is-mermaid')
    expect(wrapper.get('.code-block-content').isVisible()).toBe(false)
    expect(wrapper.find('.code-block-header').exists()).toBe(false)

    await wrapper.get('.diagram-source-toggle').trigger('click')
    expect(wrapper.get('.language-select').find('option[value="mermaid"]').text()).toBe('Mermaid 图表')
    expect(wrapper.get('.code-block-content').attributes('style') || '').not.toContain('display: none')
    expect(wrapper.find('.mermaid-diagram-stub').exists()).toBe(false)
    expect(wrapper.get('.diagram-source-toggle').attributes('aria-pressed')).toBe('true')
  })

  it('falls back to the editable source when diagram rendering asks for it', async () => {
    const wrapper = mountCodeBlock()

    await wrapper.get('.stub-show-source').trigger('click')
    expect(wrapper.get('.code-block-content').attributes('style') || '').not.toContain('display: none')
    expect(wrapper.get('.diagram-source-toggle').text()).toContain('预览')
  })

  it('keeps ordinary fenced code on the existing code presentation', () => {
    const wrapper = mountCodeBlock('javascript', 'const answer = 42')

    expect(wrapper.find('.mermaid-diagram-stub').exists()).toBe(false)
    expect(wrapper.get('.code-block-content').isVisible()).toBe(true)
    expect(wrapper.find('.diagram-source-toggle').exists()).toBe(false)
  })

  it('recognizes Mermaid GFM info strings without discarding their metadata', async () => {
    const language = 'mermaid title=审批流程'
    const wrapper = mountCodeBlock(language)
    expect(wrapper.get('.mermaid-diagram-stub').exists()).toBe(true)

    await wrapper.get('.diagram-source-toggle').trigger('click')
    expect(wrapper.get('.language-select').element.value).toBe(language)
    expect(wrapper.get('.language-select').find('option:checked').text()).toContain('含参数')
  })

  it('removes editing actions when the host editor changes to read-only mode', async () => {
    const handlers = new Map()
    const editor = {
      isEditable: true,
      on: vi.fn((event, handler) => handlers.set(event, handler)),
      off: vi.fn()
    }
    const wrapper = mountCodeBlock('mermaid', 'flowchart LR\nA --> B', editor)
    expect(wrapper.find('[aria-label="删除代码块"]').exists()).toBe(true)

    editor.isEditable = false
    handlers.get('tinyNoteEditableChange')()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[aria-label="删除代码块"]').exists()).toBe(false)

    await wrapper.get('.diagram-source-toggle').trigger('click')
    expect(wrapper.get('.language-select').attributes()).toHaveProperty('disabled')
  })
})
