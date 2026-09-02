import { flushPromises } from '@vue/test-utils'
import { EditorContent } from '@tiptap/vue-3'
import { describe, expect, it, vi } from 'vitest'
import MarkdownSourceEditor from './MarkdownSourceEditor.vue'
import { mountEditor, note, noteEditorTestMocks } from './NoteEditor.testHarness'

const { tauriMocks } = noteEditorTestMocks()

describe('NoteEditor AI writing', () => {
  it('keeps the current non-rich mode for AI replacement and disables insertion', async () => {
    const active = note('note-ai')
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({
      notes: [active],
      editProposals: [{ id: 'proposal-ai', noteId: active.id, action: 'polish', originalText: '正文', replacementMarkdown: '# AI 新版', baseUpdatedAt: active.updatedAt, status: 'draft', sources: [] }]
    }))
    const wrapper = await mountEditor(active, { proposalId: 'proposal-ai' })
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()

    expect(wrapper.get('.ai-output-action.insert').attributes('disabled')).toBeDefined()
    await wrapper.get('.ai-output-action.replace').trigger('click')
    await flushPromises()
    expect(active.contentMarkdown).toBe('# AI 新版')
    expect(active.contentHtml).toContain('<h1 data-note-title="true">AI 新版</h1>')
    expect(wrapper.get('.editor-mode-trigger').attributes('aria-label')).toContain('Markdown')
    expect(wrapper.findComponent(MarkdownSourceEditor).text()).toContain('# AI 新版')
    wrapper.unmount()
  })

  it('replaces only the proposal selection in instant editing mode', async () => {
    vi.useFakeTimers()
    const active = note('note-ai-selection')
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({
      notes: [active],
      editProposals: [{
        id: 'proposal-ai-selection',
        noteId: active.id,
        action: 'polish',
        originalText: '正文',
        replacementMarkdown: '新的正文',
        selectionFrom: 5,
        selectionTo: 7,
        baseUpdatedAt: active.updatedAt,
        status: 'draft',
        sources: []
      }]
    }))
    const wrapper = await mountEditor(active, { proposalId: 'proposal-ai-selection' })
    const tiptapEditor = wrapper.getComponent(EditorContent).props('editor')
    tiptapEditor.commands.setTextSelection({ from: 5, to: 7 })
    expect(tiptapEditor.state.selection.empty).toBe(false)

    await wrapper.get('.ai-output-action.replace').trigger('click')
    await flushPromises()

    expect(tiptapEditor.state.selection.empty).toBe(true)
    expect(wrapper.get('.editor-content').classes()).toContain('has-pending-ai-change')
    expect(wrapper.get('.note-prose s').text()).toBe('正文')
    expect(wrapper.get('.note-prose mark[data-color="#fef08a"]').text()).toBe('新的正文')
    expect(active.contentMarkdown).toBe('# 标题\n\n正文')

    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()

    expect(wrapper.get('.note-prose s').text()).toBe('正文')
    expect(wrapper.get('.note-prose mark[data-color="#fef08a"]').text()).toBe('新的正文')
    expect(active.contentMarkdown).toBe('# 标题\n\n正文')

    await wrapper.get('.editor-content').trigger('mousedown')
    await flushPromises()

    expect(wrapper.get('.editor-content').classes()).not.toContain('has-pending-ai-change')
    expect(active.contentText.replace(/\s+/g, ' ')).toBe('标题 新的正文')
    expect(active.contentMarkdown).toBe('# 标题\n\n新的正文')
    wrapper.unmount()
  })

  it('preserves existing inline Markdown formatting for a plain-text AI replacement', async () => {
    vi.useFakeTimers()
    const active = {
      ...note('note-ai-formatting'),
      contentHtml: '<p><strong>重点内容</strong> 保留段落</p>',
      contentText: '重点内容 保留段落',
      contentMarkdown: '**重点内容** 保留段落'
    }
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({
      notes: [active],
      editProposals: [{
        id: 'proposal-ai-formatting',
        noteId: active.id,
        action: 'polish',
        originalText: '重点内容',
        replacementMarkdown: '核心内容',
        selectionFrom: 1,
        selectionTo: 5,
        baseUpdatedAt: active.updatedAt,
        status: 'draft',
        sources: []
      }]
    }))
    const wrapper = await mountEditor(active, { proposalId: 'proposal-ai-formatting' })

    await wrapper.get('.ai-output-action.replace').trigger('click')
    await flushPromises()

    await wrapper.get('.editor-content').trigger('mousedown')
    await flushPromises()

    expect(active.contentMarkdown).toContain('# **核心内容** 保留段落')
    expect(active.contentHtml).toContain('<strong>核心内容</strong>')
    wrapper.unmount()
  })

  it('previews inserted AI content with a yellow highlight before committing it', async () => {
    vi.useFakeTimers()
    const active = note('note-ai-insert')
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({
      notes: [active],
      editProposals: [{
        id: 'proposal-ai-insert',
        noteId: active.id,
        action: 'continue_write',
        originalText: '正文',
        replacementMarkdown: '补充内容',
        selectionFrom: 5,
        selectionTo: 7,
        baseUpdatedAt: active.updatedAt,
        status: 'draft',
        sources: []
      }]
    }))
    const wrapper = await mountEditor(active, { proposalId: 'proposal-ai-insert' })
    const tiptapEditor = wrapper.getComponent(EditorContent).props('editor')
    tiptapEditor.commands.setTextSelection({ from: 5, to: 7 })
    expect(tiptapEditor.state.selection.empty).toBe(false)

    await wrapper.get('.ai-output-action.insert').trigger('click')
    await flushPromises()

    expect(tiptapEditor.state.selection.empty).toBe(true)
    expect(wrapper.find('.note-prose s').exists()).toBe(false)
    expect(wrapper.get('.note-prose mark[data-color="#fef08a"]').text()).toBe('补充内容')
    expect(active.contentMarkdown).toBe('# 标题\n\n正文')

    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()

    expect(wrapper.get('.note-prose mark[data-color="#fef08a"]').text()).toBe('补充内容')
    expect(active.contentMarkdown).toBe('# 标题\n\n正文')

    await wrapper.get('.editor-content').trigger('mousedown')
    await flushPromises()

    expect(wrapper.find('.note-prose mark[data-color="#fef08a"]').exists()).toBe(false)
    expect(active.contentMarkdown).toContain('正文补充内容')
    wrapper.unmount()
  })

  it('shows and preserves the selected text in the AI writing panel', async () => {
    window.__TAURI_INTERNALS__ = {}
    localStorage.setItem('tiny-note-context-consent:default', 'granted')
    tauriMocks.invoke.mockImplementation(async (command, args) => {
      if (command === 'settings_get') return { theme: 'system', language: 'zh-CN', fimEnabled: false }
      if (command === 'model_list' || command === 'knowledge_base_list') return []
      if (command === 'background_task_list') return []
      if (command === 'note_update') return { ...note(), id: args.id, ...args.input }
      if (command === 'note_ai_task_create') return { id: 'task-ai-1', kind: 'note_ai', title: 'AI 写作', status: 'queued', payload: {}, output: '', resourceKey: `note:${args.noteId}`, targetNoteId: args.noteId, createdAt: new Date().toISOString() }
      if (command === 'background_task_transition') return { id: args.input.id, kind: 'note_ai', title: 'AI 写作', status: args.input.status, output: args.input.outputDelta || '', resourceKey: 'note:note-1', targetNoteId: 'note-1', payload: {}, createdAt: new Date().toISOString() }
      return null
    })
    const wrapper = await mountEditor()
    wrapper.vm.editor.commands.setTextSelection({ from: 1, to: 3 })
    await flushPromises()

    await wrapper.get('button[title="AI 写作"]').trigger('mousedown')
    await flushPromises()

    expect(wrapper.get('.tiny-note-ai-selection-text').text()).toBe('标题')
    expect(wrapper.get('.tiny-note-ai-textarea').attributes('placeholder')).toBe('告诉 AI 如何处理这段文字…')

    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()
    await wrapper.get('.tiny-note-ai-textarea').setValue('精炼这段内容')
    await wrapper.get('.tiny-note-send-btn').trigger('click')
    await flushPromises()

    const [, payload] = tauriMocks.invoke.mock.calls.find(([command]) => command === 'note_ai_task_create')
    expect(payload.thinkingMode).toBe('disabled')
    expect(payload).not.toHaveProperty('text')
    expect(payload.selection).toMatchObject({ from: 1, to: 3, text: '标题' })
    expect(payload).not.toHaveProperty('autoRetrieve')
    wrapper.unmount()
  })

  it('shows the backend AI error detail instead of a generic connection failure', async () => {
    window.__TAURI_INTERNALS__ = {}
    localStorage.setItem('tiny-note-context-consent:default', 'granted')
    tauriMocks.invoke.mockImplementation(async (command, args) => {
      if (command === 'settings_get') return { theme: 'system', language: 'zh-CN', fimEnabled: false }
      if (command === 'model_list' || command === 'knowledge_base_list') return []
      if (command === 'background_task_list') return []
      if (command === 'note_update') return { ...note(), id: args.id, ...args.input }
      if (command === 'note_ai_task_create') throw { code: 'api_key_not_configured', message: 'api_key_not_configured' }
      if (command === 'background_task_transition') return { id: args.input.id, kind: 'note_ai', title: 'AI 写作', status: args.input.status, output: '', errorMessage: args.input.errorMessage, resourceKey: 'note:note-1', targetNoteId: 'note-1', payload: {}, createdAt: new Date().toISOString() }
      return null
    })
    const wrapper = await mountEditor()
    wrapper.vm.editor.commands.setTextSelection({ from: 1, to: 3 })
    await flushPromises()

    await wrapper.get('button[title="润色"]').trigger('mousedown')
    await flushPromises()

    expect(wrapper.get('.ai-output-content').text()).toContain('当前模型还没有配置 API Key')
    wrapper.unmount()
  })

  it('keeps the AI output panel mounted while rewriting', async () => {
    vi.useFakeTimers()
    localStorage.setItem('tiny-note-context-consent:default', 'granted')
    const active = note('note-ai-rewrite')
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({
      notes: [active],
      editProposals: [{
        id: 'proposal-ai-rewrite',
        noteId: active.id,
        action: 'polish',
        originalText: '正文',
        replacementMarkdown: '润色后的正文',
        selectionFrom: 5,
        selectionTo: 7,
        baseUpdatedAt: active.updatedAt,
        status: 'draft',
        sources: []
      }]
    }))
    const wrapper = await mountEditor(active, { proposalId: 'proposal-ai-rewrite' })
    const panel = wrapper.get('.ai-output-panel').element

    await wrapper.get('.ai-output-action.rewrite').trigger('click')
    await flushPromises()

    expect(wrapper.get('.ai-output-panel').element).toBe(panel)
    wrapper.unmount()
  })

  it('keeps only AI actions in the selection menu and renders output Markdown', async () => {
    const active = note('note-ai-markdown-output')
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({
      notes: [active],
      editProposals: [{
        id: 'proposal-ai-markdown-output',
        noteId: active.id,
        action: 'polish',
        originalText: '正文',
        replacementMarkdown: '## 建议标题\n\n- 第一项\n- 第二项\n\n**重点内容**<script>alert(1)</script>',
        selectionFrom: 5,
        selectionTo: 7,
        baseUpdatedAt: active.updatedAt,
        status: 'draft',
        sources: []
      }]
    }))
    const wrapper = await mountEditor(active, { proposalId: 'proposal-ai-markdown-output' })
    const bubble = wrapper.get('.tiny-note-bubble-content')

    expect(bubble.find('button[title="粗体"]').exists()).toBe(false)
    expect(bubble.find('button[title="斜体"]').exists()).toBe(false)
    expect(bubble.find('button[title="下划线"]').exists()).toBe(false)
    expect(bubble.find('button[title="复制"]').exists()).toBe(false)
    expect(bubble.get('button[title="在对话中打开"]').classes()).not.toContain('chat-open-btn')
    expect(wrapper.get('.ai-output-markdown h2').text()).toBe('建议标题')
    expect(wrapper.findAll('.ai-output-markdown li').map(item => item.text())).toEqual(['第一项', '第二项'])
    expect(wrapper.get('.ai-output-markdown strong').text()).toBe('重点内容')
    expect(wrapper.find('.ai-output-markdown script').exists()).toBe(false)
    wrapper.unmount()
  })

})
