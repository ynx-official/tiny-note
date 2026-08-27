<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '../utils/markdown'

const props = defineProps({
  content: { type: String, default: '' },
  streaming: { type: Boolean, default: false }
})

const renderedContent = computed(() => renderMarkdown(props.content))

async function copyCode(event: MouseEvent) {
  const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.markdown-code-copy')
  if (!button) return
  const code = button.closest('.markdown-code-block')?.querySelector('code')?.textContent
  if (code == null) return

  try {
    await navigator.clipboard.writeText(code)
    button.textContent = '已复制'
    button.classList.add('is-copied')
    window.setTimeout(() => {
      button.textContent = '复制'
      button.classList.remove('is-copied')
    }, 1600)
  } catch {
    button.textContent = '复制失败'
  }
}
</script>

<template>
  <div class="markdown-message">
    <div class="markdown-body" v-html="renderedContent" @click="copyCode"></div>
    <span v-if="streaming" class="markdown-streaming-cursor" aria-hidden="true"></span>
  </div>
</template>

<style scoped>
.markdown-message {
  max-width: 680px;
  min-width: 0;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.72;
  overflow-wrap: anywhere;
}

.markdown-body {
  display: inline;
  user-select: text;
  -webkit-user-select: text;
}

.markdown-body :deep(p) { margin: 0 0 9px; }
.markdown-body :deep(p:last-child) { margin-bottom: 0; }

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  margin: 18px 0 8px;
  color: var(--text-primary);
  font-weight: 650;
  line-height: 1.35;
  letter-spacing: -.015em;
}

.markdown-body :deep(h1:first-child),
.markdown-body :deep(h2:first-child),
.markdown-body :deep(h3:first-child),
.markdown-body :deep(h4:first-child) { margin-top: 0; }
.markdown-body :deep(h1) { font-size: 1.34em; }
.markdown-body :deep(h2) { font-size: 1.2em; }
.markdown-body :deep(h3) { font-size: 1.08em; }
.markdown-body :deep(h4) { font-size: 1em; }

.markdown-body :deep(ul),
.markdown-body :deep(ol) { margin: 8px 0; padding-left: 23px; }
.markdown-body :deep(li) { margin: 3px 0; padding-left: 2px; }
.markdown-body :deep(li > p) { margin: 0; }

.markdown-body :deep(blockquote) {
  margin: 11px 0;
  padding: 7px 13px;
  border-left: 3px solid var(--accent);
  border-radius: 0 7px 7px 0;
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--accent) 7%, transparent);
  font-style: italic;
}

.markdown-body :deep(blockquote p),
.markdown-body :deep(blockquote li) { font-style: italic; }
.markdown-body :deep(blockquote pre),
.markdown-body :deep(blockquote code) { font-style: normal; }

.markdown-body :deep(a) { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
.markdown-body :deep(strong) { font-weight: 650; }
.markdown-body :deep(hr) { margin: 15px 0; border: 0; border-top: 1px solid var(--line); }

.markdown-body :deep(code) {
  padding: 2px 5px;
  border-radius: 4px;
  color: var(--text-primary);
  background: var(--bg-secondary);
  font: .9em/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.markdown-body :deep(.markdown-code-block) {
  margin: 11px 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--bg-secondary);
}

.markdown-body :deep(.markdown-code-header) {
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 12px;
  border-bottom: 1px solid var(--line);
  color: var(--text-tertiary);
  font: 11px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.markdown-body :deep(.markdown-code-copy) {
  min-width: 46px;
  height: 26px;
  padding: 0 7px;
  border-radius: 6px;
  color: var(--text-tertiary);
  font: 11px/1.2 Inter, ui-sans-serif, sans-serif;
}

.markdown-body :deep(.markdown-code-copy:hover) { color: var(--text-primary); background: var(--bg-hover); }
.markdown-body :deep(.markdown-code-copy.is-copied) { color: #16966a; }

.markdown-body :deep(.markdown-code-block pre) {
  margin: 0;
  padding: 13px 14px;
  overflow-x: auto;
  background: transparent;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--text-tertiary) 35%, transparent) transparent;
}

.markdown-body :deep(.markdown-code-block pre code) {
  display: block;
  min-width: max-content;
  padding: 0;
  color: var(--text-primary);
  background: transparent;
  white-space: pre;
}

.markdown-body :deep(table) {
  display: block;
  width: max-content;
  max-width: 100%;
  margin: 11px 0;
  overflow-x: auto;
  border-collapse: collapse;
  font-size: .92em;
}

.markdown-body :deep(th),
.markdown-body :deep(td) { min-width: 80px; padding: 7px 10px; border: 1px solid var(--line); text-align: left; }
.markdown-body :deep(th) { background: var(--bg-secondary); font-weight: 650; }

.markdown-streaming-cursor {
  display: inline-block;
  width: 2px;
  height: 15px;
  margin-left: 3px;
  vertical-align: -2px;
  border-radius: 2px;
  background: var(--accent);
  animation: markdown-cursor-blink .85s steps(1) infinite;
}

@keyframes markdown-cursor-blink { 50% { opacity: 0; } }
</style>
