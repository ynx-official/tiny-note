<script setup>
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, basicSetup } from 'codemirror'
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

defineExpose({ view, focus, getScrollElement, setScrollProgress })
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
