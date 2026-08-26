<script setup>
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, basicSetup } from 'codemirror'
import { redo, undo } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { scrollOffset } from '../utils/noteMarkdown'

const props = defineProps({
  modelValue: { type: String, default: '' },
  readonly: { type: Boolean, default: false },
  ariaLabel: { type: String, required: true }
})

const emit = defineEmits(['update:modelValue', 'focus', 'scroll'])
const host = ref(null)
const view = shallowRef(null)
const editable = new Compartment()
let syncingFromModel = false

function editableExtensions(readonly) {
  return [EditorState.readOnly.of(readonly), EditorView.editable.of(!readonly)]
}

function emitScroll() {
  const element = view.value?.scrollDOM
  if (!element) return
  emit('scroll', {
    element,
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight
  })
}

onMounted(() => {
  view.value = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        basicSetup,
        markdown({ codeLanguages: languages }),
        EditorView.lineWrapping,
        editable.of(editableExtensions(props.readonly)),
        EditorView.updateListener.of(update => {
          if (update.docChanged && !syncingFromModel) emit('update:modelValue', update.state.doc.toString())
        }),
        EditorView.domEventHandlers({ focus: () => emit('focus') }),
        EditorView.theme({
          '&': {
            height: '100%',
            color: 'var(--text-primary)',
            backgroundColor: 'var(--bg-primary)'
          },
          '.cm-scroller': {
            fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
            fontSize: '13px',
            lineHeight: '1.7'
          },
          '.cm-content': { padding: '20px 24px', caretColor: 'var(--accent-color)' },
          '.cm-gutters': {
            color: 'var(--text-tertiary)',
            backgroundColor: 'var(--bg-primary)',
            borderRight: '1px solid var(--line)'
          },
          '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--bg-hover)' },
          '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--accent-light)' },
          '&.cm-focused': { outline: 'none' }
        })
      ]
    })
  })
  view.value.contentDOM.setAttribute('aria-label', props.ariaLabel)
  view.value.scrollDOM.addEventListener('scroll', emitScroll, { passive: true })
})

watch(() => props.modelValue, value => {
  const current = view.value?.state.doc.toString()
  if (current == null || current === value) return
  syncingFromModel = true
  view.value.dispatch({ changes: { from: 0, to: view.value.state.doc.length, insert: value } })
  syncingFromModel = false
})

watch(() => props.readonly, value => {
  view.value?.dispatch({ effects: editable.reconfigure(editableExtensions(value)) })
})

watch(() => props.ariaLabel, value => view.value?.contentDOM.setAttribute('aria-label', value))

onBeforeUnmount(() => {
  view.value?.scrollDOM.removeEventListener('scroll', emitScroll)
  view.value?.destroy()
  view.value = null
})

function focus() {
  view.value?.focus()
}

function getScrollElement() {
  return view.value?.scrollDOM || null
}

function setScrollProgress(progress) {
  const element = getScrollElement()
  if (element) element.scrollTop = scrollOffset(progress, element.scrollHeight, element.clientHeight)
}

function replaceSelection(before, after = before, placeholder = '文字') {
  const instance = view.value
  if (!instance || props.readonly) return false
  const { from, to } = instance.state.selection.main
  const selected = instance.state.sliceDoc(from, to)
  const unwrapped = selected.startsWith(before) && selected.endsWith(after)
  const selectedContent = unwrapped
    ? selected.slice(before.length, selected.length - after.length)
    : selected || placeholder
  const content = unwrapped ? selectedContent : `${before}${selectedContent}${after}`
  const selectionFrom = unwrapped ? from : from + before.length
  instance.dispatch({
    changes: { from, to, insert: content },
    selection: { anchor: selectionFrom, head: selectionFrom + selectedContent.length },
    scrollIntoView: true
  })
  instance.focus()
  return true
}

function replaceLinePrefixes(prefix, matcher = /^(?: {0,3}(?:[-+*]|\d+\.|>)(?: \[[ xX]\])?\s+)/) {
  const instance = view.value
  if (!instance || props.readonly) return false
  const selection = instance.state.selection.main
  const firstLine = instance.state.doc.lineAt(selection.from)
  const selectedLastLine = instance.state.doc.lineAt(selection.to)
  const lastLineNumber = selection.to > selection.from && selectedLastLine.from === selection.to
    ? selectedLastLine.number - 1
    : selectedLastLine.number
  const changes = []
  for (let number = firstLine.number; number <= lastLineNumber; number += 1) {
    const line = instance.state.doc.line(number)
    const match = line.text.match(matcher)
    changes.push({ from: line.from, to: line.from + (match?.[0]?.length || 0), insert: prefix })
  }
  instance.dispatch({ changes, scrollIntoView: true })
  instance.focus()
  return true
}

function applyFormat(format) {
  if (format === 'undo') return undo(view.value)
  if (format === 'redo') return redo(view.value)
  if (format === 'bold') return replaceSelection('**', '**', '粗体文字')
  if (format === 'italic') return replaceSelection('*', '*', '斜体文字')
  if (format === 'strike') return replaceSelection('~~', '~~', '删除线文字')
  if (format === 'code') return replaceSelection('`', '`', '代码')
  if (format === 'link') return replaceSelection('[', '](https://)', '链接文字')
  if (format === 'quote') return replaceLinePrefixes('> ', /^(?: {0,3}>\s*)/)
  if (format === 'bullet') return replaceLinePrefixes('- ')
  if (format === 'ordered') return replaceLinePrefixes('1. ')
  if (format === 'task') return replaceLinePrefixes('- [ ] ')
  return false
}

function setHeading(level = 0) {
  const prefix = level > 0 ? `${'#'.repeat(Math.min(6, level))} ` : ''
  return replaceLinePrefixes(prefix, /^(?: {0,3}#{1,6}\s*)/)
}

function setSmallParagraph() {
  const instance = view.value
  if (!instance || props.readonly) return false

  const selection = instance.state.selection.main
  const firstLine = instance.state.doc.lineAt(selection.from)
  const selectedLastLine = instance.state.doc.lineAt(selection.to)
  const lastLineNumber = selection.to > selection.from && selectedLastLine.from === selection.to
    ? selectedLastLine.number - 1
    : selectedLastLine.number
  const lines = []
  const smallParagraphPattern = /^<p data-small-text="true">([\s\S]*)<\/p>$/

  for (let number = firstLine.number; number <= lastLineNumber; number += 1) {
    lines.push(instance.state.doc.line(number))
  }

  const shouldUnwrap = lines.length > 0 && lines.every(line => smallParagraphPattern.test(line.text))
  const changes = lines.map(line => ({
    from: line.from,
    to: line.to,
    insert: shouldUnwrap
      ? line.text.match(smallParagraphPattern)?.[1] || ''
      : `<p data-small-text="true">${line.text}</p>`
  }))

  instance.dispatch({ changes, scrollIntoView: true })
  instance.focus()
  return true
}

defineExpose({ view, focus, getScrollElement, setScrollProgress, applyFormat, setHeading, setSmallParagraph })
</script>

<template>
  <div ref="host" class="markdown-source-editor" />
</template>

<style scoped>
.markdown-source-editor {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
}

.markdown-source-editor :deep(.cm-editor) {
  height: 100%;
}
</style>
