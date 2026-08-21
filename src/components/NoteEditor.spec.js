import { createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { messages } from '../i18n'
import { useNotesStore } from '../stores/notes'
import NoteEditor from './NoteEditor.vue'
import MarkdownSourceEditor from './MarkdownSourceEditor.vue'

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

afterEach(() => { vi.useRealTimers(); localStorage.clear() })

describe('NoteEditor article modes', () => {
  it('opens in rich text and switches to source and read modes', async () => {
    const wrapper = await mountEditor()
    expect(wrapper.get('.editor-mode-trigger').text()).toContain('富文本')
    expect(wrapper.get('.toolbar-left-group').isVisible()).toBe(true)

    await wrapper.get('.editor-mode-trigger').trigger('click')
    const modeItems = wrapper.findAll('[role="menuitemradio"]')
    expect(modeItems.map(item => item.find('strong').text())).toEqual(['富文本', '源码 + 预览', '纯源码', '阅读'])
    await modeItems[2].trigger('click')
    await flushPromises()
    expect(wrapper.find('.markdown-source-editor').exists()).toBe(true)
    expect(wrapper.get('.toolbar-left-group').isVisible()).toBe(false)

    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[3].trigger('click')
    await flushPromises()
    expect(wrapper.get('.title-input').attributes('readonly')).toBeDefined()
    expect(wrapper.get('.note-prose').attributes('contenteditable')).toBe('false')
    expect(wrapper.find('.markdown-source-editor').exists()).toBe(false)
    wrapper.unmount()
  })

  it('supports keyboard menu navigation and resets to rich text for another note', async () => {
    const wrapper = await mountEditor()
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.get('.editor-mode-menu').trigger('keydown', { key: 'ArrowDown' })
    expect(window.document.activeElement?.textContent).toContain('源码 + 预览')
    await wrapper.findAll('[role="menuitemradio"]')[1].trigger('click')
    await flushPromises()
    expect(wrapper.find('.editor-workspace.mode-split').exists()).toBe(true)

    await wrapper.setProps({ note: note('note-2') })
    await flushPromises()
    expect(wrapper.get('.editor-mode-trigger').text()).toContain('富文本')
    expect(wrapper.get('.toolbar-left-group').isVisible()).toBe(true)
    wrapper.unmount()
  })

  it('flushes an exact Markdown draft before switching notes', async () => {
    const first = note('note-source')
    const second = note('note-next')
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({ notes: [first] }))
    const wrapper = await mountEditor(first)
    wrapper.notesStore.notes.push(second)

    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[2].trigger('click')
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
    expect(wrapper.get('.editor-mode-trigger').text()).toContain('富文本')
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
    await wrapper.findAll('[role="menuitemradio"]')[2].trigger('click')
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

  it('keeps the current non-rich mode for AI replacement and disables insertion', async () => {
    const active = note('note-ai')
    localStorage.setItem('tiny-note-browser-state', JSON.stringify({
      notes: [active],
      editProposals: [{ id: 'proposal-ai', noteId: active.id, action: 'polish', originalText: '正文', replacementMarkdown: '# AI 新版', baseUpdatedAt: active.updatedAt, status: 'draft', sources: [] }]
    }))
    const wrapper = await mountEditor(active, { proposalId: 'proposal-ai' })
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[2].trigger('click')
    await flushPromises()

    expect(wrapper.get('.ai-output-action.insert').attributes('disabled')).toBeDefined()
    await wrapper.get('.ai-output-action.replace').trigger('click')
    await flushPromises()
    expect(active.contentMarkdown).toBe('# AI 新版')
    expect(active.contentHtml).toContain('<h1>AI 新版</h1>')
    expect(wrapper.get('.editor-mode-trigger').text()).toContain('纯源码')
    expect(wrapper.findComponent(MarkdownSourceEditor).text()).toContain('# AI 新版')
    wrapper.unmount()
  })

  it('derives legacy Markdown lazily without updating the note until an edit', async () => {
    const legacy = note('note-legacy')
    legacy.contentMarkdown = ''
    const wrapper = await mountEditor(legacy)
    await wrapper.get('.editor-mode-trigger').trigger('click')
    await wrapper.findAll('[role="menuitemradio"]')[2].trigger('click')
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
})
