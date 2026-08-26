<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { TextSelection } from '@tiptap/pm/state'
import { Channel } from '@tauri-apps/api/core'
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
import CodeBlockComponent from './CodeBlockComponent.vue'
import MarkdownSourceEditor from './MarkdownSourceEditor.vue'
import MarkdownMessage from './MarkdownMessage.vue'
import NoteAssistantSidebar from './NoteAssistantSidebar.vue'
import FridayDropdownChevron from './FridayDropdownChevron.vue'
import { BookOpen, Bold, CalendarDays, Check, CircleHelp, Columns2, Copy, FileCode2, FileText, Italic, Languages, LoaderCircle, Maximize2, MessageSquare, Pin, RotateCcw, Send, ShieldCheck, Table2, ThumbsDown, ThumbsUp, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, ListChecks, Quote, Code2, Undo2, Redo2, Eraser, Link2, Highlighter, PenLine, AlignLeft, AlignCenter, AlignRight, Plus, PlusCircle, MoreHorizontal, Layers, Sparkles, Trash2, Download, Printer, Workflow, X, Zap } from 'lucide-vue-next'
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
import { requestConfirmation, showToast } from '../services/appFeedback'
import { saveExportBlob } from '../services/exportLocation'
import { showExportSuccess } from '../services/exportSuccess'

