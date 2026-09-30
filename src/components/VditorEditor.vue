<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import '../styles/vditor-editor.css'
import { loadVditorRuntime } from '../editor/vditorRuntime'
import { refreshVditorDiagramTheme } from '../editor/vditorDiagramTheme'
import { readVditorSelection } from '../editor/vditorSelection'
import type { VditorPort, NoteEditorMode } from '../editor/vditorPort'
import { applyMarkdownProposal, type MarkdownSelection } from '../editor/markdownSelection'
import { sanitizeEditorHtml } from '../utils/noteMarkdown'
import { resolveNoteImage } from '../services/noteImage'
import { showToast } from '../services/appFeedback'

const props = defineProps<{ modelValue: string; mode: NoteEditorMode; preview: boolean; noteId: string }>()
const emit = defineEmits<{
  ready: [editor: VditorPort]
  change: [source: string]
  selection: [selection: MarkdownSelection | null]
  scroll: []
  image: []
  mode: [mode: NoteEditorMode]
}>()
const host = ref<HTMLElement | null>(null)
const error = ref('')
const splitRatio = ref(50)
const toolbarHeight = ref(35)
let resizeObserver: ResizeObserver | undefined
const vertical = ref(false)
let dragging = false
function resizeSplit(event: PointerEvent) {
  if (!dragging || !host.value) return
  const rect = host.value.getBoundingClientRect()
  const amount = vertical.value ? (event.clientY - rect.top - toolbarHeight.value) / (rect.height - toolbarHeight.value) : (event.clientX - rect.left) / rect.width
  splitRatio.value = Math.max(30, Math.min(70, amount * 100))
}
function stopResize() { dragging = false; window.removeEventListener('pointermove', resizeSplit); window.removeEventListener('pointerup', stopResize) }
function startResize(event: PointerEvent) {
  if (event.button !== 0) return
  dragging = true; event.preventDefault()
  window.addEventListener('pointermove', resizeSplit); window.addEventListener('pointerup', stopResize)
}
function scrollChanged(event: Event) {
  emit('scroll')
  if (props.mode !== 'markdown' || !props.preview || !instance) return
  const sourcePane = instance.vditor.sv?.element
  const previewPane = instance.vditor.preview?.element
  const from = event.target as HTMLElement
  const to = from === sourcePane ? previewPane : from === previewPane ? sourcePane : null
  if (!to) return
  event.stopPropagation()
  const progress = from.scrollTop / Math.max(1, from.scrollHeight - from.clientHeight)
  const target = progress * Math.max(0, to.scrollHeight - to.clientHeight)
  if (Math.abs(to.scrollTop - target) > 1) to.scrollTop = target
}
let instance: Vditor | undefined
let disposed = false
let loading = false
let source = props.modelValue
let canonical = ''
let selection: MarkdownSelection | null = null
let observer: MutationObserver | undefined
let themeObserver: MutationObserver | undefined
let publishing = false
let darkTheme: boolean | undefined
let noteRevision = 0

async function pasteImages(event: ClipboardEvent) {
  if (!instance || !(event.target instanceof Element) || !event.target.closest('.vditor-ir, .vditor-sv')) return
  const files = Array.from(event.clipboardData?.files || []).filter(file => file.type.startsWith('image/'))
  if (!files.length) return
  // Run before Vditor's native paste handler can inline clipboard images.
  event.preventDefault(); event.stopPropagation()
  const target = instance
  const revision = noteRevision
  syncInput(); selectionChanged()
  const range = selection
  const original = source
  try {
    const images: string[] = []
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        showToast('图片不能超过 5 MB', { tone: 'error' })
        continue
      }
      const url = await resolveNoteImage(file)
      if (disposed || instance !== target || revision !== noteRevision) return
      images.push(`![](${url})`)
    }
    if (images.length) {
      if (source === original) selection = range
      port.insertMarkdown(images.join('\n\n'))
    }
  } catch {
    if (!disposed && revision === noteRevision) showToast('读取粘贴图片失败，请重试', { tone: 'error' })
  }
}

