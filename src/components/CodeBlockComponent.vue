<template>
  <node-view-wrapper class="code-block-component">
    <div class="code-block-header">
      <select v-model="selectedLanguage" class="language-select" aria-label="代码语言">
        <option value="">auto</option>
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
        <button class="code-action-btn" :title="copied ? copyDoneLabel : copyLabel" @click="handleCopy">
          <Check v-if="copied" :size="14" />
          <Copy v-else :size="14" />
        </button>
        <button class="code-action-btn danger" :title="deleteLabel" @click="deleteNode"><Trash2 :size="14" /></button>
      </div>
    </div>
    <div class="code-block-content">
      <div class="line-numbers" contenteditable="false" aria-hidden="true">
        <div v-for="n in lineCount" :key="n" class="line-number">{{ n }}</div>
      </div>
      <pre><node-view-content as="code" /></pre>
    </div>
  </node-view-wrapper>
</template>

<script setup>
import { computed, ref } from 'vue'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/vue-3'
import { Check, Copy, Trash2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

const props = defineProps({ node: Object, updateAttributes: Function, deleteNode: Function })
const { locale } = useI18n()
const copied = ref(false)
const selectedLanguage = computed({
  get: () => props.node.attrs.language || '',
  set: value => props.updateAttributes({ language: value || null })
})
const lineCount = computed(() => Math.max(1, (props.node.textContent || '').split('\n').length))
const copyLabel = computed(() => locale.value === 'en' ? 'Copy code' : '复制代码')
const copyDoneLabel = computed(() => locale.value === 'en' ? 'Copied' : '已复制')
const deleteLabel = computed(() => locale.value === 'en' ? 'Delete code block' : '删除代码块')

async function handleCopy() {
  const text = props.node.textContent || ''
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
.code-block-component pre::-webkit-scrollbar { height: 6px; }
.code-block-component pre::-webkit-scrollbar-track { border-radius: 3px; background: #e0e0e0; }
.code-block-component pre::-webkit-scrollbar-thumb { border-radius: 3px; background: #bbb; }

[data-theme='dark'] .code-block-component { border-color: #3f3f46; background: #242428; }
[data-theme='dark'] .language-select { background-color: #242428; color: #c7c7cc; }
[data-theme='dark'] .line-numbers { border-color: #3f3f46; }
[data-theme='dark'] .line-number { color: #777780; }
[data-theme='dark'] .code-block-component pre code { color: #e5e7eb; }
[data-theme='dark'] .code-action-btn { color: #a8a29e; }
[data-theme='dark'] .code-action-btn:hover { background: #333338; color: #fff; }
</style>