const lowlight = createLowlight()
lowlight.register('javascript', javascript); lowlight.register('typescript', typescript); lowlight.register('python', python); lowlight.register('json', json); lowlight.register('html', xml); lowlight.register('xml', xml); lowlight.register('css', css); lowlight.register('bash', bash); lowlight.register('sql', sql); lowlight.register('markdown', markdown); lowlight.register('yaml', yaml); lowlight.register('rust', rust)
const props = defineProps({ note: Object, tocVisible: { type: Boolean, default: false }, proposalId: { type: String, default: '' } }); const emit = defineEmits(['deleted', 'toggle-toc', 'proposal-reviewed']); const store = useNotesStore(); const library = useLibraryStore(); const appStore = useAppStore(); const tasksStore = useTasksStore(); const { t, locale } = useI18n(); const aiBusy = ref(false); const aiText = ref(''); const aiRequestId = ref(''); const aiAction = ref('summarize'); const aiResultAction = ref(''); const aiProposal = ref(null); const aiSources = ref([]); const aiConsentOpen = ref(false); const assistantOpen = ref(false); const assistantTriggerVisible = ref(true); const assistantBusy = ref(false); const assistantRequestId = ref(''); const assistantStreamingText = ref(''); const assistantMessages = ref([]); const assistantSelection = ref(null); const assistantResponseSources = ref([]); const assistantResponseProposal = ref(null); const aiPanelOpen = ref(false); const aiPanelSelectionText = ref(''); const commandMenuOpen = ref(false); const aiPrompt = ref(''); const aiInputRef = ref(null); const commandMenuDirection = ref('down'); const moreOpen = ref(false); const moreTriggerRef = ref(null); const moreMenuRef = ref(null); const revisionsOpen = ref(false); const revisions = ref([]); const revisionsBusy = ref(false); const insertOpen = ref(false); const tablePickerOpen = ref(false); const textColorOpen = ref(false); const highlightOpen = ref(false); const headingOpen = ref(false); const knowledgeMenuOpen = ref(false); const imageDialogOpen = ref(false); const imageUrl = ref(''); const imageAlt = ref(''); const imageInput = ref(null); const imageFileInput = ref(null); const tableRows = ref(0); const tableCols = ref(0); const fimEnabled = computed(() => appStore.settings.fimEnabled === true); const fimSuggestion = ref(''); const editorStateTick = ref(0); let fimTimer; let assistantTriggerTimer; let savedSelection = null; let pendingAiRequest = null; let pendingAiChange = null
const modeIcons = { rich: PenLine, markdown: FileCode2 }
const noteLinks = ref([])
const tagDraft = ref('')
const editorModes = NOTE_MODES.map(mode => ({ ...mode, icon: modeIcons[mode.id] }))
const editorMode = ref(DEFAULT_NOTE_MODE)
const modeMenuOpen = ref(false)
const modeMenuIndex = ref(0)
const modeMenuRef = ref(null)
const markdownDraft = ref('')
const markdownParseError = ref('')
const sourceDirty = ref(false)
const markdownPasteNotice = ref(false)
const markdownPreview = ref(true)
const splitRatio = ref(50)
const splitVertical = ref(false)
const splitWorkspace = ref(null)
const sourceEditorRef = ref(null)
const previewScroller = ref(null)
const pendingSourceDrafts = new Map()
const persistedSignatures = new Map()
const exportingFormat = ref('')
const exportStatusLabel = computed(() => ({ html: t('exportingHtml'), pdf: t('exportingPdf'), print: t('preparingPrint') })[exportingFormat.value] || '')
let applyingEditorContent = false
let markdownParseTimer
let markdownPasteTimer
let splitResizeObserver
let splitDragState
let scrollSyncFrame
let scrollSyncSource = ''
let modeShortcutSwitching = false
const currentMode = computed(() => editorModes.find(mode => mode.id === editorMode.value) || editorModes[0])
const modeShortcutParts = computed(() => shortcutDisplayParts(appStore.editorModeShortcut))
const modeShortcutLabel = computed(() => modeShortcutParts.value.join(' + '))
const richMode = computed(() => editorMode.value === 'rich')
const codeMode = computed(() => editorMode.value === 'markdown')
const splitMode = computed(() => codeMode.value && markdownPreview.value)
const splitPaneStyle = computed(() => splitVertical.value ? { height: `${splitRatio.value}%` } : { width: `${splitRatio.value}%` })
const aiActionLabels = { interpret: '解读', refine: '精炼', polish: '润色', expand: '扩写', translate: '翻译', summarize: '总结', continue_write: '续写', fix_grammar: '语法修正', generate_plan: '生成任务计划', generate_table: '生成表格', custom: 'AI 写作' }
const aiErrorMessages = { model_profile_unavailable: '还没有配置可用模型，请先打开设置完成配置。', api_key_not_configured: '当前模型还没有配置 API Key，请先打开设置完成配置。', credential_store_unavailable: '系统凭据存储不可用，暂时无法调用 AI。', provider_request_failed: '模型服务请求失败，请检查模型地址和网络连接。', provider_stream_failed: '模型服务连接中断，请稍后重试。' }
function aiEventErrorMessage(event) {
  return aiErrorMessages[event?.code] || aiErrorMessages[event?.message] || event?.message || '请求未完成，请稍后重试。'
}
const contextConsentModelId = computed(() => appStore.defaultModel?.id || 'default')
const aiFeedback = ref('')
const aiOutputOpen = ref(false)
const aiOriginalText = ref('')
const aiChangePending = ref(false)
const AI_CHANGE_HIGHLIGHT = '#fef08a'
const aiCharCount = computed(() => aiText.value.replace(/\s/g, '').length)
const aiDialogPosition = ref(null)
const aiDialogStyle = computed(() => {
  if (!aiDialogPosition.value) return {}
  return {
    left: `${aiDialogPosition.value.left}px`,
    top: `${aiDialogPosition.value.top}px`,
    transform: 'none'
  }
})
let aiDragState = null
const refreshEditorState = () => { editorStateTick.value += 1 }
function looksLikeMarkdown(text) {
  return /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|~~~)/m.test(text) ||
    /(?:\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|!?\[[^\]]+\]\([^)]+\)|^\s*\|.+\|\s*$)/m.test(text)
}
function isPlainInlineAiReplacement(text) {
  if (!text || text.includes('\n') || looksLikeMarkdown(text)) return false
  return !/(?:\*[^*]+\*|_[^_]+_|~~[^~]+~~|<\/?[a-z][^>]*>)/i.test(text)
}
function handleMarkdownPaste(view, event) {
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
function prepareEditorContent(note) {
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
    const textAlign = titleNode.style?.textAlign
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
function syncNoteTitle(note, text, { schedule = false } = {}) {
  if (!note) return false
  const nextTitle = extractNoteTitle(text)
  if (note.title === nextTitle) return false
  note.title = nextTitle
  if (schedule) scheduleNoteSave(note)
  return true
}
function getEditorMarkdown(instance = editor.value) {
  return instance?.getMarkdown?.() || ''
}
const editor = useEditor({
  content: prepareEditorContent(props.note),
  extensions: createNoteExtensions({
    lowlight,
    codeBlockNodeView: VueNodeViewRenderer(CodeBlockComponent),
    placeholder: ({ node }) => node.type.name === 'noteTitle'
      ? '输入标题…'
      : '写下此刻的想法…'
  }),
  editorProps: { attributes: { class: 'note-prose' }, handlePaste: handleMarkdownPaste },
  onTransaction: refreshEditorState,
  onSelectionUpdate: refreshEditorState,
  onUpdate: ({ editor: instance }) => handleRichEditorUpdate(instance)
})
const canUndo = computed(() => { editorStateTick.value; return editor.value?.can().undo() ?? false })
const canRedo = computed(() => { editorStateTick.value; return editor.value?.can().redo() ?? false })
const linkActive = computed(() => { editorStateTick.value; return editor.value?.isActive('link') ?? false })
const canEditLink = computed(() => { editorStateTick.value; const instance = editor.value; return !!instance && (!instance.state.selection.empty || instance.isActive('link')) })
const selectedText = computed(() => { editorStateTick.value; const instance = editor.value; if (!instance || instance.state.selection.empty) return ''; const { from, to } = instance.state.selection; return instance.state.doc.textBetween(from, to, '\n').trim() })
const knowledgeGroups = computed(() => [
  { id: 'personal', label: t('personal'), items: library.bases.filter(base => base.category === 'personal') },
  { id: 'local', label: t('local'), items: library.bases.filter(base => base.category === 'local') }
].filter(group => group.items.length))
function shouldShowBubbleMenu({ state }) { return richMode.value && !aiOutputOpen.value && !state.selection.empty && state.doc.textBetween(state.selection.from, state.selection.to, '\n').trim().length > 0 }
const textColorPalette = ['#1c1917', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777']
const highlightPalette = ['#fef08a', '#fed7aa', '#fecaca', '#bbf7d0', '#bae6fd', '#c7d2fe', '#e9d5ff', '#fbcfe8']
const currentHeadingLabel = computed(() => {
  editorStateTick.value
  const instance = editor.value
  if (!instance || instance.isActive('noteTitle')) return '标题'
  for (const level of [1, 2, 3]) {
    if (instance.isActive('heading', { level })) return `标题 ${level}`
  }
  return instance.isActive('smallParagraph') ? '小正' : '正文'
})
const canSetNoteTitle = computed(() => {
  editorStateTick.value
  const instance = editor.value
  if (!instance) return false
  const { $from } = instance.state.selection
  return $from.depth === 1 && $from.index(0) === 0
})

function noteContentSignature(note) {
  if (!note) return ''
  return JSON.stringify([note.title, note.notebookId, note.contentHtml, note.contentText, note.contentMarkdown || '', note.tags || [], note.pinned])
}

function scheduleNoteSave(note = props.note) {
  if (!note) return
  const signature = noteContentSignature(note)
  store.scheduleSave(note, () => persistedSignatures.set(note.id, signature))
}

async function saveDirtyNote(note = props.note) {
  if (!note || persistedSignatures.get(note.id) === noteContentSignature(note)) return
  clearTimeout(store.saveTimer)
  await store.save(note)
  persistedSignatures.set(note.id, noteContentSignature(note))
}

function handleRichEditorUpdate(instance) {
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

function deriveMarkdown(note = props.note) {
  if (!note) return ''
  if (pendingSourceDrafts.has(note.id)) return pendingSourceDrafts.get(note.id)
  if (note.contentMarkdown || !note.contentHtml) return note.contentMarkdown || ''
  return getEditorMarkdown() || ''
}

function commitMarkdown(note = props.note, { schedule = true } = {}) {
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

function updateMarkdownDraft(value) {
  if (!props.note) return
  markdownDraft.value = value
  sourceDirty.value = true
  markdownParseError.value = ''
  pendingSourceDrafts.set(props.note.id, value)
  queueMarkdownParse()
}

async function flushLatestContent({ note = props.note, save = false } = {}) {
  clearTimeout(markdownParseTimer)
  const valid = !sourceDirty.value || commitMarkdown(note, { schedule: !save })
  if (valid && save) await saveDirtyNote(note)
  return valid
}

function resetEditorSession(note) {
  clearTimeout(markdownParseTimer)
  modeMenuOpen.value = false
  markdownParseError.value = ''
  sourceDirty.value = pendingSourceDrafts.has(note?.id)
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

async function changeEditorMode(mode) {
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

async function handleEditorModeShortcut(event) {
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
  modeMenuRef.value?.querySelectorAll('[role="menuitemradio"]')?.[modeMenuIndex.value]?.focus()
}

function moveModeFocus(offset) {
  modeMenuIndex.value = (modeMenuIndex.value + offset + editorModes.length) % editorModes.length
  focusModeOption()
}

function handleModeMenuKeydown(event) {
  if (event.key === 'ArrowDown') { event.preventDefault(); moveModeFocus(1) }
  else if (event.key === 'ArrowUp') { event.preventDefault(); moveModeFocus(-1) }
  else if (event.key === 'Home') { event.preventDefault(); modeMenuIndex.value = 0; focusModeOption() }
  else if (event.key === 'End') { event.preventDefault(); modeMenuIndex.value = editorModes.length - 1; focusModeOption() }
  else if (event.key === 'Escape') { event.preventDefault(); modeMenuOpen.value = false }
}

function focusMoreItem(position = 0) {
  const items = [...(moreMenuRef.value?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])]
  items[Math.max(0, Math.min(position, items.length - 1))]?.focus()
}

function toggleMoreMenu() {
  const shouldOpen = !moreOpen.value
  closeToolbarMenus()
  modeMenuOpen.value = false
  moreOpen.value = shouldOpen
  if (shouldOpen) nextTick(() => focusMoreItem())
}

function handleMoreMenuKeydown(event) {
  const items = [...(moreMenuRef.value?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])]
  if (!items.length) return
  const currentIndex = items.indexOf(document.activeElement)
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

function handleDocumentPointerDown(event) {
  if (!event.target.closest('.toolbar-menu-anchor')) closeToolbarMenus()
  if (!event.target.closest('.mode-menu-anchor')) modeMenuOpen.value = false
  if (!event.target.closest('.more-menu-anchor')) moreOpen.value = false
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

function resizeSplitPane(event) {
  if (!splitDragState || event.pointerId !== splitDragState.pointerId) return
  const rect = splitWorkspace.value?.getBoundingClientRect()
  if (!rect) return
  const position = splitVertical.value ? event.clientY - rect.top : event.clientX - rect.left
  const total = splitVertical.value ? rect.height : rect.width
  if (total) splitRatio.value = clampSplitRatio((position / total) * 100)
}

function startSplitResize(event) {
  if (event.button !== 0) return
  splitDragState = { pointerId: event.pointerId }
  window.addEventListener('pointermove', resizeSplitPane)
  window.addEventListener('pointerup', stopSplitResize)
  window.addEventListener('pointercancel', stopSplitResize)
  event.preventDefault()
}

function synchronizeSplitScroll(origin, payload) {
  if (!splitMode.value || (scrollSyncSource && scrollSyncSource !== origin)) return
  scrollSyncSource = origin
  cancelAnimationFrame(scrollSyncFrame)
  scrollSyncFrame = requestAnimationFrame(() => {
    if (origin === 'source') {
      const progress = scrollProgress(payload.scrollTop, payload.scrollHeight, payload.clientHeight)
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
  resetEditorSession(props.note)
  tagDraft.value = ''
  noteLinks.value = id ? (await store.listLinks(id).catch(() => [])) || [] : []
  await nextTick()
  setupSplitObserver()
  loadExternalProposal()
}, { immediate: true, flush: 'post' })

watch(assistantOpen, () => nextTick(setupSplitObserver))

async function handleBackgroundNoteTask(event) {
  const task = event.detail
  if (!task || ![aiRequestId.value, assistantRequestId.value].includes(task.id)) return
  const active = ['queued', 'running', 'awaiting_approval', 'awaiting_input'].includes(task.status)
  if (task.id === aiRequestId.value) {
    aiBusy.value = active
    if (task.output) aiText.value = task.output
    if (task.status === 'failed') aiText.value = `AI 写作失败：${aiEventErrorMessage({ message: task.errorMessage })}`
    if (task.status === 'cancelled') aiText.value = '已停止生成。'
    if (task.status === 'succeeded' && task.result?.proposalId) await loadExternalProposal(task.result.proposalId)
  }
  if (task.id === assistantRequestId.value) {
    assistantBusy.value = active
    assistantStreamingText.value = active ? (task.output || '正在思考…') : ''
    if (task.status === 'succeeded') {
      pushAssistantResponse(task.output || '模型没有返回内容，请换个问法再试。')
      if (task.result?.proposalId) await loadExternalProposal(task.result.proposalId)
    }
    if (task.status === 'failed') pushAssistantResponse(`请求失败：${aiEventErrorMessage({ message: task.errorMessage })}`)
  }
}

function setEditorEditable(editable) {
  const instance = editor.value
  if (!instance) return
  instance.setEditable(editable, false)
  instance.emit('tinyNoteEditableChange', { editable })
}

onBeforeUnmount(() => {
  clearTimeout(fimTimer)
  clearTimeout(assistantTriggerTimer)
  clearTimeout(markdownParseTimer)
  clearTimeout(markdownPasteTimer)
  stopAiDrag()
  stopSplitResize()
  splitResizeObserver?.disconnect()
  cancelAnimationFrame(scrollSyncFrame)
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
    if (proposal.noteId !== props.note.id || proposal.status !== 'draft') return
    aiProposal.value = proposal
    aiText.value = proposal.replacementMarkdown
    aiResultAction.value = proposal.action
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
function toggle(type) { editor.value?.chain().focus()[type]().run() }
async function applyMarkdownFormat(format) {
  if (!sourceEditorRef.value?.applyFormat(format)) return
  await nextTick()
  commitMarkdown(props.note)
}
async function setMarkdownHeading(level) {
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
async function runAi(action = aiAction.value, requestText = null, instruction = null, taskFlight = null) {
  if (!props.note || aiBusy.value) return
  if (!hasNoteContextConsent()) {
    pendingAiRequest = { kind: 'editor', action, requestText, instruction, taskFlight }
    aiConsentOpen.value = true
    return
  }
  if (requestText == null) requestText = props.note.contentText || ''
  const actionLabel = aiActionLabels[action] || 'AI 写作'
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
  clearTimeout(store.saveTimer)
  try {
    await saveDirtyNote(props.note)
  } catch {
    aiText.value = `${actionLabel}失败：文章保存失败，请稍后重试。`
    aiBusy.value = false
    return
  }
  const selection = savedSelection ? { ...savedSelection, text: editor.value?.state.doc.textBetween(savedSelection.from, savedSelection.to, '\n') || requestText } : null
  try {
    const task = await tasksStore.enqueue({ kind: 'note_ai', title: `${props.note.title || '未命名笔记'} · ${actionLabel}`, targetNoteId: props.note.id, payload: { previewOutput: `(${action})\n${instruction ? `${instruction}\n` : ''}${requestText.slice(0, 140)}`, request: { action, mode: action === 'interpret' ? 'chat' : 'edit', text: requestText, instruction, targetNoteId: props.note.id, selection, autoRetrieve: !selection, modelProfileId: null, thinkingMode: 'disabled', source: 'note_ai' } } }, { preparedFlight: taskFlight })
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
function openAssistant(selection = captureAssistantSelection()) {
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
  const references = [{ key: `note:${props.note?.id}`, type: 'note', label: `当前文章 · ${props.note?.title || '未命名笔记'}` }]
  if (assistantSelection.value?.text) references.push({ key: `selection:${assistantSelection.value.from}:${assistantSelection.value.to}`, type: 'selection', label: '选中文字', preview: assistantSelection.value.text.replace(/\s+/g, ' ').trim().slice(0, 60) })
  return references
}
function pushAssistantResponse(content, sources = assistantResponseSources.value, proposal = assistantResponseProposal.value) {
  if (!content?.trim()) return
  assistantMessages.value.push({ role: 'assistant', content: content.trim(), sources: sources || [], proposal: proposal || null })
}
function assistantEditIntent(message) { return /(扩写|改写|修改|润色|精炼|替换|翻译|续写|修正|重写|rewrite|translate|polish|edit)/i.test(message) }
async function sendAssistantMessage(prompt, sourceElement = null, preparedFlight = null) {
  if (!props.note || assistantBusy.value || !prompt?.trim()) return
  const taskFlight = preparedFlight || prepareTaskFlight(sourceElement)
  if (!hasNoteContextConsent()) {
    pendingAiRequest = { kind: 'assistant', prompt: prompt.trim(), taskFlight }
    aiConsentOpen.value = true
    return
  }
  if (!await flushLatestContent()) return
  clearTimeout(store.saveTimer)
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
    const task = await tasksStore.enqueue({ kind: 'note_ai', title: `${props.note.title || '未命名笔记'} · 助手`, targetNoteId: props.note.id, payload: { previewOutput: `我已参考当前文章${assistantSelection.value?.text ? '和你选中的文字' : ''}。\n\n你的问题：${message}`, request: { action: 'custom', mode: assistantEditIntent(message) ? 'edit' : 'chat', text: context, instruction: message, targetNoteId: props.note.id, selection: assistantSelection.value, autoRetrieve: true, modelProfileId: null, source: 'note_ai' } } }, { preparedFlight: taskFlight })
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
async function copyAssistantMessage(content) { if (content) await navigator.clipboard?.writeText(content) }
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
async function runArticleExport(format) {
  if (exportingFormat.value) return
  moreOpen.value = false
  exportingFormat.value = format
  try {
    const snapshot = await prepareExportSnapshot()
    if (!snapshot) return
    if (format === 'html') {
      let artifact
      await downloadNoteHtml(snapshot, { lang: locale.value, download: (blob, filename) => { artifact = { blob, filename } } })
      const result = await saveExportBlob(artifact.blob, artifact.filename, { appStore })
      if (result.cancelled) return
      if (result.path) showExportSuccess(result)
      else showToast(t('htmlExported'))
    } else if (format === 'pdf') {
      let artifact
      await exportNotePdf(snapshot, { download: (blob, filename) => { artifact = { blob, filename } } })
      const result = await saveExportBlob(artifact.blob, artifact.filename, { appStore })
      if (result.cancelled) return
      if (result.path) showExportSuccess(result)
      else showToast(t('pdfExported'))
    } else if (format === 'print') {
      await printNoteDocument(snapshot)
    }
  } catch (error) {
    const key = error?.code === 'PDF_CANVAS_LIMIT'
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
async function openRevisions() { if (!props.note) return; moreOpen.value = false; revisionsOpen.value = true; revisionsBusy.value = true; try { revisions.value = await (await import('../services/tauri')).invoke('note_revision_list', { noteId: props.note.id }) } finally { revisionsBusy.value = false } }
async function restoreRevision(revision) { if (!(await requestConfirmation({ title: '恢复历史版本', message: '恢复这个版本？当前内容也会先保存为可恢复版本。', confirmLabel: '恢复' }))) return; const updated = await (await import('../services/tauri')).invoke('note_revision_restore', { id: revision.id }); Object.assign(props.note, updated); applyingEditorContent = true; editor.value?.commands.setContent(prepareEditorContent(updated), { emitUpdate: false }); applyingEditorContent = false; markdownDraft.value = updated.contentMarkdown || getEditorMarkdown() || ''; sourceDirty.value = false; markdownParseError.value = ''; pendingSourceDrafts.delete(updated.id); persistedSignatures.set(updated.id, noteContentSignature(updated)); revisions.value = await (await import('../services/tauri')).invoke('note_revision_list', { noteId: props.note.id }) }
function formatRevisionTime(value) { try { return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) } catch { return value } }
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
function selectedContentMarks(doc, from, to) {
  let marks = []
  doc.nodesBetween(from, to, node => {
    if (node.isText && !marks.length) marks = node.marks
  })
  return marks
}
function insertPendingAiContent(content, insertPos, selectionFrom, selectionTo) {
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
function stagePendingAiChange(mode, content, selectionFrom, selectionTo, change) {
  const preview = insertPendingAiContent(content, selectionTo, selectionFrom, selectionTo)
  if (!preview) return false
  const highlightMark = editor.value.state.schema.marks.highlight
  const strikeMark = editor.value.state.schema.marks.strike
  applyingEditorContent = true
  let transaction = editor.value.state.tr
  if (highlightMark && preview.insertionFrom < preview.insertionTo) {
    transaction = transaction.addMark(preview.insertionFrom, preview.insertionTo, highlightMark.create({ color: AI_CHANGE_HIGHLIGHT }))
  }
  if (mode === 'replace' && strikeMark) {
    transaction = transaction.addMark(selectionFrom, selectionTo, strikeMark.create())
  }
  transaction = transaction.setSelection(TextSelection.near(transaction.doc.resolve(preview.insertionTo)))
  editor.value.view.dispatch(transaction.scrollIntoView())
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
function restoreAiChange(change) {
  aiChangePending.value = false
  applyingEditorContent = true
  editor.value?.commands.setContent(change.beforeHtml, { emitUpdate: false })
  applyingEditorContent = false
  if (props.note?.id === change.noteId) {
    props.note.contentHtml = change.beforeHtml
    props.note.contentText = change.beforeText
    props.note.contentMarkdown = change.beforeMarkdown
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
async function persistAiChange(change) {
  clearTimeout(store.saveTimer)
  if (!window.__TAURI_INTERNALS__) {
    await saveDirtyNote(props.note)
    change.proposal.status = 'applied'
    savedSelection = null
    return
  }
  const updated = await (await import('../services/tauri')).invoke('note_edit_apply', {
    proposalId: change.proposal.id,
    expectedUpdatedAt: change.proposal.baseUpdatedAt,
    contentHtml: props.note.contentHtml,
    contentText: props.note.contentText,
    contentMarkdown: props.note.contentMarkdown || getEditorMarkdown()
  })
  Object.assign(props.note, updated)
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
    showToast(error?.code === 'proposal_stale' ? '文章已经发生变化，请重新生成修改建议。' : '应用修改失败，请重试。', { tone: 'error' })
  }
}
async function applyAiResult(mode) {
  if (!editor.value || !aiText.value || !aiProposal.value) return
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
  const beforeMarkdown = props.note.contentMarkdown || getEditorMarkdown()
  const beforeDraft = markdownDraft.value
  const selectionFrom = proposal.selectionFrom
  const selectionTo = proposal.selectionTo
  const hasProposalSelection = Number.isInteger(selectionFrom) && Number.isInteger(selectionTo) && selectionFrom < selectionTo
  const change = { noteId: props.note.id, proposal, replacement, resultAction, resultSources, beforeHtml, beforeText, beforeMarkdown, beforeDraft }
  const insertionSelection = hasProposalSelection ? { from: selectionFrom, to: selectionTo } : savedSelection
  if (editorMode.value === 'rich' && ((mode === 'replace' && hasProposalSelection) || (mode === 'insert' && insertionSelection))) {
    const range = mode === 'replace' ? { from: selectionFrom, to: selectionTo } : insertionSelection
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
        if (!commitMarkdown(props.note, { schedule: false })) return
      }
    } else {
      editor.value.chain().focus().insertContent(replacement, { contentType: 'markdown' }).run()
      syncNoteFromEditor()
    }
    await persistAiChange(change)
  } catch (error) {
    applyingEditorContent = false
    restoreAiChange(change)
    showToast(error?.code === 'proposal_stale' ? '文章已经发生变化，请重新生成修改建议。' : '应用修改失败，请重试。', { tone: 'error' })
  }
}
function insertAi() { return applyAiResult('insert') }
function replaceWithAi() { return applyAiResult('replace') }
async function copyAi() { if (aiText.value) await navigator.clipboard?.writeText(aiText.value) }
function toggleAiFeedback(type) { aiFeedback.value = aiFeedback.value === type ? '' : type }
async function dismissAiResult() { if (aiProposal.value?.status === 'draft' && window.__TAURI_INTERNALS__) { try { await (await import('../services/tauri')).invoke('note_edit_discard', { proposalId: aiProposal.value.id }) } catch {} }; clearAiResultState() }
async function closeAiResult() { if (aiBusy.value) await stopAi(); dismissAiResult() }
function stopAiDrag() {
  if (!aiDragState) return
  window.removeEventListener('pointermove', moveAiDialog)
  window.removeEventListener('pointerup', stopAiDrag)
  window.removeEventListener('pointercancel', stopAiDrag)
  aiDragState = null
}
function moveAiDialog(event) {
  if (!aiDragState || event.pointerId !== aiDragState.pointerId) return
  const maxLeft = Math.max(8, window.innerWidth - aiDragState.width - 8)
  const maxTop = Math.max(8, window.innerHeight - aiDragState.height - 8)
  aiDialogPosition.value = {
    left: Math.min(maxLeft, Math.max(8, event.clientX - aiDragState.offsetX)),
    top: Math.min(maxTop, Math.max(8, event.clientY - aiDragState.offsetY))
  }
}
function startAiDrag(event) {
  if (event.button !== 0 || event.target.closest('button')) return
  const panel = event.currentTarget.closest('.ai-output-panel')
  if (!panel) return
  const rect = panel.getBoundingClientRect()
  aiDialogPosition.value = { left: rect.left, top: rect.top }
  aiDragState = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, width: rect.width, height: rect.height }
  try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch {}
  window.addEventListener('pointermove', moveAiDialog)
  window.addEventListener('pointerup', stopAiDrag)
  window.addEventListener('pointercancel', stopAiDrag)
  event.preventDefault()
}
function rewriteAi(event) {
  if (aiBusy.value || !aiResultAction.value) return
  const action = aiResultAction.value
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
function toggleCommandMenu(event) { event.stopPropagation(); if (!commandMenuOpen.value) positionCommandMenu(); commandMenuOpen.value = !commandMenuOpen.value }
async function selectAiCommand(action, event) { const taskFlight = prepareTaskFlight(event?.currentTarget); saveCurrentSelection(); const text = aiPanelSelectionText.value || selectedText.value || props.note?.contentText || ''; let instruction = null; if (action === 'translate') { const previous = localStorage.getItem('tiny-note-translation-language') || '英文'; const language = await requestPrompt('请输入目标语言', previous); if (!language?.trim()) return; localStorage.setItem('tiny-note-translation-language', language.trim()); instruction = `翻译为${language.trim()}` }; closeAiPanel(); runAi(action, text, instruction, taskFlight) }
function sendCustomAi(event) { const instruction = aiPrompt.value.trim(); if (!instruction || aiBusy.value) return; const source = event?.currentTarget?.closest?.('.tiny-note-ai-panel')?.querySelector('.tiny-note-send-btn') || event?.currentTarget; const taskFlight = prepareTaskFlight(source); saveCurrentSelection(); const text = aiPanelSelectionText.value || selectedText.value || props.note?.contentText || ''; closeAiPanel(); runAi('custom', text, instruction, taskFlight) }
function runSelectedAi(action, event) { const text = selectedText.value; if (!text || aiBusy.value) return; const taskFlight = prepareTaskFlight(event?.currentTarget); saveCurrentSelection(); runAi(action, text, null, taskFlight) }
function openInConversation() {
  const text = selectedText.value
  if (!text) return
  closeAiPanel()
  openAssistant(captureAssistantSelection())
}
async function runFim() { if (editorMode.value !== 'rich' || !fimEnabled.value || !editor.value || !props.note?.contentText) return; const id = crypto.randomUUID(); const channel = new Channel(); let result = ''; channel.onmessage = event => { if (event.type === 'delta') result += event.text; if (event.type === 'completed') fimSuggestion.value = result }; try { await (await import('../services/tauri')).invoke('note_fim_stream', { request: { requestId: id, action: 'continue_write', text: props.note.contentText.slice(-800), instruction: `Continue naturally. Context after cursor: ${props.note.contentText.slice(-400)}`, modelProfileId: null }, onEvent: channel }) } catch { fimSuggestion.value = '' } }
function acceptFim() { if (fimSuggestion.value && editor.value) { editor.value.commands.insertContent(fimSuggestion.value); fimSuggestion.value = '' } }
function handleEditorTab(event) {
  if (!fimSuggestion.value || !editor.value || editorMode.value !== 'rich') return
  if (event.target?.closest?.('button, select, input, textarea, [contenteditable="false"]')) return
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
function insertMermaidDiagram(kind) {
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
function closeToolbarMenus() { insertOpen.value = false; tablePickerOpen.value = false; textColorOpen.value = false; highlightOpen.value = false; headingOpen.value = false; knowledgeMenuOpen.value = false; moreOpen.value = false }
function toggleInsertMenu() { closeToolbarMenus(); insertOpen.value = !insertOpen.value }
function selectTableCell(row, col) { tableRows.value = row; tableCols.value = col }
function insertTable(rows = tableRows.value, cols = tableCols.value) {
  if (!editor.value || !rows || !cols) return
  editor.value.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
  insertOpen.value = false; tablePickerOpen.value = false; tableRows.value = 0; tableCols.value = 0
}
function openImageDialog() {
  insertOpen.value = false; imageUrl.value = ''; imageAlt.value = ''; imageDialogOpen.value = true
  nextTick(() => imageInput.value?.focus())
}
function normalizeImageUrl(value) {
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
function insertLocalImage(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024 || !editor.value) return
  const reader = new FileReader()
  reader.onload = () => {
    const src = String(reader.result || '')
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(src)) {
      editor.value.chain().focus().setImage({ src, alt: imageAlt.value.trim() }).run()
      imageDialogOpen.value = false
    }
  }
  reader.readAsDataURL(file)
}
function setTextColor(color) {
  if (!editor.value) return
  const chain = editor.value.chain().focus()
  if (color === 'inherit') chain.unsetColor().run()
  else chain.setColor(color).run()
  textColorOpen.value = false
}
function setHighlightColor(color) {
  if (!editor.value) return
  if (color === 'none') editor.value.chain().focus().unsetHighlight().run()
  else editor.value.chain().focus().toggleHighlight({ color }).run()
  highlightOpen.value = false
}
function setHeading(level) {
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
function normalizeLinkHref(value) {
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
async function addToKnowledge(knowledgeBaseId) {
  if (!props.note || !knowledgeBaseId) return
  if (!await flushLatestContent()) return
  try { await library.addNoteReference(knowledgeBaseId, props.note); knowledgeMenuOpen.value = false } catch (error) { showToast(error?.message || '添加到知识库失败，请重试', { tone: 'error' }) }
}
async function saveNoteMetadata() {
  if (!props.note) return
  await flushLatestContent({ save: true })
  await store.save(props.note)
  persistedSignatures.set(props.note.id, noteContentSignature(props.note))
  noteLinks.value = (await store.listLinks(props.note.id).catch(() => [])) || []
}
async function addTag() {
  const value = tagDraft.value.trim().replace(/^#/, '').toLowerCase()
  if (!props.note || !value || (props.note.tags || []).includes(value)) {
    tagDraft.value = ''
    return
  }
  props.note.tags = [...(props.note.tags || []), value].slice(0, 32)
  tagDraft.value = ''
  await saveNoteMetadata()
}
async function removeTag(tag) {
  if (!props.note) return
  props.note.tags = (props.note.tags || []).filter(value => value !== tag)
  await saveNoteMetadata()
}
async function togglePinned() {
  if (!props.note) return
  const updated = await store.setPinned(props.note.id, !props.note.pinned)
  if (updated) Object.assign(props.note, updated)
}
async function createKnowledgeFromEditor() {
  const name = await requestPrompt(t('newKnowledge'))
  if (!name?.trim()) return
  try { await library.create(name.trim(), 'personal'); if (library.activeId) await addToKnowledge(library.activeId) } catch (error) { showToast(error?.message || '创建知识库失败，请重试', { tone: 'error' }) }
}
</script>
<template>
  <div v-if="note" class="note-editor-shell">
    <section class="editor-panel" :class="{ 'is-code-mode': codeMode }">
    <div class="toolbar friday-editor-toolbar" :class="{ 'with-assistant': !assistantTriggerVisible }">
      <div key="toolbar-format-controls" class="toolbar-left-group">
        <template v-if="richMode">
        <button :title="t('undo')" :disabled="!canUndo" @click="editor?.chain().focus().undo().run()"><Undo2 :size="19" /></button>
        <button :title="t('redo')" :disabled="!canRedo" @click="editor?.chain().focus().redo().run()"><Redo2 :size="19" /></button>
        <button title="清除格式" @click="clearRichFormatting"><Eraser :size="19" /></button>
        <button title="链接" :class="{ pressed: linkActive }" :disabled="!canEditLink" @click="editLink"><Link2 :size="19" /></button><i></i>
        <span class="toolbar-menu-anchor"><button title="插入" @click="toggleInsertMenu"><PlusCircle :size="19" /><span class="toolbar-label">插入</span><FridayDropdownChevron /></button><div v-if="insertOpen" class="toolbar-insert-menu insert-command-menu">
          <div class="insert-submenu-anchor"><button class="insert-menu-item" @click.stop="tablePickerOpen = !tablePickerOpen"><span class="insert-menu-icon">▦</span><span>表格</span><span class="insert-menu-arrow">›</span></button><div v-if="tablePickerOpen" class="table-picker-menu" @click.stop><div class="table-picker-label">{{ tableRows }} × {{ tableCols }}</div><div v-for="row in 10" :key="`table-row-${row}`" class="table-picker-row"><button v-for="col in 10" :key="`table-cell-${row}-${col}`" class="table-picker-cell" :class="{ active: row <= tableRows && col <= tableCols }" @mouseenter="selectTableCell(row, col)" @click="insertTable(row, col)"></button></div></div></div>
          <button class="insert-menu-item" @click="openImageDialog"><span class="insert-menu-icon">▧</span><span>图片</span></button>
          <button class="insert-menu-item" @click="insertCodeBlock"><Code2 :size="15" /><span>代码块</span></button>
          <button class="insert-menu-item insert-mermaid-flowchart" @click="insertMermaidDiagram('flowchart')"><Workflow :size="15" /><span>流程图</span></button>
          <button class="insert-menu-item insert-mermaid-swimlane" @click="insertMermaidDiagram('swimlane')"><Columns2 :size="15" /><span>泳道图</span></button>
          <button class="insert-menu-item" @click="editor?.chain().focus().setHorizontalRule().run(); insertOpen = false"><span class="insert-rule-icon">—</span><span>分隔线</span></button>
          <button class="insert-menu-item" @click="editor?.chain().focus().toggleBlockquote().run(); insertOpen = false"><Quote :size="15" /><span>引用</span></button>
        </div></span><i></i>
        <button :class="{ pressed: editor?.isActive('bold') }" @click="toggle('toggleBold')"><Bold :size="19" /></button>
        <button @click="toggle('toggleItalic')"><Italic :size="19" /></button>
        <button @click="toggle('toggleUnderline')"><UnderlineIcon :size="19" /></button>
        <button @click="toggle('toggleStrike')"><Strikethrough :size="19" /></button>
        <span class="toolbar-menu-anchor color-menu-anchor"><button title="文字颜色" :class="{ pressed: textColorOpen }" @click="closeToolbarMenus(); textColorOpen = !textColorOpen"><PenLine :size="19" /><FridayDropdownChevron /></button><div v-if="textColorOpen" class="editor-color-menu"><strong>文字颜色</strong><button class="color-reset" @click="setTextColor('inherit')">默认颜色</button><div class="editor-color-grid"><button v-for="color in textColorPalette" :key="color" class="editor-color-swatch" :style="{ backgroundColor: color }" :title="color" @click="setTextColor(color)"></button></div></div></span>
        <span class="toolbar-menu-anchor color-menu-anchor"><button title="背景颜色" :class="{ pressed: highlightOpen }" @click="closeToolbarMenus(); highlightOpen = !highlightOpen"><Highlighter :size="19" /><FridayDropdownChevron /></button><div v-if="highlightOpen" class="editor-color-menu"><strong>背景颜色</strong><button class="color-reset" @click="setHighlightColor('none')">无背景</button><div class="editor-color-grid"><button v-for="color in highlightPalette" :key="color" class="editor-color-swatch" :style="{ backgroundColor: color }" :title="color" @click="setHighlightColor(color)"></button></div></div></span><i></i>
        <span class="toolbar-menu-anchor heading-menu-anchor">
          <button title="标题" :class="{ pressed: headingOpen }" @click="closeToolbarMenus(); headingOpen = !headingOpen"><span class="toolbar-label heading-label">{{ currentHeadingLabel }}</span><FridayDropdownChevron /></button>
          <div v-if="headingOpen" class="editor-heading-menu">
            <button class="heading-preview" :class="{ active: editor?.isActive('noteTitle') }" :disabled="!canSetNoteTitle" @click="setNoteTitle"><span class="note-title-menu-label">标题</span></button>
            <button class="heading-preview" :class="{ active: editor?.isActive('heading', { level: 1 }) }" :disabled="editor?.isActive('noteTitle')" @click="setHeading(1)"><span class="heading-level-1">标题 1</span></button>
            <button class="heading-preview" :class="{ active: editor?.isActive('heading', { level: 2 }) }" :disabled="editor?.isActive('noteTitle')" @click="setHeading(2)"><span class="heading-level-2">标题 2</span></button>
            <button class="heading-preview" :class="{ active: editor?.isActive('heading', { level: 3 }) }" :disabled="editor?.isActive('noteTitle')" @click="setHeading(3)"><span class="heading-level-3">标题 3</span></button>
            <button class="heading-preview" :class="{ active: editor?.isActive('paragraph') }" :disabled="editor?.isActive('noteTitle')" @click="setHeading(0)"><span>正文</span></button>
            <button class="heading-preview" :class="{ active: editor?.isActive('smallParagraph') }" :disabled="editor?.isActive('noteTitle')" @click="setSmallBody"><span class="small-body-label">小正</span></button>
          </div>
        </span><i></i>
        <button title="项目列表" @click="toggle('toggleBulletList')"><List :size="19" /></button>
        <button title="编号列表" @click="toggle('toggleOrderedList')"><ListOrdered :size="19" /></button>
        <button title="任务列表" @click="toggle('toggleTaskList')"><ListChecks :size="19" /></button><i></i>
        <button title="左对齐" @click="editor?.chain().focus().setTextAlign('left').run()"><AlignLeft :size="19" /></button>
        <button title="居中" @click="editor?.chain().focus().setTextAlign('center').run()"><AlignCenter :size="19" /></button>
        <button title="右对齐" @click="editor?.chain().focus().setTextAlign('right').run()"><AlignRight :size="19" /></button>
        </template>
        <template v-else>
          <div class="markdown-toolbar-controls" role="toolbar" aria-label="Markdown 格式工具">
            <button title="撤销" @click="applyMarkdownFormat('undo')"><Undo2 :size="19" /></button>
            <button title="重做" @click="applyMarkdownFormat('redo')"><Redo2 :size="19" /></button>
            <button title="链接" @click="applyMarkdownFormat('link')"><Link2 :size="19" /></button><i></i>
            <button title="粗体" @click="applyMarkdownFormat('bold')"><Bold :size="19" /></button>
            <button title="斜体" @click="applyMarkdownFormat('italic')"><Italic :size="19" /></button>
            <button title="删除线" @click="applyMarkdownFormat('strike')"><Strikethrough :size="19" /></button>
            <button title="行内代码" @click="applyMarkdownFormat('code')"><Code2 :size="19" /></button><i></i>
            <span class="toolbar-menu-anchor heading-menu-anchor">
              <button title="标题" :class="{ pressed: headingOpen }" @click="closeToolbarMenus(); headingOpen = !headingOpen"><span class="toolbar-label heading-label">标题</span><FridayDropdownChevron /></button>
              <div v-if="headingOpen" class="editor-heading-menu">
                <button class="heading-preview" @click="setMarkdownHeading(1)"><span class="note-title-menu-label">标题</span></button>
                <button class="heading-preview" @click="setMarkdownHeading(1)"><span class="heading-level-1">标题 1</span></button>
                <button class="heading-preview" @click="setMarkdownHeading(2)"><span class="heading-level-2">标题 2</span></button>
                <button class="heading-preview" @click="setMarkdownHeading(3)"><span class="heading-level-3">标题 3</span></button>
                <button class="heading-preview" @click="setMarkdownHeading(0)"><span>正文</span></button>
                <button class="heading-preview" @click="setMarkdownSmallBody"><span class="small-body-label">小正</span></button>
              </div>
            </span><i></i>
            <button title="项目列表" @click="applyMarkdownFormat('bullet')"><List :size="19" /></button>
            <button title="编号列表" @click="applyMarkdownFormat('ordered')"><ListOrdered :size="19" /></button>
            <button title="任务列表" @click="applyMarkdownFormat('task')"><ListChecks :size="19" /></button>
            <button title="引用" @click="applyMarkdownFormat('quote')"><Quote :size="19" /></button>
          </div>
        </template>
      </div>
      <div key="toolbar-mode-controls" class="toolbar-right-group">
        <span class="toolbar-menu-anchor knowledge-menu-anchor"><button :title="t('addToKnowledge')" @click="closeToolbarMenus(); knowledgeMenuOpen = !knowledgeMenuOpen"><PlusCircle :size="19" /></button><div v-if="knowledgeMenuOpen" class="toolbar-knowledge-menu" @click.stop>
          <button class="knowledge-menu-create" @click="createKnowledgeFromEditor"><Plus :size="14" />{{ t('newKnowledge') }}</button>
          <div class="note-context-divider"></div>
          <template v-if="knowledgeGroups.length">
            <template v-for="group in knowledgeGroups" :key="group.id">
              <div class="toolbar-knowledge-group-label">{{ group.label }}</div>
              <button v-for="base in group.items" :key="base.id" class="toolbar-knowledge-item" @click="addToKnowledge(base.id)"><BookOpen :size="14" />{{ base.name }}</button>
            </template>
          </template>
          <span v-else class="toolbar-knowledge-empty">{{ t('noKnowledgeBases') }}</span>
        </div></span>
        <button
          v-if="codeMode"
          type="button"
          class="markdown-preview-toggle"
          :class="{ pressed: markdownPreview }"
          :aria-pressed="markdownPreview"
          :title="markdownPreview ? '关闭实时预览' : '打开实时预览'"
          @click="toggleMarkdownPreview"
        ><Columns2 :size="16" /><span>预览</span></button>
        <span class="toolbar-menu-anchor mode-menu-anchor">
          <button type="button" class="editor-mode-trigger" :aria-expanded="modeMenuOpen" aria-haspopup="menu" :title="`文章模式：${currentMode.label}（${modeShortcutLabel}）`" @click="toggleModeMenu" @keydown.esc.stop="modeMenuOpen = false">
            <component :is="currentMode.icon" :size="16" />
            <span class="editor-mode-label">{{ currentMode.label }}</span>
            <FridayDropdownChevron />
          </button>
          <div v-if="modeMenuOpen" ref="modeMenuRef" class="editor-mode-menu" role="menu" aria-label="文章模式" @keydown="handleModeMenuKeydown" @click.stop>
            <button v-for="(mode, index) in editorModes" :key="mode.id" type="button" role="menuitemradio" :aria-checked="editorMode === mode.id" :tabindex="index === modeMenuIndex ? 0 : -1" @focus="modeMenuIndex = index" @click="changeEditorMode(mode.id)">
              <component :is="mode.icon" :size="15" />
              <span><strong>{{ mode.label }}</strong><small>{{ mode.description }}</small></span>
              <Check v-if="editorMode === mode.id" :size="14" class="editor-mode-check" />
            </button>
            <div class="editor-mode-shortcut-hint"><span>切换快捷键</span><kbd v-for="part in modeShortcutParts" :key="part">{{ part }}</kbd></div>
          </div>
        </span>
        <span v-if="exportStatusLabel" class="toolbar-export-status" role="status" aria-live="polite"><LoaderCircle :size="14" class="is-spinning" /> {{ exportStatusLabel }}</span>
        <span class="toolbar-menu-anchor more-menu-anchor">
          <button ref="moreTriggerRef" type="button" :title="t('more')" aria-haspopup="menu" :aria-expanded="String(moreOpen)" aria-controls="note-more-menu" @click="toggleMoreMenu"><MoreHorizontal :size="20" /></button>
          <div v-if="moreOpen" id="note-more-menu" ref="moreMenuRef" class="toolbar-more-menu" role="menu" :aria-label="t('moreActions')" @keydown="handleMoreMenuKeydown" @click.stop>
            <button type="button" role="menuitem" @click="openRevisions"><RotateCcw :size="15" /> {{ t('aiVersionHistory') }}</button>
            <div class="toolbar-more-divider" role="separator"></div>
            <button type="button" role="menuitem" :disabled="Boolean(exportingFormat)" @click="exportMarkdown"><FileText :size="15" /> {{ t('exportMarkdown') }}</button>
            <button type="button" role="menuitem" :disabled="Boolean(exportingFormat)" @click="exportHtml"><FileCode2 :size="15" /> {{ t('exportHtml') }}</button>
            <button type="button" role="menuitem" :disabled="Boolean(exportingFormat)" @click="exportPdf"><Download :size="15" /> {{ t('exportPdf') }}</button>
            <button type="button" role="menuitem" :disabled="Boolean(exportingFormat)" @click="printNote"><Printer :size="15" /> {{ t('printArticle') }}</button>
            <div class="toolbar-more-divider" role="separator"></div>
            <button type="button" role="menuitem" class="danger" @click="emit('deleted', note.id); moreOpen = false"><Trash2 :size="15" /> {{ t('deleteNote') }}</button>
          </div>
        </span>
        <button v-if="assistantTriggerVisible" class="ai-button" @click="toggleAssistant"><Layers :size="17" /> Tiny Note 助理</button>
      </div>
    </div>
    <div class="note-metadata">
      <div class="note-tag-list">
        <span v-for="tag in note.tags || []" :key="tag" class="note-tag">#{{ tag }}<button type="button" aria-label="移除标签" @click="removeTag(tag)">×</button></span>
        <input v-model="tagDraft" class="note-tag-input" placeholder="添加标签" @keydown.enter.prevent="addTag" />
      </div>
      <div v-if="noteLinks.length" class="note-links" aria-label="关联笔记"><span>关联笔记</span><button v-for="link in noteLinks" :key="link.sourceNoteId + '-' + link.targetNoteId" type="button" @click="store.activeId = link.sourceNoteId === note.id ? link.targetNoteId : link.sourceNoteId">{{ link.targetTitle }}</button></div>
      <div class="editor-meta"><button type="button" class="note-pin-button" :class="{ active: note.pinned }" :aria-pressed="note.pinned" :aria-label="note.pinned ? '取消置顶' : '置顶笔记'" :title="note.pinned ? '取消置顶' : '置顶笔记'" @click="togglePinned"><Pin :size="14" /></button><span :class="{ saving: store.saving }">{{ store.saving ? t('saving') : t('save') }}</span></div>
    </div>
    <button class="toc-btn" :class="{ 'is-open': tocVisible }" title="目录" aria-label="目录" @click="emit('toggle-toc')"><span class="toc-char">目</span><span class="toc-char">录</span></button>
    <div ref="splitWorkspace" class="editor-workspace" :class="[`mode-${editorMode}`, { 'is-previewing': splitMode, 'is-vertical': splitVertical }]">
      <div v-if="codeMode" class="markdown-source-pane" :class="{ 'split-source-pane': splitMode }" :style="splitMode ? splitPaneStyle : undefined">
        <MarkdownSourceEditor ref="sourceEditorRef" :model-value="markdownDraft" aria-label="Markdown 源码编辑器" @update:model-value="updateMarkdownDraft" @scroll="synchronizeSplitScroll('source', $event)" />
      </div>
      <div v-if="splitMode" class="split-divider" role="separator" :aria-orientation="splitVertical ? 'horizontal' : 'vertical'" aria-label="调整源码与预览比例" aria-valuemin="30" aria-valuemax="70" :aria-valuenow="Math.round(splitRatio)" @pointerdown="startSplitResize"><span></span></div>
      <div v-show="!codeMode || markdownPreview" key="editor-render" ref="previewScroller" class="editor-render-pane" :class="{ 'split-preview-pane': splitMode }" @scroll.passive="handlePreviewScroll">
        <EditorContent :editor="editor" class="editor-content" :class="{ 'split-preview-content': splitMode, 'has-pending-ai-change': aiChangePending }" @mousedown="confirmPendingAiChange" @keydown.tab="handleEditorTab" @keydown.esc="dismissFim" />
      </div>
      <div v-if="markdownParseError" class="markdown-parse-error" role="alert">{{ markdownParseError }}</div>
      <div v-if="markdownPasteNotice" class="markdown-paste-notice" role="status">
        <span>已按 Markdown 渲染</span>
        <button type="button" class="markdown-paste-source" @click="viewPastedMarkdown">查看源码</button>
        <button type="button" class="markdown-paste-close" aria-label="关闭提示" @click="markdownPasteNotice = false">×</button>
      </div>
    </div>
    <BubbleMenu v-if="editor" v-show="!aiOutputOpen && richMode" :editor="editor" :options="{ duration: 120, placement: 'top', maxWidth: 'none' }" :should-show="shouldShowBubbleMenu" class="tiny-note-bubble-menu">
      <div v-if="aiPanelOpen" class="tiny-note-ai-input-wrapper" @mousedown.stop>
        <div v-if="aiPanelSelectionText" class="tiny-note-ai-selection-context" role="group" aria-label="选中文本">
          <span class="tiny-note-ai-selection-label">基于选中文本</span>
          <p class="tiny-note-ai-selection-text">{{ aiPanelSelectionText }}</p>
        </div>
        <textarea ref="aiInputRef" v-model="aiPrompt" class="tiny-note-ai-textarea" rows="1" placeholder="告诉 AI 如何处理这段文字…" @keydown.enter.exact.prevent="sendCustomAi" @keydown.esc.prevent="closeAiPanel"></textarea>
        <div class="tiny-note-ai-input-actions">
          <div class="tiny-note-ai-action-left">
            <div class="tiny-note-command-dropdown">
              <button class="tiny-note-command-btn" :class="{ active: commandMenuOpen }" @click.stop="toggleCommandMenu"><Zap :size="13" /><span>AI 指令</span><FridayDropdownChevron /></button>
              <Transition name="tiny-note-command-transition">
                <div v-if="commandMenuOpen" class="tiny-note-command-menu" :class="`menu-${commandMenuDirection}`" @click.stop>
                  <button class="tiny-note-command-item" @click="selectAiCommand('translate', $event)"><Languages :size="14" /><span>翻译</span></button>
                  <button class="tiny-note-command-item" @click="selectAiCommand('summarize', $event)"><FileText :size="14" /><span>总结</span></button>
                  <button class="tiny-note-command-item" @click="selectAiCommand('continue_write', $event)"><PenLine :size="14" /><span>续写</span></button>
                  <button class="tiny-note-command-item" @click="selectAiCommand('fix_grammar', $event)"><CircleHelp :size="14" /><span>语法修正</span></button>
                  <button class="tiny-note-command-item" @click="selectAiCommand('generate_plan', $event)"><CalendarDays :size="14" /><span>生成任务计划</span></button>
                  <button class="tiny-note-command-item" @click="selectAiCommand('generate_table', $event)"><Table2 :size="14" /><span>生成表格</span></button>
                </div>
              </Transition>
            </div>
          </div>
          <div class="tiny-note-ai-action-right">
            <button class="tiny-note-send-btn" :class="{ active: aiPrompt.trim() }" :disabled="!aiPrompt.trim() || aiBusy" title="发送" @click="sendCustomAi"><Send :size="16" /></button>
          </div>
        </div>
      </div>
      <div v-else class="bubble-menu-container tiny-note-bubble-content" @mousedown.prevent>
        <button class="bubble-btn ai-write-btn bubble-ai-button" title="AI 写作" @mousedown.prevent="openAiPanel"><Sparkles :size="14" /><span>AI 写作</span></button>
        <span class="bubble-divider"></span>
        <button class="bubble-btn" title="解读" @mousedown.prevent="runSelectedAi('interpret', $event)"><CircleHelp :size="14" /><span>解读</span></button>
        <button class="bubble-btn" title="精炼" @mousedown.prevent="runSelectedAi('refine', $event)"><Zap :size="14" /><span>精炼</span></button>
        <button class="bubble-btn" title="润色" @mousedown.prevent="runSelectedAi('polish', $event)"><PenLine :size="14" /><span>润色</span></button>
        <button class="bubble-btn" title="扩写" @mousedown.prevent="runSelectedAi('expand', $event)"><Maximize2 :size="14" /><span>扩写</span></button>
        <span class="bubble-divider"></span>
        <button class="bubble-btn" title="在对话中打开" @mousedown.prevent="openInConversation"><MessageSquare :size="14" /><span>在对话中打开</span></button>
      </div>
    </BubbleMenu>
    <div v-if="fimSuggestion && richMode" class="fim-suggestion">{{ fimSuggestion }} <small>Tab 接受 · Esc 放弃</small></div>
    <div v-if="aiConsentOpen" class="editor-dialog-overlay" @click.self="cancelAiConsent">
      <div class="editor-dialog ai-consent-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-consent-title">
        <div class="editor-dialog-header"><strong id="ai-consent-title"><Sparkles :size="16" />允许 AI 使用文章上下文</strong><button class="editor-dialog-close" title="关闭" aria-label="关闭" @click="cancelAiConsent">×</button></div>
        <div class="editor-dialog-body"><p>Tiny Note 会把当前文章、选中的文字及命中的知识库片段发送给当前模型，以完成本次 AI 操作。</p><small>授权仅保存在本机，可随模型配置分别记录。</small></div>
        <div class="editor-dialog-footer"><button class="secondary-button" @click="cancelAiConsent">取消</button><button class="primary-button" @click="confirmAiConsent">允许并继续</button></div>
      </div>
    </div>
    <Transition name="ai-output-transition">
      <div v-if="aiOutputOpen" class="ai-output-overlay" @mousedown.self="closeAiResult">
        <div class="ai-output-panel" :style="aiDialogStyle" role="dialog" aria-modal="true" aria-label="AI 写作结果" @mousedown.stop>
        <div class="ai-output-header" @pointerdown="startAiDrag"><strong><Sparkles :size="14" />{{ aiActionLabels[aiResultAction] || 'AI 写作' }}内容</strong><button type="button" title="关闭" aria-label="关闭" @click="closeAiResult"><X :size="17" /></button></div>
        <div class="ai-output-content">
          <div v-if="aiOriginalText && aiResultAction !== 'interpret'" class="ai-diff-preview"><div class="ai-diff-before"><small>原文</small>{{ aiOriginalText }}</div><div class="ai-diff-after"><small>建议</small><MarkdownMessage class="ai-output-markdown" :content="aiText" :streaming="aiBusy" /></div></div>
          <MarkdownMessage v-else class="ai-output-markdown" :content="aiText" :streaming="aiBusy" />
          <div v-if="aiSources.length" class="ai-source-list"><span v-for="(source, index) in aiSources" :key="source.id" :title="source.snippet">[{{ index + 1 }}] {{ source.title }}<small v-if="source.truncated">已截取</small></span></div>
        </div>
        <div class="ai-output-footer"><div class="ai-output-footer-meta"><span>内容由 AI 生成 <ShieldCheck :size="13" /></span><span>已生成{{ aiCharCount }}字</span></div><div class="ai-output-feedback"><button type="button" :class="{ active: aiFeedback === 'like' }" title="有帮助" @click="toggleAiFeedback('like')"><ThumbsUp :size="16" /></button><button type="button" :class="{ active: aiFeedback === 'dislike' }" title="没帮助" @click="toggleAiFeedback('dislike')"><ThumbsDown :size="16" /></button><button type="button" title="复制" @click="copyAi"><Copy :size="16" /></button></div></div>
        <div class="ai-output-actions"><div><button type="button" class="ai-output-action rewrite" :disabled="aiBusy" @click="rewriteAi"><RotateCcw :size="14" />重写</button><button type="button" class="ai-output-action discard" :disabled="aiBusy" @click="dismissAiResult"><Trash2 :size="14" />弃用</button></div><div><button type="button" class="ai-output-action replace" :disabled="aiBusy || !aiText || !aiProposal" @click="replaceWithAi">应用替换</button><button type="button" class="ai-output-action insert" :disabled="aiBusy || !aiText || !aiProposal || !richMode" :title="richMode ? '在当前光标位置插入' : '请切换到即时编辑后应用插入'" @click="insertAi">应用插入</button></div></div>
        </div>
      </div>
    </Transition>
    <div v-if="imageDialogOpen" class="editor-dialog-overlay" @click.self="imageDialogOpen = false">
      <div class="editor-dialog" role="dialog" aria-modal="true" aria-label="插入图片">
        <div class="editor-dialog-header"><strong>插入图片</strong><button class="editor-dialog-close" title="关闭" @click="imageDialogOpen = false">×</button></div>
        <div class="editor-dialog-body"><label>图片地址<input ref="imageInput" v-model="imageUrl" type="url" placeholder="https://example.com/image.jpg" @keyup.enter="confirmImage" /></label><label>替代文字<input v-model="imageAlt" type="text" placeholder="图片说明（可选）" @keyup.enter="confirmImage" /></label><button type="button" class="secondary-button" @click="imageFileInput?.click()">从本机选择图片</button><input ref="imageFileInput" type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp" @change="insertLocalImage" /></div>
        <div class="editor-dialog-footer"><button class="secondary-button" @click="imageDialogOpen = false">取消</button><button class="primary-button" :disabled="!normalizeImageUrl(imageUrl)" @click="confirmImage">插入图片</button></div>
      </div>
    </div>
    <div v-if="revisionsOpen" class="editor-dialog-overlay" @click.self="revisionsOpen = false"><div class="editor-dialog revision-dialog" role="dialog" aria-modal="true" aria-label="AI 版本历史"><div class="editor-dialog-header"><strong>AI 版本历史</strong><button class="editor-dialog-close" title="关闭" @click="revisionsOpen = false">×</button></div><div class="revision-list"><p v-if="revisionsBusy">正在读取…</p><p v-else-if="!revisions.length">还没有 AI 修改前的版本</p><button v-for="revision in revisions" :key="revision.id" type="button" @click="restoreRevision(revision)"><span><strong>{{ revision.title || '未命名笔记' }}</strong><small>{{ formatRevisionTime(revision.createdAt) }} · {{ revision.reason === 'ai_edit' ? 'AI 修改前' : '恢复前' }}</small></span><RotateCcw :size="14" /></button></div></div></div>
    </section>
    <Transition name="tiny-note-assistant-slide">
      <NoteAssistantSidebar v-if="assistantOpen" :note="note" :selection="assistantSelection" :messages="assistantMessages" :busy="assistantBusy" :streaming-text="assistantStreamingText" @close="closeAssistant" @send="sendAssistantMessage" @stop="stopAssistant" @copy="copyAssistantMessage" />
    </Transition>
  </div>
  <div v-else class="empty-state"><div class="empty-icon">✦</div><h2>{{ t('emptyNotes') }}</h2><p>{{ t('emptyHint') }}</p></div>
</template>
