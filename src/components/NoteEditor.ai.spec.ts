import { mountEditor, note, noteEditorTestMocks, selectText, switchMode, editMarkdown } from './NoteEditor.testHarness'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import NoteAssistantSidebar from './NoteAssistantSidebar.vue'
import type { EditProposal, Note } from '../types/domain'

const { tauriMocks } = noteEditorTestMocks()
async function withProposal(source = '# 标题\n\n正文', partial: Partial<EditProposal> = {}) {
  const active = { ...note('ai-note'), contentMarkdown: source }
  const from = source.indexOf('正文')
  const proposal = { id: 'proposal', noteId: active.id, action: 'polish', originalText: '正文', replacementMarkdown: '新的正文', selectionFrom: from, selectionTo: from + 2, baseUpdatedAt: active.updatedAt, status: 'draft', sources: [], ...partial }
  localStorage.setItem('tiny-note-browser-state', JSON.stringify({ notes: [active], editProposals: [proposal] }))
  return { active, wrapper: await mountEditor(active, { proposalId: 'proposal' }) }
}

describe('Vditor AI workflows', () => {
  it.each(['rich', 'markdown'] as const)('applies a proposal only to the selected range in %s mode', async mode => {
    const { active, wrapper: w } = await withProposal()
    try {
      if (mode === 'markdown') await switchMode(w, mode)
      expect(w.get('.ai-diff-before').text()).toContain('正文')
      expect(w.get('.ai-diff-after').text()).toContain('新的正文')
      expect(active.contentMarkdown).toBe('# 标题\n\n正文')
      await w.get('.ai-output-action.replace').trigger('click'); await flushPromises()
      expect(active.contentMarkdown).toBe('# 标题\n\n新的正文')
      expect(active.contentHtml).toContain('新的正文')
      expect(w.vm.editorMode).toBe(mode)
      expect(w.get('.note-auto-save').text()).toBe('已保存')
      await vi.waitFor(() => expect(w.find('.ai-output-panel').exists()).toBe(false))
    } finally { w.unmount() }
  })
  it.each(['rich', 'markdown'] as const)('inserts after a selection in %s without diff markup', async mode => {
    const { active, wrapper: w } = await withProposal()
    try {
      if (mode === 'markdown') await switchMode(w, mode)
      expect(w.get('.ai-output-action.insert').attributes('disabled')).toBeUndefined()
      await w.get('.ai-output-action.insert').trigger('click'); await flushPromises()
      expect(active.contentMarkdown).toBe('# 标题\n\n正文新的正文')
      expect(active.contentHtml).not.toContain('<mark')
      expect(active.contentHtml).not.toContain('<s>')
    } finally { w.unmount() }
  })
  it('preserves inline formatting around a plain-text replacement', async () => {
    const { active, wrapper: w } = await withProposal('**正文** 保留段落')
    try {
      await w.get('.ai-output-action.replace').trigger('click'); await flushPromises()
      expect(active.contentMarkdown).toBe('**新的正文** 保留段落')
      expect(active.contentHtml).toContain('<strong>新的正文</strong>')
    } finally { w.unmount() }
  })
  it('distinguishes repeated text by Markdown offsets', async () => {
    const { active, wrapper: w } = await withProposal('正文\n\n正文', { selectionFrom: 4, selectionTo: 6 })
    try {
      await w.get('.ai-output-action.replace').trigger('click'); await flushPromises()
      expect(active.contentMarkdown).toBe('正文\n\n新的正文')
    } finally { w.unmount() }
  })
  it('rejects a stale document instead of replacing the wrong content', async () => {
    const { active, wrapper: w } = await withProposal()
    try {
      editMarkdown(w, '# 标题\n\n用户修改正文')
      await w.get('.ai-output-action.replace').trigger('click'); await flushPromises()
      expect(w.get('.ai-apply-error').text()).toContain('文章已经发生变化')
      expect(active.contentMarkdown).toBe('# 标题\n\n用户修改正文')
      expect(w.find('.ai-output-panel').exists()).toBe(true)
    } finally { w.unmount() }
  })
  it('rejects an external proposal loaded after an unsaved local edit', async () => {
    const active = note('external-proposal')
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({ notes: [active], editProposals: [{
      id: 'late-proposal', noteId: active.id, status: 'draft', action: 'polish', originalText: active.contentMarkdown,
      replacementMarkdown: '过期的整篇改写', baseUpdatedAt: active.updatedAt, selectionFrom: null, selectionTo: null
    }] }))
    const w = await mountEditor(active)
    try {
      editMarkdown(w, '用户刚刚写的新草稿')
      await w.setProps({ proposalId: 'late-proposal' }); await flushPromises()
      await w.get('.ai-output-action.replace').trigger('click'); await flushPromises()
      expect(active.contentMarkdown).toBe('用户刚刚写的新草稿')
      expect(w.get('.ai-apply-error').text()).toContain('文章已经发生变化')
    } finally { w.unmount() }
  })
  it('restores the draft and keeps the proposal on server apply failure', async () => {
    const { active, wrapper: w } = await withProposal()
    try {
      window.__TAURI_INTERNALS__ = {}
      tauriMocks.invoke.mockRejectedValueOnce(new Error('服务器暂不可用'))
      await w.get('.ai-output-action.replace').trigger('click'); await flushPromises()
      expect(active.contentMarkdown).toBe('# 标题\n\n正文')
      expect(w.vm.editor.getMarkdown()).toBe(active.contentMarkdown)
      expect(w.get('.ai-apply-error').text()).toContain('服务器暂不可用')
      expect(w.find('.ai-output-panel').exists()).toBe(true)
    } finally { w.unmount() }
  })
  it('rejects an empty apply response without reporting a save', async () => {
    const { active, wrapper: w } = await withProposal()
    try {
      window.__TAURI_INTERNALS__ = {}
      tauriMocks.invoke.mockResolvedValue(null)
      await w.get('.ai-output-action.replace').trigger('click'); await flushPromises()
      expect(active.contentMarkdown).toBe('# 标题\n\n正文')
      expect(w.find('.ai-apply-error').exists()).toBe(true)
      expect(w.find('.ai-output-panel').exists()).toBe(true)
    } finally { w.unmount() }
  })
  it('does not start AI on another article when a save completes late', async () => {
    localStorage.setItem('tiny-note-context-consent:default', 'granted')
    const w = await mountEditor()
    let finish!: () => void
    const create = vi.spyOn(w.vm.tasksStore, 'createNoteAI')
    try {
      editMarkdown(w, '# 标题\n\n要润色的文字')
      vi.spyOn(w.notesStore, 'save').mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
      await selectText(w, '要润色的文字')
      await w.get('button[title="润色"]').trigger('mousedown'); await flushPromises()
      const next = note('another-note')
      w.notesStore.notes.push(next)
      await w.setProps({ note: next }); await flushPromises()
      finish(); await flushPromises()
      expect(create).not.toHaveBeenCalled()
      expect(w.vm.editor.getMarkdown()).toBe(next.contentMarkdown)
    } finally { finish?.(); w.unmount() }
  })
  it('keeps a late apply response attached to its original article', async () => {
    const { active, wrapper: w } = await withProposal()
    let finish!: (value: Note) => void
    try {
      window.__TAURI_INTERNALS__ = {}
      tauriMocks.invoke.mockImplementation(command => command === 'note_edit_apply'
        ? new Promise(resolve => { finish = resolve }) : Promise.resolve([]))
      await w.get('.ai-output-action.replace').trigger('click'); await flushPromises()
      const next = { ...note('next-after-ai'), contentMarkdown: '另一篇文章' }
      w.notesStore.notes.push(next)
      await w.setProps({ note: next }); await flushPromises()
      finish({ ...active, contentMarkdown: '# 标题\n\n新的正文', contentText: '新的正文', version: 2 })
      await flushPromises()
      expect(active.contentMarkdown).toContain('新的正文')
      expect(next.contentMarkdown).toBe('另一篇文章')
      expect(w.vm.editor.getMarkdown()).toBe('另一篇文章')
      await vi.waitFor(() => expect(w.find('.ai-output-panel').exists()).toBe(false))
    } finally { w.unmount() }
  })
  it('replaces the whole article only when the proposal has no selection', async () => {
    const { active, wrapper: w } = await withProposal(undefined, { selectionFrom: null, selectionTo: null, replacementMarkdown: '# 完整新版' })
    try {
      await w.get('.ai-output-action.replace').trigger('click'); await flushPromises()
      expect(active.contentMarkdown).toBe('# 完整新版')
    } finally { w.unmount() }
  })
  it.each(['polish', 'custom', 'assistant', 'source'])('sends %s with a saved Markdown selection and current version', async entry => {
    window.__TAURI_INTERNALS__ = {}
    localStorage.setItem('tiny-note-context-consent:default', 'granted')
    let persisted: Note = note()
    tauriMocks.invoke.mockImplementation(async (command, args) => {
      if (command === 'settings_get') return { theme: 'system', language: 'zh-CN', fimEnabled: false }
      if (['model_list', 'knowledge_base_list', 'background_task_list'].includes(command)) return []
      if (command === 'note_update') { persisted = { ...persisted, ...args.input, version: (args.input.version || 1) + 1 }; return persisted }
      if (command === 'note_ai_task_create') {
        expect(persisted.contentMarkdown.slice(args.selection.from, args.selection.to)).toBe(args.selection.text)
        return { id: 'task-ai', kind: 'note_ai', title: 'AI 写作', status: 'queued', payload: {}, output: '', createdAt: new Date().toISOString() }
      }
      return null
    })
    const w = await mountEditor()
    try {
      const source = '# 标题\n\n**需要润色**\n\n保留内容'
      editMarkdown(w, source)
      if (entry === 'source') await switchMode(w, 'markdown')
      await selectText(w, '需要润色')
      if (entry === 'assistant') {
        await w.get('button[title="在对话中打开"]').trigger('mousedown')
        w.getComponent(NoteAssistantSidebar).vm.$emit('send', '润色选中文字')
      } else if (entry === 'custom') {
        await w.get('button[title="AI 写作"]').trigger('mousedown')
        expect(w.get('.tiny-note-ai-selection-text').text()).toBe('需要润色')
        await w.get('.tiny-note-ai-textarea').setValue('精炼这段内容')
        await w.get('.tiny-note-send-btn').trigger('click')
      } else await w.get('button[title="润色"]').trigger('mousedown')
      await flushPromises()
      const call = tauriMocks.invoke.mock.calls.find(([command]) => command === 'note_ai_task_create')
      expect(call).toBeDefined()
      expect(call![1].selection).toMatchObject({ from: source.indexOf('需要润色'), to: source.indexOf('需要润色') + 4, text: '需要润色' })
      expect(call![1].baseVersion).toBe(persisted.version)
    } finally { w.unmount() }
  })
  it('requires the existing context consent and blocks external-file AI', async () => {
    const w = await mountEditor()
    try {
      await selectText(w, '正文'); await w.get('button[title="润色"]').trigger('mousedown')
      expect(w.find('.ai-consent-dialog').exists()).toBe(true)
      expect(tauriMocks.invoke.mock.calls.some(([command]) => command === 'note_ai_task_create')).toBe(false)
    } finally { w.unmount() }
    const external = await mountEditor({ ...note('external-ai'), external: true })
    try {
      await selectText(external, '正文'); await external.get('button[title="润色"]').trigger('mousedown')
      expect(external.find('.ai-output-panel').exists()).toBe(false)
      expect(external.find('.ai-consent-dialog').exists()).toBe(false)
    } finally { external.unmount() }
  })
  it.each(['rich', 'markdown'] as const)('accepts FIM at the Markdown cursor in %s', async mode => {
    localStorage.setItem('tiny-note-context-consent:default', 'granted')
    const w = await mountEditor()
    try {
      window.__TAURI_INTERNALS__ = {}
      w.appStore.settings.fimEnabled = true
      tauriMocks.invoke.mockImplementation(async (command, args) => {
        if (command === 'note_fim_stream') {
          expect(args.request.text).toBe('# 标题\n\n正文')
          args.onEvent.emit({ type: 'delta', text: '**补全**' })
          args.onEvent.emit({ type: 'completed' })
        }
        return null
      })
      if (mode === 'markdown') await switchMode(w, mode)
      await selectText(w, '正文')
      window.getSelection()!.collapseToEnd()
      document.dispatchEvent(new Event('selectionchange'))
      expect(w.vm.editor.getSelection()).toMatchObject({ from: 8, to: 8, text: '' })
      await w.vm.workspace.runFim(); await flushPromises()
      expect(tauriMocks.invoke.mock.calls.some(([c]) => c === 'note_fim_stream')).toBe(true)
      expect(w.get('.fim-suggestion').text()).toContain('**补全**')
      await w.get(mode === 'markdown' ? '.vditor-sv' : '.vditor-ir pre.vditor-reset').trigger('keydown', { key: 'Tab' })
      expect(w.vm.editor.getMarkdown()).toBe('# 标题\n\n正文**补全**')
      expect(w.find('.fim-suggestion').exists()).toBe(false)
    } finally { delete window.__TAURI_INTERNALS__; w.unmount() }
  })
  it('renders safe Markdown in the result and keeps only AI actions in the selection menu', async () => {
    const { wrapper: w } = await withProposal(undefined, { replacementMarkdown: '## 建议\n\n- 第一项\n- 第二项\n\n**重点**<script>alert(1)</script>' })
    try {
      expect(w.get('.ai-output-markdown h2').text()).toBe('建议')
      expect(w.findAll('.ai-output-markdown li')).toHaveLength(2)
      expect(w.find('.ai-output-markdown script').exists()).toBe(false)
      expect(w.find('.tiny-note-bubble-content button[title="粗体"]').exists()).toBe(false)
      expect(w.find('.tiny-note-bubble-content button[title="在对话中打开"]').exists()).toBe(true)
    } finally { w.unmount() }
  })
})
