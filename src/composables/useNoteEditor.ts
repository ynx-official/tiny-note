import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import { shallowRef } from 'vue'
import TurndownService from 'turndown'
import type { VditorPort } from '../editor/vditorPort'
import { applyMarkdownProposal, type MarkdownSelection } from '../editor/markdownSelection'
import { protectNoteDraft, releaseNoteDraft, trackPersistedNote } from '../services/noteCache'
import { EventChannel } from '../services/eventChannel'
import { FileCode2, PenLine } from 'lucide-vue-next'
import { useNotesStore } from '../stores/notes'
import { useLibraryStore } from '../stores/library'
import { useAppStore } from '../stores/app'
import { useTasksStore } from '../stores/tasks'
import { useI18n } from 'vue-i18n'
import { DEFAULT_NOTE_MODE, NOTE_MODES, markdownToEditorHtml, sanitizeEditorHtml, scrollOffset, scrollProgress } from '../utils/noteMarkdown'
import { matchesKeyboardShortcut, shortcutDisplayParts } from '../utils/keyboardShortcut'
import { createSafeExportFilename, downloadNoteHtml, exportNotePdf, printNote as printNoteDocument } from '../utils/noteExport'
import { prepareTaskFlight } from '../utils/taskFlight'
import { requestPrompt } from '../services/promptDialog'
import { showToast } from '../services/appFeedback'
import { saveExportBlob } from '../services/exportLocation'
import { showExportSuccess } from '../services/exportSuccess'
import { errorMessage, type BackgroundTask, type EditProposal, type Note, type NoteLink, type JsonValue } from '../types/domain'

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
  type EditorMode = 'rich' | 'markdown'
  type AiAction = 'interpret' | 'refine' | 'polish' | 'expand' | 'translate' | 'summarize' | 'continue_write' | 'fix_grammar' | 'generate_plan' | 'generate_table' | 'custom'
  type ExportFormat = '' | 'html' | 'pdf' | 'print'
  type TaskFlight = () => void
  type SelectionRange = MarkdownSelection
  interface AssistantReference { key: string; type: string; label: string; preview?: string }
  interface AssistantMessage { role: 'assistant' | 'user'; content: string; sources?: JsonValue[]; proposal?: EditProposal | null; references?: AssistantReference[] }
  interface AiEvent { code?: string; message?: string }
  interface AiEditorRequest { kind: 'editor'; action: AiAction; requestText: string | null; instruction: string | null; taskFlight: TaskFlight | null }
  interface AiAssistantRequest { kind: 'assistant'; prompt: string; taskFlight: TaskFlight | null }
  type PendingAiRequest = AiEditorRequest | AiAssistantRequest
  interface AiDragState { pointerId: number; offsetX: number; offsetY: number; width: number; height: number }
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
  const imageDialogOpen = ref(false)
  const imageUrl = ref('')
  const imageAlt = ref('')
  const imageInput = ref<HTMLInputElement | null>(null)
  const imageFileInput = ref<HTMLInputElement | null>(null)
  const fimEnabled = computed(() => appStore.settings.fimEnabled === true)
  const fimSuggestion = ref('')
  let fimTimer: ReturnType<typeof setTimeout> | undefined
  let assistantTriggerTimer: ReturnType<typeof setTimeout> | undefined
  let savedSelection: SelectionRange | null = null
  let pendingAiRequest: PendingAiRequest | null = null
  const modeIcons = { rich: PenLine, markdown: FileCode2 }
  const noteLinks = ref<NoteLink[]>([])
  const editorModes = NOTE_MODES.map(mode => ({ ...mode, id: mode.id as EditorMode, icon: modeIcons[mode.id as EditorMode] }))
  const editorMode = ref<EditorMode>(DEFAULT_NOTE_MODE as EditorMode)
  const modeMenuOpen = ref(false)
  const modeMenuIndex = ref(0)
  const modeMenuRef = ref<HTMLElement | null>(null)
  let editingNote = props.note
  const markdownDraft = ref('')
  const markdownParseError = ref('')
  const sourceDirty = ref(false)
  const markdownPasteNotice = ref(false)
  const markdownPreview = ref(true)
  const READING_POSITION_PREFIX = 'tiny-note:reading-position:'
  let readingPositionTimer: ReturnType<typeof setTimeout> | undefined
  const pendingSourceDrafts = new Map<string, string>()
  const persistedSignatures = new WeakMap<Note, string>()
  const exportingFormat = ref<ExportFormat>('')
  const exportStatusLabel = computed(() => exportingFormat.value ? ({ html: t('exportingHtml'), pdf: t('exportingPdf'), print: t('preparingPrint') })[exportingFormat.value] : '')
  const externalFileName = computed(() => String(props.note?.externalPath || '').split(/[\\/]/).pop() || props.note?.title || 'Markdown 文件')
  const EXTERNAL_NOTICE_DISMISSED_PREFIX = 'tiny-note:external-file-notice-dismissed:'
  const externalNoticeDismissed = ref(false)
  const showExternalNoteBanner = computed(() => props.note?.external === true && !externalNoticeDismissed.value)
  let markdownParseTimer: ReturnType<typeof setTimeout> | undefined
  let markdownPasteTimer: ReturnType<typeof setTimeout> | undefined
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
  const editor = shallowRef<VditorPort | null>(null)
  const currentSelection = ref<MarkdownSelection | null>(null)
  const selectedText = computed(() => currentSelection.value?.text || '')
  const applyingAi = ref(false)
  const aiError = ref('')
  let aiBaseSource: string | null = null
  let aiProposalStale = false
  function prepareEditorContent(note: Note | null) {
    return sanitizeEditorHtml(note?.contentMarkdown ? markdownToEditorHtml(note.contentMarkdown) : note?.contentHtml || '')
  }
  function deriveMarkdown(note: Note | null = props.note): string {
    if (!note) return ''
    if (pendingSourceDrafts.has(note.id)) return pendingSourceDrafts.get(note.id) || ''
    // Empty Markdown is authoritative for a shared source. HTML-only legacy
    // notes are converted in memory, never written back merely by opening.
    if (note.markdownSource || note.contentMarkdown || !note.contentHtml) return note.contentMarkdown || ''
    return new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' }).turndown(sanitizeEditorHtml(note.contentHtml))
  }
  function onEditorReady(instance: VditorPort) {
    editor.value = instance
    instance.setMarkdown(markdownDraft.value, true)
    restoreReadingPosition(props.note?.id)
  }
  function onEditorSelection(selection: MarkdownSelection | null) {
    const previous = currentSelection.value
    if (previous?.from !== selection?.from || previous?.to !== selection?.to || previous?.source !== selection?.source) fimSuggestion.value = ''
    currentSelection.value = selection
  }
  function updateNoteTitle(title: string) {
    const note = props.note
    if (!note || note.external || note.title === title) return
    note.title = title
    scheduleNoteSave(note)
  }
  function focusNoteBody() { editor.value?.focus() }
  function getEditorMarkdown() { return editor.value?.getMarkdown() ?? markdownDraft.value }
  function noteContentSignature(note: Note | null | undefined) {
    if (!note) return ''
    return JSON.stringify([note.title, note.notebookId, note.contentHtml, note.contentText, note.contentMarkdown || '', note.pinned])
  }
  
  function scheduleNoteSave(note: Note | null = props.note) {
    if (!note) return
    const signature = noteContentSignature(note)
    store.scheduleSave(note, () => persistedSignatures.set(toRaw(note), signature))
  }
  
  async function saveDirtyNote(note: Note | null = props.note) {
    if (!note || persistedSignatures.get(toRaw(note)) === noteContentSignature(note)) return
    if (store.saveTimer != null) clearTimeout(store.saveTimer)
    const signature = noteContentSignature(note)
    await store.save(note)
    persistedSignatures.set(toRaw(note), signature)
  }
  
  function commitMarkdown(note: Note | null = props.note, { schedule = true }: { schedule?: boolean } = {}) {
    if (!note || !sourceDirty.value) return true
    const source = markdownDraft.value
    note.contentMarkdown = source
    try {
      if (editor.value) {
        note.contentHtml = editor.value.getHTML(source)
        note.contentText = editor.value.getText(source)
      } else {
        note.contentHtml = sanitizeEditorHtml(markdownToEditorHtml(source))
        const element = document.createElement('div')
        element.innerHTML = note.contentHtml
        note.contentText = element.textContent || ''
      }
      markdownParseError.value = ''
    } catch { markdownParseError.value = '预览暂未更新，Markdown 原文已保留' }
    sourceDirty.value = false
    pendingSourceDrafts.delete(note.id)
    releaseNoteDraft(note)
    if (schedule) scheduleNoteSave(note)
    return true
  }
  function queueMarkdownParse() {
    clearTimeout(markdownParseTimer)
    markdownParseTimer = setTimeout(() => commitMarkdown(editingNote), 150)
  }
  
  function updateMarkdownDraft(value: string) {
    if (!editingNote) return
    markdownDraft.value = value
    sourceDirty.value = true
    markdownParseError.value = ''
    pendingSourceDrafts.set(editingNote.id, value)
    protectNoteDraft(editingNote)
    queueMarkdownParse()
    fimSuggestion.value = ''
    clearTimeout(fimTimer)
    if (fimEnabled.value) fimTimer = setTimeout(runFim, 2000)
  }
  
  async function flushLatestContent({ note = props.note, save = false }: { note?: Note | null; save?: boolean } = {}) {
    if (note === editingNote) editor.value?.getMarkdown()
    clearTimeout(markdownParseTimer)
    const valid = !sourceDirty.value || commitMarkdown(note, { schedule: !save })
    if (valid && save) await saveDirtyNote(note)
    return valid
  }
  
  function resetEditorSession(note: Note | null) {
    editingNote = note
    clearTimeout(markdownParseTimer)
    modeMenuOpen.value = false
    markdownParseError.value = ''
    sourceDirty.value = note ? pendingSourceDrafts.has(note.id) : false
    markdownDraft.value = deriveMarkdown(note)
    editor.value?.setMarkdown(markdownDraft.value, true)
    currentSelection.value = null
    if (note) persistedSignatures.set(toRaw(note), noteContentSignature(note))
  }
  async function changeEditorMode(mode: EditorMode) {
    if (!editorModes.some(option => option.id === mode)) return
    modeMenuOpen.value = false
    if (mode === editorMode.value) return
    saveReadingPosition(props.note?.id)
    const note = props.note
    // Both modes use the same in-memory document. Commit the source locally
    // before switching, but a slow or failed network save must not lock the UI.
    const valid = await flushLatestContent({ note })
    if (!valid && mode === 'rich') return
    if (mode === 'markdown' && !sourceDirty.value) markdownDraft.value = deriveMarkdown()
    editorMode.value = mode
    editor.value?.setMode(mode)
    closeToolbarMenus()
    fimSuggestion.value = ''
    void saveDirtyNote(note).catch(error => {
      showToast(`草稿仍保留，${errorMessage(error, '笔记保存失败')}。请点击保存状态重试。`, { tone: 'error' })
    })
    await nextTick()
    restoreReadingPosition(props.note?.id)
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
      editor.value?.focus()
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
  
  function handlePreviewScroll() { scheduleReadingPositionSave() }
  function readingPositionStorageKey(noteId?: string) {
    return noteId ? `${READING_POSITION_PREFIX}${noteId}` : ''
  }

  function saveReadingPosition(noteId?: string) {
    const key = readingPositionStorageKey(noteId)
    const scroller = editor.value?.getScroller()
    if (!key || !scroller || scroller.clientHeight <= 0 || scroller.scrollHeight <= scroller.clientHeight) return
    const progress = Number(scrollProgress(scroller.scrollTop, scroller.scrollHeight, scroller.clientHeight).toFixed(6))
    try { window.localStorage.setItem(key, String(progress)) } catch {}
  }

  function scheduleReadingPositionSave() {
    clearTimeout(readingPositionTimer)
    const noteId = props.note?.id
    readingPositionTimer = setTimeout(() => saveReadingPosition(noteId), 150)
  }

  function restoreReadingPosition(noteId?: string) {
    const key = readingPositionStorageKey(noteId)
    const scroller = editor.value?.getScroller()
    if (!key || !scroller) return
    let progress = 0
    try {
      const stored = Number(window.localStorage.getItem(key))
      if (Number.isFinite(stored)) progress = Math.min(1, Math.max(0, stored))
    } catch {}
    scroller.scrollTop = scrollOffset(progress, scroller.scrollHeight, scroller.clientHeight)
  }
  
  function toggleMarkdownPreview() {
    markdownPreview.value = !markdownPreview.value
    editor.value?.setPreview(markdownPreview.value)
  }
  function resetTransientEditorState() {
    aiBaseSource = null
    aiProposalStale = false
    fimSuggestion.value = ''
    imageDialogOpen.value = false
    clearTimeout(fimTimer)
    aiRequestId.value = ''
    assistantRequestId.value = ''
    aiProposal.value = null
    aiError.value = ''
    savedSelection = null
    pendingAiRequest = null
    aiConsentOpen.value = false
    closeAiPanel()
    aiText.value = ''
    aiResultAction.value = ''
    aiBusy.value = false
    aiOutputOpen.value = false
    aiOriginalText.value = ''
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
  
  watch(() => props.note?.id, async (id, previousId, onCleanup) => {
    let cancelled = false
    onCleanup(() => { cancelled = true })
    if (previousId && previousId !== id) {
      clearTimeout(readingPositionTimer)
      saveReadingPosition(previousId)
      const previous = [...store.notes, ...store.deleted].find(note => note.id === previousId)
      if (previous) {
        // Commit synchronously before the child renders the next article.
        void flushLatestContent({ note: previous, save: true }).catch(() => {
          showToast('上一篇文章保存失败，草稿仍保留，请返回后重试。', { tone: 'error' })
        })
      }
    }
    if (cancelled) return
    resetTransientEditorState()
    if (props.note?.external) editorMode.value = 'rich'
    resetEditorSession(props.note)
    noteLinks.value = []
    // Reading position belongs to the body render, not to the links request.
    // Late metadata must neither move the reader nor overwrite a newer article.
    if (id) void store.listLinks(id).then(links => {
      if (!cancelled) noteLinks.value = links || []
    }).catch(() => {})
    await nextTick()
    if (cancelled) return
    restoreReadingPosition(id)
    loadExternalProposal()
  }, { immediate: true, flush: 'pre' })

  // A reopened source or a refreshed clean body keeps the same ID. The store
  // preserves dirty objects; replacing this object starts a fresh editor session.
  watch(() => props.note, async (next, previous) => {
    if (!next || next === previous || next.id !== previous?.id) return
    const scroller = editor.value?.getScroller()
    const scrollTop = scroller?.scrollTop
    pendingSourceDrafts.delete(next.id)
    persistedSignatures.delete(toRaw(next))
    resetTransientEditorState()
    resetEditorSession(next)
    await nextTick()
    if (props.note === next && scroller && scrollTop !== undefined) scroller.scrollTop = scrollTop
  }, { flush: 'post' })
  
  
  async function handleBackgroundNoteTask(event: Event) {
    const task = (event as CustomEvent<BackgroundTask>).detail
    if (!task || ![aiRequestId.value, assistantRequestId.value].includes(task.id)) return
    const active = ['queued', 'running', 'finalizing', 'cancelling', 'awaiting_approval', 'awaiting_input'].includes(task.status)
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
  
  onBeforeUnmount(() => {
    clearTimeout(fimTimer)
    clearTimeout(assistantTriggerTimer)
    clearTimeout(markdownParseTimer)
    clearTimeout(markdownPasteTimer)
    clearTimeout(readingPositionTimer)
    saveReadingPosition(props.note?.id)
    stopAiDrag()
    document.removeEventListener('pointerdown', handleDocumentPointerDown)
    window.removeEventListener('tiny-note-task-updated', handleBackgroundNoteTask)
    window.removeEventListener('keydown', handleEditorModeShortcut, true)
    void flushLatestContent({ save: true }).catch(() => {})
  })
  async function loadExternalProposal(id = props.proposalId) {
    if (!id || !props.note) return
    try {
      const proposal = await (await import('../services/tauri')).invoke('note_edit_get', { proposalId: id })
      if (!proposal || proposal.noteId !== props.note.id || proposal.status !== 'draft') return
      editor.value?.getMarkdown()
      const persisted = persistedSignatures.get(toRaw(props.note))
      const dirty = sourceDirty.value || (persisted !== undefined && persisted !== noteContentSignature(props.note))
      aiProposalStale = dirty || (aiProposal.value?.id === proposal.id && aiProposalStale)
      aiProposal.value = proposal
      aiBaseSource ??= markdownDraft.value
      aiText.value = proposal.replacementMarkdown || ''
      aiResultAction.value = proposal.action || ''
      aiOutputOpen.value = true
      aiOriginalText.value = proposal.originalText || ''
      aiSources.value = proposal.sources || []
      savedSelection = proposal.selectionFrom != null && proposal.selectionTo != null ? { from: proposal.selectionFrom, to: proposal.selectionTo, text: proposal.originalText || '', source: aiBaseSource } : null
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
  })
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
  function requireCloudNote() {
    if (!props.note?.external) return true
    showToast('请先将外部文件导入到笔记，再使用笔记 AI。', { tone: 'info' })
    return false
  }
  async function runAi(action: AiAction = aiAction.value, requestText: string | null = null, instruction: string | null = null, taskFlight: TaskFlight | null = null) {
    if (!props.note || aiBusy.value || !requireCloudNote()) return
    if (!hasNoteContextConsent()) {
      pendingAiRequest = { kind: 'editor', action, requestText, instruction, taskFlight }
      aiConsentOpen.value = true
      return
    }
    const activeNote = props.note
    const baseSource = editor.value?.getMarkdown() ?? markdownDraft.value
    const capturedSelection = savedSelection
    if (capturedSelection?.source !== undefined && capturedSelection.source !== baseSource) {
      showToast('选区已经变化，请重新选择要修改的文字。', { tone: 'info' })
      return
    }
    if (requestText == null) requestText = activeNote.contentText || ''
    const actionLabel = aiActionLabel(action)
    aiBusy.value = true
    aiOutputOpen.value = true
    aiText.value = `正在生成${actionLabel}…`
    aiResultAction.value = action
    aiOriginalText.value = requestText
    aiProposal.value = null
    aiSources.value = []
    aiDialogPosition.value = null
    const requestKey = crypto.randomUUID()
    aiRequestId.value = requestKey
    const isCurrent = () => props.note === activeNote && aiRequestId.value === requestKey && markdownDraft.value === baseSource
    if (!await flushLatestContent()) {
      aiText.value = `${actionLabel}失败：文章保存失败，请稍后重试。`
      aiBusy.value = false
      return
    }
    if (store.saveTimer != null) clearTimeout(store.saveTimer)
    try {
      await saveDirtyNote(activeNote)
    } catch {
      if (!isCurrent()) return
      aiText.value = `${actionLabel}失败：文章保存失败，请稍后重试。`
      aiBusy.value = false
      return
    }
    if (!isCurrent()) { if (aiRequestId.value === requestKey) { aiBusy.value = false; aiText.value = '文章已经变化，请重新生成建议。' }; return }
    const selection = capturedSelection ? { from: capturedSelection.from, to: capturedSelection.to, text: capturedSelection.text } : null
    aiBaseSource = baseSource
    try {
      const task = await tasksStore.createNoteAI({ noteId: activeNote.id, requestKey, action, mode: action === 'interpret' ? 'chat' : 'edit', instruction, selection, modelProfileId: null, thinkingMode: 'disabled', baseVersion: activeNote.version || 1 }, { preparedFlight: taskFlight })
      if (isCurrent()) aiRequestId.value = task.id
    } catch (cause) {
      if (!isCurrent()) return
      const event: AiEvent = typeof cause === 'object' && cause !== null ? cause as AiEvent : { message: String(cause || '') }
      aiText.value = `${actionLabel}失败：${aiEventErrorMessage(event)}`
      aiBusy.value = false
    }
  }
  function captureAssistantSelection() {
    const range = editor.value?.getSelection()
    return range?.text ? { ...range } : null
  }
  function openAssistant(selection: SelectionRange | null = captureAssistantSelection()) {
    if (!requireCloudNote()) return
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
    if (!props.note || assistantBusy.value || !prompt?.trim() || !requireCloudNote()) return
    const taskFlight = preparedFlight || prepareTaskFlight(sourceElement)
    if (!hasNoteContextConsent()) {
      pendingAiRequest = { kind: 'assistant', prompt: prompt.trim(), taskFlight }
      aiConsentOpen.value = true
      return
    }
    const activeNote = props.note
    const baseSource = editor.value?.getMarkdown() ?? markdownDraft.value
    const range = assistantSelection.value
    if (range?.source !== undefined && range.source !== baseSource) {
      pushAssistantResponse('选区已经变化，请重新选择文字。')
      return
    }
    if (!await flushLatestContent()) return
    if (store.saveTimer != null) clearTimeout(store.saveTimer)
    try { await saveDirtyNote(activeNote) } catch {
      if (props.note === activeNote) pushAssistantResponse('文章保存失败，请重试。')
      return
    }
    if (props.note !== activeNote || markdownDraft.value !== baseSource) return
    const selection = range ? { from: range.from, to: range.to, text: range.text } : null
    const message = prompt.trim()
    assistantMessages.value.push({ role: 'user', content: message, references: assistantReferences() })
    assistantBusy.value = true
    assistantStreamingText.value = '正在思考…'
    assistantRequestId.value = crypto.randomUUID()
    assistantResponseSources.value = []
    assistantResponseProposal.value = null
    try {
      const task = await tasksStore.createNoteAI({ noteId: activeNote.id, requestKey: assistantRequestId.value, action: 'custom', mode: assistantEditIntent(message) ? 'edit' : 'chat', instruction: message, selection, modelProfileId: null, baseVersion: activeNote.version || 1 }, { preparedFlight: taskFlight })
      if (props.note === activeNote) assistantRequestId.value = task.id
    } catch {
      if (props.note !== activeNote) return
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
  function exportBodyHtml(html = '', title = '') {
    const container = document.createElement('div')
    container.innerHTML = sanitizeEditorHtml(html)
    const firstBlock = container.firstElementChild
    if (firstBlock?.matches('h1') && firstBlock.textContent?.trim() === title.trim()) firstBlock.remove()
    return container.innerHTML
  }
  async function prepareExportSnapshot() {
    if (!props.note || !editor.value || !await flushLatestContent()) return null
    return {
      title: String(props.note.title || '').trim() || t('untitled'),
      contentHtml: exportBodyHtml(editor.value.getHTML(), props.note.title)
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
  function clearAiResultState() { aiBaseSource = null; aiProposalStale = false; aiOutputOpen.value = false; aiText.value = ''; aiOriginalText.value = ''; aiResultAction.value = ''; aiFeedback.value = ''; aiDialogPosition.value = null; aiProposal.value = null; aiSources.value = []; aiError.value = '' }
  async function applyAiResult(mode: 'insert' | 'replace') {
    const activeNote = props.note
    const proposal = aiProposal.value
    if (applyingAi.value || !editor.value || !activeNote || !proposal || !aiText.value) return
    if (proposal.noteId !== activeNote.id) return
    await flushLatestContent()
    if (props.note !== activeNote || aiProposal.value !== proposal) return
    const before = { contentMarkdown: activeNote.contentMarkdown, contentHtml: activeNote.contentHtml, contentText: activeNote.contentText }
    const draftBefore = markdownDraft.value
    applyingAi.value = true
    aiError.value = ''
    editor.value.setEditable(false)
    if (store.saveTimer != null) clearTimeout(store.saveTimer)
    try {
      if (aiProposalStale || proposal.baseUpdatedAt !== activeNote.updatedAt) throw new Error('文章已经发生变化，请重新生成修改建议。')
      if (aiBaseSource !== null && aiBaseSource !== draftBefore) throw new Error('文章已经发生变化，请重新生成修改建议。')
      const hasSelection = proposal.selectionFrom != null || proposal.selectionTo != null
      const selection = hasSelection
        ? { from: proposal.selectionFrom ?? -1, to: proposal.selectionTo ?? -1, text: proposal.originalText || '', source: savedSelection?.source }
        : mode === 'insert' ? editor.value.getSelection() : null
      const next = applyMarkdownProposal(draftBefore, aiText.value, mode, selection)
      editor.value.setMarkdown(next)
      const payload = { contentMarkdown: next, contentHtml: editor.value.getHTML(), contentText: editor.value.getText() }
      const updated = await (await import('../services/tauri')).invoke('note_edit_apply', {
        proposalId: proposal.id, expectedUpdatedAt: proposal.baseUpdatedAt, ...payload
      })
      // A late response must never write into whichever article is now open.
      if (!updated || updated.id !== activeNote.id) throw new Error('服务器未确认保存，请重试')
      Object.assign(activeNote, updated)
      trackPersistedNote(activeNote)
      store.saveStates[activeNote.id] = { status: 'saved', error: '' }
      store.syncSummary(activeNote)
      persistedSignatures.set(toRaw(activeNote), noteContentSignature(activeNote))
      proposal.status = 'applied'
      if (props.note?.id === activeNote.id) {
        markdownDraft.value = activeNote.contentMarkdown
        editor.value?.setMarkdown(markdownDraft.value)
        savedSelection = null
        currentSelection.value = null
        clearAiResultState()
      }
    } catch (error) {
      if (props.note?.id === activeNote.id) {
        Object.assign(activeNote, before)
        markdownDraft.value = draftBefore
        editor.value?.setMarkdown(draftBefore)
        aiError.value = errorMessage(error, '应用修改失败，请重试')
      }
    } finally { applyingAi.value = false; editor.value?.setEditable(true) }
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
    if (savedSelection) text = savedSelection.text.trim()
    if (aiProposal.value?.status === 'draft' && window.__TAURI_INTERNALS__) {
      const proposalId = aiProposal.value.id
      void import('../services/tauri').then(({ invoke }) => invoke('note_edit_discard', { proposalId })).catch(() => {})
    }
    runAi(action, text || props.note?.contentText || '', null, prepareTaskFlight(event?.currentTarget))
  }
  function saveCurrentSelection() { const selection = captureAssistantSelection(); if (selection) savedSelection = selection }
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
  let fimSource = ''
  let fimSelection: MarkdownSelection | null = null
  async function runFim() {
    const note = props.note
    const range = editor.value?.getSelection()
    if (!note || note.external || !fimEnabled.value || !hasNoteContextConsent() || !range || range.from !== range.to) return
    const source = markdownDraft.value
    const channel = new EventChannel<{ type: string; text?: string }>()
    let result = ''
    channel.onmessage = event => {
      if (event.type === 'delta') result += event.text || ''
      if (event.type === 'completed' && props.note?.id === note.id && markdownDraft.value === source && editor.value?.getSelection()?.from === range.from) {
        fimSource = source; fimSelection = range; fimSuggestion.value = result
      }
    }
    try { await (await import('../services/tauri')).invoke('note_fim_stream', { request: { requestId: crypto.randomUUID(), action: 'continue_write', text: source.slice(Math.max(0, range.from - 800), range.from), instruction: `Continue naturally. Context after cursor: ${source.slice(range.to, range.to + 400)}`, modelProfileId: null }, onEvent: channel }) } catch { fimSuggestion.value = '' }
  }
  function acceptFim() {
    if (!fimSuggestion.value || !fimSelection || fimSource !== markdownDraft.value) return
    const next = applyMarkdownProposal(fimSource, fimSuggestion.value, 'insert', fimSelection)
    editor.value?.setMarkdown(next)
    updateMarkdownDraft(next)
    fimSuggestion.value = ''
  }
  function handleEditorTab(event: KeyboardEvent) {
    if (!fimSuggestion.value || !editor.value) return
    event.preventDefault(); event.stopPropagation(); acceptFim()
  }
  function dismissFim() { fimSuggestion.value = '' }
  function closeToolbarMenus() { moreOpen.value = false }
  function openImageDialog() {
    imageUrl.value = ''; imageAlt.value = ''; imageDialogOpen.value = true
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
    editor.value.insertMarkdown(`![${imageAlt.value.trim().replaceAll(']', '\\]')}](${src})`)
    imageDialogOpen.value = false
  }
  function insertLocalImage(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file || !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024 || !editor.value) return
    const noteId = props.note?.id
    const reader = new FileReader()
    reader.onload = () => {
      if (props.note?.id !== noteId) return
      const src = String(reader.result || '')
      if (/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(src)) {
        editor.value?.insertMarkdown(`![${imageAlt.value.trim().replaceAll(']', '\\]')}](${src})`)
        imageDialogOpen.value = false
      }
    }
    reader.readAsDataURL(file)
  }
  async function saveNoteMetadata() {
    if (!props.note) return
    await flushLatestContent({ save: true })
    const target = props.note
    const signature = noteContentSignature(target)
    await store.save(target)
    persistedSignatures.set(toRaw(target), signature)
    if (props.note?.id === target.id) noteLinks.value = (await store.listLinks(target.id).catch(() => [])) || []
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
    t, locale, store, library, appStore, tasksStore, aiBusy, aiText, aiRequestId, aiAction, aiResultAction, aiProposal, aiSources, aiConsentOpen, assistantOpen, assistantTriggerVisible, assistantBusy, assistantRequestId, assistantStreamingText, assistantMessages, assistantSelection, assistantResponseSources, assistantResponseProposal, aiPanelOpen, aiPanelSelectionText, commandMenuOpen, aiPrompt, aiInputRef, commandMenuDirection, moreOpen, moreTriggerRef, moreMenuRef, imageDialogOpen, imageUrl, imageAlt, imageInput, imageFileInput, fimEnabled, fimSuggestion, fimTimer, assistantTriggerTimer, savedSelection, pendingAiRequest, modeIcons, noteLinks, editorModes, editorMode, modeMenuOpen, modeMenuIndex, modeMenuRef, markdownDraft, markdownParseError, sourceDirty, markdownPasteNotice, markdownPreview, READING_POSITION_PREFIX, readingPositionTimer, pendingSourceDrafts, persistedSignatures, exportingFormat, exportStatusLabel, externalFileName, EXTERNAL_NOTICE_DISMISSED_PREFIX, externalNoticeDismissed, showExternalNoteBanner, markdownParseTimer, markdownPasteTimer, modeShortcutSwitching, externalNoticeStorageKey, readExternalNoticeDismissed, dismissExternalNoteBanner, currentMode, modeShortcutParts, modeShortcutLabel, richMode, codeMode, splitMode, aiActionLabels, aiErrorMessages, aiEventErrorMessage, aiActionLabel, unknownErrorCode, contextConsentModelId, aiFeedback, aiOutputOpen, aiOriginalText, aiCharCount, aiDialogPosition, aiDialogStyle, aiDragState, editor, currentSelection, selectedText, applyingAi, aiError, prepareEditorContent, deriveMarkdown, onEditorReady, onEditorSelection, updateNoteTitle, focusNoteBody, getEditorMarkdown, noteContentSignature, scheduleNoteSave, saveDirtyNote, commitMarkdown, queueMarkdownParse, updateMarkdownDraft, flushLatestContent, resetEditorSession, changeEditorMode, handleEditorModeShortcut, toggleModeMenu, focusModeOption, moveModeFocus, handleModeMenuKeydown, focusMoreItem, toggleMoreMenu, handleMoreMenuKeydown, handleDocumentPointerDown, handlePreviewScroll, readingPositionStorageKey, saveReadingPosition, scheduleReadingPositionSave, restoreReadingPosition, toggleMarkdownPreview, resetTransientEditorState, handleBackgroundNoteTask, loadExternalProposal, hasNoteContextConsent, cancelAiConsent, confirmAiConsent, requireCloudNote, runAi, captureAssistantSelection, openAssistant, closeAssistant, toggleAssistant, assistantReferences, pushAssistantResponse, assistantEditIntent, sendAssistantMessage, stopAssistant, copyAssistantMessage, stopAi, exportBodyHtml, prepareExportSnapshot, runArticleExport, exportMarkdown, exportHtml, exportPdf, printNote, clearAiResultState, applyAiResult, insertAi, replaceWithAi, copyAi, toggleAiFeedback, dismissAiResult, closeAiResult, stopAiDrag, moveAiDialog, startAiDrag, rewriteAi, saveCurrentSelection, closeAiPanel, positionCommandMenu, openAiPanel, toggleCommandMenu, selectAiCommand, sendCustomAi, runSelectedAi, openInConversation, fimSource, fimSelection, runFim, acceptFim, handleEditorTab, dismissFim, closeToolbarMenus, openImageDialog, normalizeImageUrl, confirmImage, insertLocalImage, saveNoteMetadata, importExternalSource
  }
}