function currentScroller() { return instance?.vditor[instance.getCurrentMode()]?.element || null }
function selectionChanged() {
  if (!instance || publishing) return
  const next = readVditorSelection(instance, source)
  // Keep the captured range while a toolbar or AI input owns the focus.
  if (next) { selection = next; emit('selection', next) }
}
function syncInput() {
  if (!instance || publishing) return
  const value = instance.getValue()
  if (value === canonical) return
  source = value
  canonical = value
  selection = null
  emit('change', source)
  selectionChanged()
}
function setMarkdown(value: string, resetHistory = false) {
  source = value
  selection = null
  if (!instance) return
  publishing = true
  instance.setValue(value, resetHistory)
  canonical = instance.getValue()
  publishing = false
}
function setMode(mode: NoteEditorMode) {
  if (!instance) return
  syncInput()
  const native = mode === 'markdown' ? 'sv' : 'ir'
  if (instance.getCurrentMode() !== native) {
    publishing = true
    host.value?.querySelector<HTMLButtonElement>(`button[data-mode="${native}"]`)?.click()
    // A display-only round trip must never replace the untouched source.
    instance.setValue(source)
    canonical = instance.getValue()
    publishing = false
  }
  instance.setPreviewMode(props.preview ? 'both' : 'editor')
  decorate()
}
function decorate() {
  if (!instance) return
  for (const mode of ['ir', 'sv', 'wysiwyg'] as const) {
    const root = instance.vditor[mode]?.element
    if (!root) continue
    root.setAttribute('aria-label', mode === 'sv' ? 'Markdown 源码编辑器' : '文章正文')
  }
}
const port: VditorPort = {
  getMarkdown: () => { syncInput(); return source },
  getHTML: (value = source) => sanitizeEditorHtml(instance?.vditor.lute.Md2HTML(value) || ''),
  getText: (value = source) => {
    const root = document.createElement('div')
    root.innerHTML = port.getHTML(value).replace(/<\/(?:p|h[1-6]|li|tr|blockquote|pre)>/gi, '$&\n').replace(/<br\s*\/?>/gi, '\n')
    return root.textContent?.trim() || ''
  },
  getSelection: () => { selectionChanged(); return selection },
  setMarkdown, setMode,
  setPreview: visible => instance?.setPreviewMode(visible ? 'both' : 'editor'),
  focus: () => instance?.focus(),
  setEditable: editable => { if (editable) instance?.enable(); else instance?.disabled() },
  getScroller: currentScroller,
  insertMarkdown: value => {
    if (!instance) return false
    syncInput()
    const target = selection || { from: source.length, to: source.length, text: '', source }
    try {
      const next = applyMarkdownProposal(source, value, 'replace', target)
      setMarkdown(next)
      emit('change', next)
      instance.focus()
    } catch { return false }
    return true
  }
}
function updateTheme() {
  const dark = document.documentElement.dataset.theme === 'dark' || document.documentElement.classList.contains('dark')
  instance?.setTheme(dark ? 'dark' : 'classic', dark ? 'dark' : 'light', dark ? 'github-dark' : 'github')
  if (instance && host.value && darkTheme !== undefined && darkTheme !== dark) refreshVditorDiagramTheme(host.value, dark)
  darkTheme = dark
}
async function initialize() {
  if (loading || disposed || !host.value) return
  loading = true
  error.value = ''
  try {
    await loadVditorRuntime()
    if (disposed || !host.value) return
    instance = new Vditor(host.value, {
      cdn: '/vendor/vditor', lang: 'zh_CN', mode: props.mode === 'markdown' ? 'sv' : 'ir',
      value: source, height: '100%', minHeight: 200, cache: { enable: false },
      placeholder: '写下此刻的想法…',
      toolbar: ['undo', 'redo', '|', 'headings', 'bold', 'italic', 'strike', '|', 'list', 'ordered-list', 'check', 'quote', '|', 'link',
        { name: 'tiny-image', tip: '插入图片', icon: '<svg><use xlink:href="#vditor-icon-upload"></use></svg>', click: () => emit('image') },
        'table', 'code', 'inline-code', 'line', 'edit-mode'].map(item => {
        // The host clips overflow above the toolbar; keep native tips below it.
        if (typeof item !== 'string') return { ...item, tipPosition: 's' }
        if (item === '|') return item
        return { name: item, tipPosition: item === 'undo' || item === 'redo' ? 'se' : 's' }
      }),
      toolbarConfig: { pin: true }, counter: { enable: false },
      hint: { emoji: {}, emojiPath: '/vendor/vditor/dist/images/emoji' },
      preview: { actions: [], delay: 100, maxWidth: 960, mode: props.preview ? 'both' : 'editor',
        theme: { current: 'light', path: '/vendor/vditor/dist/css/content-theme' },
        markdown: { autoSpace: false, fixTermTypo: false, paragraphBeginningSpace: false, sanitize: true, footnotes: true, toc: true },
        math: { engine: 'KaTeX' }, hljs: { enable: true, style: 'github' } },
      input: () => syncInput(), select: () => selectionChanged(),
      after: () => {
        if (disposed || !instance) return
        canonical = instance.getValue()
        decorate(); updateTheme()
        toolbarHeight.value = instance.vditor.toolbar?.element?.getBoundingClientRect().height || 35
        emit('ready', port)
        observer = new MutationObserver(() => {
          if (!instance) return
          const mode = instance.getCurrentMode() === 'sv' ? 'markdown' : 'rich'
          if (mode !== props.mode) emit('mode', mode)
        })
        const toolbar = instance.vditor.toolbar?.element
        if (toolbar) observer.observe(toolbar, { attributes: true, subtree: true, attributeFilter: ['class'] })
      }
    })
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '编辑器加载失败' }
  finally { loading = false }
}
watch(() => props.modelValue, value => { if (value !== source) setMarkdown(value) })
watch(() => props.noteId, () => { noteRevision += 1; setMarkdown(props.modelValue, true) })
watch(() => props.mode, setMode)
watch(() => props.preview, value => port.setPreview(value))
onMounted(() => {
  void initialize()
  if (typeof ResizeObserver !== 'undefined' && host.value) {
    resizeObserver = new ResizeObserver(() => {
      vertical.value = (host.value?.clientWidth || 1000) < 720
      toolbarHeight.value = instance?.vditor.toolbar?.element?.getBoundingClientRect().height || 35
    })
    resizeObserver.observe(host.value)
  }
  document.addEventListener('selectionchange', selectionChanged)
  themeObserver = new MutationObserver(updateTheme)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
})
onBeforeUnmount(() => {
  disposed = true
  stopResize(); resizeObserver?.disconnect()
  observer?.disconnect(); themeObserver?.disconnect()
  document.removeEventListener('selectionchange', selectionChanged)
  if (instance?.vditor.lute) instance.destroy()
})
defineExpose({ ...port })
</script>
<template>
  <div class="vditor-editor" :class="{ 'vditor-split': mode === 'markdown' && preview, 'vditor-vertical': vertical }" :style="{ '--source-ratio': `${splitRatio}%`, '--source-factor': splitRatio / 100, '--native-toolbar-height': `${toolbarHeight}px` }" @paste.capture="pasteImages" @scroll.capture="scrollChanged" @keyup="selectionChanged" @mouseup="selectionChanged">
    <div v-if="error" class="markdown-parse-error" role="alert">{{ error }}<button type="button" @click="initialize">重试</button></div>
    <div class="vditor-frame">
      <div ref="host" class="tiny-vditor"></div>
      <div v-if="mode === 'markdown' && preview" class="vditor-split-divider" role="separator" tabindex="0" :aria-orientation="vertical ? 'horizontal' : 'vertical'" aria-label="调整源码与预览比例" :aria-valuenow="splitRatio" :aria-valuemin="30" :aria-valuemax="70" @pointerdown="startResize" @keydown.left.prevent="splitRatio = Math.max(30, splitRatio - 5)" @keydown.right.prevent="splitRatio = Math.min(70, splitRatio + 5)"></div>
    </div>
  </div>
</template>
