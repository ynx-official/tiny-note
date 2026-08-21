import { createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { EditorContent } from '@tiptap/vue-3'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { messages } from '../i18n'
import { useNotesStore } from '../stores/notes'
import NoteEditor from './NoteEditor.vue'
import MarkdownSourceEditor from './MarkdownSourceEditor.vue'
import NoteAssistantSidebar from './NoteAssistantSidebar.vue'

const tauriMocks = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({
  Channel: class Channel {
    onmessage = null
  },
  invoke: tauriMocks.invoke
}))

if (!window.Range.prototype.getClientRects) window.Range.prototype.getClientRects = () => []
if (!window.Range.prototype.getBoundingClientRect) window.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 })

function note(id = 'note-1') {
  return {
    id,
    notebookId: null,
    title: '四种模式',
    contentHtml: '<h1>标题</h1><p>正文</p>',
    contentText: '标题\n正文',
    contentMarkdown: '# 标题\n\n正文',
    deletedAt: null,
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z'
  }
}

async function mountEditor(activeNote = note(), extraProps = {}) {
  const pinia = createPinia()
  const notesStore = useNotesStore(pinia)
  notesStore.notes = [activeNote]
  notesStore.activeId = activeNote.id
  const wrapper = mount(NoteEditor, {
    attachTo: window.document.body,
    props: { note: activeNote, ...extraProps },
    global: {
      plugins: [
        pinia,
        createI18n({ legacy: false, locale: 'zh-CN', messages })
      ],
      stubs: {
        BubbleMenu: { template: '<div><slot /></div>' },
        NoteAssistantSidebar: true,
        Transition: false
      }
    }
  })
  await flushPromises()
  wrapper.notesStore = notesStore
  return wrapper
}

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
  tauriMocks.invoke.mockReset()
  delete window.__TAURI_INTERNALS__
})

