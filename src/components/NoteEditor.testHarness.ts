import { createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, vi } from 'vitest'
import { messages } from '../i18n'
import { useAppStore } from '../stores/app'
import { useNotesStore } from '../stores/notes'
import type { Note } from '../types/domain'
import NoteEditor from './NoteEditor.vue'
import VditorEditor from './VditorEditor.vue'
import TurndownService from 'turndown'
import { readFileSync } from 'node:fs'
import { runInThisContext } from 'node:vm'

// Real Vditor + its real Lute parser in jsdom; only the same-origin script
// loader is replaced, since jsdom does not fetch script tags by default.
vi.mock('../editor/vditorRuntime', () => ({ loadVditorRuntime: async () => {
  const globals = globalThis as unknown as { Lute?: typeof Lute }
  const browser = window as unknown as { Lute?: typeof Lute }
  if (!globals.Lute) {
    const lute = readFileSync('node_modules/vditor/dist/js/lute/lute.min.js', 'utf8')
    runInThisContext(lute)
    globals.Lute = browser.Lute
  }
  if (!window.VditorI18n) new Function('window', readFileSync('node_modules/vditor/dist/js/i18n/zh_CN.js', 'utf8'))(window)
  for (const id of ['vditorLuteScript', 'vditorI18nScriptzh_CN', 'vditorIconScript']) {
    if (!document.getElementById(id)) { const node = document.createElement('meta'); node.id = id; document.head.append(node) }
  }
} }))

document.execCommand ??= (command: string, _ui?: boolean, value?: string) => {
  // jsdom lacks this browser editing primitive used by Vditor's SV toolbar.
  if (!['insertHTML', 'delete'].includes(command)) return false
  const selection = window.getSelection()
  if (!selection?.rangeCount) return false
  const range = selection.getRangeAt(0)
  range.deleteContents()
  if (command === 'insertHTML') {
    const fragment = range.createContextualFragment(value || '')
    const last = fragment.lastChild
    range.insertNode(fragment)
    if (last) range.setStartAfter(last)
  }
  range.collapse(true); selection.removeAllRanges(); selection.addRange(range)
  const parent = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement
  parent?.closest('[contenteditable="true"]')?.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: command === 'delete' ? 'deleteContentBackward' : 'insertText' }))
  return true
}
document.queryCommandSupported ??= () => false
document.queryCommandState ??= () => false
if (!('innerText' in HTMLElement.prototype)) Object.defineProperty(HTMLElement.prototype, 'innerText', {
  get() { return this.textContent || '' }, set(value) { this.textContent = value }, configurable: true
})

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

export function noteEditorTestMocks() {
  return { tauriMocks, noteExportMocks, exportLocationMocks, exportSuccessMocks }
}

if (!window.Range.prototype.getClientRects) window.Range.prototype.getClientRects = () => [] as unknown as DOMRectList
if (!window.Range.prototype.getBoundingClientRect) window.Range.prototype.getBoundingClientRect = () => new DOMRect()

export function note(id = 'note-1'): Note {
  return {
    id,
    notebookId: null,
    knowledgeBaseId: null,
    title: '四种模式',
    contentHtml: '<h1>标题</h1><p>正文</p>',
    contentText: '标题\n正文',
    contentMarkdown: '# 标题\n\n正文',
    pinned: false,
    version: 1,
    deletedAt: null,
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z'
  }
}

export function editMarkdown(wrapper: Awaited<ReturnType<typeof mountEditor>>, source: string) {
  const component = wrapper.getComponent(VditorEditor)
  component.vm.setMarkdown(source)
  component.vm.$emit('change', source)
}
export function editHtml(wrapper: Awaited<ReturnType<typeof mountEditor>>, html: string) {
  editMarkdown(wrapper, new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' }).turndown(html))
}
export async function switchMode(wrapper: Awaited<ReturnType<typeof mountEditor>>, mode: 'rich' | 'markdown') {
  await wrapper.get('.editor-mode-trigger').trigger('click')
  await wrapper.findAll('[role="menuitemradio"]')[mode === 'rich' ? 0 : 1].trigger('click')
  await flushPromises()
}
export async function selectText(wrapper: Awaited<ReturnType<typeof mountEditor>>, text: string, occurrence = 0) {
  const root = wrapper.get(wrapper.getComponent(VditorEditor).props('mode') === 'markdown' ? '.vditor-sv' : '.vditor-ir pre.vditor-reset').element
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let seen = 0
  while (walker.nextNode()) {
    const value = walker.currentNode.textContent || ''
    const start = value.indexOf(text)
    if (start < 0 || seen++ < occurrence) continue
    const range = document.createRange()
    range.setStart(walker.currentNode, start)
    range.setEnd(walker.currentNode, start + text.length)
    const selection = window.getSelection()!
    selection.removeAllRanges(); selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    await flushPromises()
    return
  }
  throw new Error(`Selection not found: ${text}`)
}

export async function mountEditor(activeNote: Note = note(), extraProps: Partial<InstanceType<typeof NoteEditor>['$props']> = {}) {
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
  return Object.assign(wrapper, { notesStore, appStore })
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
