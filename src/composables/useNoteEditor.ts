import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEditor } from '@tiptap/vue-3'
import { TextSelection, type EditorState } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/core'
import type { Mark, Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import { EventChannel } from '../services/eventChannel'
import { createLowlight } from 'lowlight'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import bash from 'highlight.js/lib/languages/bash'
import sql from 'highlight.js/lib/languages/sql'
import markdown from 'highlight.js/lib/languages/markdown'
import yaml from 'highlight.js/lib/languages/yaml'
import rust from 'highlight.js/lib/languages/rust'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import CodeBlockComponent from '../components/CodeBlockComponent.vue'
import { FileCode2, PenLine } from 'lucide-vue-next'
import { useNotesStore } from '../stores/notes'
import { useLibraryStore } from '../stores/library'
import { useAppStore } from '../stores/app'
import { useTasksStore } from '../stores/tasks'
import { useI18n } from 'vue-i18n'
import { createNoteExtensions } from '../editor/noteExtensions'
import { DEFAULT_NOTE_MODE, NOTE_MODES, applyMarkdownSourceToEditor, clampSplitRatio, isRichClipboardHtml, markdownToEditorHtml, sanitizeEditorHtml, scrollOffset, scrollProgress } from '../utils/noteMarkdown'
import { matchesKeyboardShortcut, shortcutDisplayParts } from '../utils/keyboardShortcut'
import { createSafeExportFilename, downloadNoteHtml, exportNotePdf, printNote as printNoteDocument } from '../utils/noteExport'
import { prepareTaskFlight } from '../utils/taskFlight'
import { markMermaidDiagramForEditing } from '../utils/mermaidEditorState'
import { requestPrompt } from '../services/promptDialog'
import { showToast } from '../services/appFeedback'
import { saveExportBlob } from '../services/exportLocation'
import { showExportSuccess } from '../services/exportSuccess'
import { errorMessage, type BackgroundTask, type EditProposal, type Note, type NoteLink, type JsonValue } from '../types/domain'
import type { NodeViewProps } from '@tiptap/core'

export interface NoteEditorProps {
  note: Note | null
  tocVisible: boolean
  proposalId: string
}

export type NoteEditorEmit = {
  (event: 'deleted', id: string): void
  (event: 'toggle-toc'): void
  (event: 'proposal-reviewed'): void
  (event: 'import-external', note: Note): void
}

export function useNoteEditor(props: Readonly<NoteEditorProps>, emit: NoteEditorEmit) {  
  const lowlight = createLowlight()
  lowlight.register('javascript', javascript); lowlight.register('typescript', typescript); lowlight.register('python', python); lowlight.register('json', json); lowlight.register('html', xml); lowlight.register('xml', xml); lowlight.register('css', css); lowlight.register('bash', bash); lowlight.register('sql', sql); lowlight.register('markdown', markdown); lowlight.register('yaml', yaml); lowlight.register('rust', rust)
  type EditorMode = 'rich' | 'markdown'
  type AiAction = 'interpret' | 'refine' | 'polish' | 'expand' | 'translate' | 'summarize' | 'continue_write' | 'fix_grammar' | 'generate_plan' | 'generate_table' | 'custom'
  type ExportFormat = '' | 'html' | 'pdf' | 'print'
  type TaskFlight = () => void
  interface SelectionRange { from: number; to: number; text?: string }
  interface AssistantReference { key: string; type: string; label: string; preview?: string }
  interface AssistantMessage { role: 'assistant' | 'user'; content: string; sources?: JsonValue[]; proposal?: EditProposal | null; references?: AssistantReference[] }
  interface AiEvent { code?: string; message?: string }
  interface AiEditorRequest { kind: 'editor'; action: AiAction; requestText: string | null; instruction: string | null; taskFlight: TaskFlight | null }
  interface AiAssistantRequest { kind: 'assistant'; prompt: string; taskFlight: TaskFlight | null }
  type PendingAiRequest = AiEditorRequest | AiAssistantRequest
  interface PendingAiChange { type: 'insert' | 'replace'; noteId: string; proposal: EditProposal; replacement: string; resultAction: string; resultSources: JsonValue[]; beforeHtml: string; beforeText: string; beforeMarkdown: string; beforeDraft: string; strikeFrom: number; strikeTo: number; highlightFrom: number; highlightTo: number }
  type PendingAiChangeBase = Omit<PendingAiChange, 'type' | 'strikeFrom' | 'strikeTo' | 'highlightFrom' | 'highlightTo'>
  interface AiDragState { pointerId: number; offsetX: number; offsetY: number; width: number; height: number }
  interface SplitDragState { pointerId: number }
  interface ScrollPayload { scrollTop: number; scrollHeight: number; clientHeight: number }
  interface MarkdownEditorExpose { focus(): void; setScrollProgress(progress: number): void; applyFormat(format: string): boolean; setHeading(level: number): boolean; setSmallParagraph(): boolean }
  interface ExportArtifact { blob: Blob; filename: string }
  
  const store = useNotesStore()
  const library = useLibraryStore()
  const appStore = useAppStore()
  const tasksStore = useTasksStore()
  const { t, locale } = useI18n()
  const aiBusy = ref(false)
  const aiText = ref('')
  const aiRequestId = ref('')
  const aiAction = ref<AiAction>('summarize')
  const aiResultAction = ref('')
  const aiProposal = ref<EditProposal | null>(null)
  const aiSources = ref<JsonValue[]>([])
  const aiConsentOpen = ref(false)
  const assistantOpen = ref(false)
  const assistantTriggerVisible = ref(true)
  const assistantBusy = ref(false)
  const assistantRequestId = ref('')
  const assistantStreamingText = ref('')
  const assistantMessages = ref<AssistantMessage[]>([])
  const assistantSelection = ref<SelectionRange | null>(null)
  const assistantResponseSources = ref<JsonValue[]>([])
  const assistantResponseProposal = ref<EditProposal | null>(null)
  const aiPanelOpen = ref(false)
  const aiPanelSelectionText = ref('')
  const commandMenuOpen = ref(false)
  const aiPrompt = ref('')
  const aiInputRef = ref<HTMLInputElement | null>(null)
  const commandMenuDirection = ref<'up' | 'down'>('down')
  const moreOpen = ref(false)
  const moreTriggerRef = ref<HTMLButtonElement | null>(null)
  const moreMenuRef = ref<HTMLElement | null>(null)
  const insertOpen = ref(false)
  const tablePickerOpen = ref(false)
  const textColorOpen = ref(false)
  const highlightOpen = ref(false)
  const headingOpen = ref(false)
  const imageDialogOpen = ref(false)
  const imageUrl = ref('')
  const imageAlt = ref('')
  const imageInput = ref<HTMLInputElement | null>(null)
  const imageFileInput = ref<HTMLInputElement | null>(null)
  const tableRows = ref(0)
  const tableCols = ref(0)
  const fimEnabled = computed(() => appStore.settings.fimEnabled === true)
  const fimSuggestion = ref('')
  const editorStateTick = ref(0)
  let fimTimer: ReturnType<typeof setTimeout> | undefined
  let assistantTriggerTimer: ReturnType<typeof setTimeout> | undefined
  let savedSelection: SelectionRange | null = null
  let pendingAiRequest: PendingAiRequest | null = null
  let pendingAiChange: PendingAiChange | null = null
  const modeIcons = { rich: PenLine, markdown: FileCode2 }
  const noteLinks = ref<NoteLink[]>([])
  const editorModes = NOTE_MODES.map(mode => ({ ...mode, id: mode.id as EditorMode, icon: modeIcons[mode.id as EditorMode] }))
  const editorMode = ref<EditorMode>(DEFAULT_NOTE_MODE as EditorMode)
  const modeMenuOpen = ref(false)
  const modeMenuIndex = ref(0)
  const modeMenuRef = ref<HTMLElement | null>(null)
  const markdownDraft = ref('')
  const markdownParseError = ref('')
  const sourceDirty = ref(false)
  const markdownPasteNotice = ref(false)
  const markdownPreview = ref(true)
  const splitRatio = ref(50)
  const splitVertical = ref(false)
  const splitWorkspace = ref<HTMLElement | null>(null)
  const sourceEditorRef = ref<MarkdownEditorExpose | null>(null)
  const previewScroller = ref<HTMLElement | null>(null)
  const pendingSourceDrafts = new Map<string, string>()
  const persistedSignatures = new Map<string, string>()
  const exportingFormat = ref<ExportFormat>('')
  const exportStatusLabel = computed(() => exportingFormat.value ? ({ html: t('exportingHtml'), pdf: t('exportingPdf'), print: t('preparingPrint') })[exportingFormat.value] : '')
  const externalFileName = computed(() => String(props.note?.externalPath || '').split(/[\\/]/).pop() || props.note?.title || 'Markdown 文件')
  const EXTERNAL_NOTICE_DISMISSED_PREFIX = 'tiny-note:external-file-notice-dismissed:'
  const externalNoticeDismissed = ref(false)
  const showExternalNoteBanner = computed(() => props.note?.external === true && !externalNoticeDismissed.value)
  let applyingEditorContent = false
  let markdownParseTimer: ReturnType<typeof setTimeout> | undefined
  let markdownPasteTimer: ReturnType<typeof setTimeout> | undefined
  let splitResizeObserver: ResizeObserver | null = null
  let splitDragState: SplitDragState | null = null
  let scrollSyncFrame: number | undefined
  let scrollSyncSource = ''
  let modeShortcutSwitching = false
  function externalNoticeStorageKey(noteId?: string) {
    return noteId ? `${EXTERNAL_NOTICE_DISMISSED_PREFIX}${String(noteId)}` : ''
  }
  function readExternalNoticeDismissed(activeNote: Note | null) {
    const key = externalNoticeStorageKey(activeNote?.id)
    if (!activeNote?.external || !key || typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem(key) === '1'
    } catch {
      return false
    }
  }
  function dismissExternalNoteBanner() {
    const key = externalNoticeStorageKey(props.note?.id)
    if (!props.note?.external || !key) return
    externalNoticeDismissed.value = true
    try {
      window.localStorage.setItem(key, '1')
    } catch {
      // The current session still respects dismissal when storage is unavailable.
    }
  }
  watch(() => [props.note?.id, props.note?.external], () => {
    externalNoticeDismissed.value = readExternalNoticeDismissed(props.note)
  }, { immediate: true })
  const currentMode = computed(() => editorModes.find(mode => mode.id === editorMode.value) || editorModes[0])
  const modeShortcutParts = computed(() => shortcutDisplayParts(appStore.editorModeShortcut))
  const modeShortcutLabel = computed(() => modeShortcutParts.value.join(' + '))
  const richMode = computed(() => editorMode.value === 'rich')
  const codeMode = computed(() => editorMode.value === 'markdown')
  const splitMode = computed(() => codeMode.value && markdownPreview.value)
  const splitPaneStyle = computed(() => splitVertical.value ? { height: `${splitRatio.value}%` } : { width: `${splitRatio.value}%` })
  const aiActionLabels: Record<AiAction, string> = { interpret: '解读', refine: '精炼', polish: '润色', expand: '扩写', translate: '翻译', summarize: '总结', continue_write: '续写', fix_grammar: '语法修正', generate_plan: '生成任务计划', generate_table: '生成表格', custom: 'AI 写作' }
  const aiErrorMessages: Record<string, string> = { model_profile_unavailable: '还没有配置可用模型，请先打开设置完成配置。', api_key_not_configured: '当前模型还没有配置 API Key，请先打开设置完成配置。', credential_store_unavailable: '系统凭据存储不可用，暂时无法调用 AI。', provider_request_failed: '模型服务请求失败，请检查模型地址和网络连接。', provider_stream_failed: '模型服务连接中断，请稍后重试。' }
  function aiEventErrorMessage(event: AiEvent) {
    return (event.code ? aiErrorMessages[event.code] : '') || (event.message ? aiErrorMessages[event.message] : '') || event.message || '请求未完成，请稍后重试。'
  }
  function aiActionLabel(action: string): string { return aiActionLabels[action as AiAction] || 'AI 写作' }
  function unknownErrorCode(error: unknown): string {
    return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : ''
  }
  const contextConsentModelId = computed(() => appStore.defaultModel?.id || 'default')
  const aiFeedback = ref('')
  const aiOutputOpen = ref(false)
  const aiOriginalText = ref('')
  const aiChangePending = ref(false)
  const AI_CHANGE_HIGHLIGHT = '#fef08a'
  const aiCharCount = computed(() => aiText.value.replace(/\s/g, '').length)
  const aiDialogPosition = ref<{ left: number; top: number } | null>(null)
  const aiDialogStyle = computed(() => {
    if (!aiDialogPosition.value) return {}
    return {
      left: `${aiDialogPosition.value.left}px`,
      top: `${aiDialogPosition.value.top}px`,
      transform: 'none'
    }
  })
  let aiDragState: AiDragState | null = null
  const refreshEditorState = () => { editorStateTick.value += 1 }
  function looksLikeMarkdown(text: string) {
    return /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|~~~)/m.test(text) ||
      /(?:\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|!?\[[^\]]+\]\([^)]+\)|^\s*\|.+\|\s*$)/m.test(text)
  }
  function isPlainInlineAiReplacement(text: string) {
    if (!text || text.includes('\n') || looksLikeMarkdown(text)) return false
    return !/(?:\*[^*]+\*|_[^_]+_|~~[^~]+~~|<\/?[a-z][^>]*>)/i.test(text)
  }
  function handleMarkdownPaste(view: EditorView, event: ClipboardEvent) {
    if (!richMode.value || !event.clipboardData) return false
  
    const { $head } = view.state.selection
    for (let depth = $head.depth; depth > 0; depth -= 1) {
      if ($head.node(depth).type.name === 'codeBlock') return false
    }
  
    const text = event.clipboardData.getData('text/plain')
    const html = event.clipboardData.getData('text/html')
    if (!text || !editor.value || (html && isRichClipboardHtml(html))) return false
  
    try {
      event.preventDefault()
      event.stopPropagation?.()
      const parsedHtml = sanitizeEditorHtml(markdownToEditorHtml(text))
      const applied = editor.value.chain().focus().insertContent(parsedHtml).run()
      if (applied && looksLikeMarkdown(text)) {
        markdownPasteNotice.value = true
        clearTimeout(markdownPasteTimer)
        markdownPasteTimer = setTimeout(() => { markdownPasteNotice.value = false }, 5000)
      }
      return applied
    } catch (error) {
      console.error('Markdown paste failed:', error)
      return false
    }
  }
  function prepareEditorContent(note: Pick<Note, 'contentHtml'> | null | undefined) {
    const container = document.createElement('div')
    container.innerHTML = note?.contentHtml || ''
  
    // Friday treats the first editor block as a dedicated noteTitle node. A
    // previous Tiny Note build accidentally put these nodes inside table cells,
    // so retain only the top-level title and repair nested ones as paragraphs.
    const legacyTitle = container.firstElementChild?.matches('h1[data-note-title]')
      ? container.firstElementChild
      : null
    container.querySelectorAll('[data-note-title]').forEach(titleNode => {
      if (titleNode === legacyTitle) {
        return
      }
      const paragraph = document.createElement('p')
      const textAlign = (titleNode as HTMLElement).style.textAlign
      if (textAlign) paragraph.style.textAlign = textAlign
      paragraph.innerHTML = titleNode.innerHTML
      titleNode.replaceWith(paragraph)
    })
  
    const firstBlock = container.firstElementChild
    if (!firstBlock) return '<h1 data-note-title="true"></h1><p></p>'
    if (/^H[1-3]$/.test(firstBlock.tagName) || firstBlock.tagName === 'P') {
      if (!firstBlock.matches('h1[data-note-title]')) {
        const title = document.createElement('h1')
        title.setAttribute('data-note-title', 'true')
        title.innerHTML = firstBlock.innerHTML
        firstBlock.replaceWith(title)
      }
    } else {
      container.insertAdjacentHTML('afterbegin', '<h1 data-note-title="true"></h1>')
    }
    return container.innerHTML || '<p></p>'
  }
  function extractNoteTitle(text = '') {
    const firstLine = String(text).split(/\r?\n/).find(line => line.trim())?.trim() || ''
    return (firstLine || t('untitled')).slice(0, 50)
  }
  function textFromPreparedEditorContent(html = '') {
    const container = document.createElement('div')
    container.innerHTML = html
    return Array.from(container.children).map(node => node.textContent || '').join('\n')
  }
  function syncNoteTitle(note: Note | null | undefined, text: string, { schedule = false }: { schedule?: boolean } = {}) {
    if (!note) return false
    const nextTitle = extractNoteTitle(text)
    if (note.title === nextTitle) return false
    note.title = nextTitle
    if (schedule) scheduleNoteSave(note)
    return true
  }
  function getEditorMarkdown(instance: Editor | null | undefined = editor.value) {
    return instance?.getMarkdown?.() || ''
  }
  const editor = useEditor({
    content: prepareEditorContent(props.note),
    extensions: createNoteExtensions({
      lowlight,
      codeBlockNodeView: VueNodeViewRenderer(CodeBlockComponent as unknown as import('vue').Component<NodeViewProps>),
      placeholder: ({ node }: { node: ProseMirrorNode }) => node.type.name === 'noteTitle'
        ? '输入标题…'
        : '写下此刻的想法…'
    }),
    editorProps: { attributes: { class: 'note-prose' }, handlePaste: handleMarkdownPaste },
    onTransaction: refreshEditorState,
    onSelectionUpdate: refreshEditorState,
    onUpdate: ({ editor: instance }) => handleRichEditorUpdate(instance)
  })
  const canUndo = computed(() => { void editorStateTick.value; return editor.value?.can().undo() ?? false })
  const canRedo = computed(() => { void editorStateTick.value; return editor.value?.can().redo() ?? false })
  const linkActive = computed(() => { void editorStateTick.value; return editor.value?.isActive('link') ?? false })
  const canEditLink = computed(() => { void editorStateTick.value; const instance = editor.value; return !!instance && (!instance.state.selection.empty || instance.isActive('link')) })
  const selectedText = computed(() => { void editorStateTick.value; const instance = editor.value; if (!instance || instance.state.selection.empty) return ''; const { from, to } = instance.state.selection; return instance.state.doc.textBetween(from, to, '\n').trim() })
  function shouldShowBubbleMenu({ state }: { state: EditorState }) { return richMode.value && !aiOutputOpen.value && !state.selection.empty && state.doc.textBetween(state.selection.from, state.selection.to, '\n').trim().length > 0 }
  const textColorPalette = ['#1c1917', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777']
  const highlightPalette = ['#fef08a', '#fed7aa', '#fecaca', '#bbf7d0', '#bae6fd', '#c7d2fe', '#e9d5ff', '#fbcfe8']
  const currentHeadingLabel = computed(() => {
    void editorStateTick.value
    const instance = editor.value
    if (!instance || instance.isActive('noteTitle')) return '标题'
    for (const level of [1, 2, 3]) {
      if (instance.isActive('heading', { level })) return `标题 ${level}`
    }
    return instance.isActive('smallParagraph') ? '小正' : '正文'
  })
  const canSetNoteTitle = computed(() => {
    void editorStateTick.value
    const instance = editor.value
    if (!instance) return false
    const { $from } = instance.state.selection
    return $from.depth === 1 && $from.index(0) === 0
  })
  
  function noteContentSignature(note: Note | null | undefined) {
    if (!note) return ''
    return JSON.stringify([note.title, note.notebookId, note.contentHtml, note.contentText, note.contentMarkdown || '', note.pinned])
  }
  
  function scheduleNoteSave(note: Note | null = props.note) {
    if (!note) return
    const signature = noteContentSignature(note)
    store.scheduleSave(note, () => persistedSignatures.set(note.id, signature))
  }
  
  async function saveDirtyNote(note: Note | null = props.note) {
    if (!note || persistedSignatures.get(note.id) === noteContentSignature(note)) return
    if (store.saveTimer != null) clearTimeout(store.saveTimer)
    await store.save(note)
    persistedSignatures.set(note.id, noteContentSignature(note))
  }
  
  function handleRichEditorUpdate(instance: Editor) {
    if (!props.note || applyingEditorContent || editorMode.value !== 'rich') return
    props.note.contentHtml = sanitizeEditorHtml(instance.getHTML())
    props.note.contentText = instance.getText()
    props.note.contentMarkdown = getEditorMarkdown(instance)
    markdownDraft.value = props.note.contentMarkdown
    sourceDirty.value = false
    markdownParseError.value = ''
    pendingSourceDrafts.delete(props.note.id)
    syncNoteTitle(props.note, props.note.contentText)
    scheduleNoteSave(props.note)
    if (fimEnabled.value) {
      clearTimeout(fimTimer)
      fimTimer = setTimeout(runFim, 2000)
    }
  }
  
  function deriveMarkdown(note: Note | null = props.note) {
    if (!note) return ''
    if (pendingSourceDrafts.has(note.id)) return pendingSourceDrafts.get(note.id) || ''
    if (note.contentMarkdown || !note.contentHtml) return note.contentMarkdown || ''
    return getEditorMarkdown() || ''
  }
  
  function commitMarkdown(note: Note | null = props.note, { schedule = true }: { schedule?: boolean } = {}) {
    if (!note || !editor.value || !sourceDirty.value) return true
    const source = markdownDraft.value
    const fallbackHtml = note.contentHtml || '<p></p>'
    applyingEditorContent = true
    let previewApplied = false
    try {
      previewApplied = applyMarkdownSourceToEditor(editor.value, source)
      if (previewApplied) {
        const preparedHtml = prepareEditorContent({ contentHtml: editor.value.getHTML() })
        editor.value.commands.setContent(preparedHtml, { emitUpdate: false })
        const editorHtml = editor.value.getHTML()
        const safeHtml = sanitizeEditorHtml(editorHtml)
        if (safeHtml !== editorHtml) {
          editor.value.commands.setContent(safeHtml || '<p></p>', { emitUpdate: false })
        }
        note.contentHtml = sanitizeEditorHtml(editor.value.getHTML())
        note.contentText = editor.value.getText()
      } else {
        editor.value.commands.setContent(fallbackHtml, { emitUpdate: false })
      }
      note.contentMarkdown = source
      syncNoteTitle(note, note.contentText)
      sourceDirty.value = false
      markdownParseError.value = previewApplied ? '' : '预览暂未更新，源码已保存'
      pendingSourceDrafts.delete(note.id)
      if (schedule) scheduleNoteSave(note)
      return true
    } catch {
      note.contentMarkdown = source
      sourceDirty.value = false
      pendingSourceDrafts.delete(note.id)
      markdownParseError.value = '预览暂未更新，源码已保存'
      try { editor.value.commands.setContent(fallbackHtml, { emitUpdate: false }) } catch {}
      if (schedule) scheduleNoteSave(note)
      return true
    } finally {
      applyingEditorContent = false
    }
  }
  
  function queueMarkdownParse() {
    clearTimeout(markdownParseTimer)
    markdownParseTimer = setTimeout(() => commitMarkdown(props.note), 150)
  }
  
  function updateMarkdownDraft(value: string) {
    if (!props.note) return
    markdownDraft.value = value
    sourceDirty.value = true
    markdownParseError.value = ''
    pendingSourceDrafts.set(props.note.id, value)
    queueMarkdownParse()
  }
  
  async function flushLatestContent({ note = props.note, save = false }: { note?: Note | null; save?: boolean } = {}) {
    clearTimeout(markdownParseTimer)
    const valid = !sourceDirty.value || commitMarkdown(note, { schedule: !save })
    if (valid && save) await saveDirtyNote(note)
    return valid
  }
  
  function resetEditorSession(note: Note | null) {
    clearTimeout(markdownParseTimer)
    modeMenuOpen.value = false
    markdownParseError.value = ''
    sourceDirty.value = note ? pendingSourceDrafts.has(note.id) : false
    const previousSignature = noteContentSignature(note)
    const preparedContent = prepareEditorContent(note)
    applyingEditorContent = true
    if (note && editor.value) editor.value.commands.setContent(preparedContent, { emitUpdate: false })
    applyingEditorContent = false
    setEditorEditable(editorMode.value === 'rich')
    markdownDraft.value = deriveMarkdown(note)
    if (sourceDirty.value) markdownParseError.value = '预览正在等待刷新，源码草稿仍保留'
    if (note) {
      const titleChanged = syncNoteTitle(note, editor.value?.getText() || textFromPreparedEditorContent(preparedContent))
      persistedSignatures.set(note.id, titleChanged ? previousSignature : noteContentSignature(note))
      if (titleChanged) scheduleNoteSave(note)
    }
  }
  
  async function changeEditorMode(mode: EditorMode) {
    if (!editorModes.some(option => option.id === mode)) return
    modeMenuOpen.value = false
    if (mode === editorMode.value) return
    const valid = await flushLatestContent({ save: true })
    if (!valid && mode === 'rich') return
    if (mode === 'markdown' && !sourceDirty.value) markdownDraft.value = deriveMarkdown()
    editorMode.value = mode
    setEditorEditable(mode === 'rich')
    closeToolbarMenus()
    fimSuggestion.value = ''
    await nextTick()
    setupSplitObserver()
  }
  
  async function handleEditorModeShortcut(event: KeyboardEvent) {
    if (!props.note || !matchesKeyboardShortcut(event, appStore.editorModeShortcut)) return
    event.preventDefault()
    event.stopPropagation()
    if (modeShortcutSwitching || event.repeat) return
    modeShortcutSwitching = true
    try {
      const nextMode = editorMode.value === 'rich' ? 'markdown' : 'rich'
      await changeEditorMode(nextMode)
      await nextTick()
      if (editorMode.value === 'markdown') sourceEditorRef.value?.focus()
      else editor.value?.commands.focus()
    } finally {
      modeShortcutSwitching = false
    }
  }
  
  function toggleModeMenu() {
    closeToolbarMenus()
    modeMenuIndex.value = Math.max(0, editorModes.findIndex(mode => mode.id === editorMode.value))
    modeMenuOpen.value = !modeMenuOpen.value
    if (modeMenuOpen.value) nextTick(() => focusModeOption())
  }
  
  function focusModeOption() {
    modeMenuRef.value?.querySelectorAll<HTMLElement>('[role="menuitemradio"]')?.[modeMenuIndex.value]?.focus()
  }
  
  function moveModeFocus(offset: number) {
    modeMenuIndex.value = (modeMenuIndex.value + offset + editorModes.length) % editorModes.length
    focusModeOption()
  }
  
  function handleModeMenuKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') { event.preventDefault(); moveModeFocus(1) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); moveModeFocus(-1) }
    else if (event.key === 'Home') { event.preventDefault(); modeMenuIndex.value = 0; focusModeOption() }
    else if (event.key === 'End') { event.preventDefault(); modeMenuIndex.value = editorModes.length - 1; focusModeOption() }
    else if (event.key === 'Escape') { event.preventDefault(); modeMenuOpen.value = false }
  }
  
  function focusMoreItem(position = 0) {
    const items = [...(moreMenuRef.value?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') || [])]
    items[Math.max(0, Math.min(position, items.length - 1))]?.focus()
  }
  
  function toggleMoreMenu() {
    const shouldOpen = !moreOpen.value
    closeToolbarMenus()
    modeMenuOpen.value = false
    moreOpen.value = shouldOpen
    if (shouldOpen) nextTick(() => focusMoreItem())
  }
  
  function handleMoreMenuKeydown(event: KeyboardEvent) {
    const items = [...(moreMenuRef.value?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') || [])]
    if (!items.length) return
    const currentIndex = document.activeElement instanceof HTMLElement ? items.indexOf(document.activeElement) : -1
    if (event.key === 'ArrowDown') { event.preventDefault(); focusMoreItem((currentIndex + 1) % items.length) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); focusMoreItem((currentIndex - 1 + items.length) % items.length) }
    else if (event.key === 'Home') { event.preventDefault(); focusMoreItem(0) }
    else if (event.key === 'End') { event.preventDefault(); focusMoreItem(items.length - 1) }
    else if (event.key === 'Escape') {
      event.preventDefault()
      moreOpen.value = false
      nextTick(() => moreTriggerRef.value?.focus())
    }
  }
  
  function handleDocumentPointerDown(event: PointerEvent) {
    const target = event.target instanceof Element ? event.target : null
    if (!target?.closest('.toolbar-menu-anchor')) closeToolbarMenus()
    if (!target?.closest('.mode-menu-anchor')) modeMenuOpen.value = false
    if (!target?.closest('.more-menu-anchor')) moreOpen.value = false
  }
  
  function updateSplitOrientation() {
    if (splitWorkspace.value) splitVertical.value = splitWorkspace.value.clientWidth < 720
  }
  
  function setupSplitObserver() {
    splitResizeObserver?.disconnect()
    splitResizeObserver = null
    if (!splitMode.value || !splitWorkspace.value || typeof ResizeObserver === 'undefined') return
    updateSplitOrientation()
    splitResizeObserver = new ResizeObserver(updateSplitOrientation)
    splitResizeObserver.observe(splitWorkspace.value)
  }
  
  function stopSplitResize() {
    if (!splitDragState) return
    window.removeEventListener('pointermove', resizeSplitPane)
    window.removeEventListener('pointerup', stopSplitResize)
    window.removeEventListener('pointercancel', stopSplitResize)
    splitDragState = null
  }
  
  function resizeSplitPane(event: PointerEvent) {
    if (!splitDragState || event.pointerId !== splitDragState.pointerId) return
    const rect = splitWorkspace.value?.getBoundingClientRect()
    if (!rect) return
    const position = splitVertical.value ? event.clientY - rect.top : event.clientX - rect.left
    const total = splitVertical.value ? rect.height : rect.width
    if (total) splitRatio.value = clampSplitRatio((position / total) * 100)
  }
  
  function startSplitResize(event: PointerEvent) {
    if (event.button !== 0) return
    splitDragState = { pointerId: event.pointerId }
    window.addEventListener('pointermove', resizeSplitPane)
    window.addEventListener('pointerup', stopSplitResize)
    window.addEventListener('pointercancel', stopSplitResize)
    event.preventDefault()
  }
  
  function synchronizeSplitScroll(origin: 'source' | 'preview', payload: Partial<ScrollPayload>) {
    if (!splitMode.value || (scrollSyncSource && scrollSyncSource !== origin)) return
    scrollSyncSource = origin
    if (scrollSyncFrame != null) cancelAnimationFrame(scrollSyncFrame)
    scrollSyncFrame = requestAnimationFrame(() => {
      if (origin === 'source') {
        const progress = scrollProgress(payload.scrollTop || 0, payload.scrollHeight || 0, payload.clientHeight || 0)
        const target = previewScroller.value
        if (target) target.scrollTop = scrollOffset(progress, target.scrollHeight, target.clientHeight)
      } else {
        const target = previewScroller.value
        if (target) sourceEditorRef.value?.setScrollProgress(scrollProgress(target.scrollTop, target.scrollHeight, target.clientHeight))
      }
      requestAnimationFrame(() => { scrollSyncSource = '' })
    })
  }
  
  function handlePreviewScroll() {
    if (!splitMode.value) return
    synchronizeSplitScroll('preview', {})
  }
  
  async function toggleMarkdownPreview() {
    markdownPreview.value = !markdownPreview.value
    await nextTick()
    setupSplitObserver()
  }
  
  async function viewPastedMarkdown() {
    markdownPasteNotice.value = false
    clearTimeout(markdownPasteTimer)
    await changeEditorMode('markdown')
    sourceEditorRef.value?.focus()
  }
  
  function resetTransientEditorState() {
    savedSelection = null
    pendingAiRequest = null
    aiConsentOpen.value = false
    closeAiPanel()
    aiText.value = ''
    aiResultAction.value = ''
    aiBusy.value = false
    aiOutputOpen.value = false
    aiOriginalText.value = ''
    aiChangePending.value = false
    pendingAiChange = null
    aiDialogPosition.value = null
    clearTimeout(assistantTriggerTimer)
    assistantOpen.value = false
    assistantTriggerVisible.value = true
    assistantBusy.value = false
    assistantStreamingText.value = ''
    assistantMessages.value = []
    assistantSelection.value = null
    markdownPasteNotice.value = false
    clearTimeout(markdownPasteTimer)
  }
  
  watch(() => props.note?.id, async (id, previousId) => {
    if (previousId && previousId !== id) {
      const previous = [...store.notes, ...store.deleted].find(note => note.id === previousId)
      if (previous) await flushLatestContent({ note: previous, save: true })
    }
    resetTransientEditorState()
    if (props.note?.external) editorMode.value = 'markdown'
    resetEditorSession(props.note)
    noteLinks.value = id ? (await store.listLinks(id).catch(() => [])) || [] : []
    await nextTick()
    setupSplitObserver()
    loadExternalProposal()
  }, { immediate: true, flush: 'post' })
  
  watch(assistantOpen, () => nextTick(setupSplitObserver))
  
  async function handleBackgroundNoteTask(event: Event) {
    const task = (event as CustomEvent<BackgroundTask>).detail
    if (!task || ![aiRequestId.value, assistantRequestId.value].includes(task.id)) return
    const active = ['queued', 'running', 'awaiting_approval', 'awaiting_input'].includes(task.status)
    if (task.id === aiRequestId.value) {
      aiBusy.value = active
      if (task.output) aiText.value = task.output
      if (task.status === 'failed') aiText.value = `AI 写作失败：${aiEventErrorMessage({ message: task.errorMessage || undefined })}`
      if (task.status === 'cancelled') aiText.value = '已停止生成。'
      if (task.status === 'succeeded' && task.result && !Array.isArray(task.result) && typeof task.result === 'object' && typeof task.result.proposalId === 'string') await loadExternalProposal(task.result.proposalId)
    }
    if (task.id === assistantRequestId.value) {
      assistantBusy.value = active
      assistantStreamingText.value = active ? (task.output || '正在思考…') : ''
      if (task.status === 'succeeded') {
        pushAssistantResponse(task.output || '模型没有返回内容，请换个问法再试。')
        if (task.result && !Array.isArray(task.result) && typeof task.result === 'object' && typeof task.result.proposalId === 'string') await loadExternalProposal(task.result.proposalId)
      }
      if (task.status === 'failed') pushAssistantResponse(`请求失败：${aiEventErrorMessage({ message: task.errorMessage || undefined })}`)
    }
  }
  
  function setEditorEditable(editable: boolean) {
    const instance = editor.value
    if (!instance) return
    instance.setEditable(editable, false)
    ;(instance.emit as (event: string, payload: unknown) => void)('tinyNoteEditableChange', { editable })
  }
  
  onBeforeUnmount(() => {
    clearTimeout(fimTimer)
    clearTimeout(assistantTriggerTimer)
    clearTimeout(markdownParseTimer)
    clearTimeout(markdownPasteTimer)
    stopAiDrag()
    stopSplitResize()
    splitResizeObserver?.disconnect()
    if (scrollSyncFrame != null) cancelAnimationFrame(scrollSyncFrame)
    document.removeEventListener('pointerdown', handleDocumentPointerDown)
    window.removeEventListener('tiny-note-task-updated', handleBackgroundNoteTask)
    window.removeEventListener('keydown', handleEditorModeShortcut, true)
    void flushLatestContent({ save: true })
    editor.value?.destroy()
  })
  async function loadExternalProposal(id = props.proposalId) {
    if (!id || !props.note) return
    try {
      const proposal = await (await import('../services/tauri')).invoke('note_edit_get', { proposalId: id })
      if (!proposal || proposal.noteId !== props.note.id || proposal.status !== 'draft') return
      aiProposal.value = proposal
      aiText.value = proposal.replacementMarkdown || ''
      aiResultAction.value = proposal.action || ''
      aiOutputOpen.value = true
      aiOriginalText.value = proposal.originalText || ''
      aiSources.value = proposal.sources || []
      savedSelection = proposal.selectionFrom != null && proposal.selectionTo != null ? { from: proposal.selectionFrom, to: proposal.selectionTo } : null
      emit('proposal-reviewed')
    } catch {}
  }
  watch(() => props.proposalId, id => loadExternalProposal(id))
  onMounted(async () => {
    document.addEventListener('pointerdown', handleDocumentPointerDown)
    window.addEventListener('tiny-note-task-updated', handleBackgroundNoteTask)
    window.addEventListener('keydown', handleEditorModeShortcut, true)
    await appStore.initialize()
    await tasksStore.initialize()
    if (!library.bases.length) { try { await library.load() } catch {} }
    await loadExternalProposal()
    setupSplitObserver()
  })
  type ToggleCommand = 'toggleBold' | 'toggleItalic' | 'toggleUnderline' | 'toggleStrike' | 'toggleBulletList' | 'toggleOrderedList' | 'toggleTaskList'
  function toggle(type: ToggleCommand) {
    const chain = editor.value?.chain().focus()
    if (!chain) return
    if (type === 'toggleBold') chain.toggleBold().run()
    else if (type === 'toggleItalic') chain.toggleItalic().run()
    else if (type === 'toggleUnderline') chain.toggleUnderline().run()
    else if (type === 'toggleStrike') chain.toggleStrike().run()
    else if (type === 'toggleBulletList') chain.toggleBulletList().run()
    else if (type === 'toggleOrderedList') chain.toggleOrderedList().run()
    else chain.toggleTaskList().run()
  }
  async function applyMarkdownFormat(format: string) {
    if (!sourceEditorRef.value?.applyFormat(format)) return
    await nextTick()
    commitMarkdown(props.note)
  }
  async function setMarkdownHeading(level: number) {
    if (!sourceEditorRef.value?.setHeading(level)) return
    headingOpen.value = false
    await nextTick()
    commitMarkdown(props.note)
  }
  async function setMarkdownSmallBody() {
    if (!sourceEditorRef.value?.setSmallParagraph()) return
    headingOpen.value = false
    await nextTick()
    commitMarkdown(props.note)
  }
  function hasNoteContextConsent() {
    const key = `tiny-note-context-consent:${contextConsentModelId.value}`
    return localStorage.getItem(key) === 'granted'
  }
  function cancelAiConsent() {
    pendingAiRequest = null
    aiConsentOpen.value = false
  }
  function confirmAiConsent() {
    localStorage.setItem(`tiny-note-context-consent:${contextConsentModelId.value}`, 'granted')
    const request = pendingAiRequest
    pendingAiRequest = null
    aiConsentOpen.value = false
    if (request?.kind === 'assistant') sendAssistantMessage(request.prompt, null, request.taskFlight)
    else if (request) runAi(request.action, request.requestText, request.instruction, request.taskFlight)
  }
  async function runAi(action: AiAction = aiAction.value, requestText: string | null = null, instruction: string | null = null, taskFlight: TaskFlight | null = null) {
    if (!props.note || aiBusy.value) return
    if (!hasNoteContextConsent()) {
      pendingAiRequest = { kind: 'editor', action, requestText, instruction, taskFlight }
      aiConsentOpen.value = true
      return
    }
    if (requestText == null) requestText = props.note.contentText || ''
    const actionLabel = aiActionLabel(action)
    aiBusy.value = true
    aiOutputOpen.value = true
    aiText.value = `正在生成${actionLabel}…`
    aiResultAction.value = action
    aiOriginalText.value = requestText
    aiProposal.value = null
    aiSources.value = []
    aiDialogPosition.value = null
    aiRequestId.value = crypto.randomUUID()
    if (!await flushLatestContent()) {
      aiText.value = `${actionLabel}失败：文章保存失败，请稍后重试。`
      aiBusy.value = false
      return
    }
    if (store.saveTimer != null) clearTimeout(store.saveTimer)
    try {
      await saveDirtyNote(props.note)
    } catch {
      aiText.value = `${actionLabel}失败：文章保存失败，请稍后重试。`
      aiBusy.value = false
      return
    }
    const selection = savedSelection ? { ...savedSelection, text: editor.value?.state.doc.textBetween(savedSelection.from, savedSelection.to, '\n') || requestText } : null
    try {
      const task = await tasksStore.enqueue({ kind: 'note_ai', title: `${props.note.title || '未命名笔记'} · ${actionLabel}`, targetNoteId: props.note.id, payload: { previewOutput: `(${action})\n${instruction ? `${instruction}\n` : ''}${requestText.slice(0, 140)}`, request: { action, mode: action === 'interpret' ? 'chat' : 'edit', text: requestText, instruction, targetNoteId: props.note.id, selection, modelProfileId: null, thinkingMode: 'disabled', source: 'note_ai' } } }, { preparedFlight: taskFlight })
      aiRequestId.value = task.id
    } catch { aiText.value = 'AI 请求失败，请检查模型设置。'; aiBusy.value = false }
  }
  function captureAssistantSelection() {
    const instance = editor.value
    if (!instance || instance.state.selection.empty) return null
    const { from, to } = instance.state.selection
    const text = instance.state.doc.textBetween(from, to, '\n').trim()
    return text ? { from, to, text } : null
  }
  function openAssistant(selection: SelectionRange | null = captureAssistantSelection()) {
    clearTimeout(assistantTriggerTimer)
    if (selection) assistantSelection.value = selection
    assistantTriggerVisible.value = false
    assistantOpen.value = true
  }
  function closeAssistant() {
    assistantOpen.value = false
    assistantTriggerVisible.value = false
    clearTimeout(assistantTriggerTimer)
    assistantTriggerTimer = setTimeout(() => {
      if (!assistantOpen.value) assistantTriggerVisible.value = true
    }, 250)
  }
  function toggleAssistant() {
    if (assistantOpen.value) closeAssistant()
    else openAssistant()
  }
  function assistantContext() {
    const titleText = props.note?.title || '未命名笔记'
    const noteText = props.note?.contentText || editor.value?.getText() || ''
    const selected = assistantSelection.value?.text || '（本次没有单独选中文字）'
    return `当前文章：${titleText}\n\n文章全文：\n${noteText}\n\n选中的文字：\n${selected}`
  }
  function assistantReferences() {
    const references: Array<{ key: string; type: string; label: string; preview?: string }> = [{ key: `note:${props.note?.id}`, type: 'note', label: `当前文章 · ${props.note?.title || '未命名笔记'}` }]
    if (assistantSelection.value?.text) references.push({ key: `selection:${assistantSelection.value.from}:${assistantSelection.value.to}`, type: 'selection', label: '选中文字', preview: assistantSelection.value.text.replace(/\s+/g, ' ').trim().slice(0, 60) })
    return references
  }
  function pushAssistantResponse(content: string, sources: JsonValue[] = assistantResponseSources.value, proposal: EditProposal | null = assistantResponseProposal.value) {
    if (!content?.trim()) return
    assistantMessages.value.push({ role: 'assistant', content: content.trim(), sources: sources || [], proposal: proposal || null })
  }
  function assistantEditIntent(message: string) { return /(扩写|改写|修改|润色|精炼|替换|翻译|续写|修正|重写|rewrite|translate|polish|edit)/i.test(message) }
  async function sendAssistantMessage(prompt: string, sourceElement: EventTarget | null = null, preparedFlight: TaskFlight | null = null) {
    if (!props.note || assistantBusy.value || !prompt?.trim()) return
    const taskFlight = preparedFlight || prepareTaskFlight(sourceElement)
    if (!hasNoteContextConsent()) {
      pendingAiRequest = { kind: 'assistant', prompt: prompt.trim(), taskFlight }
      aiConsentOpen.value = true
      return
    }
    if (!await flushLatestContent()) return
    if (store.saveTimer != null) clearTimeout(store.saveTimer)
    await saveDirtyNote(props.note)
    const message = prompt.trim()
    assistantMessages.value.push({ role: 'user', content: message, references: assistantReferences() })
    assistantBusy.value = true
    assistantStreamingText.value = '正在思考…'
    assistantRequestId.value = crypto.randomUUID()
    assistantResponseSources.value = []
    assistantResponseProposal.value = null
    const context = assistantContext()
    try {
      const task = await tasksStore.enqueue({ kind: 'note_ai', title: `${props.note.title || '未命名笔记'} · 助手`, targetNoteId: props.note.id, payload: { previewOutput: `我已参考当前文章${assistantSelection.value?.text ? '和你选中的文字' : ''}。\n\n你的问题：${message}`, request: { action: 'custom', mode: assistantEditIntent(message) ? 'edit' : 'chat', text: context, instruction: message, targetNoteId: props.note.id, selection: assistantSelection.value, modelProfileId: null, source: 'note_ai' } } }, { preparedFlight: taskFlight })
      assistantRequestId.value = task.id
    } catch {
      pushAssistantResponse('AI 请求失败，请检查模型设置。')
      assistantStreamingText.value = ''
      assistantBusy.value = false
    }
  }
  async function stopAssistant() {
    if (!assistantRequestId.value || !assistantBusy.value) return
    await tasksStore.cancel(assistantRequestId.value)
    assistantBusy.value = false
    assistantStreamingText.value = ''
  }
  async function copyAssistantMessage(content: string) { if (content) await navigator.clipboard?.writeText(content) }
  async function stopAi() { if (!aiRequestId.value) return; await tasksStore.cancel(aiRequestId.value); aiBusy.value = false }
  function exportBodyHtml(html = '') {
    const container = document.createElement('div')
    container.innerHTML = sanitizeEditorHtml(html)
    if (container.firstElementChild?.matches('h1')) container.firstElementChild.remove()
    return container.innerHTML
  }
  async function prepareExportSnapshot() {
    if (!props.note || !editor.value || !await flushLatestContent()) return null
    return {
      title: String(props.note.title || '').trim() || t('untitled'),
      contentHtml: exportBodyHtml(prepareEditorContent(props.note))
    }
  }
  async function runArticleExport(format: Exclude<ExportFormat, ''>) {
    if (exportingFormat.value) return
    moreOpen.value = false
    exportingFormat.value = format
    try {
      const snapshot = await prepareExportSnapshot()
      if (!snapshot) return
      if (format === 'html') {
        let artifact: ExportArtifact | undefined
        await downloadNoteHtml(snapshot, { lang: locale.value, download: (blob, filename) => { artifact = { blob, filename } } })
        if (!artifact) throw new Error('HTML export did not produce an artifact')
        const result = await saveExportBlob(artifact.blob, artifact.filename, { appStore })
        if (result.cancelled) return
        if (result.path) showExportSuccess(result)
        else showToast(t('htmlExported'))
      } else if (format === 'pdf') {
        let artifact: ExportArtifact | undefined
        await exportNotePdf(snapshot, { download: (blob, filename) => { artifact = { blob, filename } } })
        if (!artifact) throw new Error('PDF export did not produce an artifact')
        const result = await saveExportBlob(artifact.blob, artifact.filename, { appStore })
        if (result.cancelled) return
        if (result.path) showExportSuccess(result)
        else showToast(t('pdfExported'))
      } else if (format === 'print') {
        await printNoteDocument(snapshot)
      }
    } catch (error) {
      const key = unknownErrorCode(error) === 'PDF_CANVAS_LIMIT'
        ? 'pdfTooLong'
        : format === 'pdf' ? 'pdfExportFailed' : format === 'html' ? 'htmlExportFailed' : 'printFailed'
      showToast(t(key), { tone: 'error' })
    } finally {
      exportingFormat.value = ''
    }
  }
  async function exportMarkdown() {
    moreOpen.value = false
    if (!props.note || !editor.value || !await flushLatestContent()) return
    const markdown = props.note.contentMarkdown || getEditorMarkdown()
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const result = await saveExportBlob(blob, createSafeExportFilename(props.note.title, 'md'), { appStore })
    if (result.cancelled) return
    if (result.path) showExportSuccess(result)
    else showToast(t('markdownExported'))
  }
  function exportHtml() { return runArticleExport('html') }
  function exportPdf() { return runArticleExport('pdf') }
  function printNote() { return runArticleExport('print') }
  function restoreSavedSelection() { if (!editor.value || !savedSelection) return false; return editor.value.chain().focus().setTextSelection(savedSelection).run() }
  function clearAiResultState() { aiOutputOpen.value = false; aiText.value = ''; aiOriginalText.value = ''; aiResultAction.value = ''; aiFeedback.value = ''; aiDialogPosition.value = null; aiProposal.value = null; aiSources.value = [] }
  function syncNoteFromEditor() {
    if (!props.note || !editor.value) return
    props.note.contentHtml = sanitizeEditorHtml(editor.value.getHTML())
    props.note.contentText = editor.value.getText()
    props.note.contentMarkdown = getEditorMarkdown()
    markdownDraft.value = props.note.contentMarkdown
    sourceDirty.value = false
    markdownParseError.value = ''
    pendingSourceDrafts.delete(props.note.id)
  }
  function selectedContentMarks(doc: ProseMirrorNode, from: number, to: number): readonly Mark[] {
    let marks: readonly Mark[] = []
    doc.nodesBetween(from, to, (node: ProseMirrorNode) => {
      if (node.isText && !marks.length) marks = node.marks
    })
    return marks
  }
  function insertPendingAiContent(content: string, insertPos: number, selectionFrom: number, selectionTo: number) {
    if (!editor.value) return null
    const beforeSize = editor.value.state.doc.content.size
    const { doc, schema } = editor.value.state
    const $from = doc.resolve(selectionFrom)
    const $to = doc.resolve(selectionTo)
    applyingEditorContent = true
    if ($from.parent === $to.parent && $from.parent.isTextblock && isPlainInlineAiReplacement(content)) {
      const marks = selectedContentMarks(doc, selectionFrom, selectionTo)
      editor.value.view.dispatch(editor.value.state.tr.insert(insertPos, schema.text(content, marks)).scrollIntoView())
      editor.value.commands.focus()
    } else {
      editor.value.chain().focus().insertContentAt(insertPos, content, { contentType: 'markdown' }).run()
    }
    const insertedLength = editor.value.state.doc.content.size - beforeSize
    applyingEditorContent = false
    return { insertionFrom: insertPos, insertionTo: insertPos + insertedLength }
  }
  function stagePendingAiChange(mode: 'insert' | 'replace', content: string, selectionFrom: number, selectionTo: number, change: PendingAiChangeBase) {
    const preview = insertPendingAiContent(content, selectionTo, selectionFrom, selectionTo)
    if (!preview) return false
    const instance = editor.value
    if (!instance || !props.note) return false
    const highlightMark = instance.state.schema.marks.highlight
    const strikeMark = instance.state.schema.marks.strike
    applyingEditorContent = true
    let transaction = instance.state.tr
    if (highlightMark && preview.insertionFrom < preview.insertionTo) {
      transaction = transaction.addMark(preview.insertionFrom, preview.insertionTo, highlightMark.create({ color: AI_CHANGE_HIGHLIGHT }))
    }
    if (mode === 'replace' && strikeMark) {
      transaction = transaction.addMark(selectionFrom, selectionTo, strikeMark.create())
    }
    transaction = transaction.setSelection(TextSelection.near(transaction.doc.resolve(preview.insertionTo)))
    instance.view.dispatch(transaction.scrollIntoView())
    applyingEditorContent = false
    pendingAiChange = {
      ...change,
      type: mode,
      noteId: props.note.id,
      strikeFrom: selectionFrom,
      strikeTo: selectionTo,
      highlightFrom: preview.insertionFrom,
      highlightTo: preview.insertionTo
    }
    aiChangePending.value = true
    clearAiResultState()
    return true
  }
  function restoreAiChange(change: PendingAiChangeBase) {
    aiChangePending.value = false
    applyingEditorContent = true
    editor.value?.commands.setContent(change.beforeHtml, { emitUpdate: false })
    applyingEditorContent = false
    const activeNote = props.note
    if (activeNote?.id === change.noteId) {
      activeNote.contentHtml = change.beforeHtml
      activeNote.contentText = change.beforeText
      activeNote.contentMarkdown = change.beforeMarkdown
      markdownDraft.value = change.beforeDraft
      sourceDirty.value = false
    }
    aiText.value = change.replacement
    aiOutputOpen.value = true
    aiOriginalText.value = change.proposal.originalText || ''
    aiResultAction.value = change.resultAction
    aiProposal.value = change.proposal
    aiSources.value = change.resultSources
  }
  async function persistAiChange(change: PendingAiChangeBase) {
    const activeNote = props.note
    if (!activeNote) return
    if (store.saveTimer != null) clearTimeout(store.saveTimer)
    if (!window.__TAURI_INTERNALS__) {
      await saveDirtyNote(activeNote)
      change.proposal.status = 'applied'
      savedSelection = null
      return
    }
    const updated = await (await import('../services/tauri')).invoke('note_edit_apply', {
      proposalId: change.proposal.id,
      expectedUpdatedAt: change.proposal.baseUpdatedAt,
      contentHtml: activeNote.contentHtml,
      contentText: activeNote.contentText,
      contentMarkdown: activeNote.contentMarkdown || getEditorMarkdown()
    })
    Object.assign(activeNote, updated)
    markdownDraft.value = updated.contentMarkdown || getEditorMarkdown()
    persistedSignatures.set(updated.id, noteContentSignature(updated))
    change.proposal.status = 'applied'
    savedSelection = null
  }
  async function confirmPendingAiChange() {
    if (!pendingAiChange || !editor.value || pendingAiChange.noteId !== props.note?.id) return
    const change = pendingAiChange
    pendingAiChange = null
    aiChangePending.value = false
    try {
      const highlightMark = editor.value.state.schema.marks.highlight
      applyingEditorContent = true
      let transaction = editor.value.state.tr
      if (change.type === 'replace') {
        transaction = transaction.delete(change.strikeFrom, change.strikeTo)
        const mappedFrom = transaction.mapping.map(change.highlightFrom)
        const mappedTo = transaction.mapping.map(change.highlightTo)
        if (highlightMark) transaction = transaction.removeMark(mappedFrom, mappedTo, highlightMark)
      } else if (highlightMark) {
        transaction = transaction.removeMark(change.highlightFrom, change.highlightTo, highlightMark)
      }
      editor.value.view.dispatch(transaction.scrollIntoView())
      applyingEditorContent = false
      syncNoteFromEditor()
      await persistAiChange(change)
    } catch (error) {
      applyingEditorContent = false
      restoreAiChange(change)
      showToast(unknownErrorCode(error) === 'proposal_stale' ? '文章已经发生变化，请重新生成修改建议。' : '应用修改失败，请重试。', { tone: 'error' })
    }
  }
  async function applyAiResult(mode: 'insert' | 'replace') {
    const activeNote = props.note
    if (!editor.value || !activeNote || !aiText.value || !aiProposal.value) return
    if (mode === 'insert' && editorMode.value !== 'rich') {
      showToast('Markdown 模式没有可靠插入位置，请切换到即时编辑后再应用插入。', { tone: 'warning' })
      return
    }
    if (!await flushLatestContent()) return
    const proposal = aiProposal.value
    const replacement = aiText.value
    const resultAction = aiResultAction.value
    const resultSources = aiSources.value
    const beforeHtml = editor.value.getHTML()
    const beforeText = editor.value.getText()
    const beforeMarkdown = activeNote.contentMarkdown || getEditorMarkdown()
    const beforeDraft = markdownDraft.value
    const selectionFrom = proposal.selectionFrom
    const selectionTo = proposal.selectionTo
    const hasProposalSelection = typeof selectionFrom === 'number' && typeof selectionTo === 'number' && Number.isInteger(selectionFrom) && Number.isInteger(selectionTo) && selectionFrom < selectionTo
    const change: PendingAiChangeBase = { noteId: activeNote.id, proposal, replacement, resultAction, resultSources, beforeHtml, beforeText, beforeMarkdown, beforeDraft }
    const insertionSelection = hasProposalSelection ? { from: selectionFrom, to: selectionTo } : savedSelection
    if (editorMode.value === 'rich' && ((mode === 'replace' && hasProposalSelection) || (mode === 'insert' && insertionSelection))) {
      const range = mode === 'replace' && hasProposalSelection ? { from: selectionFrom, to: selectionTo } : insertionSelection
      if (!range) return
      stagePendingAiChange(mode, replacement, range.from, range.to, change)
      return
    }
    clearAiResultState()
    try {
      if (mode === 'replace') {
        if (hasProposalSelection) {
          const { doc, tr } = editor.value.state
          const $from = doc.resolve(selectionFrom)
          const $to = doc.resolve(selectionTo)
          if ($from.parent === $to.parent && $from.parent.isTextblock && isPlainInlineAiReplacement(replacement)) {
            editor.value.view.dispatch(tr.insertText(replacement, selectionFrom, selectionTo).scrollIntoView())
            editor.value.commands.focus()
          } else {
            editor.value.chain().focus().setTextSelection({ from: selectionFrom, to: selectionTo }).insertContent(replacement, { contentType: 'markdown' }).run()
          }
          syncNoteFromEditor()
        } else {
          markdownDraft.value = replacement
          sourceDirty.value = true
          if (!commitMarkdown(activeNote, { schedule: false })) return
        }
      } else {
        editor.value.chain().focus().insertContent(replacement, { contentType: 'markdown' }).run()
        syncNoteFromEditor()
      }
      await persistAiChange(change)
    } catch (error) {
      applyingEditorContent = false
      restoreAiChange(change)
      showToast(unknownErrorCode(error) === 'proposal_stale' ? '文章已经发生变化，请重新生成修改建议。' : '应用修改失败，请重试。', { tone: 'error' })
    }
  }
  function insertAi() { return applyAiResult('insert') }
  function replaceWithAi() { return applyAiResult('replace') }
  async function copyAi() { if (aiText.value) await navigator.clipboard?.writeText(aiText.value) }
  function toggleAiFeedback(type: string) { aiFeedback.value = aiFeedback.value === type ? '' : type }
  async function dismissAiResult() { if (aiProposal.value?.status === 'draft' && window.__TAURI_INTERNALS__) { try { await (await import('../services/tauri')).invoke('note_edit_discard', { proposalId: aiProposal.value.id }) } catch {} }; clearAiResultState() }
  async function closeAiResult() { if (aiBusy.value) await stopAi(); dismissAiResult() }
  function stopAiDrag() {
    if (!aiDragState) return
    window.removeEventListener('pointermove', moveAiDialog)
    window.removeEventListener('pointerup', stopAiDrag)
    window.removeEventListener('pointercancel', stopAiDrag)
    aiDragState = null
  }
  function moveAiDialog(event: PointerEvent) {
    if (!aiDragState || event.pointerId !== aiDragState.pointerId) return
    const maxLeft = Math.max(8, window.innerWidth - aiDragState.width - 8)
    const maxTop = Math.max(8, window.innerHeight - aiDragState.height - 8)
    aiDialogPosition.value = {
      left: Math.min(maxLeft, Math.max(8, event.clientX - aiDragState.offsetX)),
      top: Math.min(maxTop, Math.max(8, event.clientY - aiDragState.offsetY))
    }
  }
  function startAiDrag(event: PointerEvent) {
    const target = event.target instanceof Element ? event.target : null
    const currentTarget = event.currentTarget instanceof Element ? event.currentTarget : null
    if (event.button !== 0 || target?.closest('button')) return
    const panel = currentTarget?.closest<HTMLElement>('.ai-output-panel')
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    aiDialogPosition.value = { left: rect.left, top: rect.top }
    aiDragState = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, width: rect.width, height: rect.height }
    try { if (currentTarget instanceof HTMLElement) currentTarget.setPointerCapture?.(event.pointerId) } catch {}
    window.addEventListener('pointermove', moveAiDialog)
    window.addEventListener('pointerup', stopAiDrag)
    window.addEventListener('pointercancel', stopAiDrag)
    event.preventDefault()
  }
  function rewriteAi(event: MouseEvent) {
    if (aiBusy.value || !aiResultAction.value) return
    const action = aiResultAction.value as AiAction
    let text = selectedText.value
    if (savedSelection && editor.value) text = editor.value.state.doc.textBetween(savedSelection.from, savedSelection.to, '\n').trim()
    if (aiProposal.value?.status === 'draft' && window.__TAURI_INTERNALS__) {
      const proposalId = aiProposal.value.id
      void import('../services/tauri').then(({ invoke }) => invoke('note_edit_discard', { proposalId })).catch(() => {})
    }
    runAi(action, text || props.note?.contentText || '', null, prepareTaskFlight(event?.currentTarget))
  }
  function saveCurrentSelection() { const selection = editor.value?.state.selection; if (selection && !selection.empty) savedSelection = { from: selection.from, to: selection.to } }
  function closeAiPanel() { aiPanelOpen.value = false; aiPanelSelectionText.value = ''; commandMenuOpen.value = false; aiPrompt.value = '' }
  function positionCommandMenu() {
    const button = document.querySelector('.tiny-note-ai-input-wrapper .tiny-note-command-btn')
    if (!button) return
    const rect = button.getBoundingClientRect()
    const menuHeight = 260
    commandMenuDirection.value = window.innerHeight - rect.bottom < menuHeight && rect.top > window.innerHeight - rect.bottom ? 'up' : 'down'
  }
  async function openAiPanel() {
    saveCurrentSelection(); aiPanelSelectionText.value = selectedText.value; aiPanelOpen.value = true; aiPrompt.value = ''
    await nextTick(); aiInputRef.value?.focus(); positionCommandMenu(); commandMenuOpen.value = true
  }
  function toggleCommandMenu(event: MouseEvent) { event.stopPropagation(); if (!commandMenuOpen.value) positionCommandMenu(); commandMenuOpen.value = !commandMenuOpen.value }
  async function selectAiCommand(action: AiAction, event: MouseEvent) { const taskFlight = prepareTaskFlight(event.currentTarget); saveCurrentSelection(); const text = aiPanelSelectionText.value || selectedText.value || props.note?.contentText || ''; let instruction: string | null = null; if (action === 'translate') { const previous = localStorage.getItem('tiny-note-translation-language') || '英文'; const language = await requestPrompt('请输入目标语言', previous); if (!language?.trim()) return; localStorage.setItem('tiny-note-translation-language', language.trim()); instruction = `翻译为${language.trim()}` }; closeAiPanel(); runAi(action, text, instruction, taskFlight) }
  function sendCustomAi(event: MouseEvent) { const instruction = aiPrompt.value.trim(); if (!instruction || aiBusy.value) return; const currentTarget = event.currentTarget instanceof Element ? event.currentTarget : null; const source = currentTarget?.closest('.tiny-note-ai-panel')?.querySelector('.tiny-note-send-btn') || currentTarget; const taskFlight = prepareTaskFlight(source); saveCurrentSelection(); const text = aiPanelSelectionText.value || selectedText.value || props.note?.contentText || ''; closeAiPanel(); runAi('custom', text, instruction, taskFlight) }
  function runSelectedAi(action: AiAction, event: MouseEvent) { const text = selectedText.value; if (!text || aiBusy.value) return; const taskFlight = prepareTaskFlight(event.currentTarget); saveCurrentSelection(); runAi(action, text, null, taskFlight) }
  function openInConversation() {
    const text = selectedText.value
    if (!text) return
    closeAiPanel()
    openAssistant(captureAssistantSelection())
  }
  async function runFim() { if (editorMode.value !== 'rich' || !fimEnabled.value || !editor.value || !props.note?.contentText) return; const id = crypto.randomUUID(); const channel = new EventChannel<{ type: string; text?: string }>(); let result = ''; channel.onmessage = event => { if (event.type === 'delta') result += event.text || ''; if (event.type === 'completed') fimSuggestion.value = result }; try { await (await import('../services/tauri')).invoke('note_fim_stream', { request: { requestId: id, action: 'continue_write', text: props.note.contentText.slice(-800), instruction: `Continue naturally. Context after cursor: ${props.note.contentText.slice(-400)}`, modelProfileId: null }, onEvent: channel }) } catch { fimSuggestion.value = '' } }
  function acceptFim() { if (fimSuggestion.value && editor.value) { editor.value.commands.insertContent(fimSuggestion.value); fimSuggestion.value = '' } }
  function handleEditorTab(event: KeyboardEvent) {
    if (!fimSuggestion.value || !editor.value || editorMode.value !== 'rich') return
    if (event.target instanceof Element && event.target.closest('button, select, input, textarea, [contenteditable="false"]')) return
    event.preventDefault()
    acceptFim()
  }
  function dismissFim() { fimSuggestion.value = '' }
  function insertCodeBlock() { editor.value?.chain().focus().toggleCodeBlock().run(); insertOpen.value = false }
  const mermaidTemplates = {
    flowchart: [
      'flowchart LR',
      '  accTitle: 示例流程图',
      '  accDescr: 从开始经过判断，到达完成或调整。',
      '  start[开始] --> decision{条件满足?}',
      '  decision -->|是| done[完成]',
      '  decision -->|否| revise[调整]',
      '  revise --> decision'
    ].join('\n'),
    swimlane: [
      'swimlane-beta LR',
      '  accTitle: 示例审批泳道',
      '  accDescr: 申请人提交申请，审批人审核并返回结果。',
      '  subgraph applicant [申请人]',
      '    submit[提交申请]',
      '    receive[接收结果]',
      '  end',
      '  subgraph reviewer [审批人]',
      '    review{是否批准}',
      '  end',
      '  submit --> review --> receive'
    ].join('\n')
  }
  function insertMermaidDiagram(kind: keyof typeof mermaidTemplates) {
    const source = mermaidTemplates[kind] || mermaidTemplates.flowchart
    const currentEditor = editor.value
    if (!currentEditor) return
    markMermaidDiagramForEditing(currentEditor, source)
    currentEditor.chain().focus().insertContent({
      type: 'codeBlock',
      attrs: { language: 'mermaid' },
      content: [{ type: 'text', text: source }]
    }).run()
    insertOpen.value = false
  }
  function closeToolbarMenus() { insertOpen.value = false; tablePickerOpen.value = false; textColorOpen.value = false; highlightOpen.value = false; headingOpen.value = false; moreOpen.value = false }
  function toggleInsertMenu() { closeToolbarMenus(); insertOpen.value = !insertOpen.value }
  function selectTableCell(row: number, col: number) { tableRows.value = row; tableCols.value = col }
  function insertTable(rows = tableRows.value, cols = tableCols.value) {
    if (!editor.value || !rows || !cols) return
    editor.value.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
    insertOpen.value = false; tablePickerOpen.value = false; tableRows.value = 0; tableCols.value = 0
  }
  function openImageDialog() {
    insertOpen.value = false; imageUrl.value = ''; imageAlt.value = ''; imageDialogOpen.value = true
    nextTick(() => imageInput.value?.focus())
  }
  function normalizeImageUrl(value: string) {
    const src = value.trim()
    if (!src) return ''
    try { return ['http:', 'https:'].includes(new URL(src, window.location.origin).protocol) ? src : '' } catch { return '' }
  }
  function confirmImage() {
    const src = normalizeImageUrl(imageUrl.value)
    if (!src || !editor.value) return
    editor.value.chain().focus().setImage({ src, alt: imageAlt.value.trim() }).run()
    imageDialogOpen.value = false
  }
  function insertLocalImage(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file || !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024 || !editor.value) return
    const reader = new FileReader()
    reader.onload = () => {
      const src = String(reader.result || '')
      if (/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(src)) {
        editor.value?.chain().focus().setImage({ src, alt: imageAlt.value.trim() }).run()
        imageDialogOpen.value = false
      }
    }
    reader.readAsDataURL(file)
  }
  function setTextColor(color: string) {
    if (!editor.value) return
    const chain = editor.value.chain().focus()
    if (color === 'inherit') chain.unsetColor().run()
    else chain.setColor(color).run()
    textColorOpen.value = false
  }
  function setHighlightColor(color: string) {
    if (!editor.value) return
    if (color === 'none') editor.value.chain().focus().unsetHighlight().run()
    else editor.value.chain().focus().toggleHighlight({ color }).run()
    highlightOpen.value = false
  }
  function setHeading(level: 0 | 1 | 2 | 3) {
    if (!editor.value) return
    if (editor.value.isActive('noteTitle')) {
      headingOpen.value = false
      return
    }
    if (level === 0) editor.value.chain().focus().setParagraph().run()
    else editor.value.chain().focus().toggleHeading({ level }).run()
    headingOpen.value = false
  }
  function setNoteTitle() {
    if (!editor.value || !canSetNoteTitle.value) return
    editor.value.chain().focus().setNode('noteTitle').run()
    headingOpen.value = false
  }
  function setSmallBody() {
    if (!editor.value || editor.value.isActive('noteTitle')) return
    const chain = editor.value.chain().focus()
    if (editor.value.isActive('smallParagraph')) chain.setParagraph().run()
    else chain.setNode('smallParagraph').run()
    headingOpen.value = false
  }
  function clearRichFormatting() {
    if (!editor.value) return
    const chain = editor.value.chain().focus().unsetAllMarks()
    if (!editor.value.isActive('noteTitle')) chain.clearNodes()
    chain.run()
  }
  function normalizeLinkHref(value: string) {
    let href = value.trim()
    if (!href) return ''
    if (/^www\./i.test(href)) href = `https://${href}`
    try {
      const protocol = new URL(href, window.location.origin).protocol
      return ['http:', 'https:', 'mailto:', 'tel:'].includes(protocol) ? href : ''
    } catch { return '' }
  }
  async function editLink() {
    const instance = editor.value
    if (!instance || !canEditLink.value) return
    const currentHref = instance.getAttributes('link').href || ''
    const nextHref = await requestPrompt(linkActive.value ? '编辑链接地址' : '输入链接地址', currentHref || 'https://', { inputType: 'url' })
    if (nextHref === null) return
    if (!nextHref.trim()) { if (linkActive.value) instance.chain().focus().extendMarkRange('link').unsetLink().run(); return }
    const href = normalizeLinkHref(nextHref)
    if (!href) return
    const chain = instance.chain().focus()
    if (linkActive.value) chain.extendMarkRange('link').setLink({ href }).run()
    else chain.setLink({ href }).run()
  }
  async function saveNoteMetadata() {
    if (!props.note) return
    await flushLatestContent({ save: true })
    await store.save(props.note)
    persistedSignatures.set(props.note.id, noteContentSignature(props.note))
    noteLinks.value = (await store.listLinks(props.note.id).catch(() => [])) || []
  }
  async function importExternalSource() {
    try {
      const activeNote = props.note
      if (activeNote && await flushLatestContent({ note: activeNote, save: true })) emit('import-external', activeNote)
    } catch (error) {
      const message = unknownErrorCode(error) === 'external_file_changed'
        ? '源文件已被其他程序修改，请重新打开文件后再导入。'
        : errorMessage(error, '保存外部文件失败，请重试')
      showToast(message, { tone: 'error' })
    }
  }
  

  return {
    lowlight, store, library, appStore, tasksStore, t, locale, aiBusy,
    aiText, aiRequestId, aiAction, aiResultAction, aiProposal, aiSources, aiConsentOpen, assistantOpen,
    assistantTriggerVisible, assistantBusy, assistantRequestId, assistantStreamingText, assistantMessages, assistantSelection, assistantResponseSources, assistantResponseProposal,
    aiPanelOpen, aiPanelSelectionText, commandMenuOpen, aiPrompt, aiInputRef, commandMenuDirection, moreOpen, moreTriggerRef,
    moreMenuRef, insertOpen, tablePickerOpen, textColorOpen, highlightOpen, headingOpen, imageDialogOpen, imageUrl,
    imageAlt, imageInput, imageFileInput, tableRows, tableCols, fimEnabled, fimSuggestion, editorStateTick,
    fimTimer, assistantTriggerTimer, savedSelection, pendingAiRequest, pendingAiChange, modeIcons, noteLinks, editorModes,
    editorMode, modeMenuOpen, modeMenuIndex, modeMenuRef, markdownDraft, markdownParseError, sourceDirty, markdownPasteNotice,
    markdownPreview, splitRatio, splitVertical, splitWorkspace, sourceEditorRef, previewScroller, pendingSourceDrafts, persistedSignatures,
    exportingFormat, exportStatusLabel, externalFileName, EXTERNAL_NOTICE_DISMISSED_PREFIX, externalNoticeDismissed, showExternalNoteBanner, applyingEditorContent, markdownParseTimer,
    markdownPasteTimer, splitResizeObserver, splitDragState, scrollSyncFrame, scrollSyncSource, modeShortcutSwitching, externalNoticeStorageKey, readExternalNoticeDismissed,
    dismissExternalNoteBanner, currentMode, modeShortcutParts, modeShortcutLabel, richMode, codeMode, splitMode, splitPaneStyle,
    aiActionLabels, aiErrorMessages, aiEventErrorMessage, aiActionLabel, unknownErrorCode, contextConsentModelId, aiFeedback, aiOutputOpen,
    aiOriginalText, aiChangePending, AI_CHANGE_HIGHLIGHT, aiCharCount, aiDialogPosition, aiDialogStyle, aiDragState, refreshEditorState,
    looksLikeMarkdown, isPlainInlineAiReplacement, handleMarkdownPaste, prepareEditorContent, extractNoteTitle, textFromPreparedEditorContent, syncNoteTitle, getEditorMarkdown,
    editor, canUndo, canRedo, linkActive, canEditLink, selectedText, shouldShowBubbleMenu, textColorPalette,
    highlightPalette, currentHeadingLabel, canSetNoteTitle, noteContentSignature, scheduleNoteSave, saveDirtyNote, handleRichEditorUpdate, deriveMarkdown,
    commitMarkdown, queueMarkdownParse, updateMarkdownDraft, flushLatestContent, resetEditorSession, changeEditorMode, handleEditorModeShortcut, toggleModeMenu,
    focusModeOption, moveModeFocus, handleModeMenuKeydown, focusMoreItem, toggleMoreMenu, handleMoreMenuKeydown, handleDocumentPointerDown, updateSplitOrientation,
    setupSplitObserver, stopSplitResize, resizeSplitPane, startSplitResize, synchronizeSplitScroll, handlePreviewScroll, toggleMarkdownPreview, viewPastedMarkdown,
    resetTransientEditorState, handleBackgroundNoteTask, setEditorEditable, loadExternalProposal, toggle, applyMarkdownFormat, setMarkdownHeading, setMarkdownSmallBody,
    hasNoteContextConsent, cancelAiConsent, confirmAiConsent, runAi, captureAssistantSelection, openAssistant, closeAssistant, toggleAssistant,
    assistantContext, assistantReferences, pushAssistantResponse, assistantEditIntent, sendAssistantMessage, stopAssistant, copyAssistantMessage, stopAi,
    exportBodyHtml, prepareExportSnapshot, runArticleExport, exportMarkdown, exportHtml, exportPdf, printNote, restoreSavedSelection,
    clearAiResultState, syncNoteFromEditor, selectedContentMarks, insertPendingAiContent, stagePendingAiChange, restoreAiChange, persistAiChange, confirmPendingAiChange,
    applyAiResult, insertAi, replaceWithAi, copyAi, toggleAiFeedback, dismissAiResult, closeAiResult, stopAiDrag,
    moveAiDialog, startAiDrag, rewriteAi, saveCurrentSelection, closeAiPanel, positionCommandMenu, openAiPanel, toggleCommandMenu,
    selectAiCommand, sendCustomAi, runSelectedAi, openInConversation, runFim, acceptFim, handleEditorTab, dismissFim,
    insertCodeBlock, mermaidTemplates, insertMermaidDiagram, closeToolbarMenus, toggleInsertMenu, selectTableCell, insertTable, openImageDialog,
    normalizeImageUrl, confirmImage, insertLocalImage, setTextColor, setHighlightColor, setHeading, setNoteTitle, setSmallBody,
    clearRichFormatting, normalizeLinkHref, editLink, saveNoteMetadata, importExternalSource,
  }
}
