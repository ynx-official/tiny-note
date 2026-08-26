import { createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { EditorContent } from '@tiptap/vue-3'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { messages } from '../i18n'
import { useAppStore } from '../stores/app'
import { useNotesStore } from '../stores/notes'
import NoteEditor from './NoteEditor.vue'
import MarkdownSourceEditor from './MarkdownSourceEditor.vue'
import NoteAssistantSidebar from './NoteAssistantSidebar.vue'

const tauriMocks = vi.hoisted(() => ({ invoke: vi.fn() }))
const noteExportMocks = vi.hoisted(() => ({
  downloadNoteHtml: vi.fn(),
  exportNotePdf: vi.fn(),
  printNote: vi.fn()
}))
const exportLocationMocks = vi.hoisted(() => ({ saveExportBlob: vi.fn(async () => ({ fileName: 'exported' })) }))
const exportSuccessMocks = vi.hoisted(() => ({ showExportSuccess: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({
  Channel: class Channel {
    onmessage = null
  },
  invoke: tauriMocks.invoke
}))
vi.mock('../utils/noteExport', async importOriginal => ({
  ...await importOriginal(),
  downloadNoteHtml: noteExportMocks.downloadNoteHtml,
  exportNotePdf: noteExportMocks.exportNotePdf,
  printNote: noteExportMocks.printNote
}))
vi.mock('../services/exportLocation', () => ({ saveExportBlob: exportLocationMocks.saveExportBlob }))
vi.mock('../services/exportSuccess', () => ({ showExportSuccess: exportSuccessMocks.showExportSuccess }))

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
  noteExportMocks.downloadNoteHtml.mockImplementation((snapshot, options) => options.download(new globalThis.Blob(['html']), `${snapshot.title}.html`))
  noteExportMocks.exportNotePdf.mockImplementation(async (snapshot, options) => options.download(new globalThis.Blob(['pdf']), `${snapshot.title}.pdf`))
  const pinia = createPinia()
  const appStore = useAppStore(pinia)
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
        MermaidDiagram: {
          props: ['source'],
          template: '<div class="mermaid-diagram-test" :data-source="source"></div>'
        },
        NoteAssistantSidebar: true,
        Transition: false
      }
    }
  })
  await flushPromises()
  wrapper.notesStore = notesStore
  wrapper.appStore = appStore
  return wrapper
}

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
  tauriMocks.invoke.mockReset()
  noteExportMocks.downloadNoteHtml.mockReset()
  noteExportMocks.exportNotePdf.mockReset()
  noteExportMocks.printNote.mockReset()
  exportLocationMocks.saveExportBlob.mockClear()
  exportSuccessMocks.showExportSuccess.mockClear()
  delete window.__TAURI_INTERNALS__
})

