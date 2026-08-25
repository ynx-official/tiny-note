<template>
  <node-view-wrapper class="code-block-component" :class="{ 'is-mermaid': isMermaid, 'is-source-visible': showSource }">
    <div v-if="!isMermaid || showSource" class="code-block-header">
      <select v-model="selectedLanguage" class="language-select" aria-label="代码语言" :disabled="!editable">
        <option value="">auto</option>
        <option value="mermaid">Mermaid 图表</option>
        <option value="mmd">Mermaid (mmd)</option>
        <option v-if="hasMermaidMetadata" :value="selectedLanguage">Mermaid 图表（含参数）</option>
        <option value="javascript">JavaScript</option>
        <option value="typescript">TypeScript</option>
        <option value="python">Python</option>
        <option value="java">Java</option>
        <option value="cpp">C++</option>
        <option value="csharp">C#</option>
        <option value="go">Go</option>
        <option value="rust">Rust</option>
        <option value="php">PHP</option>
        <option value="ruby">Ruby</option>
        <option value="swift">Swift</option>
        <option value="kotlin">Kotlin</option>
        <option value="html">HTML</option>
        <option value="css">CSS</option>
        <option value="scss">SCSS</option>
        <option value="sql">SQL</option>
        <option value="json">JSON</option>
        <option value="yaml">YAML</option>
        <option value="markdown">Markdown</option>
        <option value="bash">Bash</option>
        <option value="shell">Shell</option>
        <option value="plaintext">Plain Text</option>
      </select>
      <div class="header-actions">
        <button v-if="isMermaid" class="code-action-btn diagram-source-toggle" :aria-label="showSource ? previewLabel : sourceLabel" :aria-pressed="showSource" :title="showSource ? previewLabel : sourceLabel" @click="showSource = !showSource">
          <Eye v-if="showSource" :size="14" />
          <Code2 v-else :size="14" />
          <span>{{ showSource ? previewLabel : sourceLabel }}</span>
        </button>
        <button class="code-action-btn" :aria-label="copied ? copyDoneLabel : copyLabel" :title="copied ? copyDoneLabel : copyLabel" @click="handleCopy">
          <Check v-if="copied" :size="14" />
          <Copy v-else :size="14" />
        </button>
        <button v-if="editable" class="code-action-btn danger" :aria-label="deleteLabel" :title="deleteLabel" @click="deleteNode"><Trash2 :size="14" /></button>
      </div>
    </div>
    <MermaidDiagram v-if="isMermaid && !showSource" :source="source" @show-source="showSource = true">
      <template #actions>
        <span class="mermaid-block-divider" aria-hidden="true"></span>
        <button class="code-action-btn diagram-source-toggle" :aria-label="sourceLabel" :aria-pressed="showSource" :title="sourceLabel" @click="showSource = true">
          <Code2 :size="14" />
          <span>{{ sourceLabel }}</span>
        </button>
        <button class="code-action-btn" :aria-label="copied ? copyDoneLabel : copyLabel" :title="copied ? copyDoneLabel : copyLabel" @click="handleCopy">
          <Check v-if="copied" :size="14" />
          <Copy v-else :size="14" />
        </button>
        <button v-if="editable" class="code-action-btn danger" :aria-label="deleteLabel" :title="deleteLabel" @click="deleteNode"><Trash2 :size="14" /></button>
      </template>
    </MermaidDiagram>
    <div v-show="!isMermaid || showSource" class="code-block-content">
      <div class="line-numbers" contenteditable="false" aria-hidden="true">
        <div v-for="n in lineCount" :key="n" class="line-number">{{ n }}</div>
      </div>
      <pre><node-view-content as="code" /></pre>
    </div>
    <span class="code-copy-status" role="status" aria-live="polite">{{ copied ? copyDoneLabel : '' }}</span>
  </node-view-wrapper>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/vue-3'
import { Check, Code2, Copy, Eye, Trash2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import MermaidDiagram from './MermaidDiagram.vue'
import { consumeMermaidDiagramForEditing } from '../utils/mermaidEditorState'

const props = defineProps({ node: Object, editor: Object, updateAttributes: Function, deleteNode: Function })
const { locale } = useI18n()
const copied = ref(false)
const source = computed(() => props.node.textContent || '')
const normalizedLanguage = computed(() => String(props.node.attrs.language || '').trim().toLowerCase().split(/\s+/, 1)[0])
const isMermaid = computed(() => ['mermaid', 'mmd'].includes(normalizedLanguage.value))
const hasMermaidMetadata = computed(() => isMermaid.value && !['mermaid', 'mmd'].includes(String(props.node.attrs.language || '').trim().toLowerCase()))
const editable = ref(props.editor?.isEditable !== false)
const showSource = ref(isMermaid.value && (!source.value.trim() || consumeMermaidDiagramForEditing(props.editor, source.value)))
const selectedLanguage = computed({
  get: () => props.node.attrs.language || '',
  set: value => props.updateAttributes({ language: value || null })
})
const lineCount = computed(() => Math.max(1, source.value.split('\n').length))
const copyLabel = computed(() => locale.value === 'en' ? (isMermaid.value ? 'Copy diagram source' : 'Copy code') : (isMermaid.value ? '复制图表源码' : '复制代码'))
const copyDoneLabel = computed(() => locale.value === 'en' ? 'Copied' : '已复制')
const deleteLabel = computed(() => locale.value === 'en' ? 'Delete code block' : '删除代码块')
const sourceLabel = computed(() => locale.value === 'en' ? 'Source' : '源码')
const previewLabel = computed(() => locale.value === 'en' ? 'Preview' : '预览')

watch(isMermaid, active => {
  showSource.value = active && !source.value.trim()
})

function syncEditable() {
  editable.value = props.editor?.isEditable !== false
}

onMounted(() => {
  props.editor?.on?.('update', syncEditable)
  props.editor?.on?.('tinyNoteEditableChange', syncEditable)
})
onBeforeUnmount(() => {
  props.editor?.off?.('update', syncEditable)
  props.editor?.off?.('tinyNoteEditableChange', syncEditable)
})

async function handleCopy() {
  const text = source.value
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }
  copied.value = true
  window.setTimeout(() => { copied.value = false }, 2000)
}
</script>