describe('NoteEditor article modes', () => {
  it('hides the assistant trigger while the sidebar is open and restores it after closing', async () => {
    vi.useFakeTimers()
    const wrapper = await mountEditor()

    expect(wrapper.get('.ai-button').text()).toContain('Tiny Note 助理')
    await wrapper.get('.ai-button').trigger('click')
    await flushPromises()

    expect(wrapper.find('.ai-button').exists()).toBe(false)
    const sidebar = wrapper.getComponent(NoteAssistantSidebar)
    await sidebar.vm.$emit('close')
    await flushPromises()

    expect(wrapper.find('.ai-button').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    expect(wrapper.get('.ai-button').text()).toContain('Tiny Note 助理')
    wrapper.unmount()
  })

  it('opens in instant editing and exposes Markdown and reading as the other primary modes', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.get('.editor-mode-trigger').text()).toContain('即时编辑')
    expect(wrapper.get('.toolbar-left-group').isVisible()).toBe(true)

    await wrapper.get('.editor-mode-trigger').trigger('click')
    const modeItems = wrapper.findAll('[role="menuitemradio"]')
    expect(modeItems.map(item => item.find('strong').text())).toEqual(['即时编辑', 'Markdown', '阅读'])
    await modeItems[1].trigger('click')
    await flushPromises()
    expect(wrapper.find('.markdown-source-editor').exists()).toBe(true)
    expect(wrapper.find('.split-preview-pane').exists()).toBe(true)
    expect(wrapper.get('.toolbar-left-group').isVisible()).toBe(false)

    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[2].trigger('click')
    await flushPromises()
    expect(wrapper.get('.note-prose').attributes('contenteditable')).toBe('false')
    expect(wrapper.find('.markdown-source-editor').exists()).toBe(false)
    wrapper.unmount()
  })

  it('supports keyboard menu navigation and keeps the current mode for another note', async () => {
    const wrapper = await mountEditor()
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.get('.editor-mode-menu').trigger('keydown', { key: 'ArrowDown' })
    expect(window.document.activeElement?.textContent).toContain('Markdown')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()
    expect(wrapper.find('.editor-workspace.mode-markdown.is-previewing').exists()).toBe(true)

    await wrapper.setProps({ note: note('note-2') })
    await flushPromises()
    expect(wrapper.get('.editor-mode-trigger').text()).toContain('Markdown')
    expect(wrapper.find('.editor-workspace.mode-markdown.is-previewing').exists()).toBe(true)
    wrapper.unmount()
  })

  it('treats preview as a layout option inside Markdown mode', async () => {
    const wrapper = await mountEditor()
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()

    const previewToggle = wrapper.get('.markdown-preview-toggle')
    expect(previewToggle.attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('.split-preview-pane').exists()).toBe(true)
    await previewToggle.trigger('click')
    await flushPromises()
    expect(previewToggle.attributes('aria-pressed')).toBe('false')
    expect(wrapper.find('.split-preview-pane').exists()).toBe(false)
    expect(wrapper.find('.markdown-source-editor').exists()).toBe(true)
    wrapper.unmount()
  })

  it('flushes an exact Markdown draft before switching notes', async () => {
    const first = note('note-source')
    const second = note('note-next')
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({ notes: [first] }))
    const wrapper = await mountEditor(first)
    wrapper.notesStore.notes.push(second)

    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()
    const source = wrapper.findComponent(MarkdownSourceEditor)
    const exactDraft = '# 新稿\n\n\n保留空行\n'
    source.vm.view.dispatch({ changes: { from: 0, to: source.vm.view.state.doc.length, insert: exactDraft } })

    await wrapper.setProps({ note: second })
    await flushPromises()
    expect(first.contentMarkdown).toBe(exactDraft)
    expect(first.contentHtml).toContain('<h1>新稿</h1>')
    expect(first.contentText).toContain('保留空行')
    expect(JSON.parse(localStorage.getItem('tiny-note-browser-state')).notes[0].contentMarkdown).toBe(exactDraft)
    expect(wrapper.get('.editor-mode-trigger').text()).toContain('Markdown')
    wrapper.unmount()
  })

  it('clamps the split divider and synchronizes both scroll directions', async () => {
    const wrapper = await mountEditor()
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()

    const workspace = wrapper.get('.editor-workspace').element
    workspace.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600 })
    await wrapper.get('.split-divider').trigger('pointerdown', { button: 0, pointerId: 7, clientX: 500 })
    const move = new window.MouseEvent('pointermove', { clientX: 950 })
    Object.defineProperty(move, 'pointerId', { value: 7 })
    window.dispatchEvent(move)
    await flushPromises()
    expect(wrapper.get('.split-divider').attributes('aria-valuenow')).toBe('70')

    const sourceScroller = wrapper.get('.cm-scroller').element
    const previewScroller = wrapper.get('.split-preview-pane').element
    Object.defineProperties(sourceScroller, { scrollHeight: { value: 1000, configurable: true }, clientHeight: { value: 500, configurable: true } })
    Object.defineProperties(previewScroller, { scrollHeight: { value: 800, configurable: true }, clientHeight: { value: 200, configurable: true } })
    sourceScroller.scrollTop = 250
    sourceScroller.dispatchEvent(new window.Event('scroll'))
    await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))
    expect(previewScroller.scrollTop).toBe(300)

    previewScroller.scrollTop = 600
    previewScroller.dispatchEvent(new window.Event('scroll'))
    await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))
    expect(sourceScroller.scrollTop).toBe(500)
    wrapper.unmount()
  })

  it('parses source after 150ms and keeps the existing 800ms autosave', async () => {
    const active = note('note-autosave')
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({ notes: [active] }))
    const wrapper = await mountEditor(active)
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()
    vi.useFakeTimers()

    const source = wrapper.findComponent(MarkdownSourceEditor)
    source.vm.view.dispatch({ changes: { from: 0, to: source.vm.view.state.doc.length, insert: '## 自动保存' } })
    await vi.advanceTimersByTimeAsync(149)
    expect(active.contentMarkdown).toBe('# 标题\n\n正文')
    await vi.advanceTimersByTimeAsync(1)
    expect(active.contentMarkdown).toBe('## 自动保存')
    expect(active.contentHtml).toContain('<h2>自动保存</h2>')
    await vi.advanceTimersByTimeAsync(800)
    expect(JSON.parse(localStorage.getItem('tiny-note-browser-state')).notes[0].contentMarkdown).toBe('## 自动保存')

    vi.useRealTimers()
    wrapper.unmount()
  })

  it('keeps transient Markdown structures editable and saves the exact source', async () => {
    const active = note('note-incomplete-markdown')
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({ notes: [active] }))
    const wrapper = await mountEditor(active)
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()
    vi.useFakeTimers()

    const source = wrapper.findComponent(MarkdownSourceEditor)
    const drafts = ['', '> ', '1. ', '最终内容']
    for (const draft of drafts) {
      source.vm.view.dispatch({ changes: { from: 0, to: source.vm.view.state.doc.length, insert: draft } })
      await vi.advanceTimersByTimeAsync(150)
      expect(active.contentMarkdown).toBe(draft)
      expect(wrapper.find('.markdown-parse-error').exists()).toBe(false)
    }

    expect(wrapper.get('.split-preview-pane').text()).toContain('最终内容')

    await vi.advanceTimersByTimeAsync(800)
    expect(JSON.parse(localStorage.getItem('tiny-note-browser-state')).notes[0].contentMarkdown).toBe('最终内容')

    vi.useRealTimers()
    wrapper.unmount()
  })

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
    expect(active.contentHtml).toContain('<h1>AI 新版</h1>')
    expect(wrapper.get('.editor-mode-trigger').text()).toContain('Markdown')
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

    expect(active.contentMarkdown).toBe('**核心内容** 保留段落')
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
      if (command === 'note_update') return { ...note(), id: args.id, ...args.input }
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

    const [, payload] = tauriMocks.invoke.mock.calls.find(([command]) => command === 'note_ai_stream')
    expect(payload.request.thinkingMode).toBe('disabled')
    expect(payload.request.text).toBe('标题')
    expect(payload.request.selection).toMatchObject({ from: 1, to: 3, text: '标题' })
    expect(payload.request.autoRetrieve).toBe(false)
    expect(wrapper.find('.stop-button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the backend AI error detail instead of a generic connection failure', async () => {
    window.__TAURI_INTERNALS__ = {}
    localStorage.setItem('tiny-note-context-consent:default', 'granted')
    tauriMocks.invoke.mockImplementation(async (command, args) => {
      if (command === 'settings_get') return { theme: 'system', language: 'zh-CN', fimEnabled: false }
      if (command === 'model_list' || command === 'knowledge_base_list') return []
      if (command === 'note_update') return { ...note(), id: args.id, ...args.input }
      if (command === 'note_ai_stream') {
        args.onEvent.onmessage({ type: 'error', code: 'ai_request_failed', message: 'api_key_not_configured' })
      }
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

  it('derives legacy Markdown lazily without updating the note until an edit', async () => {
    const legacy = note('note-legacy')
    legacy.contentMarkdown = ''
    const wrapper = await mountEditor(legacy)
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()

    const source = wrapper.findComponent(MarkdownSourceEditor)
    expect(source.vm.view.state.doc.toString()).toContain('# 标题')
    expect(legacy.contentMarkdown).toBe('')
    source.vm.view.dispatch({ changes: { from: source.vm.view.state.doc.length, insert: '\n补充' } })
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[0].trigger('click')
    await flushPromises()
    expect(legacy.contentMarkdown).toContain('补充')
    wrapper.unmount()
  })

  it('renders source edits in preview and restores them in instant editing', async () => {
    const wrapper = await mountEditor()
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()

    const source = wrapper.findComponent(MarkdownSourceEditor)
    source.vm.view.dispatch({
      changes: {
        from: 0,
        to: source.vm.view.state.doc.length,
        insert: '## 源码标题\n\n- [x] 已完成\n\n**加粗内容**'
      }
    })
    await new Promise(resolve => setTimeout(resolve, 180))
    expect(wrapper.get('.split-preview-pane').html()).toContain('<h2>源码标题</h2>')
    expect(wrapper.get('.split-preview-pane').text()).toContain('已完成')

    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[0].trigger('click')
    await flushPromises()
    expect(wrapper.get('.note-prose').html()).toContain('<h2>源码标题</h2>')
    expect(wrapper.get('.note-prose').html()).toContain('<strong>加粗内容</strong>')
    wrapper.unmount()
  })

  it('keeps the note title separate from Markdown body normalization', async () => {
    const active = note('note-title')
    const wrapper = await mountEditor(active)
    expect(wrapper.get('.title-input').element.value).toBe('四种模式')

    wrapper.vm.editor.commands.setContent('<h2>正文标题</h2><p>正文</p>')
    await flushPromises()
    expect(active.title).toBe('四种模式')
    expect(active.contentMarkdown).toContain('## 正文标题')
    expect(active.contentMarkdown.startsWith('# 四种模式')).toBe(false)
    wrapper.unmount()
  })

  it('renders Markdown pasted into the rich editor', async () => {
    const wrapper = await mountEditor()
    await wrapper.get('.note-prose').trigger('paste', {
      clipboardData: {
        getData: type => type === 'text/plain' ? '# 粘贴标题\n\n**加粗内容**' : ''
      },
    })
    await flushPromises()
    expect(wrapper.get('.note-prose').element.innerHTML).toContain('<h1>粘贴标题</h1>')
    expect(wrapper.get('.note-prose').element.innerHTML).toContain('<strong>加粗内容</strong>')
    expect(wrapper.get('.markdown-paste-notice').text()).toContain('已按 Markdown 渲染')

    await wrapper.get('.markdown-paste-source').trigger('click')
    await flushPromises()
    expect(wrapper.get('.editor-mode-trigger').text()).toContain('Markdown')
    expect(wrapper.findComponent(MarkdownSourceEditor).text()).toContain('# 粘贴标题')
    wrapper.unmount()
  })

  it('prefers Markdown from a clipboard that also contains HTML', async () => {
    const wrapper = await mountEditor()
    await wrapper.get('.note-prose').trigger('paste', {
      clipboardData: {
        getData: type => type === 'text/plain' ? '## 剪贴板标题\n\n- 第一项\n- 第二项' : '<p>## 剪贴板标题</p>'
      }
    })
    await flushPromises()
    const html = wrapper.get('.note-prose').element.innerHTML
    expect(html).toContain('<h2>剪贴板标题</h2>')
    expect(html).toContain('<li><p>第一项</p></li>')
    wrapper.unmount()
  })

  it('renders pasted Markdown quotes and defaults language-less code blocks to auto', async () => {
    const wrapper = await mountEditor()
    await wrapper.get('.note-prose').trigger('paste', {
      clipboardData: {
        getData: type => type === 'text/plain'
          ? '> 引用内容\n\n```\nconst value = 1\n```'
          : ''
      }
    })
    await flushPromises()

    const quote = wrapper.get('.note-prose blockquote')
    expect(quote.text()).toBe('引用内容')
    const language = wrapper.get('.code-block-component .language-select')
    expect(language.element.value).toBe('')
    expect(language.find('option:checked').text()).toBe('auto')
    wrapper.unmount()
  })

  it('keeps pasted Markdown table headers separate from normal-weight body cells', async () => {
    const wrapper = await mountEditor()
    await wrapper.get('.note-prose').trigger('paste', {
      clipboardData: {
        getData: type => type === 'text/plain'
          ? '| 信息对象 | 权威系统 | 处理 |\n| --- | --- | --- |\n| 项目编号 | 立项工具 | 原始主数据 |'
          : ''
      }
    })
    await flushPromises()

    expect(wrapper.findAll('.note-prose th')).toHaveLength(3)
    expect(wrapper.findAll('.note-prose td')).toHaveLength(3)
    expect(wrapper.findAll('.note-prose th > p')).toHaveLength(3)
    expect(wrapper.findAll('.note-prose td > p')).toHaveLength(3)
    expect(wrapper.findAll('.note-prose table [data-note-title]')).toHaveLength(0)
    expect(wrapper.findAll('.note-prose td strong')).toHaveLength(0)
    wrapper.unmount()
  })

  it('repairs legacy table cells that were persisted as note titles', async () => {
    const legacy = note('note-legacy-table-titles')
    legacy.contentHtml = '<h1 data-note-title="true">文档标题</h1><table><tbody><tr><th><h1 data-note-title="true"><strong>表头</strong></h1></th></tr><tr><td><h1 data-note-title="true">正文单元格</h1></td></tr></tbody></table>'
    const wrapper = await mountEditor(legacy)

    expect(wrapper.findAll('.note-prose > h1[data-note-title]')).toHaveLength(0)
    expect(wrapper.findAll('.note-prose table [data-note-title]')).toHaveLength(0)
    expect(wrapper.get('.title-input').element.value).toBe('四种模式')
    expect(wrapper.get('.note-prose th > p').text()).toBe('表头')
    expect(wrapper.get('.note-prose td > p').text()).toBe('正文单元格')
    wrapper.unmount()
  })
})