describe('NoteEditor article modes', () => {
  it('marks an external source and offers an explicit import action', async () => {
    const external = { ...note('external-note'), external: true, externalPath: 'C:\\docs\\outside.md' }
    const wrapper = await mountEditor(external)

    expect(wrapper.get('.external-note-banner').text()).toContain('外部文件')
    expect(wrapper.get('.external-note-banner').text()).toContain('outside.md')
    expect(wrapper.get('.external-note-banner').text()).toContain('不会出现在笔记列表')
    expect(wrapper.get('.editor-mode-trigger').text()).toContain('Markdown')

    await wrapper.get('.external-note-import').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('import-external')).toEqual([[external]])
    wrapper.unmount()
  })

  it('offers separate print, PDF, and HTML actions instead of a combined print/PDF command', async () => {
    const wrapper = await mountEditor()

    const trigger = wrapper.get('button[title="更多"]')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.toolbar-more-menu').attributes('role')).toBe('menu')
    const labels = wrapper.findAll('.toolbar-more-menu button').map(button => button.text().trim())

    expect(labels).toContain('打印')
    expect(labels).toContain('导出 PDF')
    expect(labels).toContain('导出 HTML')
    expect(labels).not.toContain('打印 / 保存 PDF')
    await wrapper.get('.toolbar-more-menu').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.toolbar-more-menu').exists()).toBe(false)
    expect(window.document.activeElement).toBe(trigger.element)
    wrapper.unmount()
  })

  it('keeps export progress visible after the more menu closes', async () => {
    let finishPdf
    noteExportMocks.exportNotePdf.mockImplementationOnce(() => new Promise(resolve => { finishPdf = resolve }))
    const wrapper = await mountEditor()

    await wrapper.get('button[title="更多"]').trigger('click')
    await wrapper.findAll('.toolbar-more-menu button').find(button => button.text().includes('导出 PDF')).trigger('click')
    await flushPromises()

    expect(wrapper.find('.toolbar-more-menu').exists()).toBe(false)
    expect(wrapper.get('.toolbar-export-status').text()).toContain('正在导出 PDF')
    expect(wrapper.get('.toolbar-export-status').attributes('role')).toBe('status')

    finishPdf()
    await flushPromises()
    expect(wrapper.find('.toolbar-export-status').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the exported file actions after a desktop file is written', async () => {
    exportLocationMocks.saveExportBlob.mockResolvedValueOnce({ path: 'D:\\Exports\\四种模式.html', fileName: '四种模式.html' })
    const wrapper = await mountEditor()

    await wrapper.get('button[title="更多"]').trigger('click')
    await wrapper.findAll('.toolbar-more-menu button').find(button => button.text().includes('导出 HTML')).trigger('click')
    await flushPromises()

    expect(exportSuccessMocks.showExportSuccess).toHaveBeenCalledWith({ path: 'D:\\Exports\\四种模式.html', fileName: '四种模式.html' })
    wrapper.unmount()
  })

  it('flushes the latest Markdown draft before exporting HTML, PDF, or printing', async () => {
    const active = note('note-export')
    const wrapper = await mountEditor(active)
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()

    const source = wrapper.findComponent(MarkdownSourceEditor)
    source.vm.view.dispatch({
      changes: {
        from: 0,
        to: source.vm.view.state.doc.length,
        insert: '## 最新草稿\n\n尚未经过 150ms 防抖'
      }
    })

    await wrapper.get('button[title="更多"]').trigger('click')
    await wrapper.findAll('.toolbar-more-menu button').find(button => button.text().includes('导出 HTML')).trigger('click')
    await flushPromises()
    expect(noteExportMocks.downloadNoteHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '最新草稿',
        contentHtml: expect.stringContaining('尚未经过 150ms 防抖')
      }),
      expect.objectContaining({ lang: 'zh-CN', download: expect.any(Function) })
    )
    expect(noteExportMocks.downloadNoteHtml.mock.calls[0][0].contentHtml).not.toContain('最新草稿')

    await wrapper.get('button[title="更多"]').trigger('click')
    await wrapper.findAll('.toolbar-more-menu button').find(button => button.text().includes('导出 PDF')).trigger('click')
    await flushPromises()
    expect(noteExportMocks.exportNotePdf).toHaveBeenCalledWith(expect.objectContaining({ contentHtml: expect.stringContaining('尚未经过 150ms 防抖') }), expect.objectContaining({ download: expect.any(Function) }))

    await wrapper.get('button[title="更多"]').trigger('click')
    await wrapper.findAll('.toolbar-more-menu button').find(button => button.text().trim() === '打印').trigger('click')
    await flushPromises()
    expect(noteExportMocks.printNote).toHaveBeenCalledWith(expect.objectContaining({ contentHtml: expect.stringContaining('尚未经过 150ms 防抖') }))
    wrapper.unmount()
  })

  it('hides the assistant trigger while the sidebar is open and restores it after closing', async () => {
    vi.useFakeTimers()
    const wrapper = await mountEditor()

    expect(wrapper.get('.ai-button').text()).toContain('Tiny Note 助理')
    await wrapper.get('.ai-button').trigger('click')
    await flushPromises()

    expect(wrapper.find('.ai-button').exists()).toBe(false)
    expect(wrapper.get('.friday-editor-toolbar').classes()).toContain('with-assistant')
    const sidebar = wrapper.getComponent(NoteAssistantSidebar)
    await sidebar.vm.$emit('close')
    await flushPromises()

    expect(wrapper.find('.ai-button').exists()).toBe(false)
    expect(wrapper.get('.friday-editor-toolbar').classes()).toContain('with-assistant')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    expect(wrapper.get('.ai-button').text()).toContain('Tiny Note 助理')
    expect(wrapper.get('.friday-editor-toolbar').classes()).not.toContain('with-assistant')
    wrapper.unmount()
  })

  it('opens in instant editing and exposes only instant editing and Markdown', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.get('.editor-mode-trigger').text()).toContain('即时编辑')
    expect(wrapper.get('.toolbar-left-group').isVisible()).toBe(true)

    await wrapper.get('.editor-mode-trigger').trigger('click')
    const modeItems = wrapper.findAll('[role="menuitemradio"]')
    expect(modeItems.map(item => item.find('strong').text())).toEqual(['即时编辑', 'Markdown'])
    await modeItems[1].trigger('click')
    await flushPromises()
    expect(wrapper.find('.markdown-source-editor').exists()).toBe(true)
    expect(wrapper.find('.split-preview-pane').exists()).toBe(true)
    expect(wrapper.get('.toolbar-left-group').isVisible()).toBe(true)
    expect(wrapper.find('.markdown-toolbar-controls').exists()).toBe(true)

    expect(wrapper.text()).not.toContain('阅读模式')
    wrapper.unmount()
  })

  it('applies formatting toolbar actions to the Markdown source selection', async () => {
    const active = note('note-markdown-toolbar')
    const wrapper = await mountEditor(active)
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()

    const source = wrapper.findComponent(MarkdownSourceEditor)
    const start = source.vm.view.state.doc.toString().indexOf('正文')
    source.vm.view.dispatch({ selection: { anchor: start, head: start + 2 } })
    await wrapper.get('.markdown-toolbar-controls button[title="粗体"]').trigger('click')
    await flushPromises()

    expect(source.vm.view.state.doc.toString()).toContain('**正文**')
    expect(active.contentMarkdown).toContain('**正文**')
    wrapper.unmount()
  })

  it('shows the full Friday heading hierarchy in Markdown mode', async () => {
    const wrapper = await mountEditor(note('note-markdown-heading-menu'))
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()

    await wrapper.get('.markdown-toolbar-controls .heading-menu-anchor > button').trigger('click')
    expect(wrapper.findAll('.editor-heading-menu button').map(item => item.text())).toEqual([
      '标题', '标题 1', '标题 2', '标题 3', '正文', '小正'
    ])
    wrapper.unmount()
  })

  it('uses the Friday SVG chevron for every toolbar dropdown in both editor modes', async () => {
    const wrapper = await mountEditor(note('note-heading-chevron'))
    const richDropdownTriggers = [
      'button[title="插入"]',
      'button[title="文字颜色"]',
      'button[title="背景颜色"]',
      '.heading-menu-anchor > button',
      '.editor-mode-trigger'
    ]

    for (const selector of richDropdownTriggers) {
      const chevron = wrapper.get(`${selector} .friday-dropdown-chevron`)
      expect(chevron.element.tagName.toLowerCase()).toBe('svg')
      expect(chevron.attributes('width')).toBe('12')
      expect(chevron.attributes('height')).toBe('12')
      expect(chevron.get('polyline').attributes('points')).toBe('6 9 12 15 18 9')
    }
    expect(wrapper.text()).not.toContain('▾')

    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()
    expect(wrapper.get('.markdown-toolbar-controls .friday-dropdown-chevron').get('polyline').attributes('points')).toBe('6 9 12 15 18 9')
    expect(wrapper.get('.editor-mode-trigger .friday-dropdown-chevron').get('polyline').attributes('points')).toBe('6 9 12 15 18 9')
    wrapper.unmount()
  })

  it('closes the heading menu when article content is pressed in either editor mode', async () => {
    const wrapper = await mountEditor(note('note-heading-menu-dismiss'))

    await wrapper.get('.heading-menu-anchor > button[title="标题"]').trigger('click')
    expect(wrapper.find('.editor-heading-menu').exists()).toBe(true)
    await wrapper.get('.note-prose').trigger('pointerdown')
    expect(wrapper.find('.editor-heading-menu').exists()).toBe(false)

    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()
    await wrapper.get('.markdown-toolbar-controls .heading-menu-anchor > button').trigger('click')
    expect(wrapper.find('.editor-heading-menu').exists()).toBe(true)
    await wrapper.get('.cm-content').trigger('pointerdown')
    expect(wrapper.find('.editor-heading-menu').exists()).toBe(false)
    wrapper.unmount()
  })

  it('toggles both editor modes with Ctrl+/ even when CodeMirror has focus', async () => {
    const active = note('note-mode-shortcut')
    const wrapper = await mountEditor(active)
    const enterMarkdown = new window.KeyboardEvent('keydown', {
      key: '/', code: 'Slash', ctrlKey: true, bubbles: true, cancelable: true
    })

    wrapper.get('.note-prose').element.dispatchEvent(enterMarkdown)
    await flushPromises()
    expect(enterMarkdown.defaultPrevented).toBe(true)
    expect(wrapper.get('.editor-mode-trigger').text()).toContain('Markdown')
    expect(globalThis.document.activeElement).toBe(wrapper.get('.cm-content').element)

    const exactDraft = '# 快捷键保存\n\n\n保留空行\n'
    const source = wrapper.findComponent(MarkdownSourceEditor)
    source.vm.view.dispatch({ changes: { from: 0, to: source.vm.view.state.doc.length, insert: exactDraft } })
    const returnToRich = new window.KeyboardEvent('keydown', {
      key: '/', code: 'Slash', ctrlKey: true, bubbles: true, cancelable: true
    })
    wrapper.get('.cm-content').element.dispatchEvent(returnToRich)
    await flushPromises()
    expect(returnToRich.defaultPrevented).toBe(true)
    expect(wrapper.get('.editor-mode-trigger').text()).toContain('即时编辑')
    expect(globalThis.document.activeElement).toBe(wrapper.get('.note-prose').element)
    expect(active.contentMarkdown).toBe(exactDraft)
    expect(wrapper.get('.note-prose').text()).toContain('保留空行')
    wrapper.unmount()
  })

  it('uses the customized editor mode shortcut instead of Ctrl+/', async () => {
    const wrapper = await mountEditor(note('note-custom-shortcut'))
    wrapper.appStore.setEditorModeShortcut('Mod+Shift+KeyM')
    await flushPromises()

    wrapper.get('.note-prose').element.dispatchEvent(new window.KeyboardEvent('keydown', {
      key: '/', code: 'Slash', ctrlKey: true, bubbles: true, cancelable: true
    }))
    await flushPromises()
    expect(wrapper.get('.editor-mode-trigger').text()).toContain('即时编辑')

    wrapper.get('.note-prose').element.dispatchEvent(new window.KeyboardEvent('keydown', {
      key: 'm', code: 'KeyM', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true
    }))
    await flushPromises()
    expect(wrapper.get('.editor-mode-trigger').text()).toContain('Markdown')
    expect(wrapper.get('.editor-mode-trigger').attributes('title')).toContain('Ctrl + Shift + M')
    wrapper.unmount()
  })

  it('consumes repeated shortcut presses while a mode switch is still saving', async () => {
    const wrapper = await mountEditor(note('note-shortcut-race'))
    const first = new window.KeyboardEvent('keydown', {
      key: '/', code: 'Slash', ctrlKey: true, bubbles: true, cancelable: true
    })
    const second = new window.KeyboardEvent('keydown', {
      key: '/', code: 'Slash', ctrlKey: true, bubbles: true, cancelable: true
    })
    const repeated = new window.KeyboardEvent('keydown', {
      key: '/', code: 'Slash', ctrlKey: true, repeat: true, bubbles: true, cancelable: true
    })

    wrapper.get('.note-prose').element.dispatchEvent(first)
    wrapper.get('.note-prose').element.dispatchEvent(second)
    wrapper.get('.note-prose').element.dispatchEvent(repeated)
    expect(first.defaultPrevented).toBe(true)
    expect(second.defaultPrevented).toBe(true)
    expect(repeated.defaultPrevented).toBe(true)
    await flushPromises()
    expect(wrapper.get('.editor-mode-trigger').text()).toContain('Markdown')
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
    expect(first.contentHtml).toContain('<h1 data-note-title="true">新稿</h1>')
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
    expect(active.contentHtml).toContain('<h1 data-note-title="true">自动保存</h1>')
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
    expect(active.contentHtml).toContain('<h1 data-note-title="true">AI 新版</h1>')
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
      if (command === 'background_task_enqueue') return { ...args.input, id: 'task-ai-1', status: 'queued', output: '', resourceKey: `note:${args.input.targetNoteId}`, createdAt: new Date().toISOString() }
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

    const [, payload] = tauriMocks.invoke.mock.calls.find(([command]) => command === 'background_task_enqueue')
    expect(payload.input.payload.request.thinkingMode).toBe('disabled')
    expect(payload.input.payload.request.text).toBe('标题')
    expect(payload.input.payload.request.selection).toMatchObject({ from: 1, to: 3, text: '标题' })
    expect(payload.input.payload.request.autoRetrieve).toBe(false)
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
      if (command === 'background_task_enqueue') return { ...args.input, id: 'task-ai-error', status: 'queued', output: '', resourceKey: `note:${args.input.targetNoteId}`, createdAt: new Date().toISOString() }
      if (command === 'background_task_transition') return { id: args.input.id, kind: 'note_ai', title: 'AI 写作', status: args.input.status, output: '', errorMessage: args.input.errorMessage, resourceKey: 'note:note-1', targetNoteId: 'note-1', payload: {}, createdAt: new Date().toISOString() }
      if (command === 'note_ai_stream') {
        await args.onEvent.onmessage({ type: 'error', code: 'ai_request_failed', message: 'api_key_not_configured' })
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
    expect(wrapper.get('.split-preview-pane').html()).toContain('<h1 data-note-title="true">源码标题</h1>')
    expect(wrapper.get('.split-preview-pane').text()).toContain('已完成')

    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[0].trigger('click')
    await flushPromises()
    expect(wrapper.get('.note-prose').html()).toContain('<h1 data-note-title="true">源码标题</h1>')
    expect(wrapper.get('.note-prose').html()).toContain('<strong>加粗内容</strong>')
    wrapper.unmount()
  })

  it('reads the note title from the first non-empty editor line like Friday', async () => {
    const active = note('note-title')
    const wrapper = await mountEditor(active)
    expect(wrapper.find('.title-input').exists()).toBe(false)
    expect(active.title).toBe('标题')

    wrapper.vm.editor.commands.setContent('<h2>新的文档标题</h2><p>正文</p>')
    await flushPromises()
    expect(active.title).toBe('新的文档标题')
    expect(active.contentMarkdown).toContain('## 新的文档标题')

    const longTitle = '很长的标题'.repeat(12)
    wrapper.vm.editor.commands.setContent(`<h1>${longTitle}</h1><p>正文</p>`)
    await flushPromises()
    expect(active.title).toBe(longTitle.slice(0, 50))
    wrapper.unmount()
  })

  it('starts a body paragraph when Enter is pressed at the end of the title', async () => {
    const wrapper = await mountEditor(note('note-title-enter'))
    wrapper.vm.editor.commands.setTextSelection(3)
    wrapper.get('.note-prose').element.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await flushPromises()

    const blocks = wrapper.find('.note-prose').element.children
    expect(blocks[0].tagName).toBe('H1')
    expect(blocks[0].getAttribute('data-note-title')).toBe('true')
    expect(blocks[1].tagName).toBe('P')
    wrapper.unmount()
  })

  it('does not let heading controls convert the Friday-style title node', async () => {
    const wrapper = await mountEditor(note('note-title-heading'))
    wrapper.vm.editor.commands.setTextSelection(2)

    await wrapper.get('.heading-menu-anchor > button[title="标题"]').trigger('click')
    await wrapper.findAll('.editor-heading-menu button')[2].trigger('click')
    await flushPromises()

    expect(wrapper.get('.note-prose > h1').attributes('data-note-title')).toBe('true')
    expect(wrapper.get('.note-prose > h1').text()).toBe('标题')
    wrapper.unmount()
  })

  it('shows and applies the complete Friday heading hierarchy in instant editing', async () => {
    const wrapper = await mountEditor(note('note-heading-hierarchy'))
    wrapper.vm.editor.commands.setTextSelection(6)

    await wrapper.get('.heading-menu-anchor > button[title="标题"]').trigger('click')
    const options = wrapper.findAll('.editor-heading-menu button')
    expect(options.map(item => item.text())).toEqual(['标题', '标题 1', '标题 2', '标题 3', '正文', '小正'])
    expect(options[0].attributes('disabled')).toBeDefined()
    await options[5].trigger('click')
    await flushPromises()

    expect(wrapper.get('.note-prose p[data-small-text]').text()).toBe('正文')
    expect(wrapper.get('.heading-menu-anchor > button[title="标题"]').text()).toContain('小正')
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

  it('renders pasted Mermaid flowcharts as diagrams without persisting generated SVG', async () => {
    const active = note('note-mermaid')
    const wrapper = await mountEditor(active)
    const source = [
      '```mermaid',
      'swimlane-beta LR',
      '  subgraph author [申请人]',
      '    submit[提交申请]',
      '  end',
      '  subgraph reviewer [审批人]',
      '    approve{是否批准}',
      '  end',
      '  submit --> approve',
      '```'
    ].join('\n')

    await wrapper.get('.note-prose').trigger('paste', {
      clipboardData: { getData: type => type === 'text/plain' ? source : '' }
    })
    await flushPromises()

    expect(wrapper.get('.mermaid-diagram-test').attributes('data-source')).toContain('swimlane-beta LR')
    expect(active.contentMarkdown).toContain('```mermaid')
    expect(active.contentMarkdown).toContain('subgraph reviewer')
    expect(active.contentHtml).toContain('language-mermaid')
    expect(active.contentHtml).not.toContain('<svg')
    wrapper.unmount()
  })

  it('offers accessible flowchart and swimlane starters from the insert menu', async () => {
    const active = note('note-insert-diagram')
    const wrapper = await mountEditor(active)

    await wrapper.get('.toolbar-menu-anchor > button[title="插入"]').trigger('click')
    expect(wrapper.get('.insert-mermaid-flowchart').text()).toContain('流程图')
    expect(wrapper.get('.insert-mermaid-swimlane').text()).toContain('泳道图')

    await wrapper.get('.insert-mermaid-swimlane').trigger('click')
    await flushPromises()

    expect(wrapper.get('.code-block-component').classes()).toContain('is-source-visible')
    expect(wrapper.get('.code-block-content').text()).toContain('swimlane-beta LR')
    const tabEvent = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    wrapper.get('.language-select').element.dispatchEvent(tabEvent)
    expect(tabEvent.defaultPrevented).toBe(false)
    expect(active.contentMarkdown).toContain('accTitle: 示例审批泳道')
    expect(active.contentMarkdown).toContain('```mermaid')

    await wrapper.get('.diagram-source-toggle').trigger('click')
    expect(wrapper.get('.mermaid-diagram-test').attributes('data-source')).toContain('swimlane-beta LR')
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

    expect(wrapper.findAll('.note-prose > h1[data-note-title]')).toHaveLength(1)
    expect(wrapper.findAll('.note-prose table [data-note-title]')).toHaveLength(0)
    expect(legacy.title).toBe('文档标题')
    expect(wrapper.get('.note-prose th > p').text()).toBe('表头')
    expect(wrapper.get('.note-prose td > p').text()).toBe('正文单元格')
    wrapper.unmount()
  })
})
