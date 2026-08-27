import { createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, vi } from 'vitest'
import { messages } from '../i18n'
import { useAppStore } from '../stores/app'
import { useNotesStore } from '../stores/notes'
import type { Note } from '../types/domain'
import NoteEditor from './NoteEditor.vue'

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
    deletedAt: null,
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z'
  }
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
