<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
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
import TurndownService from 'turndown'
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, ListChecks, Quote, Code2, Undo2, Redo2, Eraser, Link2, Highlighter, PenLine, AlignLeft, AlignCenter, AlignRight, PlusCircle, MoreHorizontal, Layers, Sparkles, Trash2, Download, Printer } from 'lucide-vue-next'
import { useNotesStore } from '../stores/notes'
import { useI18n } from 'vue-i18n'

const lowlight = createLowlight()
lowlight.register('javascript', javascript); lowlight.register('typescript', typescript); lowlight.register('python', python); lowlight.register('json', json); lowlight.register('html', xml); lowlight.register('xml', xml); lowlight.register('css', css); lowlight.register('bash', bash); lowlight.register('sql', sql); lowlight.register('markdown', markdown); lowlight.register('yaml', yaml); lowlight.register('rust', rust)
const props = defineProps({ note: Object, tocVisible: { type: Boolean, default: false } }); const emit = defineEmits(['deleted', 'toggle-toc']); const store = useNotesStore(); const { t } = useI18n(); const aiBusy = ref(false); const aiText = ref(''); const aiRequestId = ref(''); const aiAction = ref('summarize'); const moreOpen = ref(false); const insertOpen = ref(false); const tablePickerOpen = ref(false); const textColorOpen = ref(false); const highlightOpen = ref(false); const headingOpen = ref(false); const imageDialogOpen = ref(false); const imageUrl = ref(''); const imageAlt = ref(''); const imageInput = ref(null); const tableRows = ref(0); const tableCols = ref(0); const fimEnabled = ref(false); const fimSuggestion = ref(''); const editorStateTick = ref(0); let fimTimer
const refreshEditorState = () => { editorStateTick.value += 1 }
const editor = useEditor({ content: props.note?.contentHtml || '<p></p>', extensions: [StarterKit.configure({ codeBlock: false }), Underline, Link.configure({ openOnClick: false }), Highlight, Image.configure({ allowBase64: false }), Table.configure({ resizable: true }), TableRow, TableHeader, TableCell, TaskList, TaskItem.configure({ nested: true }), Subscript, Superscript, TextStyle, Color, TextAlign.configure({ types: ['heading', 'paragraph'] }), CodeBlockLowlight.extend({ addNodeView() { return VueNodeViewRenderer(CodeBlockComponent) } }).configure({ lowlight }), Placeholder.configure({ placeholder: '写下此刻的想法…' })], editorProps: { attributes: { class: 'note-prose' } }, onTransaction: refreshEditorState, onSelectionUpdate: refreshEditorState, onUpdate: ({ editor: e }) => { if (!props.note) return; props.note.contentHtml = e.getHTML(); props.note.contentText = e.getText(); if (!props.note.title || props.note.title === '未命名笔记') { const first = e.getText().split('\n').find(Boolean); if (first) props.note.title = first.slice(0, 60) } store.scheduleSave(props.note); if (fimEnabled.value) { clearTimeout(fimTimer); fimTimer = setTimeout(runFim, 2000) } } })
const canUndo = computed(() => { editorStateTick.value; return editor.value?.can().undo() ?? false })
const canRedo = computed(() => { editorStateTick.value; return editor.value?.can().redo() ?? false })
const linkActive = computed(() => { editorStateTick.value; return editor.value?.isActive('link') ?? false })
const canEditLink = computed(() => { editorStateTick.value; const instance = editor.value; return !!instance && (!instance.state.selection.empty || instance.isActive('link')) })
const textColorPalette = ['#1c1917', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777']
const highlightPalette = ['#fef08a', '#fed7aa', '#fecaca', '#bbf7d0', '#bae6fd', '#c7d2fe', '#e9d5ff', '#fbcfe8']
const currentHeadingLabel = computed(() => { editorStateTick.value; const instance = editor.value; if (!instance) return '标题'; for (const level of [1, 2, 3]) if (instance.isActive('heading', { level })) return `H${level}`; return '正文' })
watch(() => props.note?.id, () => { if (props.note && editor.value) editor.value.commands.setContent(props.note.contentHtml || '<p></p>') })
onBeforeUnmount(() => { clearTimeout(fimTimer); editor.value?.destroy() })
onMounted(async () => { try { fimEnabled.value = (await (await import('../services/tauri')).invoke('settings_get')).fimEnabled === true } catch { fimEnabled.value = false } })
function toggle(type) { editor.value?.chain().focus()[type]().run() }
async function runAi() {
  if (!props.note || aiBusy.value) return
  aiBusy.value = true; aiText.value = ''; aiRequestId.value = crypto.randomUUID()
  if (!window.__TAURI_INTERNALS__) { aiText.value = '正在整理这段内容…'; setTimeout(() => { aiText.value = `\n\n> Tiny Note AI：${props.note.contentText.slice(0, 140)}`; aiBusy.value = false }, 700); return }
  const channel = new Channel()
  channel.onmessage = event => { if (event.type === 'delta') aiText.value += event.text; if (event.type === 'completed' || event.type === 'cancelled' || event.type === 'error') aiBusy.value = false }
  try { await (await import('../services/tauri')).invoke('note_ai_stream', { request: { requestId: aiRequestId.value, action: aiAction.value, text: props.note.contentText, instruction: null, modelProfileId: null }, onEvent: channel }) } catch { aiText.value = 'AI 请求失败，请检查模型设置。'; aiBusy.value = false }
}
async function stopAi() { if (!aiRequestId.value) return; if (window.__TAURI_INTERNALS__) await (await import('../services/tauri')).invoke('note_ai_cancel', { requestId: aiRequestId.value }); aiBusy.value = false }
function exportMarkdown() { if (!props.note || !editor.value) return; const markdown = new TurndownService().turndown(editor.value.getHTML()); const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${props.note.title || 'note'}.md`; link.click(); URL.revokeObjectURL(url) }
function printNote() { window.print() }
function insertAi() { if (editor.value && aiText.value) { editor.value.commands.insertContent(aiText.value); aiText.value = '' } }
function replaceWithAi() { if (editor.value && aiText.value) { editor.value.commands.setContent(`<p>${aiText.value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br>')}</p>`); aiText.value = '' } }
async function copyAi() { if (aiText.value) await navigator.clipboard?.writeText(aiText.value) }
async function runFim() { if (!fimEnabled.value || !editor.value || !props.note?.contentText) return; const id = crypto.randomUUID(); const channel = new Channel(); let result = ''; channel.onmessage = event => { if (event.type === 'delta') result += event.text; if (event.type === 'completed') fimSuggestion.value = result }; try { await (await import('../services/tauri')).invoke('note_fim_stream', { request: { requestId: id, action: 'continue_write', text: props.note.contentText.slice(-800), instruction: `Continue naturally. Context after cursor: ${props.note.contentText.slice(-400)}`, modelProfileId: null }, onEvent: channel }) } catch { fimSuggestion.value = '' } }
function acceptFim() { if (fimSuggestion.value && editor.value) { editor.value.commands.insertContent(fimSuggestion.value); fimSuggestion.value = '' } }
function dismissFim() { fimSuggestion.value = '' }
function insertCodeBlock() { editor.value?.chain().focus().toggleCodeBlock().run(); insertOpen.value = false }
function closeToolbarMenus() { insertOpen.value = false; tablePickerOpen.value = false; textColorOpen.value = false; highlightOpen.value = false; headingOpen.value = false }
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
const title = computed({ get: () => props.note?.title || '', set: v => { if (props.note) { props.note.title = v; store.scheduleSave(props.note) } } })
</script>
<template>
  <section v-if="note" class="editor-panel">
    <div class="toolbar friday-editor-toolbar">
      <div class="toolbar-left-group">
        <button :title="t('undo')" :disabled="!canUndo" @click="editor?.chain().focus().undo().run()"><Undo2 :size="19" /></button>
        <button :title="t('redo')" :disabled="!canRedo" @click="editor?.chain().focus().redo().run()"><Redo2 :size="19" /></button>
        <button title="清除格式" @click="toggle('clearNodes')"><Eraser :size="19" /></button>
        <button title="链接" :class="{ pressed: linkActive }" :disabled="!canEditLink" @click="editLink"><Link2 :size="19" /></button><i></i>
        <span class="toolbar-menu-anchor"><button title="插入" @click="toggleInsertMenu"><PlusCircle :size="19" /><span class="toolbar-label">插入</span><span class="toolbar-chevron">▾</span></button><div v-if="insertOpen" class="toolbar-insert-menu insert-command-menu">
          <div class="insert-submenu-anchor"><button class="insert-menu-item" @click.stop="tablePickerOpen = !tablePickerOpen"><span class="insert-menu-icon">▦</span><span>表格</span><span class="insert-menu-arrow">›</span></button><div v-if="tablePickerOpen" class="table-picker-menu" @click.stop><div class="table-picker-label">{{ tableRows && tableCols ? `${tableRows} × ${tableCols}` : '选择表格大小' }}</div><div v-for="row in 8" :key="`table-row-${row}`" class="table-picker-row"><button v-for="col in 8" :key="`table-cell-${row}-${col}`" class="table-picker-cell" :class="{ active: row <= tableRows && col <= tableCols }" @mouseenter="selectTableCell(row, col)" @click="insertTable(row, col)"></button></div></div></div>
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
        <button title="加入知识库"><PlusCircle :size="19" /></button>
        <span class="toolbar-menu-anchor"><button title="更多" @click="moreOpen = !moreOpen"><MoreHorizontal :size="20" /></button><div v-if="moreOpen" class="toolbar-more-menu"><button @click="exportMarkdown(); moreOpen = false"><Download :size="15" /> 导出 Markdown</button><button @click="printNote(); moreOpen = false"><Printer :size="15" /> 打印 / 保存 PDF</button><button class="danger" @click="emit('deleted', note.id); moreOpen = false"><Trash2 :size="15" /> 删除笔记</button></div></span>
        <select v-model="aiAction" class="ai-select"><option value="interpret">解读</option><option value="refine">精炼</option><option value="polish">润色</option><option value="expand">扩写</option><option value="translate">翻译</option><option value="summarize">总结</option><option value="continue_write">续写</option><option value="fix_grammar">修复语法</option><option value="generate_plan">生成计划</option><option value="generate_table">生成表格</option><option value="custom">自定义</option></select>
        <button class="ai-button" :disabled="aiBusy" @click="runAi"><Layers :size="17" /> Tiny Note 助理</button>
        <button v-if="aiBusy" class="stop-button" @click="stopAi">{{ t('stop') }}</button>
      </div>
    </div>
    <div class="editor-head"><input v-model="title" class="title-input" :placeholder="t('untitled')" /><div class="editor-meta"><span :class="{ saving: store.saving }">{{ store.saving ? t('saving') : t('save') }}</span></div></div>
    <button v-if="!tocVisible" class="toc-btn" title="目录" aria-label="目录" @click="emit('toggle-toc')"><span class="toc-char">目</span><span class="toc-char">录</span></button>
    <EditorContent :editor="editor" class="editor-content" @keydown.tab.prevent="acceptFim" @keydown.esc="dismissFim" /><div v-if="fimSuggestion" class="fim-suggestion">{{ fimSuggestion }} <small>Tab 接受 · Esc 放弃</small></div>
    <div v-if="aiText" class="ai-result"><div class="ai-result-label"><Sparkles :size="14" /> {{ t('ai') }} <span class="ai-actions"><button @click="copyAi">复制</button><button @click="insertAi">插入</button><button @click="replaceWithAi">替换</button><button @click="aiText=''">放弃</button></span></div><div>{{ aiText }}</div></div>
    <div v-if="imageDialogOpen" class="editor-dialog-overlay" @click.self="imageDialogOpen = false">
      <div class="editor-dialog" role="dialog" aria-modal="true" aria-label="插入图片">
        <div class="editor-dialog-header"><strong>插入图片</strong><button class="editor-dialog-close" title="关闭" @click="imageDialogOpen = false">×</button></div>
        <div class="editor-dialog-body"><label>图片地址<input ref="imageInput" v-model="imageUrl" type="url" placeholder="https://example.com/image.jpg" @keyup.enter="confirmImage" /></label><label>替代文字<input v-model="imageAlt" type="text" placeholder="图片说明（可选）" @keyup.enter="confirmImage" /></label></div>
        <div class="editor-dialog-footer"><button class="secondary-button" @click="imageDialogOpen = false">取消</button><button class="primary-button" :disabled="!normalizeImageUrl(imageUrl)" @click="confirmImage">插入图片</button></div>
      </div>
    </div>
  </section>
  <div v-else class="empty-state"><div class="empty-icon">✦</div><h2>{{ t('emptyNotes') }}</h2><p>{{ t('emptyHint') }}</p></div>
</template>
