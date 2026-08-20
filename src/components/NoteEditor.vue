<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { Channel } from '@tauri-apps/api/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
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
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import CodeBlockComponent from './CodeBlockComponent.vue'
import NoteAssistantSidebar from './NoteAssistantSidebar.vue'
import TurndownService from 'turndown'
import { BookOpen, Bold, CalendarDays, ChevronDown, CircleHelp, Copy, FileText, Italic, Languages, Maximize2, MessageSquare, RotateCcw, Send, ShieldCheck, Table2, ThumbsDown, ThumbsUp, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, ListChecks, Quote, Code2, Undo2, Redo2, Eraser, Link2, Highlighter, PenLine, AlignLeft, AlignCenter, AlignRight, Plus, PlusCircle, MoreHorizontal, Layers, Sparkles, Trash2, Download, Printer, X, Zap } from 'lucide-vue-next'
import { useNotesStore } from '../stores/notes'
import { useLibraryStore } from '../stores/library'
import { useI18n } from 'vue-i18n'

const lowlight = createLowlight()
lowlight.register('javascript', javascript); lowlight.register('typescript', typescript); lowlight.register('python', python); lowlight.register('json', json); lowlight.register('html', xml); lowlight.register('xml', xml); lowlight.register('css', css); lowlight.register('bash', bash); lowlight.register('sql', sql); lowlight.register('markdown', markdown); lowlight.register('yaml', yaml); lowlight.register('rust', rust)
const props = defineProps({ note: Object, tocVisible: { type: Boolean, default: false } }); const emit = defineEmits(['deleted', 'toggle-toc']); const store = useNotesStore(); const library = useLibraryStore(); const { t } = useI18n(); const aiBusy = ref(false); const aiText = ref(''); const aiRequestId = ref(''); const aiAction = ref('summarize'); const aiResultAction = ref(''); const assistantOpen = ref(false); const assistantBusy = ref(false); const assistantRequestId = ref(''); const assistantStreamingText = ref(''); const assistantMessages = ref([]); const assistantSelection = ref(null); const aiPanelOpen = ref(false); const commandMenuOpen = ref(false); const aiPrompt = ref(''); const aiInputRef = ref(null); const commandMenuDirection = ref('down'); const moreOpen = ref(false); const insertOpen = ref(false); const tablePickerOpen = ref(false); const textColorOpen = ref(false); const highlightOpen = ref(false); const headingOpen = ref(false); const knowledgeMenuOpen = ref(false); const imageDialogOpen = ref(false); const imageUrl = ref(''); const imageAlt = ref(''); const imageInput = ref(null); const tableRows = ref(0); const tableCols = ref(0); const fimEnabled = ref(false); const fimSuggestion = ref(''); const editorStateTick = ref(0); let fimTimer; let savedSelection = null
const aiActionLabels = { interpret: '解读', refine: '精炼', polish: '润色', expand: '扩写', translate: '翻译', summarize: '总结', continue_write: '续写', fix_grammar: '语法修正', generate_plan: '生成任务计划', generate_table: '生成表格', custom: 'AI 写作' }
const aiErrorMessages = { model_profile_unavailable: '还没有配置可用模型，请先打开设置完成配置。', api_key_not_configured: '当前模型还没有配置 API Key，请先打开设置完成配置。', credential_store_unavailable: '系统凭据存储不可用，暂时无法调用 AI。', provider_request_failed: '模型服务请求失败，请检查模型地址和网络连接。', provider_stream_failed: '模型服务连接中断，请稍后重试。' }
const aiFeedback = ref('')
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
const editor = useEditor({ content: props.note?.contentHtml || '<p></p>', extensions: [StarterKit.configure({ codeBlock: false, link: false, underline: false }), Underline, Link.configure({ openOnClick: false }), Highlight, Image.configure({ allowBase64: false }), Table.configure({ resizable: true }), TableRow, TableHeader, TableCell, TaskList, TaskItem.configure({ nested: true }), Subscript, Superscript, TextStyle, Color, TextAlign.configure({ types: ['heading', 'paragraph'] }), CodeBlockLowlight.extend({ addNodeView() { return VueNodeViewRenderer(CodeBlockComponent) } }).configure({ lowlight }), Placeholder.configure({ placeholder: '写下此刻的想法…' })], editorProps: { attributes: { class: 'note-prose' } }, onTransaction: refreshEditorState, onSelectionUpdate: refreshEditorState, onUpdate: ({ editor: e }) => { if (!props.note) return; props.note.contentHtml = e.getHTML(); props.note.contentText = e.getText(); if (!props.note.title || props.note.title === '未命名笔记') { const first = e.getText().split('\n').find(Boolean); if (first) props.note.title = first.slice(0, 60) } store.scheduleSave(props.note); if (fimEnabled.value) { clearTimeout(fimTimer); fimTimer = setTimeout(runFim, 2000) } } })
const canUndo = computed(() => { editorStateTick.value; return editor.value?.can().undo() ?? false })
const canRedo = computed(() => { editorStateTick.value; return editor.value?.can().redo() ?? false })
const linkActive = computed(() => { editorStateTick.value; return editor.value?.isActive('link') ?? false })
const canEditLink = computed(() => { editorStateTick.value; const instance = editor.value; return !!instance && (!instance.state.selection.empty || instance.isActive('link')) })
const selectedText = computed(() => { editorStateTick.value; const instance = editor.value; if (!instance || instance.state.selection.empty) return ''; const { from, to } = instance.state.selection; return instance.state.doc.textBetween(from, to, '\n').trim() })
const knowledgeGroups = computed(() => [
  { id: 'personal', label: t('personal'), items: library.bases.filter(base => base.category === 'personal') },
  { id: 'local', label: t('local'), items: library.bases.filter(base => base.category === 'local') }
].filter(group => group.items.length))
function shouldShowBubbleMenu({ state }) { return !state.selection.empty && state.doc.textBetween(state.selection.from, state.selection.to, '\n').trim().length > 0 }
const textColorPalette = ['#1c1917', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777']
const highlightPalette = ['#fef08a', '#fed7aa', '#fecaca', '#bbf7d0', '#bae6fd', '#c7d2fe', '#e9d5ff', '#fbcfe8']
const currentHeadingLabel = computed(() => { editorStateTick.value; const instance = editor.value; if (!instance) return '标题'; for (const level of [1, 2, 3]) if (instance.isActive('heading', { level })) return `H${level}`; return '正文' })
watch(() => props.note?.id, () => { savedSelection = null; closeAiPanel(); aiText.value = ''; aiResultAction.value = ''; aiBusy.value = false; aiDialogPosition.value = null; assistantOpen.value = false; assistantBusy.value = false; assistantStreamingText.value = ''; assistantMessages.value = []; assistantSelection.value = null; if (props.note && editor.value) editor.value.commands.setContent(props.note.contentHtml || '<p></p>') })
onBeforeUnmount(() => { clearTimeout(fimTimer); stopAiDrag(); editor.value?.destroy() })
onMounted(async () => { try { fimEnabled.value = (await (await import('../services/tauri')).invoke('settings_get')).fimEnabled === true } catch { fimEnabled.value = false }; if (!library.bases.length) { try { await library.load() } catch {} } })
function toggle(type) { editor.value?.chain().focus()[type]().run() }
async function runAi(action = aiAction.value, requestText = props.note?.contentText || '', instruction = null) {
  if (!props.note || aiBusy.value) return
  const actionLabel = aiActionLabels[action] || 'AI 写作'
  aiBusy.value = true; aiText.value = `正在生成${actionLabel}…`; aiResultAction.value = action; aiDialogPosition.value = null; aiRequestId.value = crypto.randomUUID()
  if (!window.__TAURI_INTERNALS__) { setTimeout(() => { aiText.value = `(${action})\n${instruction ? `${instruction}\n` : ''}${requestText.slice(0, 140)}`; aiBusy.value = false }, 700); return }
  const channel = new Channel()
  channel.onmessage = event => {
    if (event.type === 'delta') {
      if (aiText.value === `正在生成${actionLabel}…`) aiText.value = ''
      aiText.value += event.text
    }
    if (event.type === 'error') {
      aiText.value = `${actionLabel}失败：${aiErrorMessages[event.code] || '请求未完成，请稍后重试。'}`
      aiBusy.value = false
    }
    if (event.type === 'cancelled') { aiText.value = '已停止生成。'; aiBusy.value = false }
    if (event.type === 'completed') aiBusy.value = false
  }
  try { await (await import('../services/tauri')).invoke('note_ai_stream', { request: { requestId: aiRequestId.value, action, text: requestText, instruction, modelProfileId: null }, onEvent: channel }) } catch { aiText.value = 'AI 请求失败，请检查模型设置。'; aiBusy.value = false }
}
function captureAssistantSelection() {
  const instance = editor.value
  if (!instance || instance.state.selection.empty) return null
  const { from, to } = instance.state.selection
  const text = instance.state.doc.textBetween(from, to, '\n').trim()
  return text ? { from, to, text } : null
}
function openAssistant(selection = captureAssistantSelection()) {
  if (selection) assistantSelection.value = selection
  assistantOpen.value = true
}
function toggleAssistant() {
  if (assistantOpen.value) assistantOpen.value = false
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
function pushAssistantResponse(content) {
  if (!content?.trim()) return
  assistantMessages.value.push({ role: 'assistant', content: content.trim() })
}
async function sendAssistantMessage(prompt) {
  if (!props.note || assistantBusy.value || !prompt?.trim()) return
  const message = prompt.trim()
  assistantMessages.value.push({ role: 'user', content: message, references: assistantReferences() })
  assistantBusy.value = true
  assistantStreamingText.value = '正在思考…'
  assistantRequestId.value = crypto.randomUUID()
  const context = assistantContext()
  if (!window.__TAURI_INTERNALS__) {
    window.setTimeout(() => {
      pushAssistantResponse(`我已参考当前文章${assistantSelection.value?.text ? '和你选中的文字' : ''}。\n\n你的问题：${message}`)
      assistantStreamingText.value = ''
      assistantBusy.value = false
    }, 700)
    return
  }
  const channel = new Channel()
  channel.onmessage = event => {
    if (event.type === 'delta') {
      if (assistantStreamingText.value === '正在思考…') assistantStreamingText.value = ''
      assistantStreamingText.value += event.text
    }
    if (event.type === 'error') {
      pushAssistantResponse(`请求失败：${aiErrorMessages[event.code] || '请求未完成，请稍后重试。'}`)
      assistantStreamingText.value = ''
      assistantBusy.value = false
    }
    if (event.type === 'cancelled') { assistantStreamingText.value = ''; assistantBusy.value = false }
    if (event.type === 'completed') {
      pushAssistantResponse(assistantStreamingText.value === '正在思考…' ? '模型没有返回内容，请换个问法再试。' : assistantStreamingText.value)
      assistantStreamingText.value = ''
      assistantBusy.value = false
    }
  }
  try {
    await (await import('../services/tauri')).invoke('note_ai_stream', { request: { requestId: assistantRequestId.value, action: 'custom', text: context, instruction: message, modelProfileId: null, source: 'note_ai' }, onEvent: channel })
  } catch {
    pushAssistantResponse('AI 请求失败，请检查模型设置。')
    assistantStreamingText.value = ''
    assistantBusy.value = false
  }
}
async function stopAssistant() {
  if (!assistantRequestId.value || !assistantBusy.value) return
  if (window.__TAURI_INTERNALS__) { try { await (await import('../services/tauri')).invoke('note_ai_cancel', { requestId: assistantRequestId.value }) } catch {} }
  assistantBusy.value = false
  assistantStreamingText.value = ''
}
async function copyAssistantMessage(content) { if (content) await navigator.clipboard?.writeText(content) }
async function stopAi() { if (!aiRequestId.value) return; if (window.__TAURI_INTERNALS__) await (await import('../services/tauri')).invoke('note_ai_cancel', { requestId: aiRequestId.value }); aiBusy.value = false }
function exportMarkdown() { if (!props.note || !editor.value) return; const markdown = new TurndownService().turndown(editor.value.getHTML()); const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${props.note.title || 'note'}.md`; link.click(); URL.revokeObjectURL(url) }
function printNote() { window.print() }
function restoreSavedSelection() { if (!editor.value || !savedSelection) return false; return editor.value.chain().focus().setTextSelection(savedSelection).run() }
function insertAi() { if (editor.value && aiText.value) { restoreSavedSelection(); editor.value.commands.insertContent(aiText.value); savedSelection = null; dismissAiResult() } }
function replaceWithAi() { if (editor.value && aiText.value) { if (restoreSavedSelection()) editor.value.commands.deleteSelection(); else editor.value.commands.clearContent(); editor.value.commands.insertContent(aiText.value); savedSelection = null; dismissAiResult() } }
async function copyAi() { if (aiText.value) await navigator.clipboard?.writeText(aiText.value) }
function toggleAiFeedback(type) { aiFeedback.value = aiFeedback.value === type ? '' : type }
function dismissAiResult() { aiText.value = ''; aiResultAction.value = ''; aiFeedback.value = ''; aiDialogPosition.value = null }
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
function rewriteAi() {
  if (aiBusy.value || !aiResultAction.value) return
  const action = aiResultAction.value
  let text = selectedText.value
  if (savedSelection && editor.value) text = editor.value.state.doc.textBetween(savedSelection.from, savedSelection.to, '\n').trim()
  dismissAiResult()
  runAi(action, text || props.note?.contentText || '')
}
async function copySelection() { if (selectedText.value) await navigator.clipboard?.writeText(selectedText.value) }
function saveCurrentSelection() { const selection = editor.value?.state.selection; if (selection && !selection.empty) savedSelection = { from: selection.from, to: selection.to } }
function closeAiPanel() { aiPanelOpen.value = false; commandMenuOpen.value = false; aiPrompt.value = '' }
function positionCommandMenu() {
  const button = document.querySelector('.tiny-note-ai-input-wrapper .command-btn')
  if (!button) return
  const rect = button.getBoundingClientRect()
  const menuHeight = 260
  commandMenuDirection.value = window.innerHeight - rect.bottom < menuHeight && rect.top > window.innerHeight - rect.bottom ? 'up' : 'down'
}
async function openAiPanel() {
  saveCurrentSelection(); aiPanelOpen.value = true; aiPrompt.value = ''
  await nextTick(); aiInputRef.value?.focus(); positionCommandMenu(); commandMenuOpen.value = true
}
function toggleCommandMenu(event) { event.stopPropagation(); if (!commandMenuOpen.value) positionCommandMenu(); commandMenuOpen.value = !commandMenuOpen.value }
function selectAiCommand(action) { saveCurrentSelection(); const text = selectedText.value || props.note?.contentText || ''; closeAiPanel(); runAi(action, text) }
function sendCustomAi() { const instruction = aiPrompt.value.trim(); if (!instruction || aiBusy.value) return; saveCurrentSelection(); const text = selectedText.value || props.note?.contentText || ''; closeAiPanel(); runAi('custom', text, instruction) }
function runSelectedAi(action) { const text = selectedText.value; if (!text || aiBusy.value) return; saveCurrentSelection(); runAi(action, text) }
function openInConversation() {
  const text = selectedText.value
  if (!text) return
  closeAiPanel()
  openAssistant(captureAssistantSelection())
}
async function runFim() { if (!fimEnabled.value || !editor.value || !props.note?.contentText) return; const id = crypto.randomUUID(); const channel = new Channel(); let result = ''; channel.onmessage = event => { if (event.type === 'delta') result += event.text; if (event.type === 'completed') fimSuggestion.value = result }; try { await (await import('../services/tauri')).invoke('note_fim_stream', { request: { requestId: id, action: 'continue_write', text: props.note.contentText.slice(-800), instruction: `Continue naturally. Context after cursor: ${props.note.contentText.slice(-400)}`, modelProfileId: null }, onEvent: channel }) } catch { fimSuggestion.value = '' } }
function acceptFim() { if (fimSuggestion.value && editor.value) { editor.value.commands.insertContent(fimSuggestion.value); fimSuggestion.value = '' } }
function dismissFim() { fimSuggestion.value = '' }
function insertCodeBlock() { editor.value?.chain().focus().toggleCodeBlock().run(); insertOpen.value = false }
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
  if (level === 0) editor.value.chain().focus().setParagraph().run()
  else editor.value.chain().focus().toggleHeading({ level }).run()
  headingOpen.value = false
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
function editLink() {
  const instance = editor.value
  if (!instance || !canEditLink.value) return
  const currentHref = instance.getAttributes('link').href || ''
  const nextHref = window.prompt(linkActive.value ? '编辑链接地址' : '输入链接地址', currentHref || 'https://')
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
  try { await library.addNoteReference(knowledgeBaseId, props.note); knowledgeMenuOpen.value = false } catch (error) { window.alert(error?.message || '添加到知识库失败，请重试') }
}
async function createKnowledgeFromEditor() {
  const name = window.prompt(t('newKnowledge'))
  if (!name?.trim()) return
  try { await library.create(name.trim(), 'personal'); if (library.activeId) await addToKnowledge(library.activeId) } catch (error) { window.alert(error?.message || '创建知识库失败，请重试') }
}
const title = computed({ get: () => props.note?.title || '', set: v => { if (props.note) { props.note.title = v; store.scheduleSave(props.note) } } })
</script>
<template>
  <div v-if="note" class="note-editor-shell">
    <section class="editor-panel">
    <div class="toolbar friday-editor-toolbar">
      <div class="toolbar-left-group">
        <button :title="t('undo')" :disabled="!canUndo" @click="editor?.chain().focus().undo().run()"><Undo2 :size="19" /></button>
        <button :title="t('redo')" :disabled="!canRedo" @click="editor?.chain().focus().redo().run()"><Redo2 :size="19" /></button>
        <button title="清除格式" @click="toggle('clearNodes')"><Eraser :size="19" /></button>
        <button title="链接" :class="{ pressed: linkActive }" :disabled="!canEditLink" @click="editLink"><Link2 :size="19" /></button><i></i>
        <span class="toolbar-menu-anchor"><button title="插入" @click="toggleInsertMenu"><PlusCircle :size="19" /><span class="toolbar-label">插入</span><span class="toolbar-chevron">▾</span></button><div v-if="insertOpen" class="toolbar-insert-menu insert-command-menu">
          <div class="insert-submenu-anchor"><button class="insert-menu-item" @click.stop="tablePickerOpen = !tablePickerOpen"><span class="insert-menu-icon">▦</span><span>表格</span><span class="insert-menu-arrow">›</span></button><div v-if="tablePickerOpen" class="table-picker-menu" @click.stop><div class="table-picker-label">{{ tableRows }} × {{ tableCols }}</div><div v-for="row in 10" :key="`table-row-${row}`" class="table-picker-row"><button v-for="col in 10" :key="`table-cell-${row}-${col}`" class="table-picker-cell" :class="{ active: row <= tableRows && col <= tableCols }" @mouseenter="selectTableCell(row, col)" @click="insertTable(row, col)"></button></div></div></div>
          <button class="insert-menu-item" @click="openImageDialog"><span class="insert-menu-icon">▧</span><span>图片</span></button>
          <button class="insert-menu-item" @click="insertCodeBlock"><Code2 :size="15" /><span>代码块</span></button>
          <button class="insert-menu-item" @click="editor?.chain().focus().setHorizontalRule().run(); insertOpen = false"><span class="insert-rule-icon">—</span><span>分隔线</span></button>
          <button class="insert-menu-item" @click="editor?.chain().focus().toggleBlockquote().run(); insertOpen = false"><Quote :size="15" /><span>引用</span></button>
        </div></span><i></i>
        <button :class="{ pressed: editor?.isActive('bold') }" @click="toggle('toggleBold')"><Bold :size="19" /></button>
        <button @click="toggle('toggleItalic')"><Italic :size="19" /></button>
        <button @click="toggle('toggleUnderline')"><UnderlineIcon :size="19" /></button>
        <button @click="toggle('toggleStrike')"><Strikethrough :size="19" /></button>
        <span class="toolbar-menu-anchor color-menu-anchor"><button title="文字颜色" :class="{ pressed: textColorOpen }" @click="closeToolbarMenus(); textColorOpen = !textColorOpen"><PenLine :size="19" /><span class="toolbar-chevron">▾</span></button><div v-if="textColorOpen" class="editor-color-menu"><strong>文字颜色</strong><button class="color-reset" @click="setTextColor('inherit')">默认颜色</button><div class="editor-color-grid"><button v-for="color in textColorPalette" :key="color" class="editor-color-swatch" :style="{ backgroundColor: color }" :title="color" @click="setTextColor(color)"></button></div></div></span>
        <span class="toolbar-menu-anchor color-menu-anchor"><button title="背景颜色" :class="{ pressed: highlightOpen }" @click="closeToolbarMenus(); highlightOpen = !highlightOpen"><Highlighter :size="19" /><span class="toolbar-chevron">▾</span></button><div v-if="highlightOpen" class="editor-color-menu"><strong>背景颜色</strong><button class="color-reset" @click="setHighlightColor('none')">无背景</button><div class="editor-color-grid"><button v-for="color in highlightPalette" :key="color" class="editor-color-swatch" :style="{ backgroundColor: color }" :title="color" @click="setHighlightColor(color)"></button></div></div></span><i></i>
        <span class="toolbar-menu-anchor heading-menu-anchor"><button title="标题" :class="{ pressed: headingOpen }" @click="closeToolbarMenus(); headingOpen = !headingOpen"><span class="toolbar-label heading-label">{{ currentHeadingLabel }}</span><span class="toolbar-chevron">▾</span></button><div v-if="headingOpen" class="editor-heading-menu"><button @click="setHeading(0)">正文</button><button @click="setHeading(1)">H1 标题</button><button @click="setHeading(2)">H2 标题</button><button @click="setHeading(3)">H3 标题</button></div></span><i></i>
        <button title="项目列表" @click="toggle('toggleBulletList')"><List :size="19" /></button>
        <button title="编号列表" @click="toggle('toggleOrderedList')"><ListOrdered :size="19" /></button>
        <button title="任务列表" @click="toggle('toggleTaskList')"><ListChecks :size="19" /></button><i></i>
        <button title="左对齐" @click="editor?.chain().focus().setTextAlign('left').run()"><AlignLeft :size="19" /></button>
        <button title="居中" @click="editor?.chain().focus().setTextAlign('center').run()"><AlignCenter :size="19" /></button>
        <button title="右对齐" @click="editor?.chain().focus().setTextAlign('right').run()"><AlignRight :size="19" /></button>
      </div>
      <div class="toolbar-right-group">
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
        <span class="toolbar-menu-anchor"><button title="更多" @click="knowledgeMenuOpen = false; moreOpen = !moreOpen"><MoreHorizontal :size="20" /></button><div v-if="moreOpen" class="toolbar-more-menu"><button @click="exportMarkdown(); moreOpen = false"><Download :size="15" /> 导出 Markdown</button><button @click="printNote(); moreOpen = false"><Printer :size="15" /> 打印 / 保存 PDF</button><button class="danger" @click="emit('deleted', note.id); moreOpen = false"><Trash2 :size="15" /> 删除笔记</button></div></span>
        <button class="ai-button" :class="{ pressed: assistantOpen }" @click="toggleAssistant"><Layers :size="17" /> Tiny Note 助理</button>
        <button v-if="aiBusy" class="stop-button" @click="stopAi">{{ t('stop') }}</button>
      </div>
    </div>
    <div class="editor-head"><input v-model="title" class="title-input" :placeholder="t('untitled')" /><div class="editor-meta"><span :class="{ saving: store.saving }">{{ store.saving ? t('saving') : t('save') }}</span></div></div>
    <button class="toc-btn" :class="{ 'is-open': tocVisible }" title="目录" aria-label="目录" @click="emit('toggle-toc')"><span class="toc-char">目</span><span class="toc-char">录</span></button>
    <EditorContent :editor="editor" class="editor-content" @keydown.tab.prevent="acceptFim" @keydown.esc="dismissFim" />
    <BubbleMenu v-if="editor && !aiText" :editor="editor" :options="{ duration: 120, placement: 'top', maxWidth: 'none' }" :should-show="shouldShowBubbleMenu" class="tiny-note-bubble-menu">
      <div v-if="aiPanelOpen" class="tiny-note-ai-input-wrapper" @mousedown.stop>
        <textarea ref="aiInputRef" v-model="aiPrompt" class="tiny-note-ai-textarea" rows="1" placeholder="基于选中文本：或许你还不知道从何开始，别担心，一切都是慢慢…" @keydown.enter.exact.prevent="sendCustomAi" @keydown.esc.prevent="closeAiPanel"></textarea>
        <div class="tiny-note-ai-input-actions">
          <div class="tiny-note-ai-action-left">
            <div class="tiny-note-command-dropdown">
              <button class="tiny-note-command-btn" :class="{ active: commandMenuOpen }" @click.stop="toggleCommandMenu"><Zap :size="13" /><span>AI 指令</span><ChevronDown :size="12" /></button>
              <Transition name="tiny-note-command-transition">
                <div v-if="commandMenuOpen" class="tiny-note-command-menu" :class="`menu-${commandMenuDirection}`" @click.stop>
                  <button class="tiny-note-command-item" @click="selectAiCommand('translate')"><Languages :size="14" /><span>翻译</span></button>
                  <button class="tiny-note-command-item" @click="selectAiCommand('summarize')"><FileText :size="14" /><span>总结</span></button>
                  <button class="tiny-note-command-item" @click="selectAiCommand('continue_write')"><PenLine :size="14" /><span>续写</span></button>
                  <button class="tiny-note-command-item" @click="selectAiCommand('fix_grammar')"><CircleHelp :size="14" /><span>语法修正</span></button>
                  <button class="tiny-note-command-item" @click="selectAiCommand('generate_plan')"><CalendarDays :size="14" /><span>生成任务计划</span></button>
                  <button class="tiny-note-command-item" @click="selectAiCommand('generate_table')"><Table2 :size="14" /><span>生成表格</span></button>
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
        <button class="bubble-btn" title="解读" @mousedown.prevent="runSelectedAi('interpret')"><CircleHelp :size="14" /><span>解读</span></button>
        <button class="bubble-btn" title="精炼" @mousedown.prevent="runSelectedAi('refine')"><Zap :size="14" /><span>精炼</span></button>
        <button class="bubble-btn" title="润色" @mousedown.prevent="runSelectedAi('polish')"><PenLine :size="14" /><span>润色</span></button>
        <button class="bubble-btn" title="扩写" @mousedown.prevent="runSelectedAi('expand')"><Maximize2 :size="14" /><span>扩写</span></button>
        <span class="bubble-divider"></span>
        <button class="bubble-btn chat-open-btn" title="在对话中打开" @mousedown.prevent="openInConversation"><MessageSquare :size="14" /><span>在对话中打开</span></button>
        <span class="bubble-divider"></span>
        <button class="bubble-btn" title="粗体" :class="{ active: editor.isActive('bold') }" @mousedown.prevent="toggle('toggleBold')"><Bold :size="14" /></button>
        <button class="bubble-btn" title="斜体" :class="{ active: editor.isActive('italic') }" @mousedown.prevent="toggle('toggleItalic')"><Italic :size="14" /></button>
        <button class="bubble-btn" title="下划线" :class="{ active: editor.isActive('underline') }" @mousedown.prevent="toggle('toggleUnderline')"><UnderlineIcon :size="14" /></button>
        <button class="bubble-btn" title="复制" @mousedown.prevent="copySelection"><Copy :size="14" /></button>
      </div>
    </BubbleMenu>
    <div v-if="fimSuggestion" class="fim-suggestion">{{ fimSuggestion }} <small>Tab 接受 · Esc 放弃</small></div>
    <div v-if="aiText" class="ai-output-overlay" @mousedown.self="closeAiResult">
      <div class="ai-output-panel" :style="aiDialogStyle" role="dialog" aria-modal="true" aria-label="AI 写作结果" @mousedown.stop>
        <div class="ai-output-header" @pointerdown="startAiDrag"><strong><Sparkles :size="14" />{{ aiActionLabels[aiResultAction] || 'AI 写作' }}内容</strong><button type="button" title="关闭" aria-label="关闭" @click="closeAiResult"><X :size="17" /></button></div>
        <div class="ai-output-content"><div>{{ aiText }}</div><span v-if="aiBusy" class="ai-output-cursor"></span></div>
        <div class="ai-output-footer"><div class="ai-output-footer-meta"><span>内容由 AI 生成 <ShieldCheck :size="13" /></span><span>已生成{{ aiCharCount }}字</span></div><div class="ai-output-feedback"><button type="button" :class="{ active: aiFeedback === 'like' }" title="有帮助" @click="toggleAiFeedback('like')"><ThumbsUp :size="16" /></button><button type="button" :class="{ active: aiFeedback === 'dislike' }" title="没帮助" @click="toggleAiFeedback('dislike')"><ThumbsDown :size="16" /></button><button type="button" title="复制" @click="copyAi"><Copy :size="16" /></button></div></div>
        <div class="ai-output-actions"><div><button type="button" class="ai-output-action rewrite" :disabled="aiBusy" @click="rewriteAi"><RotateCcw :size="14" />重写</button><button type="button" class="ai-output-action discard" :disabled="aiBusy" @click="dismissAiResult"><Trash2 :size="14" />弃用</button></div><div><button type="button" class="ai-output-action replace" :disabled="aiBusy || !aiText" @click="replaceWithAi">替换</button><button type="button" class="ai-output-action insert" :disabled="aiBusy || !aiText" @click="insertAi">插入</button></div></div>
      </div>
    </div>
    <div v-if="imageDialogOpen" class="editor-dialog-overlay" @click.self="imageDialogOpen = false">
      <div class="editor-dialog" role="dialog" aria-modal="true" aria-label="插入图片">
        <div class="editor-dialog-header"><strong>插入图片</strong><button class="editor-dialog-close" title="关闭" @click="imageDialogOpen = false">×</button></div>
        <div class="editor-dialog-body"><label>图片地址<input ref="imageInput" v-model="imageUrl" type="url" placeholder="https://example.com/image.jpg" @keyup.enter="confirmImage" /></label><label>替代文字<input v-model="imageAlt" type="text" placeholder="图片说明（可选）" @keyup.enter="confirmImage" /></label></div>
        <div class="editor-dialog-footer"><button class="secondary-button" @click="imageDialogOpen = false">取消</button><button class="primary-button" :disabled="!normalizeImageUrl(imageUrl)" @click="confirmImage">插入图片</button></div>
      </div>
    </div>
    </section>
    <Transition name="tiny-note-assistant-slide">
      <NoteAssistantSidebar v-if="assistantOpen" :note="note" :selection="assistantSelection" :messages="assistantMessages" :busy="assistantBusy" :streaming-text="assistantStreamingText" @close="assistantOpen = false" @send="sendAssistantMessage" @stop="stopAssistant" @copy="copyAssistantMessage" />
    </Transition>
  </div>
  <div v-else class="empty-state"><div class="empty-icon">✦</div><h2>{{ t('emptyNotes') }}</h2><p>{{ t('emptyHint') }}</p></div>
</template>
