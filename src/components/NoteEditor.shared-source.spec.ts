import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MarkdownSourceEditor from './MarkdownSourceEditor.vue'
import { mountEditor, note, noteEditorTestMocks } from './NoteEditor.testHarness'

noteEditorTestMocks()

describe('shared Markdown source fidelity', () => {
  it('opens shared source in Markdown mode and prevents rich-text conversion', async () => {
    const source = '---\ntitle: Shared\n---\n\n$$x^2$$\n\n[[Other#Section]]\n\n```mermaid\ngraph LR\n A-->B\n```\n'
    const shared = { ...note('shared-source'), markdownSource: true, contentMarkdown: source }
    const wrapper = await mountEditor(shared)
    expect(wrapper.findComponent(MarkdownSourceEditor).exists()).toBe(true)
    expect(wrapper.findComponent(MarkdownSourceEditor).props('modelValue')).toBe(source)
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[0].trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(MarkdownSourceEditor).exists()).toBe(true)
    expect(shared.contentMarkdown).toBe(source)
    wrapper.unmount()
  })
})