<style>
.code-block-component {
  position: relative;
  container-type: inline-size;
  margin: .7em 0;
  overflow: hidden;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  background: #f0f0f0;
}

.code-block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
  padding: 6px 12px;
  background: transparent;
}

.header-actions { display: flex; align-items: center; gap: 2px; }
.mermaid-block-divider { align-self:center; width:1px; height:18px; margin:0 3px; background:var(--line,#dedbd6); }
.code-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #888;
  cursor: pointer;
}
.code-action-btn:hover { background: #e0e0e0; color: #333; }
.code-action-btn.danger:hover { background: #fee2e2; color: #ef4444; }
.diagram-source-toggle { width:auto; padding:0 7px; gap:5px; color:var(--text-secondary,#6b6863); font-size:11px; }
.code-copy-status { position:absolute!important; width:1px!important; height:1px!important; padding:0!important; margin:-1px!important; overflow:hidden!important; clip:rect(0,0,0,0)!important; white-space:nowrap!important; border:0!important; }

.language-select {
  width: auto;
  min-width: 70px;
  padding: 4px 24px 4px 8px;
  border: 0;
  border-radius: 4px;
  outline: 0;
  appearance: none;
  background-color: #f0f0f0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-position: right 6px center;
  background-repeat: no-repeat;
  color: #555;
  font-size: 12px;
  cursor: pointer;
}
.language-select:focus { box-shadow: none; }
.language-select:disabled { cursor:default; opacity:.65; }

.code-block-content { display: flex; overflow: hidden; }
.line-numbers {
  flex: 0 0 36px;
  min-width: 36px;
  padding: 8px 0;
  border-right: 1px solid #d9d9d9;
  text-align: right;
  user-select: none !important;
  pointer-events: none;
}
.line-number {
  padding: 0 8px;
  color: #aaa;
  font-family: Consolas, Monaco, 'Courier New', monospace;
  font-size: 13px;
  line-height: 20px;
}
.code-block-component pre {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 8px 16px;
  overflow-x: auto;
  background: transparent;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, .12) transparent;
}
.code-block-component pre code {
  display: block;
  color: #333;
  font-family: Consolas, Monaco, 'Courier New', monospace;
  font-size: 13px;
  line-height: 20px;
  tab-size: 2;
  text-shadow: none;
  white-space: pre !important;
  word-wrap: normal !important;
  overflow-wrap: normal !important;
}
.code-block-component pre::-webkit-scrollbar { height: 4px; }
.code-block-component pre::-webkit-scrollbar-track { background: transparent; }
.code-block-component pre::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(0, 0, 0, .12); }
.code-block-component pre::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, .24); }

.code-block-component.is-mermaid { border-color:var(--line,#e5e3df); background:var(--bg-primary,#fff); }
.code-block-component.is-mermaid .code-block-header { min-height:38px; border-bottom:1px solid var(--line,#e5e3df); background:var(--bg-secondary,#f6f5f4); }
.code-block-component.is-mermaid .language-select { background-color:var(--bg-secondary,#f6f5f4); color:var(--text-secondary,#5d5b54); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; font-weight:600; }
.code-block-component.is-mermaid.is-source-visible .code-block-content { background:var(--bg-secondary,#f6f5f4); }

[data-theme='dark'] .code-block-component { border-color: #3f3f46; background: #242428; }
[data-theme='dark'] .language-select { background-color: #242428; color: #c7c7cc; }
[data-theme='dark'] .line-numbers { border-color: #3f3f46; }
[data-theme='dark'] .line-number { color: #777780; }
[data-theme='dark'] .code-block-component pre code { color: #e5e7eb; }
[data-theme='dark'] .code-block-component pre { scrollbar-color: rgba(255, 255, 255, .14) transparent; }
[data-theme='dark'] .code-block-component pre::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, .14); }
[data-theme='dark'] .code-block-component pre::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, .28); }
[data-theme='dark'] .code-action-btn { color: #a8a29e; }
[data-theme='dark'] .code-action-btn:hover { background: #333338; color: #fff; }
[data-theme='dark'] .code-block-component.is-mermaid { border-color:var(--line,#3f3f46); background:var(--bg-primary,#1a1a1c); }
[data-theme='dark'] .code-block-component.is-mermaid .code-block-header,[data-theme='dark'] .code-block-component.is-mermaid .language-select { background-color:var(--bg-secondary,#242428); }

@container (max-width:420px) {
  .diagram-source-toggle span { display:none; }
  .diagram-source-toggle { width:28px; padding:0; }
}
</style>
